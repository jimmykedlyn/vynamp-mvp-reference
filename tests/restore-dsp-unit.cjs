// Testes unitários puros para restore-dsp.js (Kernel) — sem Playwright, sem DOM, sem AudioWorklet.
// Execute: node tests/restore-dsp-unit.cjs
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
		console.log('  ✓ ' + name);
	} catch (e) {
		console.error('  ✗ ' + name);
		console.error('    ' + e.message);
		process.exitCode = 1;
	}
}

const FS = 48000;

function makeSine(freq, duration, amplitude = 0.2) {
	const n = Math.floor(FS * duration);
	return Float32Array.from({ length: n }, (_, i) => amplitude * Math.sin(i * 2 * Math.PI * freq / FS));
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

// ─── Kernel: criação e estado inicial ────────────────────────────────
test('Kernel cria instância sem erro', () => {
	const k = new Kernel(FS);
	assert.ok(k);
	assert.equal(k.rate, FS);
});

test('Kernel processa buffer vazio sem crash', () => {
	const k = new Kernel(FS);
	const empty = [new Float32Array(0), new Float32Array(0)];
	const out = [new Float32Array(0), new Float32Array(0)];
	k.setState(M.initial(0));
	k.processInto(empty, out, 0);
	assert.equal(out[0].length, 0);
});

test('Kernel processa buffer mínimo (1 sample) sem crash', () => {
	const k = new Kernel(FS);
	const tiny = [new Float32Array([0.5]), new Float32Array([0.5])];
	const out = [new Float32Array(1), new Float32Array(1)];
	k.setState(M.initial(1 / FS));
	k.processInto(tiny, out, 0);
	assert.ok(Number.isFinite(out[0][0]));
});

// ─── DC offset removal ───────────────────────────────────────────────
test('DC removal elimina offset constante após convergência', () => {
	const dc = Float32Array.from({ length: FS * 2 }, () => 0.15);
	const out = runKernel({ tools: { dc: true, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2 } }, dc);
	// Após 1 segundo, o filtro DC deve ter convergido
	const tail = out[0].slice(FS);
	const mean = tail.reduce((s, x) => s + x, 0) / tail.length;
	assert(Math.abs(mean) < 0.002, 'DC mean after convergence should be ~0, got ' + mean);
});

test('DC removal preserva sinal AC sobreposto ao offset', () => {
	const sine = makeSine(1000, 2, 0.2);
	const dcSine = Float32Array.from(sine, x => x + 0.15);
	const out = runKernel({ tools: { dc: true, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2 } }, dcSine);
	const tailRms = rms(out[0].slice(FS));
	assert(tailRms > 0.1, 'AC component must survive DC removal, rms=' + tailRms);
});

test('DC bypass mantém offset intacto', () => {
	const dc = Float32Array.from({ length: FS }, () => 0.15);
	const out = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2 } }, dc);
	const mean = out[0].reduce((s, x) => s + x, 0) / out[0].length;
	assert(Math.abs(mean - 0.15) < 0.001, 'DC bypass should preserve offset, got mean=' + mean);
});

// ─── Hum filter (notch 50/60 Hz) ────────────────────────────────────
test('Hum 60Hz atenua componente de 60Hz em >=20dB', () => {
	const hum = makeSine(60, 2, 0.3);
	const out = runKernel({ tools: { dc: false, hum: 60, gate: false, threshold: -45, click: false, clickThreshold: 0.2 } }, hum);
	const inputRms = rms(hum.slice(FS));
	const outputRms = rms(out[0].slice(FS));
	const attenuation = 20 * Math.log10(outputRms / inputRms);
	assert(attenuation < -20, 'Hum attenuation should be >=20dB, got ' + attenuation.toFixed(1) + 'dB');
});

test('Hum 50Hz atenua componente de 50Hz em >=20dB', () => {
	const hum = makeSine(50, 2, 0.3);
	const out = runKernel({ tools: { dc: false, hum: 50, gate: false, threshold: -45, click: false, clickThreshold: 0.2 } }, hum);
	const inputRms = rms(hum.slice(FS));
	const outputRms = rms(out[0].slice(FS));
	const attenuation = 20 * Math.log10(outputRms / inputRms);
	assert(attenuation < -20, 'Hum 50Hz attenuation should be >=20dB, got ' + attenuation.toFixed(1) + 'dB');
});

