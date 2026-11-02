// Testes unitários puros para restore-model.js — sem Playwright, sem DOM.
// Execute: node tests/restore-model-unit.cjs
'use strict';
const assert = require('assert/strict');
const path = require('path');
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

// ─── Store: criação e snapshot ───────────────────────────────────────
test('Store cria estado inicial válido com duração', () => {
	const s = new M.Store(120);
	assert.equal(s.state.duration, 120);
	assert.equal(s.state.enabled, false);
	assert.equal(s.state.monitor, 'treated');
	assert.equal(s.state.scope, 'all');
	assert.deepEqual(s.state.tools, { dc: false, hum: 0, humAdaptive: false, gate: false, threshold: -45, click: false, clickThreshold: 0.2, rumble: 0, decrackle: 0 });
	assert.deepEqual(s.state.regions, []);
	assert.equal(s.past.length, 0);
	assert.equal(s.future.length, 0);
});

test('snapshot retorna cópia profunda, não referência', () => {
	const s = new M.Store(60);
	const snap = s.snapshot();
	snap.enabled = true;
	snap.regions.push({ id: 'x', start: 0, end: 1, gainDB: 0, fade: 0.02, kind: 'between' });
	assert.equal(s.state.enabled, false);
	assert.equal(s.state.regions.length, 0);
});

// ─── Validação: campos obrigatórios e limites ────────────────────────
test('validate rejeita duration fora do intervalo [0, 86400]', () => {
	assert.throws(() => M.validate(M.initial(10), -1));
	assert.throws(() => M.validate(M.initial(10), 86401));
	assert.throws(() => M.validate(M.initial(10), NaN));
});

test('validate rejeita monitor inválido', () => {
	const raw = M.initial(10);
	raw.monitor = 'invalid';
	assert.throws(() => M.validate(raw, 10));
});

test('validate rejeita scope inválido', () => {
	const raw = M.initial(10);
	raw.scope = 'none';
	assert.throws(() => M.validate(raw, 10));
});

test('validate rejeita hum fora de [0, 50, 60]', () => {
	const raw = M.initial(10);
	raw.tools.hum = 25;
	assert.throws(() => M.validate(raw, 10));
});

test('validate rejeita threshold fora de [-72, -12]', () => {
	const raw = M.initial(10);
	raw.tools.threshold = -80;
	assert.throws(() => M.validate(raw, 10));
	raw.tools.threshold = -5;
	assert.throws(() => M.validate(raw, 10));
});

test('validate rejeita clickThreshold fora de [0.03, 0.9]', () => {
	const raw = M.initial(10);
	raw.tools.clickThreshold = 0.01;
	assert.throws(() => M.validate(raw, 10));
	raw.tools.clickThreshold = 1.0;
	assert.throws(() => M.validate(raw, 10));
});

test('validate rejeita região com start >= end', () => {
	const raw = M.initial(10);
	raw.regions = [{ id: 'a', start: 5, end: 5, gainDB: 0, fade: 0.02, kind: 'between' }];
	assert.throws(() => M.validate(raw, 10));
});

test('validate rejeita região com duração < 10ms', () => {
	const raw = M.initial(10);
	raw.regions = [{ id: 'a', start: 1, end: 1.005, gainDB: 0, fade: 0.02, kind: 'between' }];
	assert.throws(() => M.validate(raw, 10));
});

test('validate rejeita regiões sobrepostas', () => {
	const raw = M.initial(10);
	raw.regions = [
		{ id: 'a', start: 1, end: 3, gainDB: 0, fade: 0.02, kind: 'between' },
		{ id: 'b', start: 2, end: 4, gainDB: 0, fade: 0.02, kind: 'between' }
	];
	assert.throws(() => M.validate(raw, 10));
});

test('validate rejeita mais de 128 regiões', () => {
	const raw = M.initial(100);
	raw.regions = Array.from({ length: 129 }, (_, i) => ({
		id: 'r' + i, start: i * 0.5, end: i * 0.5 + 0.2, gainDB: 0, fade: 0.02, kind: 'between'
	}));
	assert.throws(() => M.validate(raw, 100));
});

