// Testes unitários puros para o De-crackle Mid/Side (#4) — restore-decrackle.js
// Execute: node tests/restore-decrackle-unit.cjs
'use strict';
const assert = require('assert/strict');
const path = require('path');
const DC = require(path.resolve(__dirname, '..', 'restore-decrackle.js'));

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

function insertImpulse(channel, sampleIndex, amplitude = 0.8) {
	if (sampleIndex >= 0 && sampleIndex < channel.length) {
		channel[sampleIndex] = amplitude;
	}
}

// ─── 1. detectSideImpulses ─────────────────────────────────────────────
test('detectSideImpulses detecta impulsos em canal side sintético', () => {
	const side = makeSilence(1);
	const positions = [5000, 10000, 20000, 30000, 40000];
	for (const pos of positions) insertImpulse(side, pos, 0.9);
	const mask = DC.detectSideImpulses(side, 0.12);
	let detected = 0;
	for (let i = 0; i < mask.length; i++) if (mask[i]) detected++;
	assert(detected >= 3, `Deve detectar pelo menos 3 dos 5 impulsos; detectou ${detected}`);
});

test('detectSideImpulses retorna máscara vazia para silêncio puro', () => {
	const side = makeSilence(0.5);
	const mask = DC.detectSideImpulses(side, 0.12);
	let detected = 0;
	for (let i = 0; i < mask.length; i++) if (mask[i]) detected++;
	assert.strictEqual(detected, 0, `Silêncio deve ter 0 impulsos; obteve ${detected}`);
});

test('detectSideImpulses não marca senoide pura como impulso', () => {
	const side = makeSine(1000, 0.5, 0.3);
	const mask = DC.detectSideImpulses(side, 0.12);
	let detected = 0;
	for (let i = 0; i < mask.length; i++) if (mask[i]) detected++;
	// Senoide suave não deve gerar muitos falsos positivos
	assert(detected < 10, `Senoide 1kHz não deve gerar muitos falsos positivos; obteve ${detected}`);
});

test('detectSideImpulses retorna array vazio para canal muito curto', () => {
	const side = new Float32Array(5);
	const mask = DC.detectSideImpulses(side, 0.12);
	assert.strictEqual(mask.length, 5);
	let detected = 0;
	for (let i = 0; i < mask.length; i++) if (mask[i]) detected++;
	assert.strictEqual(detected, 0);
});

// ─── 2. repairImpulses ─────────────────────────────────────────────────
test('repairImpulses repara amostras marcadas na máscara', () => {
	const ch = makeSilence(0.5);
	insertImpulse(ch, 5000, 0.9);
	const mask = new Uint8Array(ch.length);
	mask[5000] = 1;
	const repaired = DC.repairImpulses(ch, mask);
	assert(repaired > 0, `Deve reparar pelo menos 1 amostra; reparou ${repaired}`);
	// Após reparo, a amostra deve estar próxima de zero (vizinhos são silêncio)
	assert(Math.abs(ch[5000]) < 0.1, `Amostra reparada deve estar próxima de zero; obteve ${ch[5000]}`);
});

test('repairImpulses retorna 0 quando máscara está vazia', () => {
	const ch = makeSilence(0.5);
	const mask = new Uint8Array(ch.length);
	const repaired = DC.repairImpulses(ch, mask);
	assert.strictEqual(repaired, 0);
});

test('repairImpulses preserva amostras não marcadas', () => {
	const ch = makeSine(440, 0.3, 0.5);
	const original = Float32Array.from(ch);
	const mask = new Uint8Array(ch.length); // tudo zero
	DC.repairImpulses(ch, mask);
	let maxDiff = 0;
	for (let i = 0; i < ch.length; i++) maxDiff = Math.max(maxDiff, Math.abs(ch[i] - original[i]));
	assert(maxDiff < 0.001, `Amostras não marcadas devem ser preservadas; maxDiff=${maxDiff}`);
});

// ─── 3. apply (estéreo mid/side) ───────────────────────────────────────
test('apply repara crepitação lateral em estéreo', () => {
	const n = Math.floor(FS * 1);
	const left = new Float32Array(n);
	const right = new Float32Array(n);
	// Inserir impulsos apenas no canal esquerdo (crepitação lateral)
	for (let i = 1000; i < n - 1000; i += 3000) {
		left[i] = 0.85;
	}
	const result = DC.apply(left, right, 0.12, 2);
	assert(result.repairedTotal > 0, `Deve reparar impulsos laterais; reparou ${result.repairedTotal}`);
	assert(result.passesUsed >= 1, `Deve usar pelo menos 1 passada; usou ${result.passesUsed}`);
});