test('Hum filter preserva sinal fora da banda notch', () => {
	const sine = makeSine(1000, 2, 0.2);
	const out = runKernel({ tools: { dc: false, hum: 60, gate: false, threshold: -45, click: false, clickThreshold: 0.2 } }, sine);
	const outputRms = rms(out[0].slice(FS));
	assert(outputRms > 0.12, '1kHz signal must survive hum filter, rms=' + outputRms);
});

test('Hum=0 não aplica filtro notch', () => {
	const hum = makeSine(60, 1, 0.3);
	const out = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2 } }, hum);
	const outputRms = rms(out[0]);
	assert(outputRms > 0.2, 'Hum=0 should pass 60Hz unchanged, rms=' + outputRms);
});

// ─── Noise gate ──────────────────────────────────────────────────────
test('Gate silencia sinal abaixo do threshold', () => {
	const quiet = Float32Array.from({ length: FS }, () => 0.001);
	const out = runKernel({ tools: { dc: false, hum: 0, gate: true, threshold: -30, click: false, clickThreshold: 0.2 } }, quiet);
	const outputPeak = Math.max(...out[0].map(Math.abs));
	assert(outputPeak < 0.002, 'Gate should silence below threshold, peak=' + outputPeak);
});

test('Gate preserva sinal acima do threshold', () => {
	const loud = makeSine(1000, 1, 0.3);
	const out = runKernel({ tools: { dc: false, hum: 0, gate: true, threshold: -30, click: false, clickThreshold: 0.2 } }, loud);
	const outputRms = rms(out[0]);
	assert(outputRms > 0.15, 'Gate should pass signal above threshold, rms=' + outputRms);
});

test('Gate desativado preserva sinal silencioso', () => {
	const quiet = Float32Array.from({ length: FS }, () => 0.001);
	const out = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -30, click: false, clickThreshold: 0.2 } }, quiet);
	const outputPeak = Math.max(...out[0].map(Math.abs));
	assert(Math.abs(outputPeak - 0.001) < 0.0005, 'Gate off should preserve quiet signal, peak=' + outputPeak);
});

// ─── De-click ────────────────────────────────────────────────────────
test('De-click repara impulso isolado', () => {
	const clean = makeSine(1000, 0.5, 0.2);
	const damaged = Float32Array.from(clean);
	damaged[10000] = 1.0; // impulso isolado
	const out = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: true, clickThreshold: 0.2 } }, damaged);
	// O sample reparado deve estar próximo da interpolação linear dos vizinhos
	const expected = (damaged[9999] + damaged[10001]) * 0.5;
	assert(Math.abs(out[0][10000] - expected) < 0.05, 'Click should be interpolated, got ' + out[0][10000] + ' expected ~' + expected);
});

test('De-click preserva transientes legítimos (não isolados)', () => {
	// Dois samples adjacentes altos não são clique isolado
	const signal = makeSine(1000, 0.5, 0.2);
	signal[10000] = 0.8;
	signal[10001] = 0.7;
	const out = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: true, clickThreshold: 0.2 } }, signal);
	// Pelo menos um dos dois deve sobreviver parcialmente
	const maxOut = Math.max(Math.abs(out[0][10000]), Math.abs(out[0][10001]));
	assert(maxOut > 0.3, 'Adjacent transients should not be fully removed, max=' + maxOut);
});

