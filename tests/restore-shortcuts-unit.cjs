// Testes unitários puros para atalhos de teclado (#14) — sem Playwright, sem DOM.
// Valida lógica de undo/redo, criação de região via seleção e zoom proporcional.
// Execute: node tests/restore-shortcuts-unit.cjs
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

// ─── Undo/Redo via store (integração com atalhos) ────────────────────
test('Ctrl+Z desfaz última alteração de região', () => {
	const s = new M.Store(60);
	s.add({ start: 1, end: 2, gainDB: -90, fade: 0.02, kind: 'between' });
	assert.equal(s.state.regions.length, 1);
	s.undo(); // simula Ctrl+Z
	assert.equal(s.state.regions.length, 0);
	assert.equal(s.past.length, 0);
	assert.equal(s.future.length, 1);
});

test('Ctrl+Shift+Z refaz região desfeita', () => {
	const s = new M.Store(60);
	s.add({ start: 1, end: 2, gainDB: -90, fade: 0.02, kind: 'between' });
	s.undo();
	assert.equal(s.state.regions.length, 0);
	s.redo(); // simula Ctrl+Shift+Z
	assert.equal(s.state.regions.length, 1);
	assert.equal(s.state.regions[0].start, 1);
	assert.equal(s.state.regions[0].end, 2);
});

test('Ctrl+Y refaz após undo', () => {
	const s = new M.Store(60);
	s.change(st => { st.enabled = true; });
	s.undo();
	assert.equal(s.state.enabled, false);
	s.redo(); // Ctrl+Y também dispara redo
	assert.equal(s.state.enabled, true);
});

test('Undo/redo preservam seleção sincronizada', () => {
	const s = new M.Store(60);
	const id = s.add({ start: 5, end: 10, gainDB: 0, fade: 0.02, kind: 'between' });
	let selected = id;
	s.undo();
	// syncSelection: região removida, selected deve limpar
	const found = s.state.regions.find(r => r.id === selected);
	if (!found) selected = '';
	assert.equal(selected, '');
	s.redo();
	const restored = s.state.regions.find(r => Math.abs(r.start - 5) < 0.001 && Math.abs(r.end - 10) < 0.001);
	if (restored) selected = restored.id;
	assert.notEqual(selected, '');
	assert.equal(s.state.regions.length, 1);
});

// ─── Criação de região via atalho R (lógica pura) ────────────────────
test('Atalho R cria região com selection atual', () => {
	const s = new M.Store(60);
	const selection = { start: 3.5, end: 7.2 };
	const kind = 'between';
	// Simula lógica do handler R: valida e adiciona
	if (selection.end - selection.start >= 0.01 - 1e-9) {
		const id = s.add({ ...selection, gainDB: kind === 'between' ? -90 : 0, fade: 0.02, kind });
		assert.ok(id);
	}
	assert.equal(s.state.regions.length, 1);
	assert.equal(s.state.regions[0].start, 3.5);
	assert.equal(s.state.regions[0].end, 7.2);
	assert.equal(s.state.regions[0].gainDB, -90);
	assert.equal(s.state.regions[0].kind, 'between');
});

test('Atalho R com overlay cria região com gainDB 0', () => {
	const s = new M.Store(60);
	const selection = { start: 1, end: 2 };
	const kind = 'overlay';
	if (selection.end - selection.start >= 0.01 - 1e-9) {
		s.add({ ...selection, gainDB: kind === 'between' ? -90 : 0, fade: 0.02, kind });
	}
	assert.equal(s.state.regions[0].kind, 'overlay');
	assert.equal(s.state.regions[0].gainDB, 0);
});

test('Atalho R rejeita seleção menor que 10ms', () => {
	const s = new M.Store(60);
	const selection = { start: 5, end: 5.005 };
	let threw = false;
	try {
		if (selection.end - selection.start < 0.01 - 1e-9) throw Error('Selecione pelo menos 10 ms.');
		s.add({ ...selection, gainDB: -90, fade: 0.02, kind: 'between' });
	} catch {
		threw = true;
	}
	assert.ok(threw, 'Deve lançar erro para seleção < 10ms');
	assert.equal(s.state.regions.length, 0);
});

test('Atalho R grava no histórico para undo', () => {
	const s = new M.Store(60);
	const selection = { start: 2, end: 4 };
	s.add({ ...selection, gainDB: -90, fade: 0.02, kind: 'between' });
	assert.equal(s.past.length, 1);
	s.undo();
	assert.equal(s.state.regions.length, 0);
});

// ─── Zoom proporcional centrado no cursor ────────────────────────────
function applyZoom(view, duration, cursor, deltaY) {
	const span = view.end - view.start;
	const factor = deltaY > 0 ? 1.2 : 1 / 1.2;
	const newSpan = Math.max(0.05, Math.min(duration, span * factor));
	const ratio = (cursor - view.start) / span;
	const start = Math.max(0, Math.min(cursor - newSpan * ratio, duration - newSpan));
	return { start, end: start + newSpan };
}

test('Zoom in reduz span em ~20% centrado no cursor', () => {
	const view = { start: 10, end: 20 };
	const result = applyZoom(view, 60, 15, -100); // scroll up = zoom in
	const span = result.end - result.start;
	assert.ok(span < 10, 'Span deve diminuir: got ' + span);
	assert.ok(Math.abs(span - 10 / 1.2) < 0.5, 'Span ≈ 8.33: got ' + span);
	// Cursor deve permanecer na mesma posição relativa
	const ratioBefore = (15 - 10) / 10;
	const ratioAfter = (15 - result.start) / span;
	assert.ok(Math.abs(ratioBefore - ratioAfter) < 0.01, 'Proporção do cursor preservada');
});

test('Zoom out aumenta span em ~20% centrado no cursor', () => {
	const view = { start: 10, end: 20 };
	const result = applyZoom(view, 60, 15, 100); // scroll down = zoom out
	const span = result.end - result.start;
	assert.ok(span > 10, 'Span deve aumentar: got ' + span);
	assert.ok(Math.abs(span - 10 * 1.2) < 0.5, 'Span ≈ 12: got ' + span);
});

test('Zoom clamp no mínimo 0.05s', () => {
	const view = { start: 5, end: 5.06 };
	const result = applyZoom(view, 60, 5.03, -100);
	assert.ok(result.end - result.start >= 0.05 - 1e-9, 'Mínimo 0.05s: got ' + (result.end - result.start));
});

test('Zoom clamp na duração total', () => {
	const view = { start: 0, end: 59 };
	const result = applyZoom(view, 60, 30, 100);
	assert.ok(result.end - result.start <= 60 + 1e-9, 'Não excede duração: got ' + (result.end - result.start));
	assert.ok(result.start >= 0, 'Start não negativo');
	assert.ok(result.end <= 60 + 1e-9, 'End não excede duração');
});

test('Zoom no início da faixa mantém start em 0', () => {
	const view = { start: 0, end: 10 };
	const result = applyZoom(view, 60, 2, 100); // zoom out perto do início
	assert.equal(result.start, 0, 'Start clampado em 0: got ' + result.start);
});

test('Zoom no fim da faixa mantém end na duração', () => {
	const view = { start: 50, end: 60 };
	const result = applyZoom(view, 60, 58, 100); // zoom out perto do fim
	assert.ok(Math.abs(result.end - 60) < 1e-9, 'End clampado em 60: got ' + result.end);
});

console.log('\n' + passed + ' testes passaram.');
if (process.exitCode) process.exit(1);