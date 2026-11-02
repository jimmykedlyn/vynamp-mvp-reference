// Testes unitários puros para redução espectral de chiado/hiss (#2) no restore-dsp.js Kernel.
// Execute: node tests/restore-denoise-unit.cjs
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

function makeNoise(duration, amplitude = 0.1) {
	const n = Math.floor(FS * duration);
	// Ruído branco pseudo-aleatório determinístico (seed fixa via LCG)
	let seed = 12345;
	const lcg = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 4294967296) * 2 - 1; };
	return Float32Array.from({ length: n }, () => amplitude * lcg());
}

function rms(arr) {
	let sum = 0;
	for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
	return Math.sqrt(sum / arr.length);
}

function runKernel(cfg, left, right = left) {
	const k = new Kernel(FS);
	const out = [new Float32Array(left.length), new Float32Array(right.length)];
	k.setState({ ...M.initial(left.length / FS), enabled: true, ...cfg });
	k.processInto([left, right], out, 0);
	return out;
}

// ─── Denoise: comportamento básico ──────────────────────────────────
test('Denoise=0 não aplica atenuação adicional além do pipeline base', () => {
	const sine = makeSine(1000, 1, 0.3);
	const outOff = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 0 } }, sine);
	const outOn = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 0.8 } }, sine);
	// Com denoise=0 vs denoise=0.8, a diferença deve ser significativa apenas quando denoise está ativo
	const half = Math.floor(sine.length / 2);
	const rmsOff = rms(outOff[0].slice(half));
	const rmsOn = rms(outOn[0].slice(half));
	assert(rmsOn < rmsOff, 'denoise=0.8 must attenuate more than denoise=0; off=' + rmsOff.toFixed(4) + ' on=' + rmsOn.toFixed(4));
});

test('Denoise atenua ruído branco em >=3dB', () => {
	const noise = makeNoise(2, 0.1);
	const outOff = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 0 } }, noise);
	const outOn = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 0.8 } }, noise);
	// Usar apenas a segunda metade para evitar transiente de convergência do envelope de ruído
	const half = Math.floor(noise.length / 2);
	const rmsOff = rms(outOff[0].slice(half));
	const rmsOn = rms(outOn[0].slice(half));
	const attenuation = 20 * Math.log10(rmsOn / rmsOff);
	assert(attenuation < -3, 'Denoise should attenuate noise by >=3dB, got ' + attenuation.toFixed(1) + 'dB');
});

test('Denoise preserva sinal tonal forte (>50% da amplitude original)', () => {
	const sine = makeSine(1000, 2, 0.3);
	const out = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 0.8 } }, sine);
	// Usar último quarto para evitar transiente de convergência do envelope de ruído
	const q3 = Math.floor(sine.length * 0.75);
	const inputRms = rms(sine.slice(q3));
	const outputRms = rms(out[0].slice(q3));
	const preservation = outputRms / inputRms;
	assert(preservation > 0.5, 'Strong tonal signal must survive denoise (>50%), got ' + (preservation * 100).toFixed(1) + '%');
});

test('Denoise com sinal+ruído reduz RMS do sinal processado vs bypass', () => {
	const sine = makeSine(1000, 2, 0.3);
	const noise = makeNoise(2, 0.1);
	const mixed = Float32Array.from(sine, (v, i) => v + noise[i]);
	const outOff = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 0 } }, mixed);
	const outOn = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 0.8 } }, mixed);
	// Usar último quarto para evitar transiente de convergência do envelope de ruído
	const q3 = Math.floor(mixed.length * 0.75);
	const rmsOff = rms(outOff[0].slice(q3));
	const rmsOn = rms(outOn[0].slice(q3));
	// O denoise deve reduzir a energia total do sinal processado (ruído removido)
	assert(rmsOn < rmsOff, 'Denoise must reduce total signal energy; off=' + rmsOff.toFixed(4) + ' on=' + rmsOn.toFixed(4));
});

test('Denoise amount maior produz mais atenuação de ruído', () => {
	const noise = makeNoise(2, 0.1);
	const outLow = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 0.3 } }, noise);
	const outHigh = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 0.9 } }, noise);
	const half = Math.floor(noise.length / 2);
	const rmsLow = rms(outLow[0].slice(half));
	const rmsHigh = rms(outHigh[0].slice(half));
	assert(rmsHigh < rmsLow, 'Higher denoise amount should produce more noise attenuation; low=' + rmsLow.toFixed(4) + ' high=' + rmsHigh.toFixed(4));
});

test('Denoise funciona em ambos os canais estéreo', () => {
	const noiseL = makeNoise(2, 0.1);
	const noiseR = makeNoise(2, 0.15);
	const out = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 0.8 } }, noiseL, noiseR);
	const half = Math.floor(noiseL.length / 2);
	const rmsLIn = rms(noiseL.slice(half));
	const rmsRIn = rms(noiseR.slice(half));
	const rmsLOut = rms(out[0].slice(half));
	const rmsROut = rms(out[1].slice(half));
	assert(rmsLOut < rmsLIn, 'Left channel noise must be attenuated');
	assert(rmsROut < rmsRIn, 'Right channel noise must be attenuated');
});

test('Denoise não introduz NaN ou Infinity', () => {
	const noise = makeNoise(1, 0.5);
	const out = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 1.0 } }, noise);
	for (let i = 0; i < out[0].length; i++) {
		assert(Number.isFinite(out[0][i]), 'Output sample ' + i + ' is not finite: ' + out[0][i]);
	}
});

test('Denoise combinado com DC removal funciona corretamente', () => {
	const dcNoise = Float32Array.from(makeNoise(2, 0.1), x => x + 0.15);
	const out = runKernel({ tools: { dc: true, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 0.7 } }, dcNoise);
	const half = Math.floor(dcNoise.length / 2);
	const mean = out[0].slice(half).reduce((s, x) => s + x, 0) / (dcNoise.length / 2);
	const outputRms = rms(out[0].slice(half));
	assert(Math.abs(mean) < 0.01, 'DC must still be removed with denoise active, mean=' + mean);
	assert(outputRms < rms(dcNoise.slice(half)), 'Noise must still be attenuated with DC removal active');
});

console.log('\n' + passed + ' testes denoise passaram.');
if (process.exitCode) process.exit(1);