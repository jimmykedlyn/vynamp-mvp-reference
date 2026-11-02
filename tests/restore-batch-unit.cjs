// Testes unitários puros para o Batch Processing com relatório (#5) — restore-batch.js
// Execute: node tests/restore-batch-unit.cjs
'use strict';
const assert = require('assert/strict');
const path = require('path');
const B = require(path.resolve(__dirname, '..', 'restore-batch.js'));

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

// ─── 1. createQueue ────────────────────────────────────────────────────
test('createQueue cria itens pendentes a partir de uma lista de arquivos', () => {
	const q = B.createQueue([{ name: 'a.wav', size: 100 }, { name: 'b.mp3', size: 200 }]);
	assert.strictEqual(q.items.length, 2);
	assert.strictEqual(q.items[0].name, 'a.wav');
	assert.strictEqual(q.items[0].status, B.STATUS.PENDING);
	assert.strictEqual(q.items[0].progress, 0);
	assert.strictEqual(q.items[0].report, null);
});

test('createQueue rejeita lista não-array', () => {
	assert.throws(() => B.createQueue(null), /Fila inválida/);
	assert.throws(() => B.createQueue('arquivos'), /Fila inválida/);
});

test('createQueue rejeita arquivo sem nome', () => {
	assert.throws(() => B.createQueue([{}]), /sem nome/);
	assert.throws(() => B.createQueue([{ name: '' }]), /sem nome/);
});

test('createQueue limita a 32 arquivos', () => {
	const many = Array.from({ length: 33 }, (_, i) => ({ name: 'f' + i + '.wav' }));
	assert.throws(() => B.createQueue(many), /limitada a 32/);
});

test('createQueue aceita exatamente 32 arquivos', () => {
	const ok = Array.from({ length: 32 }, (_, i) => ({ name: 'f' + i + '.wav' }));
	const q = B.createQueue(ok);
	assert.strictEqual(q.items.length, 32);
});

// ─── 2. Ciclo de vida do item ──────────────────────────────────────────
test('markProcessing marca o item como em processamento', () => {
	const q = B.createQueue([{ name: 'a.wav' }]);
	const item = B.markProcessing(q, q.items[0].id);
	assert.strictEqual(item.status, B.STATUS.PROCESSING);
	assert.strictEqual(item.progress, 0);
	assert.strictEqual(item.error, null);
});

test('updateProgress atualiza o progresso e satura em [0,1]', () => {
	const q = B.createQueue([{ name: 'a.wav' }]);
	B.markProcessing(q, q.items[0].id);
	B.updateProgress(q, q.items[0].id, 0.5);
	assert.strictEqual(q.items[0].progress, 0.5);
	B.updateProgress(q, q.items[0].id, 2);
	assert.strictEqual(q.items[0].progress, 1);
	B.updateProgress(q, q.items[0].id, -1);
	assert.strictEqual(q.items[0].progress, 0);
});

test('markDone guarda o relatório e zera o erro', () => {
	const q = B.createQueue([{ name: 'a.wav' }]);
	B.markProcessing(q, q.items[0].id);
	const report = { defects: [], chain: [] };
	B.markDone(q, q.items[0].id, report);
	assert.strictEqual(q.items[0].status, B.STATUS.DONE);
	assert.strictEqual(q.items[0].progress, 1);
	assert.deepStrictEqual(q.items[0].report, report);
});

test('markFailed guarda a mensagem de erro', () => {
	const q = B.createQueue([{ name: 'a.wav' }]);
	B.markFailed(q, q.items[0].id, 'decodificação falhou');
	assert.strictEqual(q.items[0].status, B.STATUS.FAILED);
	assert.strictEqual(q.items[0].error, 'decodificação falhou');
});

test('markFailed usa mensagem padrão quando o erro é inválido', () => {
	const q = B.createQueue([{ name: 'a.wav' }]);
	B.markFailed(q, q.items[0].id, '');
	assert.strictEqual(q.items[0].error, 'Falha desconhecida.');
});

test('markFailed com status de item inexistente lança erro', () => {
	const q = B.createQueue([{ name: 'a.wav' }]);
	assert.throws(() => B.markFailed(q, 'inexistente', 'x'), /não existe/);
	assert.throws(() => B.markProcessing(q, 'inexistente'), /não existe/);
	assert.throws(() => B.markDone(q, 'inexistente'), /não existe/);
});

// ─── 3. Cancelamento ───────────────────────────────────────────────────
test('cancelItem cancela item pendente', () => {
	const q = B.createQueue([{ name: 'a.wav' }]);
	B.cancelItem(q, q.items[0].id);
	assert.strictEqual(q.items[0].status, B.STATUS.CANCELLED);
});

