// Testes unitários puros para o Sistema de Presets (#20b) — restore-presets.js
// Execute: node tests/restore-presets-unit.cjs
'use strict';
const assert = require('assert/strict');
const path = require('path');
const P = require(path.resolve(__dirname, '..', 'restore-presets.js'));

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

// ─── 1. Presets built-in ────────────────────────────────────────────────
test('BUILT_IN contém exatamente 5 presets', () => {
	assert.strictEqual(P.BUILT_IN.length, 5, `Esperava 5 presets built-in, obteve ${P.BUILT_IN.length}`);
});

test('Todos os presets built-in têm id, name, description, tools e builtIn=true', () => {
	for (const p of P.BUILT_IN) {
		assert(p.id.startsWith('builtin-'), `ID deve começar com builtin-: ${p.id}`);
		assert(typeof p.name === 'string' && p.name.length > 0, 'Nome deve ser string não vazia');
		assert(typeof p.description === 'string', 'Descrição deve ser string');
		assert(p.builtIn === true, 'builtIn deve ser true');
		assert(typeof p.tools === 'object', 'tools deve ser objeto');
	}
});

test('Cada preset built-in tem tools válidos segundo validateTools', () => {
	for (const p of P.BUILT_IN) {
		const validated = P.validateTools(p.tools);
		assert(validated, `Preset ${p.id} deve ter tools válidos`);
	}
});

// ─── 2. validateTools ───────────────────────────────────────────────────
test('validateTools aceita tools completo válido', () => {
	const tools = { dc: true, hum: 60, gate: false, threshold: -45, click: true, clickThreshold: 0.2, denoise: 0.5, rumble: 30 };
	const result = P.validateTools(tools);
	assert.deepStrictEqual(result, tools);
});

test('validateTools aceita tools parcial', () => {
	const result = P.validateTools({ dc: true });
	assert.deepStrictEqual(result, { dc: true });
});

test('validateTools rejeita hum inválido', () => {
	assert.throws(() => P.validateTools({ hum: 100 }), /hum deve ser 0, 50 ou 60/);
});

test('validateTools rejeita threshold fora do intervalo', () => {
	assert.throws(() => P.validateTools({ threshold: -100 }), /threshold fora de/);
	assert.throws(() => P.validateTools({ threshold: 0 }), /threshold fora de/);
});

test('validateTools rejeita clickThreshold fora do intervalo', () => {
	assert.throws(() => P.validateTools({ clickThreshold: 0.01 }), /clickThreshold fora de/);
	assert.throws(() => P.validateTools({ clickThreshold: 1.0 }), /clickThreshold fora de/);
});

test('validateTools rejeita denoise fora de [0,1]', () => {
	assert.throws(() => P.validateTools({ denoise: -0.1 }), /denoise fora de/);
	assert.throws(() => P.validateTools({ denoise: 1.5 }), /denoise fora de/);
});

test('validateTools rejeita rumble fora de [0,80]', () => {
	assert.throws(() => P.validateTools({ rumble: -1 }), /rumble fora de/);
	assert.throws(() => P.validateTools({ rumble: 100 }), /rumble fora de/);
});

test('validateTools rejeita tipo booleano errado', () => {
	assert.throws(() => P.validateTools({ dc: 'true' }), /dc deve ser boolean/);
});

test('validateTools rejeita null/undefined', () => {
	assert.throws(() => P.validateTools(null), /tools deve ser um objeto/);
	assert.throws(() => P.validateTools(undefined), /tools deve ser um objeto/);
});

// ─── 3. validatePreset ──────────────────────────────────────────────────
test('validatePreset aceita preset customizado válido', () => {
	const raw = { id: 'custom-test', name: 'Teste', description: 'Desc', tools: { dc: true } };
	const result = P.validatePreset(raw);
	assert.strictEqual(result.id, 'custom-test');
	assert.strictEqual(result.name, 'Teste');
	assert.strictEqual(result.builtIn, false);
	assert.deepStrictEqual(result.tools, { dc: true });
});

test('validatePreset rejeita preset sem nome', () => {
	assert.throws(() => P.validatePreset({ id: 'x', name: '', tools: {} }), /nome inválido/);
});

test('validatePreset rejeita preset sem id', () => {
	assert.throws(() => P.validatePreset({ id: '', name: 'X', tools: {} }), /id inválido/);
});

test('validatePreset rejeita tools inválidos dentro do preset', () => {
	assert.throws(() => P.validatePreset({ id: 'x', name: 'X', tools: { hum: 99 } }), /hum deve ser/);
});

