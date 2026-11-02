// De-crackle Mid/Side para restauração de áudio (#4)
// Algoritmo puro: detecta e repara crepitação no canal lateral (L-R)
// preservando o conteúdo central (L+R). Múltiplas passadas opcionais.
// Funções puras para testes unitários.
(function(root, factory) {
	const api = factory();
	// __factory (não-enumerável) permite embutir este módulo no source do worker.
	Object.defineProperty(api, '__factory', { value: factory, enumerable: false });
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.VynampRestoreDecrackle = api;
})(globalThis, () => {
	'use strict';

	const DEFAULT_SENSITIVITY = 0.12;
	const DEFAULT_PASSES = 2;
	const MAX_PASSES = 5;
	const INTERP_NEIGHBORS = 3;

	/**
	 * Detecta impulsos de crepitação no canal side (L-R).
	 * Usa diferença de segunda ordem relativa ao envelope local.
	 * @param {Float32Array} side - Canal lateral (L-R)/2
	 * @param {number} sensitivity - Threshold [0.03, 0.5]
	 * @returns {Uint8Array} Máscara binária: 1 = impulso detectado
	 */
	function detectSideImpulses(side, sensitivity = DEFAULT_SENSITIVITY) {
		if (!side || side.length < 7) return new Uint8Array(side?.length || 0);
		const n = side.length;
		const mask = new Uint8Array(n);
		// Calcular envelope local usando janela deslizante de 64 amostras
		const winSize = 64;
		const env = new Float32Array(n);
		let sum = 0;
		for (let i = 0; i < Math.min(winSize, n); i++) sum += Math.abs(side[i]);
		env[0] = sum / winSize;
		for (let i = 1; i < n; i++) {
			const addIdx = i + winSize - 1;
			const remIdx = i - 1;
			if (addIdx < n) sum += Math.abs(side[addIdx]);
			if (remIdx >= 0) sum -= Math.abs(side[remIdx]);
			env[i] = Math.max(1e-8, sum / winSize);
		}
		// Detectar impulsos: residual > sensitivity * envelope local
		for (let i = INTERP_NEIGHBORS; i < n - INTERP_NEIGHBORS; i++) {
			const predicted = (side[i - 1] + side[i + 1]) * 0.5;
			const residual = Math.abs(side[i] - predicted);
			if (residual > sensitivity * env[i] && residual > sensitivity * 0.5) {
				mask[i] = 1;
			}
		}
		return mask;
	}

	/**
	 * Repara impulsos marcados por interpolação cúbica nos vizinhos não-impulsivos.
	 * @param {Float32Array} channel - Canal a reparar (modificado em-place)
	 * @param {Uint8Array} mask - Máscara de impulsos (1 = reparar)
	 * @returns {number} Número de amostras reparadas
	 */
	function repairImpulses(channel, mask) {
		if (!channel || !mask || channel.length !== mask.length) return 0;
		const n = channel.length;
		let repaired = 0;
		for (let i = INTERP_NEIGHBORS; i < n - INTERP_NEIGHBORS; i++) {
			if (!mask[i]) continue;
			// Encontrar vizinhos não-impulsivos mais próximos
			let leftVal = 0, rightVal = 0, found = false;
			for (let d = 1; d <= INTERP_NEIGHBORS; d++) {
				if (!mask[i - d]) { leftVal = channel[i - d]; break; }
			}
			for (let d = 1; d <= INTERP_NEIGHBORS; d++) {
				if (!mask[i + d]) { rightVal = channel[i + d]; found = true; break; }
			}
			if (found) {
				channel[i] = (leftVal + rightVal) * 0.5;
				repaired++;
			}
		}
		return repaired;
	}

	/**
	 * Aplica de-crackle mid/side em canais estéreo.
	 * Decompor em mid=(L+R)/2 e side=(L-R)/2, reparar apenas side, recompor.
	 * Múltiplas passadas para crepitação densa.
	 * @param {Float32Array} left - Canal esquerdo (modificado em-place)
	 * @param {Float32Array} right - Canal direito (modificado em-place)
	 * @param {number} sensitivity - Threshold [0.03, 0.5]
	 * @param {number} passes - Número de passadas [1, 5]
	 * @returns {{ repairedTotal: number, passesUsed: number }}
	 */
	function apply(left, right, sensitivity = DEFAULT_SENSITIVITY, passes = DEFAULT_PASSES) {
		if (!left || !right || left.length !== right.length || left.length < 7) {
			return { repairedTotal: 0, passesUsed: 0 };
		}
		const n = left.length;
		passes = Math.max(1, Math.min(MAX_PASSES, passes));
		// Alocar buffers mid/side
		const mid = new Float32Array(n);
		const side = new Float32Array(n);
		let repairedTotal = 0;
		let passesUsed = 0;
		for (let p = 0; p < passes; p++) {
			// Decompor L/R → mid/side
			for (let i = 0; i < n; i++) {
				mid[i] = (left[i] + right[i]) * 0.5;
				side[i] = (left[i] - right[i]) * 0.5;
			}
			// Detectar impulsos no side
			const mask = detectSideImpulses(side, sensitivity);
			// Reparar side
			const repaired = repairImpulses(side, mask);
			repairedTotal += repaired;
			passesUsed++;
			// Se nada foi reparado nesta passada, parar
			if (repaired === 0) break;
			// Recompor mid/side → L/R
			for (let i = 0; i < n; i++) {
				left[i] = mid[i] + side[i];
				right[i] = mid[i] - side[i];
			}
		}
		return { repairedTotal, passesUsed };
	}

	/**
	 * Versão mono: aplica detecção e reparo diretamente no canal.
	 * Útil para fontes mono ou quando não há informação lateral.
	 * @param {Float32Array} channel - Canal a processar (modificado em-place)
	 * @param {number} sensitivity - Threshold [0.03, 0.5]
	 * @param {number} passes - Número de passadas [1, 5]
	 * @returns {{ repairedTotal: number, passesUsed: number }}
	 */
	function applyMono(channel, sensitivity = DEFAULT_SENSITIVITY, passes = DEFAULT_PASSES) {
		if (!channel || channel.length < 7) return { repairedTotal: 0, passesUsed: 0 };
		passes = Math.max(1, Math.min(MAX_PASSES, passes));
		let repairedTotal = 0;
		let passesUsed = 0;
		for (let p = 0; p < passes; p++) {
			const mask = detectSideImpulses(channel, sensitivity);
			const repaired = repairImpulses(channel, mask);
			repairedTotal += repaired;
			passesUsed++;
			if (repaired === 0) break;
		}
		return { repairedTotal, passesUsed };
	}

	return {
		DEFAULT_SENSITIVITY,
		DEFAULT_PASSES,
		MAX_PASSES,
		INTERP_NEIGHBORS,
		detectSideImpulses,
		repairImpulses,
		apply,
		applyMono
	};
});