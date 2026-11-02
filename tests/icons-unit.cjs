// Teste unitário do conjunto de ícones SVG (icons.js).
// Execute: node tests/icons-unit.cjs
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const Icons = require(path.resolve(__dirname, '..', 'icons.js'));

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

test('cada ícone gera SVG 24×24 decorativo com classe própria', () => {
	assert(Icons.names.length >= 75, 'conjunto incompleto: ' + Icons.names.length);
	for (const name of Icons.names) {
		const out = Icons.svg(name);
		assert.match(out, /^<svg class="icon icon-[a-z-]+" viewBox="0 0 24 24" focusable="false" aria-hidden="true">.+<\/svg>$/, name);
		assert(out.includes('icon-' + name), name);
	}
});

test('formas ficam dentro da grade e não usam cor fixa', () => {
	for (const name of Icons.names) {
		const out = Icons.svg(name);
		assert(!/#[0-9a-f]{3,6}\b|rgb\(/i.test(out), name + ' usa cor fixa');
		for (const n of out.match(/-?\d*\.?\d+/g)) assert(+n >= -24 && +n <= 24, name + ' fora da grade: ' + n);
	}
});

test('ícones usados pelo app existem (sem cair no fallback)', () => {
	const dir = path.resolve(__dirname, '..');
	const used = new Set();
	for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'icons.js')) {
		const src = fs.readFileSync(path.join(dir, f), 'utf8');
		for (const m of src.matchAll(/VynampIcons\.(?:svg|element|lead)\((?:[^,()]+,\s*)?'([a-z-]+)'/g)) used.add(m[1]);
		for (const m of src.matchAll(/icon\('([a-z-]+)'\)/g)) used.add(m[1]);
	}
	const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
	for (const m of html.matchAll(/data-lead-icon="([a-z-]+)"/g)) used.add(m[1]);
	assert(used.size > 20, 'varredura não achou usos');
	const missing = [...used].filter(n => !Icons.has(n));
	assert.deepEqual(missing, []);
});

test('aliases de severidade apontam para formas distintas', () => {
	assert.equal(Icons.svg('warning'), Icons.svg('alert'));
	assert.equal(Icons.svg('error'), Icons.svg('severe'));
	const shapes = ['severe', 'moderate', 'mild'].map(n => Icons.svg(n).replace(/class="[^"]*"/, ''));
	assert.equal(new Set(shapes).size, 3, 'severidade não pode depender só de cor');
});

test('rótulo vira role=img com aria-label escapado', () => {
	const out = Icons.svg('severe', { label: 'Grave <"&">', className: 'x' });
	assert.match(out, /class="icon icon-severe x"/);
	assert.match(out, /role="img" aria-label="Grave &#60;&#34;&#38;&#34;&#62;"/);
	assert(!out.includes('aria-hidden'));
});

test('nome desconhecido cai no ícone genérico de módulo', () => {
	assert.equal(Icons.has('nao-existe'), false);
	assert.equal(Icons.svg('nao-existe').replace('icon-nao-existe', 'icon-module'), Icons.svg('module'));
});

test('dataURI serve para mask CSS: preto, sem currentColor, aspas escapadas', () => {
	for (const name of Icons.CSS_ICONS) {
		const uri = Icons.dataURI(name);
		assert.match(uri, /^url\("data:image\/svg\+xml,%3Csvg/);
		const markup = decodeURIComponent(uri.slice(29, -2));
		assert(!markup.includes('currentColor'));
		assert(markup.includes('stroke="#000"'));
		assert(!uri.slice(5, -2).includes('"') && !uri.includes("'"));
	}
});

test('módulo expõe __factory não-enumerável', () => {
	assert.equal(typeof Icons.__factory, 'function');
	assert(!Object.keys(Icons).includes('__factory'));
});

console.log(`\n${passed} testes passaram.`);
if (process.exitCode) process.exit(1);