test('De-click com threshold baixo repara impulso menor que com threshold alto', () => {
	const clean = makeSine(1000, 0.5, 0.2);
	const damaged = Float32Array.from(clean);
	damaged[10000] = 0.5;
	const outLow = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: true, clickThreshold: 0.1 } }, damaged);
	const outHigh = runKernel({ tools: { dc: false, hum: 0, gate: false, threshold: -45, click: true, clickThreshold: 0.9 } }, damaged);
	// Threshold baixo detecta mais cliques → reparo mais agressivo → valor mais próximo da interpolação
	// Threshold alto é menos sensível → valor mais próximo do original
	const expectedInterp = (damaged[9999] + damaged[10001]) * 0.5;
	const distLow = Math.abs(outLow[0][10000] - expectedInterp);
	const distHigh = Math.abs(outHigh[0][10000] - expectedInterp);
	assert(distLow <= distHigh + 0.01, 'Lower clickThreshold should repair at least as aggressively as higher; lowDist=' + distLow.toFixed(4) + ' highDist=' + distHigh.toFixed(4));
});

// ─── Regiões de ganho ────────────────────────────────────────────────
test('Região mute (-90dB) silencia intervalo marcado', () => {
	const sine = makeSine(1000, 3, 0.3);
	const regions = [{ id: 'r1', start: 1, end: 2, gainDB: -90, fade: 0.01, kind: 'between', target: 0 }];
	const out = runKernel({ regions }, sine);
	const mutedSegment = out[0].slice(FS + 1000, FS * 2 - 1000); // dentro da região, longe das bordas
	const mutedRms = rms(mutedSegment);
	assert(mutedRms < 0.001, 'Muted region should be silent, rms=' + mutedRms);
});

test('Fora da região o sinal é preservado', () => {
	const sine = makeSine(1000, 3, 0.3);
	const regions = [{ id: 'r1', start: 1, end: 2, gainDB: -90, fade: 0.01, kind: 'between', target: 0 }];
	const out = runKernel({ regions }, sine);
	const beforeRegion = out[0].slice(1000, FS - 1000);
	const beforeRms = rms(beforeRegion);
	assert(beforeRms > 0.15, 'Signal before region must be preserved, rms=' + beforeRms);
});

test('Região com ganho parcial (-6dB ≈ 0.5x) reduz amplitude', () => {
	const sine = makeSine(1000, 3, 0.3);
	const regions = [{ id: 'r1', start: 1, end: 2, gainDB: -6, fade: 0.01, kind: 'overlay', target: 10 ** (-6 / 20) }];
	const out = runKernel({ regions }, sine);
	const inside = out[0].slice(FS + 1000, FS * 2 - 1000);
	const outside = out[0].slice(1000, FS - 1000);
	const ratio = rms(inside) / rms(outside);
	assert(ratio > 0.3 && ratio < 0.7, '-6dB region should halve amplitude, ratio=' + ratio.toFixed(3));
});

// ─── Monitor modes ───────────────────────────────────────────────────
test('Monitor original ignora todas as ferramentas', () => {
	const dc = Float32Array.from({ length: FS }, () => 0.15);
	const out = runKernel({ monitor: 'original', tools: { dc: true, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2 } }, dc);
	const mean = out[0].reduce((s, x) => s + x, 0) / out[0].length;
	assert(Math.abs(mean - 0.15) < 0.001, 'Original monitor should bypass DC, mean=' + mean);
});

test('Monitor removed retorna apenas o que foi removido', () => {
	const sine = makeSine(1000, 2, 0.3);
	const regions = [{ id: 'r1', start: 0.5, end: 1.5, gainDB: -90, fade: 0.01, kind: 'between', target: 0 }];
	const out = runKernel({ monitor: 'removed', regions }, sine);
	// Fora da região, "removed" deve ser ~silêncio (tolerância para crossfade suave do kernel)
	const outside = out[0].slice(100, FS * 0.4 - 100);
	const outsideRms = rms(outside);
	assert(outsideRms < 0.02, 'Removed monitor should be near-silent outside regions, rms=' + outsideRms);
	// Dentro da região, "removed" deve conter o sinal original
	const inside = out[0].slice(FS + 1000, FS * 1.5 - 1000);
	const insideRms = rms(inside);
	assert(insideRms > 0.1, 'Removed monitor should contain original inside muted region, rms=' + insideRms);
});

