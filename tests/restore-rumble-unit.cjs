// Testes unitários puros para o filtro de-rumble passa-altas (#20c) no restore-dsp.js Kernel.
// Execute: node tests/restore-rumble-unit.cjs
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
	return Float32Array.from({ length: n }, (_, i) => amplitude * Math.sin(i * 2 * Math.PI * freq / FS));
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

// ─── De-rumble: atenuação abaixo da frequência de corte ────────────────
test('De-rumble 30Hz atenua componente de 10Hz em >=18dB', () => {
	const low = makeSine(10, 2, 0.5);
	const outOff = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 0 } }, low);
	const outOn = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 30 } }, low);
	// Medir RMS na segunda metade (após convergência do filtro)
	const half = Math.floor(low.length / 2);
	const rmsOff = rms(outOff[0], half);
	const rmsOn = rms(outOn[0], half);
	const attenuationDB = 20 * Math.log10(rmsOff / Math.max(1e-10, rmsOn));
	// Biquad 2ª ordem Butterworth: ~12dB/oitava; 10Hz vs corte 30Hz ≈ 19dB teórico
	assert(attenuationDB >= 18, `Atenuação esperada >=18dB, obteve ${attenuationDB.toFixed(1)}dB (off=${rmsOff.toFixed(4)}, on=${rmsOn.toFixed(4)})`);
});

test('De-rumble 30Hz preserva sinal acima de 100Hz (>90% da amplitude)', () => {
	const high = makeSine(200, 2, 0.3);
	const outOff = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 0 } }, high);
	const outOn = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 30 } }, high);
	const half = Math.floor(high.length / 2);
	const rmsOff = rms(outOff[0], half);
	const rmsOn = rms(outOn[0], half);
	const ratio = rmsOn / Math.max(1e-10, rmsOff);
	assert(ratio > 0.9, `Preservação esperada >90%, obteve ${(ratio * 100).toFixed(1)}% (off=${rmsOff.toFixed(4)}, on=${rmsOn.toFixed(4)})`);
});

test('De-rumble=0 não aplica filtro passa-altas', () => {
	const low = makeSine(15, 2, 0.4);
	const outOff = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 0 } }, low);
	const outZero = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 0 } }, low);
	const half = Math.floor(low.length / 2);
	const rmsOff = rms(outOff[0], half);
	const rmsZero = rms(outZero[0], half);
	assert(Math.abs(rmsOff - rmsZero) < 0.001, `rumble=0 deve ser idêntico a bypass; diff=${Math.abs(rmsOff - rmsZero).toFixed(6)}`);
});

test('De-rumble funciona em ambos os canais estéreo', () => {
	const low = makeSine(10, 2, 0.5);
	const out = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 30 } }, low, low);
	const half = Math.floor(low.length / 2);
	const rmsL = rms(out[0], half);
	const rmsR = rms(out[1], half);
	assert(Math.abs(rmsL - rmsR) < 0.001, `Canais devem ser simétricos; L=${rmsL.toFixed(4)}, R=${rmsR.toFixed(4)}`);
});

test('De-rumble não introduz NaN ou Infinity', () => {
	const signal = makeSine(50, 1, 0.3);
	const out = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 40 } }, signal);
	for (let i = 0; i < out[0].length; i++) {
		assert(Number.isFinite(out[0][i]), `Amostra ${i} não é finita: ${out[0][i]}`);
	}
});

test('De-rumble combinado com DC removal funciona corretamente', () => {
	const n = Math.floor(FS * 2);
	const signal = Float32Array.from({ length: n }, (_, i) => 0.02 + 0.3 * Math.sin(2 * Math.PI * 10 * i / FS));
	const out = runKernel({ tools: { dc: true, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 30 } }, signal);
	const half = Math.floor(n / 2);
	const rmsOut = rms(out[0], half);
	// DC + rumble devem remover tanto o offset quanto o grave
	assert(rmsOut < 0.05, `RMS após DC+rumble deve ser baixo; obteve ${rmsOut.toFixed(4)}`);
});

test('De-rumble com frequência mais alta (60Hz) atenua mais agressivamente', () => {
	const low = makeSine(20, 2, 0.5);
	const out30 = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 30 } }, low);
	const out60 = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 60 } }, low);
	const half = Math.floor(low.length / 2);
	const rms30 = rms(out30[0], half);
	const rms60 = rms(out60[0], half);
	assert(rms60 < rms30, `rumble=60 deve atenuar mais que rumble=30 em 20Hz; rms30=${rms30.toFixed(4)}, rms60=${rms60.toFixed(4)}`);
});

test('Modelo valida campo rumble no intervalo [0, 80]', () => {
	const base = M.initial(10);
	const valid = M.validate({ ...base, tools: { ...base.tools, rumble: 30 } }, 10);
	assert.strictEqual(valid.tools.rumble, 30);
	assert.throws(() => M.validate({ ...base, tools: { ...base.tools, rumble: -1 } }, 10), /Parâmetros de restauração inválidos/);
	assert.throws(() => M.validate({ ...base, tools: { ...base.tools, rumble: 100 } }, 10), /Parâmetros de restauração inválidos/);
});

console.log(`\n${passed} testes passaram.`);
if (process.exitCode) process.exit(1);