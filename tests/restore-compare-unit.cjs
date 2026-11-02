// Teste unitário da comparação lado a lado (#19).
// Execute: node tests/restore-compare-unit.cjs
'use strict';
const assert = require('assert/strict');
const path = require('path');
const C = require(path.resolve(__dirname, '..', 'restore-compare.js'));

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

test('validMode aceita off/wipe/stacked e rejeita o resto', () => {
	assert.equal(C.validMode('wipe'), 'wipe');
	assert.equal(C.validMode('stacked'), 'stacked');
	assert.equal(C.validMode('off'), 'off');
	assert.equal(C.validMode('side'), 'off');
	assert.equal(C.validMode(undefined), 'off');
});

test('clampSplit limita o divisor e usa o padrão para valores inválidos', () => {
	assert.equal(C.clampSplit(0.3), 0.3);
	assert.equal(C.clampSplit(-1), C.MIN_SPLIT);
	assert.equal(C.clampSplit(5), C.MAX_SPLIT);
	assert.equal(C.clampSplit('x'), C.DEFAULT_SPLIT);
	assert.equal(C.clampSplit(NaN), C.DEFAULT_SPLIT);
});

test('computePeaks devolve o pico absoluto por coluna', () => {
	const ch = new Float32Array(100);
	ch[10] = -0.8;
	ch[60] = 0.4;
	const peaks = C.computePeaks(ch, 0, 100, 4);
	assert.equal(peaks.length, 4);
	assert(Math.abs(peaks[0] - 0.8) < 1e-6, 'coluna 0 contém −0.8');
	assert.equal(peaks[1], 0);
	assert(Math.abs(peaks[2] - 0.4) < 1e-6, 'coluna 2 contém 0.4');
	assert.equal(peaks[3], 0);
});

test('computePeaks com mais colunas que amostras não estoura nem deixa NaN', () => {
	const ch = Float32Array.from([0.1, 0.5, 0.2]);
	const peaks = C.computePeaks(ch, 0, 3, 10);
	assert.equal(peaks.length, 10);
	assert(peaks.every(Number.isFinite));
	assert(Math.abs(Math.max(...peaks) - 0.5) < 1e-6);
});

test('computePeaks respeita o trecho [from, to) e limita colunas', () => {
	const ch = new Float32Array(1000);
	ch[5] = 1;
	ch[500] = 0.3;
	const peaks = C.computePeaks(ch, 400, 600, 2);
	assert.equal(peaks[0], 0, 'impulso em 5 está fora do trecho');
	assert(Math.abs(peaks[1] - 0.3) < 1e-6);
	assert.equal(C.computePeaks(ch, 0, 1000, 1e6).length, C.MAX_COLUMNS);
});

test('computePeaks de trecho vazio devolve zeros', () => {
	const peaks = C.computePeaks(new Float32Array(10), 20, 30, 5);
	assert.equal(peaks.length, 5);
	assert(peaks.every(v => v === 0));
});

test('diffStats sem diferença marca changed=false', () => {
	const a = Float32Array.from({ length: 480 }, (_, i) => Math.sin(i / 7) * 0.5);
	const stats = C.diffStats([a], [a.slice()]);
	assert.equal(stats.changed, false);
	assert.equal(stats.rmsRemovedDB, C.SILENCE_DB);
	assert.equal(C.summary(stats), 'Tratado idêntico ao original neste trecho.');
});

test('diffStats mede a remoção relativa (metade da amplitude ≈ −6 dB removido)', () => {
	const a = Float32Array.from({ length: 4800 }, (_, i) => Math.sin(i / 7) * 0.5);
	const b = a.map(v => v * 0.5);
	const stats = C.diffStats([a], [b]);
	assert.equal(stats.changed, true);
	assert(Math.abs(stats.removedRelativeDB - (-6.02)) < 0.05, 'obtido ' + stats.removedRelativeDB);
	assert(Math.abs(stats.rmsOriginalDB - stats.rmsTreatedDB - 6.02) < 0.05);
	assert(Math.abs(stats.peakOriginalDB - stats.peakTreatedDB - 6.02) < 0.05);
});

test('diffStats de clique removido mostra pico menor no tratado', () => {
	const a = new Float32Array(1000);
	a[500] = 0.9;
	const b = new Float32Array(1000);
	const stats = C.diffStats([a, a], [b, b]);
	assert(stats.peakOriginalDB > -1 && stats.peakTreatedDB === C.SILENCE_DB);
	assert(Math.abs(stats.removedRelativeDB) < 1e-6, 'removeu tudo ⇒ 0 dB relativo');
	assert(/Removido/.test(C.summary(stats)));
});

test('diffStats com silêncio em ambos não gera NaN', () => {
	const stats = C.diffStats([new Float32Array(100)], [new Float32Array(100)]);
	for (const v of Object.values(stats)) if (typeof v === 'number') assert(Number.isFinite(v));
});

test('layout wipe divide horizontalmente no ponto do divisor', () => {
	const l = C.layout('wipe', 800, 140, 0.25);
	assert.equal(l.divider, 200);
	assert.deepEqual(l.original, { x: 0, y: 0, w: 200, h: 140 });
	assert.deepEqual(l.treated, { x: 200, y: 0, w: 600, h: 140 });
});

test('layout stacked divide verticalmente e cobre a altura inteira', () => {
	const l = C.layout('stacked', 800, 141, 0.9);
	assert.equal(l.original.h + l.treated.h, 141);
	assert.equal(l.treated.y, l.original.h);
	assert.equal(l.original.w, 800);
});

test('layout off não tem área tratada', () => {
	const l = C.layout('foo', 800, 140, 0.5);
	assert.equal(l.mode, 'off');
	assert.equal(l.treated, null);
});

test('renderWindow inclui pré-rolagem e respeita os limites do áudio', () => {
	const w = C.renderWindow(1, 2, 48000, 96000);
	assert.equal(w.from, 48000);
	assert.equal(w.to, 96000);
	assert.equal(w.prerollFrom, 48000 - C.PREROLL_SECONDS * 48000);
	const start = C.renderWindow(0, 5, 48000, 96000);
	assert.equal(start.prerollFrom, 0);
	assert.equal(start.to, 96000, 'fim limitado ao comprimento');
});

test('módulo expõe __factory não-enumerável para embutir no worker', () => {
	assert.equal(typeof C.__factory, 'function');
	assert(!Object.keys(C).includes('__factory'));
});

console.log(`\n${passed} testes passaram.`);
if (process.exitCode) process.exit(1);
