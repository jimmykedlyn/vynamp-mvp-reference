// Testes unitários puros para o kernel DSP com De-crackle mid/side e Hum adaptativo (#4).
// Execute: node tests/restore-adaptive-unit.cjs
'use strict';
const assert = require('assert/strict');
const path = require('path');
const { Kernel } = require(path.resolve(__dirname, '..', 'restore-dsp.js'));
const M = require(path.resolve(__dirname, '..', 'restore-model.js'));

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

function makeSine(freq, duration, amplitude = 0.3) {
	const n = Math.floor(FS * duration);
	return Float32Array.from({ length: n }, (_, i) => amplitude * Math.sin(2 * Math.PI * freq * i / FS));
}

function rms(arr, start = 0, end = arr.length) {
	let sum = 0;
	for (let i = start; i < end; i++) sum += arr[i] * arr[i];
	return Math.sqrt(sum / (end - start));
}

function runKernel(cfg, left, right = left) {
	const k = new Kernel(FS);
	const out = [new Float32Array(left.length), new Float32Array(right.length)];
	k.setState({ ...M.initial(left.length / FS), enabled: true, ...cfg });
	k.processInto([left, right], out, 0);
	return out;
}

const BASE = { dc: false, hum: 0, humAdaptive: false, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 0, decrackle: 0 };

// ─── Hum adaptativo ────────────────────────────────────────────────────
test('Hum adaptativo atenua 50Hz quando ativado sem frequência explícita', () => {
	const sig = makeSine(50, 2, 0.5);
	const off = runKernel({ tools: { ...BASE } }, sig);
	const on = runKernel({ tools: { ...BASE, humAdaptive: true } }, sig);
	const half = Math.floor(sig.length / 2);
	const rmsOff = rms(off[0], half);
	const rmsOn = rms(on[0], half);
	const attenDB = 20 * Math.log10(rmsOff / Math.max(1e-10, rmsOn));
	assert(attenDB >= 20, `Atenuação de 50Hz esperada >=20dB, obteve ${attenDB.toFixed(1)}dB`);
});

test('Hum adaptativo atenua 60Hz quando ativado sem frequência explícita', () => {
	const sig = makeSine(60, 2, 0.5);
	const off = runKernel({ tools: { ...BASE } }, sig);
	const on = runKernel({ tools: { ...BASE, humAdaptive: true } }, sig);
	const half = Math.floor(sig.length / 2);
	const rmsOff = rms(off[0], half);
	const rmsOn = rms(on[0], half);
	const attenDB = 20 * Math.log10(rmsOff / Math.max(1e-10, rmsOn));
	assert(attenDB >= 20, `Atenuação de 60Hz esperada >=20dB, obteve ${attenDB.toFixed(1)}dB`);
});

test('Hum adaptativo preserva sinal musical (440Hz)', () => {
	const sig = makeSine(440, 2, 0.4);
	const off = runKernel({ tools: { ...BASE } }, sig);
	const on = runKernel({ tools: { ...BASE, humAdaptive: true } }, sig);
	const half = Math.floor(sig.length / 2);
	const rmsOff = rms(off[0], half);
	const rmsOn = rms(on[0], half);
	const ratio = rmsOn / Math.max(1e-10, rmsOff);
	assert(ratio > 0.85, `Preservação de 440Hz esperada >85%, obteve ${(ratio * 100).toFixed(1)}%`);
});

test('Hum adaptativo desativado não aplica filtro', () => {
	const sig = makeSine(50, 1, 0.5);
	const off = runKernel({ tools: { ...BASE } }, sig);
	const off2 = runKernel({ tools: { ...BASE, humAdaptive: false } }, sig);
	const half = Math.floor(sig.length / 2);
	const a = rms(off[0], half), b = rms(off2[0], half);
	assert(Math.abs(a - b) < 0.001, `Sem hum adaptativo não deve filtrar; diff=${Math.abs(a - b).toFixed(6)}`);
});