test('apply não altera áudio estéreo limpo', () => {
	const left = makeSine(440, 0.5, 0.3);
	const right = makeSine(440, 0.5, 0.3);
	const origL = Float32Array.from(left);
	const origR = Float32Array.from(right);
	const result = DC.apply(left, right, 0.12, 2);
	assert.strictEqual(result.repairedTotal, 0, `Áudio limpo não deve ter reparos; obteve ${result.repairedTotal}`);
	let maxDiff = 0;
	for (let i = 0; i < left.length; i++) maxDiff = Math.max(maxDiff, Math.abs(left[i] - origL[i]));
	assert(maxDiff < 0.001, `Canal L não deve ser alterado; maxDiff=${maxDiff}`);
});

test('apply com múltiplas passadas repara mais que com 1 passada', () => {
	const n = Math.floor(FS * 1);
	const l1 = new Float32Array(n), r1 = new Float32Array(n);
	const l2 = new Float32Array(n), r2 = new Float32Array(n);
	// Crepitação densa: impulsos a cada 500 amostras
	for (let i = 500; i < n - 500; i += 500) {
		l1[i] = 0.7; l2[i] = 0.7;
	}
	const r1Result = DC.apply(l1, r1, 0.12, 1);
	const r2Result = DC.apply(l2, r2, 0.12, 3);
	assert(r2Result.repairedTotal >= r1Result.repairedTotal,
		`3 passadas (${r2Result.repairedTotal}) devem reparar >= 1 passada (${r1Result.repairedTotal})`);
});

test('apply retorna seguro para canais vazios ou incompatíveis', () => {
	const r1 = DC.apply(null, null, 0.12, 2);
	assert.strictEqual(r1.repairedTotal, 0);
	const r2 = DC.apply(new Float32Array(10), new Float32Array(20), 0.12, 2);
	assert.strictEqual(r2.repairedTotal, 0);
});

test('apply não introduz NaN ou Infinity', () => {
	const left = makeSilence(0.5);
	const right = makeSilence(0.5);
	for (let i = 100; i < left.length - 100; i += 200) left[i] = 0.9;
	DC.apply(left, right, 0.12, 3);
	for (let i = 0; i < left.length; i++) {
		assert(Number.isFinite(left[i]), `L[${i}] não é finito: ${left[i]}`);
		assert(Number.isFinite(right[i]), `R[${i}] não é finito: ${right[i]}`);
	}
});

// ─── 4. applyMono ──────────────────────────────────────────────────────
test('applyMono repara impulsos em canal mono', () => {
	const ch = makeSilence(0.5);
	for (let i = 1000; i < ch.length - 1000; i += 5000) insertImpulse(ch, i, 0.8);
	const result = DC.applyMono(ch, 0.12, 2);
	assert(result.repairedTotal > 0, `Deve reparar impulsos em mono; reparou ${result.repairedTotal}`);
});

test('applyMono retorna seguro para canal muito curto', () => {
	const result = DC.applyMono(new Float32Array(3), 0.12, 2);
	assert.strictEqual(result.repairedTotal, 0);
});

// ─── 5. Constantes exportadas ──────────────────────────────────────────
test('DEFAULT_SENSITIVITY está dentro do intervalo válido [0.03, 0.5]', () => {
	assert(DC.DEFAULT_SENSITIVITY >= 0.03 && DC.DEFAULT_SENSITIVITY <= 0.5,
		`DEFAULT_SENSITIVITY=${DC.DEFAULT_SENSITIVITY} fora de [0.03, 0.5]`);
});

test('MAX_PASSES é positivo e razoável', () => {
	assert(DC.MAX_PASSES > 0 && DC.MAX_PASSES <= 10,
		`MAX_PASSES=${DC.MAX_PASSES} deve ser entre 1 e 10`);
});

test('INTERP_NEIGHBORS é positivo', () => {
	assert(DC.INTERP_NEIGHBORS > 0 && DC.INTERP_NEIGHBORS <= 10,
		`INTERP_NEIGHBORS=${DC.INTERP_NEIGHBORS} deve ser entre 1 e 10`);
});

console.log(`\n${passed} testes passaram.`);
if (process.exitCode) process.exit(1);