test('validate rejeita kind inválido', () => {
	const raw = M.initial(10);
	raw.regions = [{ id: 'a', start: 1, end: 2, gainDB: 0, fade: 0.02, kind: 'unknown' }];
	assert.throws(() => M.validate(raw, 10));
});

test('validate rejeita gainDB fora de [-90, 0]', () => {
	const raw = M.initial(10);
	raw.regions = [{ id: 'a', start: 1, end: 2, gainDB: 5, fade: 0.02, kind: 'between' }];
	assert.throws(() => M.validate(raw, 10));
});

test('validate rejeita fade fora de [0.005, 1]', () => {
	const raw = M.initial(10);
	raw.regions = [{ id: 'a', start: 1, end: 2, gainDB: 0, fade: 0.001, kind: 'between' }];
	assert.throws(() => M.validate(raw, 10));
});

test('validate aceita fade exatamente na metade da duração da região', () => {
	const raw = M.initial(10);
	raw.regions = [{ id: 'a', start: 1, end: 1.02, gainDB: 0, fade: 0.01, kind: 'between' }];
	const valid = M.validate(raw, 10);
	assert.equal(valid.regions[0].fade, 0.01);
});

test('validate clamp fade para metade da duração da região quando excede', () => {
	const raw = M.initial(10);
	raw.regions = [{ id: 'a', start: 1, end: 1.02, gainDB: 0, fade: 0.5, kind: 'between' }];
	const valid = M.validate(raw, 10);
	assert.ok(valid.regions[0].fade <= 0.01 + 1e-9, 'fade deve ser clampado para <= (end-start)/2, got ' + valid.regions[0].fade);
});

test('validate aceita estado mínimo válido', () => {
	const raw = M.initial(10);
	const valid = M.validate(raw, 10);
	assert.equal(valid.version, 1);
	assert.equal(valid.duration, 10);
});

// ─── Undo / Redo ─────────────────────────────────────────────────────
test('undo reverte change e move estado para future', () => {
	const s = new M.Store(10);
	s.change(st => { st.enabled = true; });
	assert.equal(s.state.enabled, true);
	assert.equal(s.past.length, 1);
	s.undo();
	assert.equal(s.state.enabled, false);
	assert.equal(s.past.length, 0);
	assert.equal(s.future.length, 1);
});

test('redo restaura estado desfeito', () => {
	const s = new M.Store(10);
	s.change(st => { st.enabled = true; });
	s.undo();
	s.redo();
	assert.equal(s.state.enabled, true);
	assert.equal(s.future.length, 0);
	assert.equal(s.past.length, 1);
});

test('undo em estado limpo é no-op', () => {
	const s = new M.Store(10);
	s.undo();
	assert.equal(s.state.enabled, false);
	assert.equal(s.past.length, 0);
});

test('redo em estado limpo é no-op', () => {
	const s = new M.Store(10);
	s.redo();
	assert.equal(s.state.enabled, false);
	assert.equal(s.future.length, 0);
});

test('change após undo descarta future', () => {
	const s = new M.Store(10);
	s.change(st => { st.enabled = true; });
	s.undo();
	assert.equal(s.future.length, 1);
	s.change(st => { st.monitor = 'original'; });
	assert.equal(s.future.length, 0);
	assert.equal(s.state.monitor, 'original');
});

test('histórico limita a 60 entradas', () => {
	const s = new M.Store(10);
	for (let i = 0; i < 65; i++) {
		s.change(st => { st.tools.threshold = i % 2 === 0 ? -45 : -30; });
	}
	assert.equal(s.past.length, 60);
});

test('change idêntico não grava no histórico', () => {
	const s = new M.Store(10);
	s.change(st => { st.enabled = false; }); // já é false
	assert.equal(s.past.length, 0);
});