// ─── De-crackle mid/side no kernel ─────────────────────────────────────
test('De-crackle repara crepitação lateral isolada no canal esquerdo', () => {
	const n = Math.floor(FS * 1);
	const left = new Float32Array(n);
	const right = new Float32Array(n);
	// Crepitação apenas em L (impulsos esparsos)
	for (let i = 1000; i < n - 1000; i += 4000) left[i] = 0.85;
	const out = runKernel({ tools: { ...BASE, decrackle: 0.12 } }, left, right);
	// O impulso original deve ter sido atenuado no canal L
	const idx = 1000;
	assert(Math.abs(out[0][idx]) < Math.abs(left[idx]),
		`Impulso lateral deve ser reparado; antes=${Math.abs(left[idx]).toFixed(3)}, depois=${Math.abs(out[0][idx]).toFixed(3)}`);
});

test('De-crackle preserva conteúdo central (mid) de sinal estéreo comum', () => {
	const n = Math.floor(FS * 1);
	const left = new Float32Array(n);
	const right = new Float32Array(n);
	// Mesmo sinal em L e R → mid cheio, side vazio
	for (let i = 0; i < n; i++) {
		const v = 0.4 * Math.sin(2 * Math.PI * 300 * i / FS);
		left[i] = v; right[i] = v;
	}
	const out = runKernel({ tools: { ...BASE, decrackle: 0.12 } }, left, right);
	const half = Math.floor(n / 2);
	const rmsOff = rms(left, half);
	const rmsOn = rms(out[0], half);
	const ratio = rmsOn / Math.max(1e-10, rmsOff);
	assert(ratio > 0.95, `Conteúdo central deve ser preservado >95%; obteve ${(ratio * 100).toFixed(1)}%`);
});

test('De-crackle=0 não altera o áudio', () => {
	const sig = makeSine(440, 0.5, 0.3);
	const out = runKernel({ tools: { ...BASE, decrackle: 0 } }, sig);
	// O kernel tem latência de 1 amostra (raw = pending, pending = incoming)
	let maxDiff = 0;
	for (let i = 1; i < sig.length; i++) maxDiff = Math.max(maxDiff, Math.abs(out[0][i] - sig[i - 1]));
	assert(maxDiff < 0.002, `decrackle=0 não deve alterar o sinal; maxDiff=${maxDiff.toFixed(6)}`);
});

test('De-crackle não introduz NaN ou Infinity', () => {
	const n = Math.floor(FS * 0.5);
	const left = new Float32Array(n), right = new Float32Array(n);
	for (let i = 100; i < n - 100; i += 300) left[i] = 0.9;
	const out = runKernel({ tools: { ...BASE, decrackle: 0.2 } }, left, right);
	for (let i = 0; i < n; i++) {
		assert(Number.isFinite(out[0][i]), `L[${i}] não é finito: ${out[0][i]}`);
		assert(Number.isFinite(out[1][i]), `R[${i}] não é finito: ${out[1][i]}`);
	}
});

test('De-crackle não funciona em mono (requer estéreo) sem crash', () => {
	const sig = makeSine(440, 0.3, 0.3);
	const out = runKernel({ tools: { ...BASE, decrackle: 0.15 } }, sig);
	for (let i = 0; i < sig.length; i++) assert(Number.isFinite(out[0][i]), `Amostra ${i} não é finita`);
});

// ─── Modelo aceita os novos campos ─────────────────────────────────────
test('Modelo aceita decrackle no intervalo [0, 0.5]', () => {
	const base = M.initial(10);
	const valid = M.validate({ ...base, tools: { ...base.tools, decrackle: 0.25 } }, 10);
	assert.strictEqual(valid.tools.decrackle, 0.25);
	assert.throws(() => M.validate({ ...base, tools: { ...base.tools, decrackle: -0.1 } }, 10), /Parâmetros de restauração inválidos/);
	assert.throws(() => M.validate({ ...base, tools: { ...base.tools, decrackle: 0.9 } }, 10), /Parâmetros de restauração inválidos/);
});

test('Modelo aceita humAdaptive booleano e rejeita não-booleano', () => {
	const base = M.initial(10);
	const valid = M.validate({ ...base, tools: { ...base.tools, humAdaptive: true } }, 10);
	assert.strictEqual(valid.tools.humAdaptive, true);
	assert.throws(() => M.validate({ ...base, tools: { ...base.tools, humAdaptive: 'sim' } }, 10), /Parâmetros de restauração inválidos/);
});

console.log(`\n${passed} testes passaram.`);
if (process.exitCode) process.exit(1);