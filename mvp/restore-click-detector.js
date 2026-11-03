// Detecção Automática de Cliques (#6)
// Algoritmo puro para pré-análise: detecta impulsos isolados e crepitação densa.
// Retorna timestamps e contagens; não modifica o áudio.
// Funções puras para testes unitários.
(function(root, factory) {
	const api = factory();
	// __factory (não-enumerável) permite embutir este módulo no source do worker.
	Object.defineProperty(api, '__factory', { value: factory, enumerable: false });
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.VynampRestoreClickDetector = api;
})(globalThis, () => {
	'use strict';

	const DEFAULT_SENSITIVITY = 0.18;
	const MAX_EXAMPLES = 20;
	const MIN_ISOLATION_SAMPLES = 3;

	/**
 * Detecta cliques isolados em um canal usando diferença de segunda ordem.
 * Um clique é um impulso curto onde |x[n] - (x[n-1]+x[n+1])/2| > threshold
 * E os vizinhos NÃO são também impulsivos (isolamento).
 * @param {Float32Array} channel - Dados do canal
 * @param {number} sampleRate - Taxa de amostragem
 * @param {number} sensitivity - Threshold de detecção [0.03, 0.9]
 * @returns {{ count: number, timestamps: number[] }}
 */
	function detectIsolated(channel, sampleRate, sensitivity = DEFAULT_SENSITIVITY) {
 if (!channel || channel.length < 5) return { count: 0, timestamps: [] };
 const n = channel.length;
 const timestamps = [];
 let count = 0;
 for (let i = 2; i < n - 2; i++) {
 const predicted = (channel[i - 1] + channel[i + 1]) * 0.5;
 const residual = Math.abs(channel[i] - predicted);
 if (residual > sensitivity) {
 // Verificar isolamento: vizinhos devem ter residual significativamente
 // menor que o candidato (fator 0.6). Para um clique em silêncio,
 // vizinho imediato tem residual = clique/2 = 0.5 * residual,
 // então 0.5 < 0.6 passa. Vizinhos mais distantes têm residual = 0.
 let neighborMax = 0;
 for (let d = 1; d <= 3; d++) {
 if (i - d >= 1 && i - d < n - 1) {
 const rp = Math.abs(channel[i - d] - (channel[i - d - 1] + channel[i - d + 1]) * 0.5);
 if (rp > neighborMax) neighborMax = rp;
 }
 if (i + d >= 1 && i + d < n - 1) {
 const rn = Math.abs(channel[i + d] - (channel[i + d - 1] + channel[i + d + 1]) * 0.5);
 if (rn > neighborMax) neighborMax = rn;
 }
 }
 // Vizinhos devem ter residual < 60% do residual do candidato
 if (neighborMax < residual * 0.6) {
 count++;
 if (timestamps.length < MAX_EXAMPLES) {
 timestamps.push(i / sampleRate);
 }
 }
 }
 }
 return { count, timestamps };
	}

	/**
 * Detecta crepitação densa comparando energia de impulsos no canal lateral vs mid.
 * Conta impulsos em cada canal separadamente. Se impulsos aparecem
 * predominantemente em apenas um canal (XOR), é crepitação lateral.
 * @param {Float32Array} left - Canal esquerdo
 * @param {Float32Array} right - Canal direito
 * @param {number} sampleRate - Taxa de amostragem
 * @param {number} sensitivity - Threshold de detecção
 * @returns {{ isLateral: boolean, sideCount: number, midCount: number, timestamps: number[] }}
 */
	function detectCrackle(left, right, sampleRate, sensitivity = DEFAULT_SENSITIVITY) {
 if (!left || !right || left.length < 5 || left.length !== right.length) {
 return { isLateral: false, sideCount: 0, midCount: 0, timestamps: [] };
 }
 const n = left.length;
 let sideCount = 0;
 let midCount = 0;
 const timestamps = [];

 for (let i = 2; i < n - 2; i++) {
 // Impulso em L
 const lPred = (left[i - 1] + left[i + 1]) * 0.5;
 const lRes = Math.abs(left[i] - lPred);
 // Impulso em R
 const rPred = (right[i - 1] + right[i + 1]) * 0.5;
 const rRes = Math.abs(right[i] - rPred);

 const lIsImpulse = lRes > sensitivity;
 const rIsImpulse = rRes > sensitivity;

 // Side impulse: impulso em L XOR R (não em ambos simultaneamente)
 if ((lIsImpulse && !rIsImpulse) || (!lIsImpulse && rIsImpulse)) {
 sideCount++;
 if (timestamps.length < MAX_EXAMPLES) {
 timestamps.push(i / sampleRate);
 }
 }
 // Mid impulse: impulso em ambos os canais simultaneamente
 if (lIsImpulse && rIsImpulse) {
 midCount++;
 }
 }

 const isLateral = sideCount > midCount * 2 && sideCount > 10;
 return { isLateral, sideCount, midCount, timestamps };
	}

	/**
 * Análise completa de cliques em áudio multicanal.
 * @param {Float32Array[]} channels - Array de canais
 * @param {number} sampleRate - Taxa de amostragem
 * @param {number} sensitivity - Threshold [0.03, 0.9]
 * @returns {{ isolated: {count, timestamps}, crackle: {isLateral, sideCount, midCount, timestamps}, total: number }}
 */
	function analyze(channels, sampleRate, sensitivity = DEFAULT_SENSITIVITY) {
 if (!channels || channels.length === 0) {
 return {
 isolated: { count: 0, timestamps: [] },
 crackle: { isLateral: false, sideCount: 0, midCount: 0, timestamps: [] },
 total: 0
 };
 }
 // Detectar cliques isolados em cada canal
 let totalIsolated = 0;
 const allTimestamps = [];
 for (const ch of channels) {
 const result = detectIsolated(ch, sampleRate, sensitivity);
 totalIsolated += result.count;
 for (const t of result.timestamps) {
 if (allTimestamps.length < MAX_EXAMPLES) allTimestamps.push(t);
 }
 }
 allTimestamps.sort((a, b) => a - b);

 // Detectar crepitação se estéreo
 let crackle = { isLateral: false, sideCount: 0, midCount: 0, timestamps: [] };
 if (channels.length >= 2) {
 crackle = detectCrackle(channels[0], channels[1], sampleRate, sensitivity);
 }

 return {
 isolated: { count: totalIsolated, timestamps: allTimestamps.slice(0, MAX_EXAMPLES) },
 crackle,
 total: totalIsolated + (crackle.isLateral ? crackle.sideCount : 0)
 };
	}

	return {
 DEFAULT_SENSITIVITY,
 MAX_EXAMPLES,
 MIN_ISOLATION_SAMPLES,
 detectIsolated,
 detectCrackle,
 analyze
	};
});