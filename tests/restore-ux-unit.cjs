// Testes unitários puros para melhorias UX (#16, #17, #18) — sem Playwright, sem DOM real.
// Execute: node tests/restore-ux-unit.cjs
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

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

const cssPath = path.resolve(__dirname, '..', 'restore.css');
const jsPath = path.resolve(__dirname, '..', 'restore.js');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

// ─── #16 — Feedback visual de processamento ativo ─────────────────────
test('CSS contém regra para data-restore-processing=true no workspace', () => {
	assert.match(css, /:root\[data-restore-processing=true\]\s*#restore-workspace/, 'Regra de processamento ausente');
});

test('CSS de processamento inclui border-left com var(--lime)', () => {
	assert.match(css, /border-left\s*:\s*2px\s+solid\s+var\(--lime\)/, 'Border-left lime ausente');
});

test('CSS de processamento inclui box-shadow inset com var(--lime)', () => {
	assert.match(css, /box-shadow\s*:\s*inset\s+2px\s+0\s+8px\s+-2px\s+var\(--lime\)/, 'Box-shadow inset ausente');
});

test('CSS de processamento inclui transition para border-color e box-shadow', () => {
	assert.match(css, /transition\s*:\s*border-color\s+\.3s\s*,\s*box-shadow\s+\.3s/, 'Transition ausente');
});

test('prefers-reduced-motion desativa transições e animações no workspace', () => {
	assert.match(css, /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)\s*\{[^}]*#restore-workspace\s*\*\s*\{[^}]*transition\s*:\s*none\s*!important[^}]*animation\s*:\s*none\s*!important/, 'Media query prefers-reduced-motion ausente ou incompleta');
});

// ─── #17 — Tooltip educativo / modo guia ──────────────────────────────
test('JS define chave localStorage vynamp-restore-guide-v1', () => {
	assert.match(js, /vynamp-restore-guide-v1/, 'Chave do guia ausente no JS');
});

test('JS cria botão guia com ícone SVG de ajuda', () => {
	assert.match(js, /guideBtn\.innerHTML\s*=\s*VynampIcons\.svg\('help'\)/, 'Botão guia não criado');
});

test('JS implementa loadGuide lendo do localStorage', () => {
	assert.match(js, /function\s+loadGuide/, 'Função loadGuide ausente');
	assert.match(js, /localStorage\.getItem\s*\(\s*GUIDE_KEY\s*\)/, 'loadGuide não lê localStorage');
});

test('JS implementa saveGuide escrevendo no localStorage', () => {
	assert.match(js, /function\s+saveGuide/, 'Função saveGuide ausente');
	assert.match(js, /localStorage\.setItem\s*\(\s*GUIDE_KEY/, 'saveGuide não escreve localStorage');
});

test('JS cria tooltips com classe restore-guide-tooltip', () => {
	assert.match(js, /restore-guide-tooltip/, 'Classe tooltip ausente no JS');
});

test('CSS contém estilos para .restore-guide-tooltip', () => {
	assert.match(css, /\.restore-guide-tooltip/, 'Estilos do tooltip ausentes no CSS');
});

test('CSS mostra tooltip apenas quando data-restore-guide=true', () => {
	assert.match(css, /:root\[data-restore-guide=true\].*\.restore-guide-tooltip/, 'Tooltip não condicionado ao modo guia');
});

test('Tooltip de DC Offset contém texto explicativo', () => {
	assert.match(js, /Remove deslocamento constante da linha de base/, 'Texto DC ausente');
});

test('Tooltip de Hum contém texto explicativo', () => {
	assert.match(js, /Elimina zumbido de rede eléctrica/, 'Texto Hum ausente');
});

test('Tooltip de Gate contém texto explicativo', () => {
	assert.match(js, /Silencia trechos abaixo do limiar/, 'Texto Gate ausente');
});

test('Tooltip de De-click contém texto explicativo', () => {
	assert.match(js, /Repara impulsos curtos/, 'Texto De-click ausente');
});

test('Tooltip de Região contém texto explicativo', () => {
	assert.match(js, /Região Entre faixas.*Sobreposta/s, 'Texto Região ausente');
});

// ─── #18 — Drag-and-drop de áudio ────────────────────────────────────
test('CSS contém classe .restore-drop-active', () => {
	assert.match(css, /\.restore-drop-active/, 'Classe drop-active ausente no CSS');
});

test('CSS de drop-active usa borda tracejada com var(--lime)', () => {
	assert.match(css, /\.restore-drop-active\{[^}]*border\s*:\s*2px\s+dashed\s+var\(--lime\)/, 'Borda tracejada lime ausente');
});

test('CSS contém overlay de drop com texto "Solte o áudio aqui"', () => {
	assert.match(css, /\.restore-drop-overlay/, 'Overlay de drop ausente no CSS');
	assert.match(js, /Solte o áudio aqui/, 'Texto do overlay ausente no JS');
});

test('JS adiciona listener dragenter no painel', () => {
	assert.match(js, /panel\.addEventListener\s*\(\s*'dragenter'/, 'Listener dragenter ausente');
});

test('JS adiciona listener dragover no painel', () => {
	assert.match(js, /panel\.addEventListener\s*\(\s*'dragover'/, 'Listener dragover ausente');
});

test('JS adiciona listener dragleave no painel', () => {
	assert.match(js, /panel\.addEventListener\s*\(\s*'dragleave'/, 'Listener dragleave ausente');
});

test('JS adiciona listener drop no painel', () => {
	assert.match(js, /panel\.addEventListener\s*\(\s*'drop'/, 'Listener drop ausente');
});

test('Handler de drop valida tipo de arquivo de áudio', () => {
	assert.match(js, /audio\/|video\/ogg|\.mp3|\.wav|\.flac/, 'Validação de tipo de áudio ausente');
});

test('Handler de drop dispara evento change no input de arquivo', () => {
	assert.match(js, /dispatchEvent\s*\(\s*new\s+Event\s*\(\s*'change'/, 'Disparo de change ausente');
});

// ─── Resumo ───────────────────────────────────────────────────────────
console.log('\n' + passed + ' testes passaram.');