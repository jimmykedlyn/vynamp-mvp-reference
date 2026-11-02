// Teste unitário da geração do source do worker (#20/#4).
// O worker roda num Blob isolado: todos os módulos usados dentro dele
// precisam estar embutidos no source gerado.
// Execute: node tests/restore-worker-source-unit.cjs
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.resolve(__dirname, '..');
// Simular o ambiente do browser: os módulos registram-se em globalThis.
const sandbox = { globalThis: null, console, Math, JSON, Object, Array, Float32Array, Float64Array, Uint8Array, DataView, ArrayBuffer, Error, Number, String, Set, Map, isFinite, parseFloat, parseInt };
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

function loadScript(file) {
	const src = fs.readFileSync(path.join(dir, file), 'utf8');
	vm.runInContext(src, sandbox, { filename: file });
}

loadScript('restore-dsp.js');
loadScript('restore-diagnostics.js');
loadScript('restore-click-detector.js');
loadScript('restore-limiter.js');
loadScript('restore-decrackle.js');
loadScript('restore-compare.js');
loadScript('restore-worker.js');

let passed = 0;
const queue = [];
// Testes rodam em sequência; aceitam funções síncronas ou async.
function test(name, fn) {
	queue.push({ name, fn });
}

// batch() do worker é async (cede ao event loop entre itens): aguardar a mensagem.
async function waitFor(posted, type, timeoutMs = 10000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const found = posted.find(m => m.type === type);
		if (found) return found;
		await new Promise(resolve => setTimeout(resolve, 5));
	}
	return null;
}

test('worker source é gerado sem erro', () => {
	const source = sandbox.VynampRestoreWorkerSource();
	assert(typeof source === 'string' && source.length > 0, 'Source deve ser string não vazia');
});

test('worker source embute RestoreKernel', () => {
	const source = sandbox.VynampRestoreWorkerSource();
	assert(source.includes('const RestoreKernel='), 'Source deve conter o kernel');
});

test('worker source embute os módulos de diagnóstico, cliques, limiter e decrackle', () => {
	const source = sandbox.VynampRestoreWorkerSource();
	for (const name of ['VynampRestoreDiagnostics', 'VynampRestoreClickDetector', 'VynampRestoreLimiter', 'VynampRestoreDecrackle']) {
		assert(source.includes('const ' + name + '='), `Source deve embutir ${name}`);
	}
});

test('worker source gerado é JavaScript sintaticamente válido', () => {
	const source = sandbox.VynampRestoreWorkerSource();
	// Compilar sem executar revela erros de sintaxe
	new vm.Script(source);
});

test('módulos embutidos ficam acessíveis dentro do worker', () => {
	const source = sandbox.VynampRestoreWorkerSource();
	// Executar o source num contexto limpo e verificar que as globals existem
	const ctx = { console, Math, JSON, Object, Array, Float32Array, Float64Array, Uint8Array, DataView, ArrayBuffer, Error, Number, String, Set, Map, isFinite, parseFloat, parseInt, postMessage() {} };
	ctx.globalThis = ctx;
	ctx.self = ctx;
	ctx.window = ctx;
	vm.createContext(ctx);
	vm.runInContext(source, ctx, { filename: 'worker-blob.js' });
	// `const` cria binding lexical no escopo do script — consultar via vm,
	// não como propriedade do globalThis.
	for (const name of ['VynampRestoreDiagnostics', 'VynampRestoreClickDetector', 'VynampRestoreLimiter', 'VynampRestoreDecrackle']) {
		const type = vm.runInContext('typeof ' + name, ctx);
		assert(type === 'object', name + ' deve existir no worker (obtido: ' + type + ')');
	}
});

test('diagnóstico funciona dentro do worker isolado (sem escopo da página)', () => {
	const source = sandbox.VynampRestoreWorkerSource();
	const posted = [];
	const ctx = { console, Math, JSON, Object, Array, Float32Array, Float64Array, Uint8Array, DataView, ArrayBuffer, Error, Number, String, Set, Map, isFinite, parseFloat, parseInt, setTimeout, postMessage(m) { posted.push(m); } };
	ctx.globalThis = ctx;
	ctx.self = ctx;
	ctx.window = ctx;
	vm.createContext(ctx);
	vm.runInContext(source, ctx, { filename: 'worker-blob.js' });

	// O handler é atribuído dentro do worker; recuperá-lo do contexto vm
	const dispatch = vm.runInContext('onmessage', ctx);
	assert(typeof dispatch === 'function', 'O worker deve expor onmessage');

	// Simular carga de áudio (silêncio mono 1s a 48kHz)
	const n = 48000;
	const ch = new Float32Array(n);
	dispatch({ data: { type: 'load', channels: [ch], rate: 48000 } });
	const ready = posted.find(m => m.type === 'ready');
	assert(ready, 'Worker deve responder ready após load');

	// Executar o diagnóstico
	posted.length = 0;
	dispatch({ data: { type: 'diagnose', id: 7 } });
	const diag = posted.find(m => m.type === 'diagnostics');
	assert(diag, 'Worker deve responder diagnostics; recebeu: ' + JSON.stringify(posted.map(m => m.type)));
	assert(diag.id === 7, 'O id deve ser preservado');
	assert(Array.isArray(diag.report.defects), 'Relatório deve conter defects');
	assert(Array.isArray(diag.report.chain), 'Relatório deve conter chain');
	assert(diag.report.clickDetection, 'Relatório deve conter clickDetection do detector de cliques');
});