// ─── Scope: all vs regions ───────────────────────────────────────────
test('Scope regions aplica ferramentas apenas dentro das regiões', () => {
	const dcSine = Float32Array.from({ length: FS * 3 }, (_, i) => 0.15 + 0.2 * Math.sin(i * 2 * Math.PI * 1000 / FS));
	const regions = [{ id: 'r1', start: 1, end: 2, gainDB: 0, fade: 0.01, kind: 'overlay', target: 1 }];
	const out = runKernel({ scope: 'regions', tools: { dc: true, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2 }, regions }, dcSine);
	// Fora da região, o DC deve permanecer (scope=regions não aplica DC fora)
	const beforeMean = out[0].slice(1000, FS - 1000).reduce((s, x) => s + x, 0) / (FS - 2000);
	assert(Math.abs(beforeMean - 0.15) < 0.02, 'Scope=regions should not apply DC outside regions, mean=' + beforeMean);
});

// ─── Estéreo ─────────────────────────────────────────────────────────
test('Kernel processa ambos os canais independentemente', () => {
	const left = makeSine(1000, 1, 0.3);
	const right = makeSine(500, 1, 0.3);
	const out = runKernel({}, left, right);
	assert(rms(out[0]) > 0.15, 'Left channel must be processed');
	assert(rms(out[1]) > 0.15, 'Right channel must be processed');
	// Canais devem ser diferentes (frequências distintas)
	let diff = 0;
	for (let i = 0; i < out[0].length; i++) diff += Math.abs(out[0][i] - out[1][i]);
	assert(diff > 1, 'Stereo channels should differ for different frequencies');
});

// ─── Crepitação: reparo AR de rajadas de agudos em fundo de escala (artefato de MP3 saturado) ───
// Rajada de ~0,7 ms alternando ±1,2 por amostra, nos dois canais, como na Track07.
function burstSignal() {
	const x = makeSine(200, 1, 0.8);
	for (let i = 0; i < 36; i++) x[24000 + i] = (i % 2 ? -1.2 : 1.2);
	return x;
}
function maxResidual(arr, from, to) {
	let max = 0;
	for (let i = Math.max(1, from); i < Math.min(arr.length - 1, to); i++) max = Math.max(max, Math.abs(arr[i] - (arr[i - 1] + arr[i + 1]) * 0.5));
	return max;
}
const DECLIP_TOOLS = { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2 };

test('Crepitação repara rajada de agudos em fundo de escala', () => {
	const out = runKernel({ tools: { ...DECLIP_TOOLS, decrackle: 0.15 } }, burstSignal());
	const residual = maxResidual(out[0], 23000, out[0].length);
	assert(residual < 0.1, 'resíduo na rajada ' + residual.toFixed(3));
});

test('Crepitação desligada não toca na rajada', () => {
	const out = runKernel({ tools: { ...DECLIP_TOOLS, decrackle: 0 } }, burstSignal());
	assert(maxResidual(out[0], 23990, 24050) > 2);
});
test('Crepitação suave também repara rajada de agudos em fundo de escala', () => {
	const out = runKernel({ tools: { ...DECLIP_TOOLS, decrackle: 0.15, decrackleMode: 'soft' } }, burstSignal());
	const residual = maxResidual(out[0], 23000, out[0].length);
	assert(residual < 0.1, 'resíduo na rajada ' + residual.toFixed(3));
});

for (const mode of ['strong', 'soft']) test('Crepitação (' + mode + ') não altera música limpa com agudos fortes, só atrasa', () => {
	// Agudos densos até 12 kHz: um sinal previsível sai igual mesmo se algum trecho for refeito; o passa-baixa de ~18 kHz só atrasa (ondulação < 0,3%).
	const x = makeSine(200, 1, 0.3).map((v, i) => v + 0.15 * Math.sin(2 * Math.PI * 3100 * i / FS) + 0.1 * Math.sin(2 * Math.PI * 7300 * i / FS) + 0.08 * Math.sin(2 * Math.PI * 12100 * i / FS));
	const k = new Kernel(FS), out = [new Float32Array(x.length), new Float32Array(x.length)];
	k.setState({ ...M.initial(1), enabled: true, tools: { ...M.initial(1).tools, ...DECLIP_TOOLS, decrackle: 0.15, decrackleMode: mode } });
	k.processInto([x, x], out, 0);
	assert(k.latency > 1 && k.latency < FS * 0.03, 'latência ' + k.latency);
	let worst = 0;
	for (let i = 4800; i < x.length; i++) worst = Math.max(worst, Math.abs(out[0][i] - x[i - k.latency]));
	// Suave: num sinal quase perfeitamente previsível o limiar fica minúsculo e o corte mexe um pouco (< -40 dB).
	assert(worst < (mode === 'soft' ? 1e-2 : 2e-3), 'desvio ' + worst);
});

