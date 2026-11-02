// Batch Processing com relatório (#5)
// Fila de arquivos para restauração em lote, com relatório agregado.
// Lógica pura (sem DOM): o worker e a UI orquestram usando estas funções.
(function(root, factory) {
	const api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.VynampRestoreBatch = api;
})(globalThis, () => {
	'use strict';

	const MAX_ITEMS = 32;
	const MAX_ITEMS_PER_JOB = 8;

	const STATUS = Object.freeze({
		PENDING: 'pending',
		PROCESSING: 'processing',
		DONE: 'done',
		FAILED: 'failed',
		CANCELLED: 'cancelled'
	});

	/**
	 * Cria uma fila de batch a partir de uma lista de arquivos.
	 * @param {Array<{name: string, size?: number}>} files - Arquivos a processar
	 * @returns {{ id: string, items: Array, createdAt: number }}
	 */
	function createQueue(files) {
		if (!Array.isArray(files)) throw Error('Fila inválida: espera uma lista de arquivos.');
		if (files.length > MAX_ITEMS) throw Error(`Fila limitada a ${MAX_ITEMS} arquivos.`);
		const items = files.map((file, index) => {
			if (!file || typeof file.name !== 'string' || !file.name.length) {
				throw Error('Fila inválida: arquivo sem nome.');
			}
			return {
				id: 'batch-' + index,
				name: file.name,
				size: typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : null,
				status: STATUS.PENDING,
				progress: 0,
				report: null,
				error: null
			};
		});
		return { id: 'batch-' + Date.now().toString(36), items, createdAt: Date.now() };
	}

	/**
	 * Valida um item da fila.
	 */
	function validateItem(item) {
		if (!item || typeof item !== 'object') throw Error('Item de fila inválido.');
		if (typeof item.id !== 'string' || !item.id.length) throw Error('Item de fila sem id.');
		if (typeof item.name !== 'string' || !item.name.length) throw Error('Item de fila sem nome.');
		if (!Object.values(STATUS).includes(item.status)) throw Error('Item de fila com status inválido.');
		if (typeof item.progress !== 'number' || !Number.isFinite(item.progress) || item.progress < 0 || item.progress > 1) {
			throw Error('Item de fila com progresso inválido.');
		}
		return {
			id: item.id,
			name: item.name,
			size: typeof item.size === 'number' ? item.size : null,
			status: item.status,
			progress: item.progress,
			report: item.report ?? null,
			error: item.error ?? null
		};
	}

	/**
	 * Marca um item como em processamento.
	 */
	function markProcessing(queue, itemId) {
		const item = queue.items.find(i => i.id === itemId);
		if (!item) throw Error('Item de fila não existe.');
		item.status = STATUS.PROCESSING;
		item.progress = 0;
		item.error = null;
		return item;
	}

	/**
	 * Atualiza o progresso de um item (0..1).
	 */
	function updateProgress(queue, itemId, progress) {
		const item = queue.items.find(i => i.id === itemId);
		if (!item) throw Error('Item de fila não existe.');
		const value = Math.max(0, Math.min(1, Number(progress) || 0));
		item.progress = value;
		return item;
	}

	/**
	 * Marca um item como concluído com seu relatório de diagnóstico.
	 */
	function markDone(queue, itemId, report) {
		const item = queue.items.find(i => i.id === itemId);
		if (!item) throw Error('Item de fila não existe.');
		item.status = STATUS.DONE;
		item.progress = 1;
		item.report = report ?? null;
		item.error = null;
		return item;
	}

	/**
	 * Marca um item como falho com uma mensagem de erro.
	 */
	function markFailed(queue, itemId, error) {
		const item = queue.items.find(i => i.id === itemId);
		if (!item) throw Error('Item de fila não existe.');
		item.status = STATUS.FAILED;
		item.error = typeof error === 'string' && error.length ? error : 'Falha desconhecida.';
		return item;
	}

	/**
	 * Cancela um item pendente ou em processamento.
	 */
	function cancelItem(queue, itemId) {
		const item = queue.items.find(i => i.id === itemId);
		if (!item) throw Error('Item de fila não existe.');
		if (item.status === STATUS.DONE || item.status === STATUS.FAILED) return item;
		item.status = STATUS.CANCELLED;
		return item;
	}

	/**
	 * Cancela todos os itens ainda não concluídos.
	 */
	function cancelAll(queue) {
		for (const item of queue.items) {
			if (item.status !== STATUS.DONE && item.status !== STATUS.FAILED) {
				item.status = STATUS.CANCELLED;
			}
		}
		return queue;
	}

	/**
	 * Retorna os próximos itens prontos para processar (pending), limitado a N.
	 */
	function nextPending(queue, limit = MAX_ITEMS_PER_JOB) {
		return queue.items
			.filter(i => i.status === STATUS.PENDING)
			.slice(0, Math.max(1, limit));
	}

	/**
	 * Progresso global da fila (0..1), ponderado por contagem de itens.
	 */
	function overallProgress(queue) {
		if (!queue.items.length) return 0;
		let sum = 0;
		for (const item of queue.items) {
			if (item.status === STATUS.DONE) sum += 1;
			else if (item.status === STATUS.PROCESSING) sum += item.progress;
		}
		return sum / queue.items.length;
	}

	/**
	 * Agrega os relatórios de diagnóstico dos itens concluídos.
	 * @returns {{ total: number, done: number, failed: number, cancelled: number,
	 *             defects: Array<{type: string, count: number, severity: string}>,
	 *             chains: Array<Array<string>>, summary: string }}
	 */
	function aggregate(queue) {
		const done = queue.items.filter(i => i.status === STATUS.DONE);
		const failed = queue.items.filter(i => i.status === STATUS.FAILED);
		const cancelled = queue.items.filter(i => i.status === STATUS.CANCELLED);
		const defectTally = new Map();
		const chainTally = new Map();
		for (const item of done) {
			const report = item.report;
			if (!report || !Array.isArray(report.defects)) continue;
			for (const defect of report.defects) {
				const key = defect.type;
				const entry = defectTally.get(key) || { type: key, count: 0, severity: defect.severity };
				entry.count += typeof defect.count === 'number' ? defect.count : 1;
				// Mantém a severidade mais alta encontrada
				const order = { mild: 1, moderate: 2, severe: 3 };
				if ((order[defect.severity] || 0) > (order[entry.severity] || 0)) entry.severity = defect.severity;
				defectTally.set(key, entry);
			}
			// Cadeia vazia = arquivo sem defeito; não é uma "cadeia" a recomendar.
			if (Array.isArray(report.chain) && report.chain.length) {
				const chainKey = report.chain.join('→');
				chainTally.set(chainKey, (chainTally.get(chainKey) || 0) + 1);
			}
		}
		const defects = [...defectTally.values()].sort((a, b) => b.count - a.count);
		const chains = [...chainTally.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([chain, count]) => ({ chain: chain.split('→'), count }));
		const summary = buildAggregateSummary(queue, defects, chains);
		return {
			total: queue.items.length,
			done: done.length,
			failed: failed.length,
			cancelled: cancelled.length,
			defects,
			chains,
			summary
		};
	}

	/**
	 * Monta o resumo textual do relatório agregado.
	 */
	function buildAggregateSummary(queue, defects, chains) {
		if (!queue.items.length) return 'Nenhum arquivo na fila.';
		const parts = [];
		const done = queue.items.filter(i => i.status === STATUS.DONE).length;
		const failed = queue.items.filter(i => i.status === STATUS.FAILED).length;
		parts.push(done + '/' + queue.items.length + ' processados');
		if (failed) parts.push(failed + ' com falha');
		if (defects.length) {
			const top = defects.slice(0, 3).map(d => {
				const label = DEFECT_LABELS[d.type] || d.type;
				return d.count + ' ' + label;
			});
			parts.push('principais defeitos: ' + top.join(', '));
		}
		if (chains.length) {
			parts.push('cadeia mais comum: ' + chains[0].chain.join(' → '));
		}
		return parts.join(' · ') + '.';
	}

	const DEFECT_LABELS = {
		click: 'cliques', crackle: 'crepitação', hum50: 'zumbido 50Hz', hum60: 'zumbido 60Hz',
		hiss: 'chiado', rumble: 'ronco', clipping: 'saturação', true_peak: 'true peak',
		discontinuity: 'descontinuidades', skip: 'pulos', dc_offset: 'DC offset'
	};

	return {
		MAX_ITEMS,
		MAX_ITEMS_PER_JOB,
		STATUS,
		DEFECT_LABELS,
		createQueue,
		validateItem,
		markProcessing,
		updateProgress,
		markDone,
		markFailed,
		cancelItem,
		cancelAll,
		nextPending,
		overallProgress,
		aggregate
	};
});