test('cancelItem não altera item já concluído', () => {
	const q = B.createQueue([{ name: 'a.wav' }]);
	B.markDone(q, q.items[0].id, { defects: [], chain: [] });
	B.cancelItem(q, q.items[0].id);
	assert.strictEqual(q.items[0].status, B.STATUS.DONE);
});

test('cancelAll cancela apenas itens não finalizados', () => {
	const q = B.createQueue([{ name: 'a.wav' }, { name: 'b.wav' }, { name: 'c.wav' }]);
	B.markDone(q, q.items[0].id, { defects: [], chain: [] });
	B.markFailed(q, q.items[1].id, 'erro');
	B.cancelAll(q);
	assert.strictEqual(q.items[0].status, B.STATUS.DONE);
	assert.strictEqual(q.items[1].status, B.STATUS.FAILED);
	assert.strictEqual(q.items[2].status, B.STATUS.CANCELLED);
});

// ─── 4. nextPending e overallProgress ──────────────────────────────────
test('nextPending retorna apenas itens pendentes, limitado', () => {
	const q = B.createQueue([{ name: 'a.wav' }, { name: 'b.wav' }, { name: 'c.wav' }]);
	B.markProcessing(q, q.items[0].id);
	const next = B.nextPending(q, 2);
	assert.strictEqual(next.length, 2);
	assert(next.every(i => i.status === B.STATUS.PENDING));
});

test('nextPending com limite padrão retorna no máximo MAX_ITEMS_PER_JOB', () => {
	const files = Array.from({ length: 20 }, (_, i) => ({ name: 'f' + i + '.wav' }));
	const q = B.createQueue(files);
	assert.strictEqual(B.nextPending(q).length, B.MAX_ITEMS_PER_JOB);
});

test('overallProgress reflete o avanço dos itens', () => {
	const q = B.createQueue([{ name: 'a.wav' }, { name: 'b.wav' }]);
	assert.strictEqual(B.overallProgress(q), 0);
	B.markProcessing(q, q.items[0].id);
	B.updateProgress(q, q.items[0].id, 0.5);
	assert(Math.abs(B.overallProgress(q) - 0.25) < 0.001, `Esperava 0.25; obteve ${B.overallProgress(q)}`);
	B.markDone(q, q.items[0].id, { defects: [], chain: [] });
	assert(Math.abs(B.overallProgress(q) - 0.5) < 0.001);
	B.markDone(q, q.items[1].id, { defects: [], chain: [] });
	assert.strictEqual(B.overallProgress(q), 1);
});

test('overallProgress de fila vazia é 0', () => {
	assert.strictEqual(B.overallProgress({ items: [] }), 0);
});

// ─── 5. aggregate ──────────────────────────────────────────────────────
test('aggregate conta estados e agrega defeitos por tipo', () => {
	const q = B.createQueue([{ name: 'a.wav' }, { name: 'b.wav' }, { name: 'c.wav' }]);
	B.markDone(q, q.items[0].id, {
		defects: [{ type: 'click', severity: 'mild', count: 10 }, { type: 'hum60', severity: 'severe', count: 1 }],
		chain: ['dc', 'hum', 'click']
	});
	B.markDone(q, q.items[1].id, {
		defects: [{ type: 'click', severity: 'severe', count: 5 }],
		chain: ['dc', 'hum', 'click']
	});
	B.markFailed(q, q.items[2].id, 'erro de leitura');
	const agg = B.aggregate(q);
	assert.strictEqual(agg.total, 3);
	assert.strictEqual(agg.done, 2);
	assert.strictEqual(agg.failed, 1);
	assert.strictEqual(agg.cancelled, 0);
	const click = agg.defects.find(d => d.type === 'click');
	assert.strictEqual(click.count, 15, 'Contagem de cliques deve somar 10 + 5');
	assert.strictEqual(click.severity, 'severe', 'Severidade deve ser a mais alta encontrada');
});

test('aggregate ordena defeitos por contagem decrescente', () => {
	const q = B.createQueue([{ name: 'a.wav' }]);
	B.markDone(q, q.items[0].id, {
		defects: [{ type: 'click', severity: 'mild', count: 2 }, { type: 'hiss', severity: 'mild', count: 50 }],
		chain: []
	});
	const agg = B.aggregate(q);
	assert.strictEqual(agg.defects[0].type, 'hiss', 'Defeito mais frequente deve vir primeiro');
});

test('aggregate agrupa cadeias e conta a mais comum', () => {
	const q = B.createQueue([{ name: 'a.wav' }, { name: 'b.wav' }]);
	B.markDone(q, q.items[0].id, { defects: [], chain: ['dc', 'hum'] });
	B.markDone(q, q.items[1].id, { defects: [], chain: ['dc', 'hum'] });
	B.markDone(q, q.items[1].id, { defects: [], chain: ['dc', 'hum'] });
	const agg = B.aggregate(q);
	assert.strictEqual(agg.chains.length, 1);
	assert.strictEqual(agg.chains[0].count, 2);
	assert.deepStrictEqual(agg.chains[0].chain, ['dc', 'hum']);
});

