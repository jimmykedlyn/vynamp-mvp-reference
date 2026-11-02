// True-peak Limiter para exportação (#20d)
// Algoritmo look-ahead com oversampling 4x por interpolação cúbica.
// Aplicado apenas na exportação, não no monitor em tempo real.
// Funções puras para testes unitários.
(function(root, factory) {
	const api = factory();
	// __factory (não-enumerável) permite embutir este módulo no source do worker.
	Object.defineProperty(api, '__factory', { value: factory, enumerable: false });
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.VynampRestoreLimiter = api;
})(globalThis, () => {
	'use strict';

	const DEFAULT_CEILING_DBTP = -1.0;
	const LOOKAHEAD_MS = 5.0;
	const OVERSAMPLE = 4;

	/**
	 * Converte dBTP para linear.
	 */
	function dbToLinear(db) {
		return Math.pow(10, db / 20);
	}

	/**
	 * Converte linear para dB.
	 */
	function linearToDb(v) {
		return 20 * Math.log10(Math.max(1e-10, v));
	}

	/**
	 * Interpolação cúbica de Lagrange para oversampling 4x.
	 * Retorna 4 valores interpolados entre x[n-1] e x[n].
	 * Usa 4 pontos: x[n-2], x[n-1], x[n], x[n+1].
	 */
	function interpolateCubic(xm2, xm1, x0, xp1) {
		const results = new Float64Array(OVERSAMPLE);
		for (let k = 0; k < OVERSAMPLE; k++) {
			const t = (k + 1) / OVERSAMPLE;
			const tm1 = t + 1;
			const t0 = t;
			const t1 = t - 1;
			const t2 = t - 2;

			const l0 = (t0 * t1 * t2) / ((-1) * (-2) * (-3));
			const l1 = (tm1 * t1 * t2) / ((1) * (-1) * (-2));
			const l2 = (tm1 * t0 * t2) / ((2) * (1) * (-1));
			const l3 = (tm1 * t0 * t1) / ((3) * (2) * (1));

			results[k] = xm2 * l0 + xm1 * l1 + x0 * l2 + xp1 * l3;
		}
		return results;
	}

	/**
	 * Mede o true peak de um canal usando oversampling 4x com interpolação cúbica.
	 * Retorna o pico absoluto inter-sample.
	 */
	function measureTruePeak(channel) {
		let maxAbs = 0;
		const n = channel.length;
		for (let i = 1; i < n - 2; i++) {
			const xm2 = channel[i - 1];
			const xm1 = channel[i];
			const x0 = channel[i + 1];
			const xp1 = i + 2 < n ? channel[i + 2] : channel[i + 1];
			const interp = interpolateCubic(xm2, xm1, x0, xp1);
			for (let k = 0; k < OVERSAMPLE; k++) {
				const abs = Math.abs(interp[k]);
				if (abs > maxAbs) maxAbs = abs;
			}
		}
		for (let i = 0; i < n; i++) {
			const abs = Math.abs(channel[i]);
			if (abs > maxAbs) maxAbs = abs;
		}
		return maxAbs;
	}

	/**
	 * Mede o true peak multicanal (max entre canais).
	 */
	function measureTruePeakMulti(channels) {
		let maxAll = 0;
		for (const ch of channels) {
			const tp = measureTruePeak(ch);
			if (tp > maxAll) maxAll = tp;
		}
		return maxAll;
	}

	/**
	 * Aplica limiter look-ahead em-place nos canais.
	 * Usa margem de segurança de 0.5dB abaixo do teto para compensar
	 * imprecisão da interpolação cúbica e suavização do envelope.
	 * Attack instantâneo garante resposta imediata a picos.
	 * @param {Float32Array[]} channels - Array de canais (modificado em-place)
	 * @param {number} sampleRate - Taxa de amostragem
	 * @param {number} ceilingDBTP - Teto em dBTP (padrão -1.0)
	 * @returns {{ peakBefore: number, peakAfter: number, gainApplied: number }}
	 */
	function apply(channels, sampleRate, ceilingDBTP = DEFAULT_CEILING_DBTP) {
		if (!channels || channels.length === 0) return { peakBefore: 0, peakAfter: 0, gainApplied: 1 };

		const ceiling = dbToLinear(ceilingDBTP);
		// Margem de segurança: limitar 0.5dB abaixo do teto para garantir
		// que o true peak medido pós-processamento fique dentro do teto
		const safeCeiling = dbToLinear(ceilingDBTP - 0.5);
		const lookaheadSamples = Math.ceil(LOOKAHEAD_MS * sampleRate / 1000);

		// Medir true peak antes
		const peakBefore = measureTruePeakMulti(channels);

		if (peakBefore <= ceiling) {
			return { peakBefore, peakAfter: peakBefore, gainApplied: 1 };
		}

		// Calcular ganho necessário com margem de segurança
		const targetGain = safeCeiling / peakBefore;

		// Release suave; attack é instantâneo (min direto)
		const releaseSamples = Math.max(1, lookaheadSamples);
		const releaseCoeff = 1 - Math.exp(-1 / releaseSamples);

		// Primeira passada: calcular envelope de ganho mínimo na janela look-ahead
		const n = channels[0].length;
		const gainEnv = new Float32Array(n);

		for (let i = 0; i < n; i++) {
			let localMax = 0;
			const windowEnd = Math.min(n, i + lookaheadSamples);
			for (let j = i; j < windowEnd; j++) {
				for (const ch of channels) {
					const abs = Math.abs(ch[j]);
					if (abs > localMax) localMax = abs;
				}
			}
			gainEnv[i] = localMax > safeCeiling ? safeCeiling / localMax : 1;
		}

		// Suavizar envelope: attack instantâneo (min), release exponencial
		let smoothGain = 1;
		for (let i = 0; i < n; i++) {
			const target = gainEnv[i];
			if (target < smoothGain) {
				smoothGain = target; // attack instantâneo
			} else {
				smoothGain += (target - smoothGain) * releaseCoeff;
			}
			gainEnv[i] = smoothGain;
		}

		// Segunda passada: aplicar ganho suavizado
		for (const ch of channels) {
			for (let i = 0; i < n; i++) {
				ch[i] *= gainEnv[i];
			}
		}

		// Hard clip como segurança final absoluta
		for (const ch of channels) {
			for (let i = 0; i < n; i++) {
				if (ch[i] > 1) ch[i] = 1;
				else if (ch[i] < -1) ch[i] = -1;
			}
		}

		const peakAfter = measureTruePeakMulti(channels);

		return { peakBefore, peakAfter, gainApplied: targetGain };
	}

	return {
		DEFAULT_CEILING_DBTP,
		LOOKAHEAD_MS,
		OVERSAMPLE,
		dbToLinear,
		linearToDb,
		interpolateCubic,
		measureTruePeak,
		measureTruePeakMulti,
		apply
	};
});