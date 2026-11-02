// Testes unitários puros para o True-peak Limiter (#20d) — restore-limiter.js
// Execute: node tests/restore-limiter-unit.cjs
'use strict';
const assert = require('assert/strict');
const path = require('path');
const L = require(path.resolve(__dirname, '..', 'restore-limiter.js'));

let passed = 0;
function test(name, fn) {
	try {
		fn();
		passed++;
		console.log(' ✓ ' + name);
	} catch (e) {
		console.error(' ✗ ' + name);
		console.error('   ' + e.message);
		process.exitCode = 1;
	}
}

const FS = 48000;

function makeSine(freq, duration, amplitude = 0.5) {
	const n = Math.floor(FS * duration);
	return Float32Array.from({ length: n }, (_, i) => amplitude * Math.sin(2 * Math.PI * freq * i / FS));
}

// ─── 1. measureTruePeak ────────────────────────────────────────────────
test('measureTruePeak de sinal DC retorna amplitude correta', () => {
	const ch = new Float32Array(1000).fill(0.7);
	const tp = L.measureTruePeak(ch);
	assert(Math.abs(tp - 0.7) < 0.01, `Esperava ~0.7, obteve ${tp}`);
});

test('measureTruePeak detecta pico inter-sample > amostral em senoide próxima de Nyquist', () => {
	// Senoide em FS/4 com amplitude 0.9 → picos inter-sample podem exceder 0.9
	const ch = makeSine(FS / 4, 0.1, 0.9);
	const samplePeak = ch.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
	const tp = L.measureTruePeak(ch);
	// True peak deve ser >= sample peak
	assert(tp >= samplePeak - 0.001, `True peak (${tp}) deve ser >= sample peak (${samplePeak})`);
});

test('measureTruePeak de silêncio retorna 0', () => {
	const ch = new Float32Array(1000);
	assert.strictEqual(L.measureTruePeak(ch), 0);
});

// ─── 2. measureTruePeakMulti ───────────────────────────────────────────
test('measureTruePeakMulti retorna max entre canais', () => {
	const ch1 = new Float32Array(500).fill(0.3);
	const ch2 = new Float32Array(500).fill(0.8);
	const tp = L.measureTruePeakMulti([ch1, ch2]);
	assert(Math.abs(tp - 0.8) < 0.01, `Esperava ~0.8, obteve ${tp}`);
});

// ─── 3. apply: bypass quando abaixo do teto ────────────────────────────
test('apply não altera sinal abaixo do teto (-1 dBTP)', () => {
	const ch = makeSine(440, 0.5, 0.5);
	const original = Float32Array.from(ch);
	const result = L.apply([ch], FS, -1.0);
	assert.strictEqual(result.gainApplied, 1, 'gainApplied deve ser 1 quando abaixo do teto');
	let maxDiff = 0;
	for (let i = 0; i < ch.length; i++) maxDiff = Math.max(maxDiff, Math.abs(ch[i] - original[i]));
	assert(maxDiff < 0.001, `Sinal não deve ser alterado; maxDiff=${maxDiff}`);
});

// ─── 4. apply: limita sinal acima do teto ──────────────────────────────
test('apply reduz true peak para <= teto quando sinal excede', () => {
	const ch = makeSine(440, 0.5, 1.2); // pico amostral 1.2 (> 0 dBFS)
	const result = L.apply([ch], FS, -1.0);
	assert(result.peakBefore > L.dbToLinear(-1.0), `peakBefore (${result.peakBefore}) deve exceder teto`);
	assert(result.peakAfter <= L.dbToLinear(-1.0) + 0.02, `peakAfter (${result.peakAfter}) deve estar <= teto + tolerância`);
	assert(result.gainApplied < 1, 'gainApplied deve ser < 1');
});