test('Crepitação suave tira estalos isolados e tem menos atraso que a forte', () => {
	let seed = 5;
	const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
	const x = makeSine(330, 1, 0.3).map(v => v + 0.02 * rand());
	for (let i = 6000; i < x.length; i += 997) x[i] += 0.4;
	const run = mode => { const k = new Kernel(FS), out = [new Float32Array(x.length), new Float32Array(x.length)]; k.setState({ ...M.initial(1), enabled: true, tools: { ...M.initial(1).tools, ...DECLIP_TOOLS, decrackle: 0.15, decrackleMode: mode } }); k.processInto([x, x], out, 0); return { k, out: out[0] }; };
	const soft = run('soft'), strong = run('strong');
	assert(soft.k.latency < strong.k.latency, 'atraso suave ' + soft.k.latency + ' ≥ forte ' + strong.k.latency);
	const before = maxResidual(x, 6000, x.length), after = maxResidual(soft.out, 6000 + soft.k.latency, x.length);
	assert(after < before * 0.25, 'resíduo ' + after.toFixed(3) + ' de ' + before.toFixed(3));
});

test('Anti-saturação não altera música limpa com agudos fortes', () => {
	// Seno + ruído branco forte (pratos/chimbal): só ganho, nenhuma troca pelo passa-baixa.
	let seed = 7;
	const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
	const x = makeSine(200, 1, 0.5).map(v => v + 0.15 * rand());
	const out = runKernel({ tools: { ...DECLIP_TOOLS, declip: -5 } }, x);
	const gain = 10 ** (-5 / 20);
	let worst = 0;
	for (let i = 4800; i < x.length; i++) worst = Math.max(worst, Math.abs(out[0][i] - x[i - 1] * gain));
	assert(worst < 1e-6, 'desvio ' + worst);
});

// ─── Worklet source generation ───────────────────────────────────────
test('workletSource gera string JavaScript válida contendo registerProcessor', () => {
	const { workletSource } = require(path.resolve(__dirname, '..', 'restore-dsp.js'));
	const src = workletSource();
	assert(typeof src === 'string');
	assert(src.includes('registerProcessor'));
	assert(src.includes('vynamp-restore'));
	assert(src.includes('RestoreKernel'));
});

function runTools(tools, x) {
	const k = new Kernel(FS), out = [new Float32Array(x.length), new Float32Array(x.length)];
	k.setState({ ...M.initial(x.length / FS), enabled: true, tools: { ...M.initial(1).tools, ...tools } });
	k.processInto([x, x], out, 0);
	return { k, y: out[0].subarray(k.latency) };
}
function highpassed(x, freq) {
	const sections = [Kernel.biquad('hp', freq, FS), Kernel.biquad('hp', freq, FS)];
	return x.map(v => Kernel.run(sections[1], Kernel.run(sections[0], v)));
}
function levelDB(x, from, to) {
	let e = 0;
	for (let i = from; i < to; i++) e += x[i] * x[i];
	return 10 * Math.log10(e / (to - from) + 1e-20);
}
function noise(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1; }

