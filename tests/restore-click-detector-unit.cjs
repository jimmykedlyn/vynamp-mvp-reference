// Testes unitários puros para o Detector Automático de Cliques (#6) — restore-click-detector.js
// Execute: node tests/restore-click-detector-unit.cjs
'use strict';
const assert = require('assert/strict');
const path = require('path');
const D = require(path.resolve(__dirname, '..', 'restore-click-detector.js'));

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

function makeSilence(duration) {
	return new Float32Array(Math.floor(FS * duration));
}

function makeSine(freq, duration, amplitude = 0.3) {
	const n = Math.floor(FS * duration);
	return Float32Array.from({ length: n }, (_, i) => amplitude * Math.sin(2 * Math.PI * freq * i / FS));
}

function insertClick(channel, sampleIndex, amplitude = 0.9) {
	if (sampleIndex >= 0 && sampleIndex < channel.length) {
		channel[sampleIndex] = amplitude;
	}
}

// ─── 1. detectIsolated: cliques sintéticos ─────────────────────────────
test('detectIsolated detecta 10 cliques em posições conhecidas', () => {
	const ch = makeSilence(2);
	const positions = [1000, 5000, 10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000];
	for (const pos of positions) insertClick(ch, pos, 0.9);
	const result = D.detectIsolated(ch, FS, 0.18);
	assert.strictEqual(result.count, 10, `Esperava 10 cliques, obteve ${result.count}`);
	// Verificar que todos os timestamps estão próximos das posições inseridas (±50ms = ±2400 samples)
	for (const ts of result.timestamps) {
		const samplePos = Math.round(ts * FS);
		const nearest = positions.reduce((best, p) => Math.abs(p - samplePos) < Math.abs(best - samplePos) ? p : best, positions[0]);
		assert(Math.abs(nearest - samplePos) <= 2400, `Timestamp ${ts}s (${samplePos}) deve estar próximo de uma posição conhecida; mais próximo=${nearest}`);
	}
});

test('detectIsolated não detecta cliques em silêncio puro', () => {
	const ch = makeSilence(1);
	const result = D.detectIsolated(ch, FS, 0.18);
	assert.strictEqual(result.count, 0, `Silêncio deve ter 0 cliques, obteve ${result.count}`);
});

test('detectIsolated não classifica senoide pura como clique', () => {
	const ch = makeSine(440, 1, 0.5);
	const result = D.detectIsolated(ch, FS, 0.18);
	assert.strictEqual(result.count, 0, `Senoide 440Hz não deve ser classificada como clique; obteve ${result.count}`);
});

test('detectIsolated com threshold baixo detecta mais que com threshold alto', () => {
	const ch = makeSilence(1);
	insertClick(ch, 5000, 0.3); // clique pequeno
	const low = D.detectIsolated(ch, FS, 0.10);
	const high = D.detectIsolated(ch, FS, 0.50);
	assert(low.count >= high.count, `Threshold baixo (${low.count}) deve detectar >= que alto (${high.count})`);
});

test('detectIsolated retorna array vazio para canal muito curto', () => {
	const ch = new Float32Array(3);
	const result = D.detectIsolated(ch, FS, 0.18);
	assert.strictEqual(result.count, 0);
	assert.strictEqual(result.timestamps.length, 0);
});

// ─── 2. detectCrackle: crepitação lateral ──────────────────────────────
test('detectCrackle identifica crepitação lateral quando side >> mid', () => {
	const n = Math.floor(FS * 2);
	const left = new Float32Array(n);
	const right = new Float32Array(n);
	// Inserir impulsos apenas no canal esquerdo (side forte, mid fraco)
	for (let i = 100; i < n - 100; i += 200) {
		left[i] = 0.8;
	}
	const result = D.detectCrackle(left, right, FS, 0.18);
	assert(result.isLateral === true, `Deve detectar crepitação lateral; isLateral=${result.isLateral}, side=${result.sideCount}, mid=${result.midCount}`);
	assert(result.sideCount > result.midCount * 2, `Side (${result.sideCount}) deve ser >2x mid (${result.midCount})`);
});

