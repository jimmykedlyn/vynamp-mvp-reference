// Comparação lado a lado — split-view (#19)
// Complementa o monitor A/B/C: mostra Original e Tratado ao mesmo tempo na waveform.
// Funções puras: picos por coluna, estatísticas do que foi removido e geometria do split.
// O render do trecho tratado roda no worker com o mesmo kernel da exportação.
(function(root, factory) {
	const api = factory();
	// __factory (não-enumerável) permite embutir este módulo no source do worker.
	Object.defineProperty(api, '__factory', { value: factory, enumerable: false });
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.VynampRestoreCompare = api;
})(globalThis, () => {
	'use strict';

	const MODES = ['off', 'wipe', 'stacked'];
	const DEFAULT_SPLIT = 0.5;
	const MIN_SPLIT = 0.02;
	const MAX_SPLIT = 0.98;
	// Pré-rolagem antes da janela visível para os filtros (biquads, DC) assentarem.
	const PREROLL_SECONDS = 0.25;
	const MAX_COLUMNS = 2048;
	const SILENCE_DB = -120;

	function validMode(mode) {
		return MODES.includes(mode) ? mode : 'off';
	}

	function clampSplit(ratio) {
		const value = Number(ratio);
		if (!Number.isFinite(value)) return DEFAULT_SPLIT;
		return Math.max(MIN_SPLIT, Math.min(MAX_SPLIT, value));
	}

	function toDB(value) {
		return value > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(value)) : SILENCE_DB;
	}

	/**
	 * Pico absoluto por coluna do trecho [from, to) de um canal.
	 * Cada coluna cobre pelo menos uma amostra; fora do canal conta como silêncio.
	 */
	function computePeaks(channel, from, to, columns) {
		const count = Math.max(1, Math.min(MAX_COLUMNS, Math.floor(columns) || 1));
		const peaks = new Float32Array(count);
		const start = Math.max(0, Math.floor(from));
		const end = Math.max(start, Math.min(channel.length, Math.ceil(to)));
		const span = end - start;
		if (!span) return peaks;
		for (let col = 0; col < count; col++) {
			const a = start + Math.floor(span * col / count);
			const b = Math.max(a + 1, start + Math.floor(span * (col + 1) / count));
			let peak = 0;
			for (let i = a; i < b && i < end; i++) {
				const v = Math.abs(channel[i]);
				if (v > peak) peak = v;
			}
			peaks[col] = peak;
		}
		return peaks;
	}

	/**
	 * Estatísticas de Original × Tratado no mesmo trecho (canais alinhados).
	 * removed = original − tratado; removedDB é relativo ao original (quanto foi tirado).
	 */
	function diffStats(original, treated) {
		let sumO = 0, sumT = 0, sumR = 0, peakO = 0, peakT = 0, n = 0;
		for (let ch = 0; ch < original.length; ch++) {
			const o = original[ch], t = treated[ch] || o;
			const len = Math.min(o.length, t.length);
			for (let i = 0; i < len; i++) {
				const r = o[i] - t[i];
				sumO += o[i] * o[i];
				sumT += t[i] * t[i];
				sumR += r * r;
				peakO = Math.max(peakO, Math.abs(o[i]));
				peakT = Math.max(peakT, Math.abs(t[i]));
			}
			n += len;
		}
		const rms = sum => n ? Math.sqrt(sum / n) : 0;
		const rmsOriginal = rms(sumO), rmsTreated = rms(sumT), rmsRemoved = rms(sumR);
		return {
			rmsOriginalDB: toDB(rmsOriginal),
			rmsTreatedDB: toDB(rmsTreated),
			rmsRemovedDB: toDB(rmsRemoved),
			// Remoção relativa: −∞ (nada removido) até 0 dB (removeu tudo)
			removedRelativeDB: rmsOriginal > 0 ? toDB(rmsRemoved / rmsOriginal) : SILENCE_DB,
			peakOriginalDB: toDB(peakO),
			peakTreatedDB: toDB(peakT),
			changed: sumR > 0
		};
	}

	/**
	 * Geometria das áreas de desenho num canvas de largura w e altura h.
	 * wipe: Original à esquerda do divisor, Tratado à direita (mesma escala de tempo).
	 * stacked: Original na metade de cima, Tratado na de baixo.
	 */
	function layout(mode, w, h, split) {
		const m = validMode(mode);
		if (m === 'wipe') {
			const x = Math.round(w * clampSplit(split));
			return {
				mode: m,
				divider: x,
				original: { x: 0, y: 0, w: x, h },
				treated: { x, y: 0, w: w - x, h }
			};
		}
		if (m === 'stacked') {
			const half = Math.floor(h / 2);
			return {
				mode: m,
				divider: half,
				original: { x: 0, y: 0, w, h: half },
				treated: { x: 0, y: half, w, h: h - half }
			};
		}
		return { mode: 'off', divider: 0, original: { x: 0, y: 0, w, h }, treated: null };
	}

	/** Trecho em amostras a renderizar (com pré-rolagem) para a janela visível [start, end] s. */
	function renderWindow(start, end, rate, length) {
		const from = Math.max(0, Math.floor(start * rate));
		const to = Math.max(from, Math.min(length, Math.ceil(end * rate)));
		const prerollFrom = Math.max(0, from - Math.round(PREROLL_SECONDS * rate));
		return { from, to, prerollFrom };
	}

	/** Resumo legível para a barra de comparação. */
	function summary(stats) {
		if (!stats || !stats.changed) return 'Tratado idêntico ao original neste trecho.';
		const removed = stats.removedRelativeDB <= SILENCE_DB + 1 ? '< −120' : stats.removedRelativeDB.toFixed(1);
		return 'Removido ' + removed + ' dB (relativo) · RMS ' + stats.rmsOriginalDB.toFixed(1) + ' → ' + stats.rmsTreatedDB.toFixed(1) + ' dBFS · pico ' + stats.peakOriginalDB.toFixed(1) + ' → ' + stats.peakTreatedDB.toFixed(1) + ' dBFS';
	}

	return {
		MODES,
		DEFAULT_SPLIT,
		MIN_SPLIT,
		MAX_SPLIT,
		PREROLL_SECONDS,
		MAX_COLUMNS,
		SILENCE_DB,
		validMode,
		clampSplit,
		computePeaks,
		diffStats,
		layout,
		renderWindow,
		summary
	};
});
