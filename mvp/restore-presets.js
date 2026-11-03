// Sistema de Presets de Restauração (#20b)
// Presets built-in + persistência em localStorage. Funções puras para testes.
(function(root, factory) {
	const api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.VynampRestorePresets = api;
})(globalThis, () => {
	'use strict';

	const STORAGE_KEY = 'vynamp-restore-presets-v1';

	// Campos de tools que um preset pode definir
	const TOOL_KEYS = ['dc', 'hum', 'humAdaptive', 'gate', 'threshold', 'click', 'clickThreshold', 'denoise', 'rumble', 'decrackle'];

	// Presets built-in (imutáveis)
	const BUILT_IN = Object.freeze([
		{
			id: 'builtin-scratched-cd',
			name: 'CD arranhado',
			description: 'Cliques isolados + chiado leve de superfície',
			builtIn: true,
			tools: { dc: true, hum: 0, gate: false, threshold: -45, click: true, clickThreshold: 0.18, denoise: 0.3, rumble: 0 }
		},
		{
			id: 'builtin-vinyl',
			name: 'Vinil / LP',
			description: 'Crepitação densa + zumbido de rede + ronco grave',
			builtIn: true,
			tools: { dc: true, hum: 60, humAdaptive: false, gate: false, threshold: -45, click: true, clickThreshold: 0.22, denoise: 0.4, rumble: 30, decrackle: 0.15 }
		},
		{
			id: 'builtin-cassette',
			name: 'Fita K7',
			description: 'Chiado de fita + wow/flutter (parcial) + saturação leve',
			builtIn: true,
			tools: { dc: true, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 0.5, rumble: 20 }
		},
		{
			id: 'builtin-phone-recording',
			name: 'Gravação celular',
			description: 'Ruído ambiente + DC offset possível + agudos limitados',
			builtIn: true,
			tools: { dc: true, hum: 0, gate: true, threshold: -40, click: false, clickThreshold: 0.2, denoise: 0.35, rumble: 40 }
		},
		{
			id: 'builtin-low-mp3',
			name: 'MP3 baixa qualidade',
			description: 'Artefatos de compressão + chiado digital + perda de agudos',
			builtIn: true,
			tools: { dc: false, hum: 0, gate: false, threshold: -45, click: false, clickThreshold: 0.2, denoise: 0.25, rumble: 0 }
		}
	]);

	/**
	 * Valida um objeto de tools contra os campos permitidos e intervalos válidos.
	 * Retorna uma cópia sanitizada ou lança erro.
	 */
	function validateTools(raw) {
		if (!raw || typeof raw !== 'object') throw Error('Preset inválido: tools deve ser um objeto.');
		const tools = {};
		for (const key of TOOL_KEYS) {
			if (!(key in raw)) continue;
			const v = raw[key];
			switch (key) {
				case 'dc': case 'gate': case 'click': case 'humAdaptive':
					if (typeof v !== 'boolean') throw Error(`Preset inválido: ${key} deve ser boolean.`);
					tools[key] = v; break;
				case 'hum':
					if (![0, 50, 60].includes(v)) throw Error('Preset inválido: hum deve ser 0, 50 ou 60.');
					tools[key] = v; break;
				case 'threshold':
					if (typeof v !== 'number' || !Number.isFinite(v) || v < -72 || v > -12) throw Error('Preset inválido: threshold fora de [-72, -12].');
					tools[key] = v; break;
				case 'clickThreshold':
					if (typeof v !== 'number' || !Number.isFinite(v) || v < 0.03 || v > 0.9) throw Error('Preset inválido: clickThreshold fora de [0.03, 0.9].');
					tools[key] = v; break;
				case 'denoise':
					if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) throw Error('Preset inválido: denoise fora de [0, 1].');
					tools[key] = v; break;
				case 'rumble':
					if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 80) throw Error('Preset inválido: rumble fora de [0, 80].');
					tools[key] = v; break;
				case 'decrackle':
					if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 0.5) throw Error('Preset inválido: decrackle fora de [0, 0.5].');
					tools[key] = v; break;
			}
		}
		return tools;
	}

	/**
	 * Valida um preset customizado completo.
	 */
	function validatePreset(raw) {
		if (!raw || typeof raw !== 'object') throw Error('Preset inválido.');
		if (typeof raw.id !== 'string' || raw.id.length < 1 || raw.id.length > 80) throw Error('Preset inválido: id inválido.');
		if (typeof raw.name !== 'string' || raw.name.length < 1 || raw.name.length > 60) throw Error('Preset inválido: nome inválido.');
		const description = typeof raw.description === 'string' ? raw.description.slice(0, 120) : '';
		const tools = validateTools(raw.tools);
		return { id: raw.id, name: raw.name, description, builtIn: false, tools };
	}

	/**
	 * Carrega presets customizados do localStorage.
	 * Retorna array de presets válidos (inválidos são descartados silenciosamente).
	 */
	function loadCustom() {
		try {
			const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
			if (!Array.isArray(raw)) return [];
			const valid = [];
			for (const p of raw) {
				try { valid.push(validatePreset(p)); } catch { /* descarta inválido */ }
			}
			return valid;
		} catch {
			return [];
		}
	}

	/**
	 * Salva presets customizados no localStorage.
	 * Apenas presets não-built-in são persistidos.
	 */
	function saveCustom(presets) {
		const custom = presets.filter(p => !p.builtIn).map(p => ({
			id: p.id, name: p.name, description: p.description, tools: p.tools
		}));
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
		} catch { /* storage cheio ou indisponível */ }
	}

	/**
	 * Retorna todos os presets (built-in + custom), na ordem: built-in primeiro.
	 */
	function listAll() {
		return [...BUILT_IN, ...loadCustom()];
	}

	/**
	 * Adiciona um preset customizado. Retorna o preset validado.
	 * Gera id único se necessário.
	 */
	function addCustom(name, tools, description = '') {
		const id = 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
		const preset = validatePreset({ id, name, description, tools });
		const all = loadCustom();
		all.push(preset);
		saveCustom(all);
		return preset;
	}

	/**
	 * Remove um preset customizado por id. Built-ins não podem ser removidos.
	 * Retorna true se removido, false se não encontrado ou built-in.
	 */
	function removeCustom(id) {
		if (BUILT_IN.some(p => p.id === id)) return false;
		const all = loadCustom();
		const filtered = all.filter(p => p.id !== id);
		if (filtered.length === all.length) return false;
		saveCustom(filtered);
		return true;
	}

	/**
	 * Aplica um preset ao estado de tools, retornando novo objeto tools.
	 * Não altera regiões nem diagnóstico.
	 */
	function applyToTools(preset, currentTools) {
		const base = { ...currentTools };
		const p = preset.tools;
		for (const key of TOOL_KEYS) {
			if (key in p) base[key] = p[key];
		}
		return base;
	}

	/**
	 * Verifica se a aplicação do preset causaria perda >3dB acima de 8kHz.
	 * Heurística: denoise > 0.4 ou hum ativo reduzem agudos significativamente.
	 * Retorna true se aviso deve ser mostrado.
	 */
	function shouldWarnHighFreqLoss(preset) {
		const t = preset.tools;
		if ((t.denoise || 0) > 0.4) return true;
		if (t.hum === 50 || t.hum === 60) return true;
		return false;
	}

	return {
		BUILT_IN,
		STORAGE_KEY,
		TOOL_KEYS,
		validateTools,
		validatePreset,
		loadCustom,
		saveCustom,
		listAll,
		addCustom,
		removeCustom,
		applyToTools,
		shouldWarnHighFreqLoss
	};
});