test('detectCrackle não marca como lateral quando ambos canais têm impulsos iguais', () => {
	const n = Math.floor(FS * 2);
	const left = new Float32Array(n);
	const right = new Float32Array(n);
	for (let i = 100; i < n - 100; i += 200) {
		left[i] = 0.8;
		right[i] = 0.8;
	}
	const result = D.detectCrackle(left, right, FS, 0.18);
	assert(result.isLateral === false, `Impulsos iguais em L/R não devem ser crepitação lateral; isLateral=${result.isLateral}`);
});

test('detectCrackle retorna seguro para canais vazios ou incompatíveis', () => {
	const r1 = D.detectCrackle(null, null, FS, 0.18);
	assert.strictEqual(r1.isLateral, false);
	assert.strictEqual(r1.sideCount, 0);
	const r2 = D.detectCrackle(new Float32Array(10), new Float32Array(20), FS, 0.18);
	assert.strictEqual(r2.isLateral, false);
});

// ─── 3. analyze: análise completa multicanal ───────────────────────────
test('analyze retorna estrutura correta com campos isolated, crackle e total', () => {
	const ch = makeSilence(1);
	insertClick(ch, 5000, 0.9);
	const result = D.analyze([ch], FS, 0.18);
	assert(result.isolated !== undefined, 'Deve ter campo isolated');
	assert(result.crackle !== undefined, 'Deve ter campo crackle');
	assert(typeof result.total === 'number', 'Deve ter campo total numérico');
	assert(Array.isArray(result.isolated.timestamps), 'isolated.timestamps deve ser array');
});

test('analyze com áudio limpo retorna total=0', () => {
	const ch = makeSilence(1);
	const result = D.analyze([ch], FS, 0.18);
	assert.strictEqual(result.total, 0, `Áudio limpo deve ter total=0, obteve ${result.total}`);
	assert.strictEqual(result.isolated.count, 0);
});

test('analyze limita timestamps a MAX_EXAMPLES', () => {
	const ch = makeSilence(5);
	// Inserir 50 cliques
	for (let i = 1000; i < ch.length - 1000; i += 2000) {
		insertClick(ch, i, 0.9);
	}
	const result = D.analyze([ch], FS, 0.18);
	assert(result.isolated.timestamps.length <= D.MAX_EXAMPLES, `Timestamps devem ser limitados a ${D.MAX_EXAMPLES}; obteve ${result.isolated.timestamps.length}`);
});

test('analyze com canais vazios retorna resultado seguro', () => {
	const result = D.analyze([], FS, 0.18);
	assert.strictEqual(result.total, 0);
	assert.strictEqual(result.isolated.count, 0);
});

test('analyze em estéreo com cliques apenas em L detecta crepitação lateral', () => {
	const n = Math.floor(FS * 2);
	const left = new Float32Array(n);
	const right = new Float32Array(n);
	for (let i = 100; i < n - 100; i += 150) {
		left[i] = 0.85;
	}
	const result = D.analyze([left, right], FS, 0.18);
	assert(result.crackle.isLateral === true, `Deve detectar crepitação lateral em estéreo; isLateral=${result.crackle.isLateral}`);
});

// ─── 4. Constantes exportadas ──────────────────────────────────────────
test('DEFAULT_SENSITIVITY está dentro do intervalo válido [0.03, 0.9]', () => {
	assert(D.DEFAULT_SENSITIVITY >= 0.03 && D.DEFAULT_SENSITIVITY <= 0.9,
		`DEFAULT_SENSITIVITY=${D.DEFAULT_SENSITIVITY} fora de [0.03, 0.9]`);
});

test('MAX_EXAMPLES é positivo e razoável', () => {
	assert(D.MAX_EXAMPLES > 0 && D.MAX_EXAMPLES <= 100,
		`MAX_EXAMPLES=${D.MAX_EXAMPLES} deve ser entre 1 e 100`);
});

console.log(`\n${passed} testes passaram.`);
if (process.exitCode) process.exit(1);