// ─── add / patch / remove ────────────────────────────────────────────
test('add cria região com id único e ordena por start', () => {
	const s = new M.Store(10);
	const id1 = s.add({ start: 3, end: 4, gainDB: -10, fade: 0.02, kind: 'between' });
	const id2 = s.add({ start: 1, end: 2, gainDB: 0, fade: 0.02, kind: 'overlay' });
	assert.equal(s.state.regions.length, 2);
	assert.equal(s.state.regions[0].id, id2); // ordenado por start
	assert.equal(s.state.regions[1].id, id1);
	assert.notEqual(id1, id2);
});

test('patch atualiza campos da região existente', () => {
	const s = new M.Store(10);
	const id = s.add({ start: 1, end: 2, gainDB: 0, fade: 0.02, kind: 'between' });
	s.patch(id, { gainDB: -30, fade: 0.05 });
	const r = s.state.regions.find(r => r.id === id);
	assert.equal(r.gainDB, -30);
	assert.equal(r.fade, 0.05);
});

test('patch em região inexistente lança erro', () => {
	const s = new M.Store(10);
	assert.throws(() => s.patch('nonexistent', { gainDB: -10 }));
});

test('remove elimina região por id', () => {
	const s = new M.Store(10);
	const id = s.add({ start: 1, end: 2, gainDB: 0, fade: 0.02, kind: 'between' });
	assert.equal(s.state.regions.length, 1);
	s.remove(id);
	assert.equal(s.state.regions.length, 0);
});

test('add/patch/remove gravam no histórico para undo', () => {
	const s = new M.Store(10);
	const id = s.add({ start: 1, end: 2, gainDB: 0, fade: 0.02, kind: 'between' });
	s.patch(id, { gainDB: -20 });
	s.remove(id);
	assert.equal(s.past.length, 3);
	s.undo(); // remove → add+patch
	assert.equal(s.state.regions.length, 1);
	s.undo(); // patch → add original
	assert.equal(s.state.regions[0].gainDB, 0);
	s.undo(); // add → empty
	assert.equal(s.state.regions.length, 0);
});

// ─── load ─────────────────────────────────────────────────────────────
test('load substitui estado completo e valida', () => {
	const s = new M.Store(10);
	s.add({ start: 1, end: 2, gainDB: 0, fade: 0.02, kind: 'between' });
	const imported = M.initial(10);
	imported.enabled = true;
	imported.tools.hum = 50;
	s.load(imported);
	assert.equal(s.state.enabled, true);
	assert.equal(s.state.tools.hum, 50);
	assert.equal(s.state.regions.length, 0);
});

test('load com dados inválidos lança erro sem corromper estado', () => {
	const s = new M.Store(10);
	s.add({ start: 1, end: 2, gainDB: 0, fade: 0.02, kind: 'between' });
	const before = s.snapshot();
	assert.throws(() => s.load({ ...M.initial(10), monitor: 'bad' }));
	assert.deepEqual(s.snapshot(), before);
});

// ─── Listeners ────────────────────────────────────────────────────────
test('listeners são notificados em change/add/patch/remove/load', () => {
	const s = new M.Store(10);
	let count = 0;
	s.on(() => count++);
	s.change(st => { st.enabled = true; });
	s.add({ start: 1, end: 2, gainDB: 0, fade: 0.02, kind: 'between' });
	const id = s.state.regions[0].id;
	s.patch(id, { gainDB: -10 });
	s.remove(id);
	s.load(M.initial(10));
	assert.equal(count, 5);
});

test('unsubscribe remove listener', () => {
	const s = new M.Store(10);
	let count = 0;
	const unsub = s.on(() => count++);
	s.change(st => { st.enabled = true; });
	assert.equal(count, 1);
	unsub();
	s.change(st => { st.enabled = false; });
	assert.equal(count, 1);
});

console.log('\n' + passed + ' testes passaram.');
if (process.exitCode) process.exit(1);