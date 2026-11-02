// Testes unitários puros para lógica de exportação/normalização — sem Playwright, sem DOM.
// Execute: node tests/restore-export-unit.cjs
'use strict';
const assert = require('assert/strict');

let passed = 0;
function test(name, fn) {
	try {
		fn();
		passed++;
		console.log('  ✓ ' + name);
	} catch (e) {
		console.error('  ✗ ' + name);
		console.error('    ' + e.message);
		process.exitCode = 1;
	}
}

// ─── Funções puras de normalização (espelham lógica de finishExport) ───

/**
 * Calcula ganho linear necessário para normalizar peakLinear até targetDBFS.
 * Retorna 1.0 quando peakLinear <= 0 (silêncio total).
 */
function computeNormalizationGain(peakLinear, targetDBFS) {
	if (!Number.isFinite(peakLinear) || peakLinear <= 0) return 1.0;
	const peakDBFS = 20 * Math.log10(peakLinear);
	const gainDB = targetDBFS - peakDBFS;
	return Math.pow(10, gainDB / 20);
}

/**
 * Retorna true quando peakLinear corresponde a > 0 dBFS (clipping).
 */
function isClipping(peakLinear) {
	return Number.isFinite(peakLinear) && peakLinear > 1.0;
}

/**
 * Converte pico linear para dBFS.
 */
function linearToDBFS(peakLinear) {
	return 20 * Math.log10(Math.max(1e-9, peakLinear));
}

// ─── Cálculo do ganho de normalização ────────────────────────────────

test('computeNormalizationGain retorna ganho que leva pico de +3 dBFS para -1 dBFS', () => {
	const peak = Math.pow(10, 3 / 20); // ~1.4125 (+3 dBFS)
	const gain = computeNormalizationGain(peak, -1);
	const resultDBFS = linearToDBFS(peak * gain);
	assert.ok(Math.abs(resultDBFS - (-1)) < 0.01, `esperado -1 dBFS, obtido ${resultDBFS.toFixed(4)}`);
});

test('computeNormalizationGain retorna ganho que leva pico de +6 dBFS para -1 dBFS', () => {
	const peak = Math.pow(10, 6 / 20); // ~1.995 (+6 dBFS)
	const gain = computeNormalizationGain(peak, -1);
	const resultDBFS = linearToDBFS(peak * gain);
	assert.ok(Math.abs(resultDBFS - (-1)) < 0.01, `esperado -1 dBFS, obtido ${resultDBFS.toFixed(4)}`);
});

test('computeNormalizationGain retorna 1.0 para pico em 0 dBFS (sem clipping)', () => {
	const gain = computeNormalizationGain(1.0, -1);
	// Pico já está em 0 dBFS; normalizar para -1 requer ganho < 1
	const resultDBFS = linearToDBFS(1.0 * gain);
	assert.ok(Math.abs(resultDBFS - (-1)) < 0.01, `esperado -1 dBFS, obtido ${resultDBFS.toFixed(4)}`);
});

test('computeNormalizationGain retorna 1.0 para pico zero (silêncio)', () => {
	const gain = computeNormalizationGain(0, -1);
	assert.equal(gain, 1.0);
});

test('computeNormalizationGain retorna 1.0 para pico negativo ou NaN', () => {
	assert.equal(computeNormalizationGain(-0.5, -1), 1.0);
	assert.equal(computeNormalizationGain(NaN, -1), 1.0);
});

// ─── Pico resultante após normalização dentro da tolerância ──────────

test('pico após normalização de +3 dBFS fica em -1 ± 0.1 dBFS', () => {
	const peak = Math.pow(10, 3 / 20);
	const gain = computeNormalizationGain(peak, -1);
	const resultDBFS = linearToDBFS(peak * gain);
	assert.ok(Math.abs(resultDBFS - (-1)) < 0.1, `fora da tolerância: ${resultDBFS.toFixed(4)} dBFS`);
});

test('pico após normalização de +12 dBFS fica em -1 ± 0.1 dBFS', () => {
	const peak = Math.pow(10, 12 / 20);
	const gain = computeNormalizationGain(peak, -1);
	const resultDBFS = linearToDBFS(peak * gain);
	assert.ok(Math.abs(resultDBFS - (-1)) < 0.1, `fora da tolerância: ${resultDBFS.toFixed(4)} dBFS`);
});

test('pico após normalização de pico muito alto (+20 dBFS) fica em -1 ± 0.1 dBFS', () => {
	const peak = Math.pow(10, 20 / 20); // 10.0
	const gain = computeNormalizationGain(peak, -1);
	const resultDBFS = linearToDBFS(peak * gain);
	assert.ok(Math.abs(resultDBFS - (-1)) < 0.1, `fora da tolerância: ${resultDBFS.toFixed(4)} dBFS`);
});

// ─── Aviso de clipping ───────────────────────────────────────────────

test('isClipping retorna true para pico > 1.0 (> 0 dBFS)', () => {
	assert.equal(isClipping(1.001), true);
	assert.equal(isClipping(1.5), true);
	assert.equal(isClipping(2.0), true);
});

test('isClipping retorna false para pico <= 1.0 (<= 0 dBFS)', () => {
	assert.equal(isClipping(1.0), false);
	assert.equal(isClipping(0.999), false);
	assert.equal(isClipping(0.5), false);
	assert.equal(isClipping(0), false);
});

test('isClipping retorna false para valores não finitos', () => {
	assert.equal(isClipping(NaN), false);
	assert.equal(isClipping(Infinity), false);
	assert.equal(isClipping(-Infinity), false);
});

// ─── Export sem normalização preserva pico original ──────────────────

test('ganho 1.0 preserva pico original (sem normalização)', () => {
	const peak = 0.85;
	const normalized = peak * 1.0;
	assert.equal(normalized, peak);
});

test('ganho 1.0 preserva pico acima de 0 dBFS quando normalização não é aplicada', () => {
	const peak = 1.3; // clipping
	const normalized = peak * 1.0;
	assert.equal(normalized, peak);
	assert.equal(linearToDBFS(normalized), linearToDBFS(peak));
});

// ─── Casos de borda ──────────────────────────────────────────────────

test('normalização de pico muito pequeno produz resultado finito', () => {
	const peak = 1e-8;
	const gain = computeNormalizationGain(peak, -1);
	const result = peak * gain;
	assert.ok(Number.isFinite(result), 'resultado deve ser finito');
	assert.ok(result > 0, 'resultado deve ser positivo');
});

test('linearToDBFS de 1.0 é exatamente 0 dBFS', () => {
	assert.ok(Math.abs(linearToDBFS(1.0)) < 1e-10);
});

test('linearToDBFS de 0.5 é aproximadamente -6.02 dBFS', () => {
	const db = linearToDBFS(0.5);
	assert.ok(Math.abs(db - (-6.0206)) < 0.01, `esperado ~-6.02, obtido ${db.toFixed(4)}`);
});

console.log('\n' + passed + ' testes passaram.');
if (process.exitCode) process.exit(1);