test('erro do worker é reportado quando o motor de diagnóstico falta', () => {	const source = sandbox.VynampRestoreWorkerSource();
	const posted = [];
	// Contexto sem os módulos: simula falha de carregamento
	const ctx = { console, Math, JSON, Object, Array, Float32Array, Float64Array, Uint8Array, DataView, ArrayBuffer, Error, Number, String, Set, Map, isFinite, parseFloat, parseInt, postMessage(m) { posted.push(m); }, onmessage: null };
	ctx.globalThis = ctx;
	ctx.self = ctx;
	ctx.window = ctx;
	ctx.self = ctx;
	vm.createContext(ctx);
	// Source mínimo: só workerMain, sem os módulos
	const workerMainSrc = fs.readFileSync(path.join(dir, 'restore-worker.js'), 'utf8');
	const mainMatch = workerMainSrc.match(/function workerMain\(\)\{[\s\S]*?\n \}/);
	assert(mainMatch, 'Deve encontrar workerMain no source do worker');
	vm.runInContext('const RestoreKernel=function(){};(' + mainMatch[0] + ')();', ctx, { filename: 'worker-min.js' });
	posted.length = 0;
	ctx.onmessage({ data: { type: 'diagnose', id: 1 } });
	const err = posted.find(m => m.type === 'error');
	assert(err, 'Deve reportar erro quando o motor de diagnóstico não está carregado');
});

test('batch processa arquivos sequencialmente e devolve resultados com relatório', async () => {
	const source = sandbox.VynampRestoreWorkerSource();
	const posted = [];
	const ctx = { console, Math, JSON, Object, Array, Float32Array, Float64Array, Uint8Array, DataView, ArrayBuffer, Error, Number, String, Set, Map, isFinite, parseFloat, parseInt, setTimeout, postMessage(m) { posted.push(m); } };
	ctx.globalThis = ctx;
	ctx.self = ctx;
	ctx.window = ctx;
	vm.createContext(ctx);
	vm.runInContext(source, ctx, { filename: 'worker-blob.js' });
	const dispatch = vm.runInContext('onmessage', ctx);

	// Dois itens: um silêncio, um com um impulso de clique
	const n = 48000;
	const silent = new Float32Array(n);
	const clicked = new Float32Array(n);
	clicked[1000] = 0.9;
	const state = { version: 1, duration: 1, enabled: true, monitor: 'treated', scope: 'all', tools: { dc: false, hum: 0, humAdaptive: false, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 0, decrackle: 0 }, regions: [] };

	posted.length = 0;
	dispatch({ data: { type: 'batch', id: 3, items: [
		{ name: 'a.wav', channels: [silent], rate: 48000 },
		{ name: 'b.wav', channels: [clicked], rate: 48000 }
	], state } });
	const done = await waitFor(posted, 'batch-done');
	assert(done, 'Worker deve responder batch-done; recebeu: ' + JSON.stringify(posted.map(m => m.type)));
	assert.strictEqual(done.id, 3, 'O id deve ser preservado');
	assert.strictEqual(done.results.length, 2, 'Deve processar 2 arquivos');
	assert(done.results[0].report, 'Cada item deve ter relatório de diagnóstico');
	assert(done.results[0].buffer, 'Cada item deve ter buffer exportado');
	assert(done.results[0].report.clickDetection, 'Relatório deve incluir detecção de cliques');
	// O arquivo com clique deve reportar cliques detectados
	const clicks = done.results[1].report.clickDetection;
	assert(clicks && clicks.isolated.count >= 1, `Segundo arquivo deve ter cliques detectados; obteve ${JSON.stringify(clicks && clicks.isolated)}`);
});

test('batch com item sem canais reporta falha e continua a fila', async () => {
	const source = sandbox.VynampRestoreWorkerSource();
	const posted = [];
	const ctx = { console, Math, JSON, Object, Array, Float32Array, Float64Array, Uint8Array, DataView, ArrayBuffer, Error, Number, String, Set, Map, isFinite, parseFloat, parseInt, setTimeout, postMessage(m) { posted.push(m); } };
	ctx.globalThis = ctx;
	ctx.self = ctx;
	ctx.window = ctx;
	vm.createContext(ctx);
	vm.runInContext(source, ctx, { filename: 'worker-blob.js' });
	const dispatch = vm.runInContext('onmessage', ctx);

	const n = 48000;
	const ok = new Float32Array(n);
	posted.length = 0;
	dispatch({ data: { type: 'batch', id: 4, items: [
		{ name: 'ruim.wav', channels: [], rate: 48000 },
		{ name: 'bom.wav', channels: [ok], rate: 48000 }
	], state: { version: 1, duration: 1, enabled: true, monitor: 'treated', scope: 'all', tools: {}, regions: [] } } });

	const done = await waitFor(posted, 'batch-done');
	assert(done, 'Worker deve concluir o batch mesmo com item inválido');
	assert.strictEqual(done.results.length, 2, 'A fila deve continuar após uma falha');
	assert(done.results[0].error, 'O item inválido deve ter erro');
	assert(!done.results[1].error, 'O item válido deve ser processado normalmente');
});