test('apply com teto -3 dBTP limita mais agressivamente que -1 dBTP', () => {
	const ch1 = makeSine(1000, 0.3, 1.1);
	const ch2 = Float32Array.from(ch1);
	const r1 = L.apply([ch1], FS, -1.0);
	const r2 = L.apply([ch2], FS, -3.0);
	assert(r2.peakAfter < r1.peakAfter, `Teto -3dB (${r2.peakAfter}) deve resultar em pico menor que -1dB (${r1.peakAfter})`);
});

// ─── 5. apply: preserva sinal silencioso ───────────────────────────────
test('apply em silêncio retorna gainApplied=1 e peakAfter=0', () => {
	const ch = new Float32Array(1000);
	const result = L.apply([ch], FS, -1.0);
	assert.strictEqual(result.gainApplied, 1);
	assert.strictEqual(result.peakAfter, 0);
});

// ─── 6. apply: não introduz NaN ou Infinity ────────────────────────────
test('apply não introduz NaN ou Infinity', () => {
	const ch = makeSine(8000, 0.2, 1.5);
	L.apply([ch], FS, -1.0);
	for (let i = 0; i < ch.length; i++) {
		assert(Number.isFinite(ch[i]), `Amostra ${i} não é finita: ${ch[i]}`);
	}
});

// ─── 7. apply: funciona em estéreo ─────────────────────────────────────
test('apply limita ambos os canais estéreo simetricamente', () => {
	const left = makeSine(440, 0.3, 1.3);
	const right = makeSine(440, 0.3, 1.3);
	L.apply([left, right], FS, -1.0);
	const tpL = L.measureTruePeak(left);
	const tpR = L.measureTruePeak(right);
	assert(Math.abs(tpL - tpR) < 0.01, `Canais devem ser simétricos; L=${tpL}, R=${tpR}`);
	const ceiling = L.dbToLinear(-1.0);
	assert(tpL <= ceiling + 0.02, `L true peak (${tpL}) deve estar <= teto`);
});

// ─── 8. apply: hard clip como segurança final ──────────────────────────
test('apply garante nenhuma amostra excede ±1.0 após processamento', () => {
	const ch = makeSine(100, 0.5, 2.0); // pico muito alto
	L.apply([ch], FS, -1.0);
	for (let i = 0; i < ch.length; i++) {
		assert(ch[i] <= 1.0 && ch[i] >= -1.0, `Amostra ${i} fora de [-1,1]: ${ch[i]}`);
	}
});

// ─── 9. dbToLinear / linearToDb ────────────────────────────────────────
test('dbToLinear(0) = 1.0', () => {
	assert(Math.abs(L.dbToLinear(0) - 1.0) < 1e-10);
});

test('dbToLinear(-1) ≈ 0.8913', () => {
	assert(Math.abs(L.dbToLinear(-1) - 0.89125) < 0.001);
});

test('linearToDb(1.0) = 0', () => {
	assert(Math.abs(L.linearToDb(1.0)) < 1e-10);
});

// ─── 10. interpolateCubic ──────────────────────────────────────────────
test('interpolateCubic retorna 4 valores', () => {
	const result = L.interpolateCubic(0, 0.5, 1.0, 0.5);
	assert.strictEqual(result.length, 4);
});

test('interpolateCubic com valores constantes retorna constante', () => {
	const result = L.interpolateCubic(0.5, 0.5, 0.5, 0.5);
	for (let k = 0; k < 4; k++) {
		assert(Math.abs(result[k] - 0.5) < 0.01, `Valor interpolado ${k} deve ser ~0.5, obteve ${result[k]}`);
	}
});

// ─── 11. apply com array vazio ─────────────────────────────────────────
test('apply com canais vazios retorna resultado seguro', () => {
	const result = L.apply([], FS, -1.0);
	assert.strictEqual(result.peakBefore, 0);
	assert.strictEqual(result.peakAfter, 0);
	assert.strictEqual(result.gainApplied, 1);
});

console.log(`\n${passed} testes passaram.`);
if (process.exitCode) process.exit(1);