test('aggregate ignora cadeias vazias (arquivos sem defeito) no resumo', () => {
	const q = B.createQueue([{ name: 'a.wav', size: 1 }, { name: 'b.wav', size: 1 }, { name: 'c.wav', size: 1 }]);
	B.markDone(q, q.items[0].id, { defects: [], chain: [] });
	B.markDone(q, q.items[1].id, { defects: [], chain: [] });
	B.markDone(q, q.items[2].id, { defects: [], chain: ['dc'] });
	const agg = B.aggregate(q);
	assert.deepStrictEqual(agg.chains, [{ chain: ['dc'], count: 1 }]);
	assert(agg.summary.includes('cadeia mais comum: dc'), `Resumo inesperado: ${agg.summary}`);
	const clean = B.createQueue([{ name: 'x.wav', size: 1 }]);
	B.markDone(clean, clean.items[0].id, { defects: [], chain: [] });
	const cleanAgg = B.aggregate(clean);
	assert.deepStrictEqual(cleanAgg.chains, []);
	assert(!cleanAgg.summary.includes('cadeia'), `Resumo não deve citar cadeia vazia: ${cleanAgg.summary}`);
});

test('aggregate de fila vazia retorna totais zerados', () => {
	const agg = B.aggregate({ items: [] });
	assert.strictEqual(agg.total, 0);
	assert.strictEqual(agg.done, 0);
	assert.deepStrictEqual(agg.defects, []);
	assert.deepStrictEqual(agg.chains, []);
	assert(agg.summary.includes('Nenhum arquivo'), `Resumo inesperado: ${agg.summary}`);
});

test('aggregate gera resumo textual legível', () => {
	const q = B.createQueue([{ name: 'a.wav' }]);
	B.markDone(q, q.items[0].id, {
		defects: [{ type: 'click', severity: 'mild', count: 12 }],
		chain: ['click']
	});
	const agg = B.aggregate(q);
	assert(agg.summary.includes('1/1'), `Resumo deve conter 1/1: ${agg.summary}`);
	assert(agg.summary.includes('cliques'), `Resumo deve conter "cliques": ${agg.summary}`);
});

test('aggregate ignora itens sem relatório válido', () => {
	const q = B.createQueue([{ name: 'a.wav' }]);
	B.markDone(q, q.items[0].id, null);
	const agg = B.aggregate(q);
	assert.strictEqual(agg.done, 1);
	assert.deepStrictEqual(agg.defects, []);
});

// ─── 6. validateItem ───────────────────────────────────────────────────
test('validateItem aceita item válido e normaliza campos', () => {
	const item = B.validateItem({
		id: 'x', name: 'a.wav', size: 10, status: B.STATUS.PENDING, progress: 0, report: null, error: null
	});
	assert.strictEqual(item.id, 'x');
	assert.strictEqual(item.status, B.STATUS.PENDING);
});

test('validateItem rejeita status inválido', () => {
	assert.throws(() => B.validateItem({ id: 'x', name: 'a.wav', status: 'weird', progress: 0 }), /status inválido/);
});

test('validateItem rejeita progresso fora de [0,1]', () => {
	assert.throws(() => B.validateItem({ id: 'x', name: 'a.wav', status: B.STATUS.PENDING, progress: 1.5 }), /progresso inválido/);
	assert.throws(() => B.validateItem({ id: 'x', name: 'a.wav', status: B.STATUS.PENDING, progress: -0.1 }), /progresso inválido/);
});

test('validateItem rejeita item sem id ou sem nome', () => {
	assert.throws(() => B.validateItem({ name: 'a.wav', status: B.STATUS.PENDING, progress: 0 }), /sem id/);
	assert.throws(() => B.validateItem({ id: 'x', status: B.STATUS.PENDING, progress: 0 }), /sem nome/);
});

// ─── 7. Constantes exportadas ──────────────────────────────────────────
test('MAX_ITEMS é 32 e MAX_ITEMS_PER_JOB é 8', () => {
	assert.strictEqual(B.MAX_ITEMS, 32);
	assert.strictEqual(B.MAX_ITEMS_PER_JOB, 8);
});

test('STATUS contém os quatro estados esperados', () => {
	assert.strictEqual(B.STATUS.PENDING, 'pending');
	assert.strictEqual(B.STATUS.PROCESSING, 'processing');
	assert.strictEqual(B.STATUS.DONE, 'done');
	assert.strictEqual(B.STATUS.FAILED, 'failed');
	assert.strictEqual(B.STATUS.CANCELLED, 'cancelled');
});

console.log(`\n${passed} testes passaram.`);
if (process.exitCode) process.exit(1);