// ─── 4. applyToTools ────────────────────────────────────────────────────
test('applyToTools sobrescreve campos presentes no preset', () => {
	const current = { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2 };
	const preset = P.BUILT_IN.find(p => p.id === 'builtin-vinyl');
	const result = P.applyToTools(preset, current);
	assert.strictEqual(result.dc, true);
	assert.strictEqual(result.hum, 60);
	assert.strictEqual(result.click, true);
});

test('applyToTools preserva campos não definidos no preset', () => {
	const current = { dc: false, hum: 0, gate: true, threshold: -30, click: false, clickThreshold: 0.2 };
	const preset = { tools: { dc: true } };
	const result = P.applyToTools(preset, current);
	assert.strictEqual(result.gate, true);
	assert.strictEqual(result.threshold, -30);
	assert.strictEqual(result.dc, true);
});

test('applyToTools não altera o objeto original', () => {
	const current = { dc: false, hum: 0 };
	const preset = { tools: { dc: true } };
	P.applyToTools(preset, current);
	assert.strictEqual(current.dc, false);
});

// ─── 5. shouldWarnHighFreqLoss ──────────────────────────────────────────
test('shouldWarnHighFreqLoss retorna true para denoise > 0.4', () => {
	assert(P.shouldWarnHighFreqLoss({ tools: { denoise: 0.5 } }));
});

test('shouldWarnHighFreqLoss retorna true para hum ativo', () => {
	assert(P.shouldWarnHighFreqLoss({ tools: { hum: 60, denoise: 0 } }));
	assert(P.shouldWarnHighFreqLoss({ tools: { hum: 50, denoise: 0 } }));
});

test('shouldWarnHighFreqLoss retorna false para preset leve', () => {
	assert(!P.shouldWarnHighFreqLoss({ tools: { denoise: 0.2, hum: 0 } }));
});

test('shouldWarnHighFreqLoss retorna false para preset sem denoise nem hum', () => {
	assert(!P.shouldWarnHighFreqLoss({ tools: { dc: true } }));
});

// ─── 6. listAll inclui built-ins ────────────────────────────────────────
test('listAll retorna pelo menos os 5 presets built-in', () => {
	const all = P.listAll();
	assert(all.length >= 5, `Esperava >=5 presets, obteve ${all.length}`);
	const builtInIds = P.BUILT_IN.map(p => p.id);
	for (const id of builtInIds) {
		assert(all.some(p => p.id === id), `Preset built-in ${id} deve estar em listAll()`);
	}
});

// ─── 7. TOOL_KEYS contém todos os campos esperados ──────────────────────
test('TOOL_KEYS contém os 10 campos de ferramentas', () => {
	assert.strictEqual(P.TOOL_KEYS.length, 10);
	assert(P.TOOL_KEYS.includes('dc'));
	assert(P.TOOL_KEYS.includes('hum'));
	assert(P.TOOL_KEYS.includes('humAdaptive'));
	assert(P.TOOL_KEYS.includes('gate'));
	assert(P.TOOL_KEYS.includes('threshold'));
	assert(P.TOOL_KEYS.includes('click'));
	assert(P.TOOL_KEYS.includes('clickThreshold'));
	assert(P.TOOL_KEYS.includes('denoise'));
	assert(P.TOOL_KEYS.includes('rumble'));
	assert(P.TOOL_KEYS.includes('decrackle'));
});

test('validateTools aceita humAdaptive booleano', () => {
	const result = P.validateTools({ humAdaptive: true });
	assert.strictEqual(result.humAdaptive, true);
	assert.throws(() => P.validateTools({ humAdaptive: 'sim' }), /humAdaptive deve ser boolean/);
});

test('validateTools aceita decrackle e rejeita fora de [0, 0.5]', () => {
	assert.strictEqual(P.validateTools({ decrackle: 0.15 }).decrackle, 0.15);
	assert.throws(() => P.validateTools({ decrackle: -0.1 }), /decrackle fora de/);
	assert.throws(() => P.validateTools({ decrackle: 0.9 }), /decrackle fora de/);
});

test('Preset vinil inclui de-crackle para crepitação densa', () => {
	const vinyl = P.BUILT_IN.find(p => p.id === 'builtin-vinyl');
	assert(vinyl, 'Preset vinil deve existir');
	assert(vinyl.tools.decrackle > 0, 'Preset vinil deve aplicar de-crackle');
});

console.log(`\n${passed} testes passaram.`);
if (process.exitCode) process.exit(1);