// #19 — comparação Original × Tratado da janela visível
function compareWorker(channels) {
	const source = sandbox.VynampRestoreWorkerSource();
	const posted = [];
	const ctx = { console, Math, JSON, Object, Array, Float32Array, Float64Array, Uint8Array, DataView, ArrayBuffer, Error, Number, String, Set, Map, isFinite, parseFloat, parseInt, setTimeout, postMessage(m) { posted.push(m); } };
	ctx.globalThis = ctx;
	ctx.self = ctx;
	ctx.window = ctx;
	vm.createContext(ctx);
	vm.runInContext(source, ctx, { filename: 'worker-blob.js' });
	const dispatch = vm.runInContext('onmessage', ctx);
	dispatch({ data: { type: 'load', channels, rate: 48000 } });
	posted.length = 0;
	return { dispatch, posted };
}
const compareTools = { dc: false, hum: 0, humAdaptive: false, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 0, decrackle: 0 };
const compareState = tools => ({ version: 1, duration: 2, enabled: true, monitor: 'treated', scope: 'all', tools: { ...compareTools, ...tools }, regions: [] });

test('worker source embute o módulo de comparação', () => {
	assert(sandbox.VynampRestoreWorkerSource().includes('const VynampRestoreCompare='));
});

test('compare sem ferramentas ativas devolve Tratado idêntico ao Original', () => {
	const sig = Float32Array.from({ length: 96000 }, (_, i) => Math.sin(i / 11) * 0.5);
	const { dispatch, posted } = compareWorker([sig, sig.slice()]);
	dispatch({ data: { type: 'compare', id: 9, start: 1, end: 2, columns: 64, state: compareState({}) } });
	const cmp = posted.find(m => m.type === 'comparison');
	assert(cmp, 'Worker deve responder comparison; recebeu: ' + JSON.stringify(posted));
	assert.equal(cmp.id, 9);
	assert.equal(cmp.original.length, 2, 'um array de picos por canal');
	assert.equal(cmp.original[0].length, 64);
	assert.equal(cmp.stats.changed, false, 'kernel sem ferramentas deve ser transparente (latência compensada)');
});

test('compare com DC ativo mostra o offset removido no Tratado', () => {
	const sig = new Float32Array(96000).fill(0.3);
	const { dispatch, posted } = compareWorker([sig]);
	dispatch({ data: { type: 'compare', id: 10, start: 1, end: 2, columns: 32, state: compareState({ dc: true }) } });
	const cmp = posted.find(m => m.type === 'comparison');
	assert(cmp, 'Worker deve responder comparison; recebeu: ' + JSON.stringify(posted));
	assert.equal(cmp.stats.changed, true);
	assert(Math.abs(cmp.original[0][0] - 0.3) < 1e-6, 'Original preserva o DC');
	assert(cmp.treated[0][0] < 0.05, 'Tratado deve remover o DC após a pré-rolagem; obteve ' + cmp.treated[0][0]);
	assert(cmp.stats.peakTreatedDB < cmp.stats.peakOriginalDB - 10);
});

test('compare sem áudio carregado reporta erro', () => {
	const source = sandbox.VynampRestoreWorkerSource();
	const posted = [];
	const ctx = { console, Math, JSON, Object, Array, Float32Array, Float64Array, Uint8Array, DataView, ArrayBuffer, Error, Number, String, Set, Map, isFinite, parseFloat, parseInt, setTimeout, postMessage(m) { posted.push(m); } };
	ctx.globalThis = ctx;
	ctx.self = ctx;
	ctx.window = ctx;
	vm.createContext(ctx);
	vm.runInContext(source, ctx, { filename: 'worker-blob.js' });
	vm.runInContext('onmessage', ctx)({ data: { type: 'compare', id: 11, start: 0, end: 1, state: compareState({}) } });
	assert(posted.find(m => m.type === 'error' && m.id === 11));
});

(async () => {
	for (const { name, fn } of queue) {
		try {
			await fn();
			passed++;
			console.log(' ✓ ' + name);
		} catch (e) {
			console.error(' ✗ ' + name);
			console.error('   ' + e.message);
			process.exitCode = 1;
		}
	}
	console.log(`\n${passed} testes passaram.`);
	if (process.exitCode) process.exit(1);
})();