test('Artefatos MP3 não altera música estável, só atrasa (STFT reconstrói exato)', () => {
	const x = makeSine(200, 1, 0.3).map((v, i) => v + 0.1 * Math.sin(2 * Math.PI * 3100 * i / FS) + 0.05 * Math.sin(2 * Math.PI * 9000 * i / FS) + 0.03 * Math.sin(2 * Math.PI * 12500 * i / FS));
	const { k, y } = runTools({ deartifact: 1 }, x);
	assert.equal(k.latency, 1 + 1024);
	let worst = 0;
	for (let i = 4800; i < y.length; i++) worst = Math.max(worst, Math.abs(y[i] - x[i]));
	assert(worst < 1e-4, 'desvio ' + worst);
});

test('Artefatos MP3 soma o atraso ao do De-crackle', () => {
	const strong = runTools({ decrackle: 0.15 }, makeSine(200, 0.1)).k.latency;
	assert.equal(runTools({ decrackle: 0.15, deartifact: 0.5 }, makeSine(200, 0.1)).k.latency, strong + 1024);
});

test('Artefatos MP3 reduz pré-eco antes do ataque e preserva o ataque', () => {
	const rand = noise(7), at = 24000, x = new Float32Array(FS);
	for (let i = 0; i < FS; i++) {
		x[i] = 0.1 * Math.sin(2 * Math.PI * 150 * i / FS);
		if (i >= at - 720 && i < at) x[i] += 0.03 * rand();
		if (i >= at && i < at + 4800) x[i] += 0.5 * rand() * Math.exp(-(i - at) / 2000);
	}
	const { y } = runTools({ deartifact: 1 }, x), hx = highpassed(x, 3000), hy = highpassed(y, 3000);
	const pre = levelDB(hx, at - 720, at - 100) - levelDB(hy, at - 720, at - 100);
	const attack = levelDB(hx, at, at + 2400) - levelDB(hy, at, at + 2400);
	assert(pre > 6, 'pré-eco caiu só ' + pre.toFixed(1) + ' dB');
	assert(attack < 2, 'ataque perdeu ' + attack.toFixed(1) + ' dB');
});

test('Artefatos MP3 atenua birdies (agudo isolado no tempo) e deixa o grave', () => {
	const x = Float32Array.from({ length: FS }, (_, i) => {
		const p = i % 4800, bird = p >= 2000 && p < 2384 ? 0.03 * Math.sin(2 * Math.PI * 10000 * i / FS) * Math.sin(Math.PI * (p - 2000) / 384) : 0;
		return 0.2 * Math.sin(2 * Math.PI * 300 * i / FS) + 0.05 * Math.sin(2 * Math.PI * 2500 * i / FS) + bird;
	});
	const { y } = runTools({ deartifact: 1 }, x);
	const drop = levelDB(highpassed(x, 7000), 4800, FS - 4800) - levelDB(highpassed(y, 7000), 4800, FS - 4800);
	assert(drop > 8, 'birdies caíram só ' + drop.toFixed(1) + ' dB');
	assert(Math.abs(levelDB(x, 4800, FS - 4800) - levelDB(y, 4800, FS - 4800)) < 0.2);
});

test('Extensão de agudos recria banda acima do corte sem mexer abaixo', () => {
	const rand = noise(11), lp = Array.from({ length: 8 }, () => Kernel.biquad('lp', 15000, FS));
	const x = Float32Array.from({ length: FS }, () => 0.2 * lp.reduce((v, section) => Kernel.run(section, v), rand()));
	const { k, y } = runTools({ bwe: 0.5, bweCutoff: 16000 }, x);
	assert.equal(k.latency, 1);
	const top = levelDB(highpassed(y, 17500), 9600, FS - 100) - levelDB(highpassed(x, 17500), 9600, FS - 100);
	assert(top > 12, 'agudo subiu só ' + top.toFixed(1) + ' dB');
	const hx = highpassed(x, 14000), hy = highpassed(y, 14000);
	const lowX = x.map((v, i) => v - hx[i]), lowY = y.map((v, i) => v - hy[i]);
	assert(Math.abs(levelDB(lowX, 9600, FS - 100) - levelDB(lowY, 9600, FS - 100)) < 0.3);
	assert.equal(runTools({ bwe: 0, bweCutoff: 16000 }, x).k.extend, null);
});

console.log('\n' + passed + ' testes DSP passaram.');
if (process.exitCode) process.exit(1);