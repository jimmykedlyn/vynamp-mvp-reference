'use strict';
// Conjunto único de ícones do Vynamp. Grade 24×24 com área viva de 2–22, traço herdado de .icon (1,5px,
// pontas e junções redondas) e cor currentColor — o ícone segue o estado do botão (hover, pressed, disabled).
// Formas com "f" são preenchidas para dar peso óptico onde o traço sozinho ficaria fraco (transporte, pontos,
// estados ligados). Ícones são decorativos (aria-hidden): o nome acessível fica sempre no botão.
(function (root, factory) {
	const api = factory();
	Object.defineProperty(api, '__factory', { value: factory, enumerable: false });
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.VynampIcons = api;
})(typeof self !== 'undefined' ? self : this, function factory() {
	const p = d => `<path d="${d}"/>`;
	const f = d => `<path d="${d}" fill="currentColor"/>`;
	const c = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
	const dot = (x, y, r = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
	const rect = (x, y, w, h, r = 1.5) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
	const speaker = 'M4 9.5h3.5L12 5.5v13l-4.5-4H4a.5.5 0 0 1-.5-.5v-4a.5.5 0 0 1 .5-.5Z';
	const star = 'M12 3.6l2.53 5.72 6.22.64-4.66 4.17 1.32 6.11L12 17.1l-5.41 3.14 1.32-6.11-4.66-4.17 6.22-.64Z';
	const cog = 'M19.07 9.81l2.14.32v3.74l-2.14.32a7.4 7.4 0 0 1-.52 1.26l1.28 1.74-2.64 2.64-1.74-1.28a7.4 7.4 0 0 1-1.26.52l-.32 2.14h-3.74l-.32-2.14a7.4 7.4 0 0 1-1.26-.52l-1.74 1.28-2.64-2.64 1.28-1.74a7.4 7.4 0 0 1-.52-1.26l-2.14-.32v-3.74l2.14-.32a7.4 7.4 0 0 1 .52-1.26L4.17 6.81l2.64-2.64 1.74 1.28a7.4 7.4 0 0 1 1.26-.52l.32-2.14h3.74l.32 2.14a7.4 7.4 0 0 1 1.26.52l1.74-1.28 2.64 2.64-1.28 1.74a7.4 7.4 0 0 1 .52 1.26Z';
	const triangle = 'M10.27 4.2 2.9 17a2 2 0 0 0 1.73 3h14.74a2 2 0 0 0 1.73-3L13.73 4.2a2 2 0 0 0-3.46 0Z';
	const octagon = 'M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3Z';

	const shapes = {
		// Navegação e janelas
		menu: p('M4 6.5h16M4 12h16M4 17.5h16'),
		close: p('M6.5 6.5l11 11M17.5 6.5l-11 11'),
		remove: p('M7.5 7.5l9 9M16.5 7.5l-9 9'),
		plus: p('M12 5v14M5 12h14'),
		minus: p('M5 12h14'),
		more: dot(5.5, 12, 1.5) + dot(12, 12, 1.5) + dot(18.5, 12, 1.5),
		'chevron-right': p('M9.5 6.5 15 12l-5.5 5.5'),
		bypass: c(12, 12, 8) + p('M6.4 17.6 17.6 6.4'),
		check: p('M5 12.5l4.5 4.5L19 7.5'),
		'chevron-down': p('M6.5 9.5 12 15l5.5-5.5'),
		'arrow-up': p('M12 19V5.5M6.5 11 12 5.5 17.5 11'),
		'arrow-down': p('M12 5v13.5M6.5 13 12 18.5 17.5 13'),
		'arrow-right': p('M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5'),
		miniplayer: p('M20.5 10.5V6A1.5 1.5 0 0 0 19 4.5H5A1.5 1.5 0 0 0 3.5 6v12A1.5 1.5 0 0 0 5 19.5h5.5') + rect(13.5, 13.5, 7, 6, 1),
		grip: dot(9, 6, 1.4) + dot(15, 6, 1.4) + dot(9, 12, 1.4) + dot(15, 12, 1.4) + dot(9, 18, 1.4) + dot(15, 18, 1.4),
		external: p('M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10'),
		dock: p('M20 4l-8 8M12 7.5V12h4.5M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14'),
		undo: p('M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11'),
		redo: p('M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13'),
		link: p('M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1'),
		reset:p('M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9M4.5 4.5V9H9'),
		grid: rect(3.5, 3.5, 7, 7) + rect(13.5, 3.5, 7, 7) + rect(3.5, 13.5, 7, 7) + rect(13.5, 13.5, 7, 7),
		filter: p('M4 5h16l-6 7.5V19l-4-2v-4.5Z'),
		search: c(10.5, 10.5, 6.5) + p('M15.5 15.5 20 20'),
		help: c(12, 12, 9) + p('M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4') + dot(12, 16.9, 1),
		info: c(12, 12, 9) + p('M12 11v5.5') + dot(12, 7.9, 1),
		settings: p('M4 7h9.5M18.5 7H20M4 17h3.5M12.5 17H20') + c(16, 7, 2.5) + c(10, 17, 2.5),
		gear: p(cog) + c(12, 12, 3),
		power: p('M12 3.5v8M7.2 6.4a7.5 7.5 0 1 0 9.6 0'),
		dot: dot(12, 12, 4),
		'dot-outline': c(12, 12, 4),
		star: p(star),
		'star-filled': f(star),
		heart: p('M12 19.5C6.3 15.7 3.5 12.6 3.5 9.4A4.4 4.4 0 0 1 12 7.1a4.4 4.4 0 0 1 8.5 2.3c0 3.2-2.8 6.3-8.5 10.1Z'),
		sparkle: p('M10.75 3.5l1.7 4.8 4.8 1.7-4.8 1.7-1.7 4.8-1.7-4.8L4.25 10l4.8-1.7Z') + p('M17.25 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z'),

		// Arquivos e coleção
		folder: p('M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5Z'),
		'file-audio': p('M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5ZM14 3v4.5h4.5') + p('M11.5 17V11.5l3.5-1') + c(10.2, 17, 1.3),
		download: p('M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14'),
		upload: p('M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14'),
		'queue-add': p('M4 6h13M4 11h13M4 16h7M17.5 14v6M14.5 17h6'),
		playlist: p('M4 6h11M4 11h11M4 16h6') + p('M17 16.5V7l3.5-1') + c(15.5, 16.5, 1.8),
		library: p('M3.4 4.5h3v15h-3ZM8.9 4.5h3v15h-3Z') + p('M14.2 5.6l2.8-.8 3.6 13.6-2.8.8Z'),
		lyrics: p('M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9a1.5 1.5 0 0 1-1.5 1.5h-8.5L6 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z') + p('M7.5 9h9M7.5 12.5h5.5'),
		note: p('M9 17.5V6l10-2v11.5') + c(6.8, 17.5, 2.2) + c(16.8, 15.5, 2.2),
		radio: dot(12, 11, 1.6) + p('M8.5 7.5a5 5 0 0 0 0 7M15.5 7.5a5 5 0 0 1 0 7M5.64 4.64a9 9 0 0 0 0 12.72M18.36 4.64a9 9 0 0 1 0 12.72M12 13.5v7'),
		vinyl: c(12, 12, 9) + c(12, 12, 3) + dot(12, 12, .9) + p('M6.5 9.2a6 6 0 0 1 2.7-2.7'),

		// Transporte (preenchidos: leitura imediata em tamanho pequeno)
		play: f('M8 5.6v12.8a.8.8 0 0 0 1.2.7l10-6.4a.8.8 0 0 0 0-1.4l-10-6.4a.8.8 0 0 0-1.2.7Z'),
		pause: f('M7 5h3v14H7ZM14 5h3v14h-3Z'),
		previous: p('M6 5.5v13') + f('M18.5 6.4v11.2a.7.7 0 0 1-1.1.6L9.5 12.6a.7.7 0 0 1 0-1.2l7.9-5.6a.7.7 0 0 1 1.1.6Z'),
		next: p('M18 5.5v13') + f('M5.5 6.4v11.2a.7.7 0 0 0 1.1.6l7.9-5.6a.7.7 0 0 0 0-1.2L6.6 5.8a.7.7 0 0 0-1.1.6Z'),
		stop: `<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor"/>`,
		shuffle: p('M3.5 7h2.8c5 0 6.4 10 11.4 10h2.8M17.5 14.5 20.5 17l-3 2.5M3.5 17h2.8c1.7 0 3-1.2 4.1-2.8M13.6 9.8C14.7 8.2 16 7 17.7 7h2.8M17.5 4.5 20.5 7l-3 2.5'),
		repeat: p('M17 3.5 20.5 7 17 10.5M20.5 7H7a3.5 3.5 0 0 0-3.5 3.5v1M7 20.5 3.5 17 7 13.5M3.5 17H17a3.5 3.5 0 0 0 3.5-3.5v-1'),
		volume: f(speaker) + p('M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.3a8 8 0 0 1 0 11.4'),
		mute: f(speaker) + p('M16 9.5l5 5M21 9.5l-5 5'),
		speaker: f(speaker) + p('M15.5 9a4.2 4.2 0 0 1 0 6'),

		// Medição e áudio
		meter: p('M3.5 17a8.5 8.5 0 0 1 17 0M12 17l4-5.5M6.2 11.2l1.1 1.1M12 8.5V10M17.8 11.2l-1.1 1.1') + dot(12, 17, 1.3),
		eq: p('M6 4v4M6 12v8M12 4v9M12 17v3M18 4v2M18 10v10') + c(6, 10, 2) + c(12, 15, 2) + c(18, 8, 2),
		spectrum: p('M4.5 20v-5M8.5 20V9M12.5 20v-7M16.5 20V6M20 20v-4'),
		levels: rect(5, 4, 5, 16, 1.2) + rect(14, 4, 5, 16, 1.2) + f('M6.5 11h2v7.5h-2ZM15.5 14h2v4.5h-2Z'),
		waveform: p('M3 12h1.5M6 9v6M9 6v12M12 8.5v7M15 4.5v15M18 9.5v5M21 12h-1.5'),
		impulse: p('M3 12h5l1-2 1 2h1.2l1.4-8 1.6 16 1.4-8H21'),
		diagnose: c(10.5, 10.5, 6.5) + p('M15.5 15.5 20 20M6.5 10.5h1.8l1.2-2.4 2 4.8 1.2-2.4h1.8'),
		bulb: p('M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.2 1.1 2V16h5v-.2c0-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z'),
		flow: rect(3, 4, 6, 5, 1.2) + rect(15, 15, 6, 5, 1.2) + p('M9 6.5h3a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 0 1.5 1.5'),
		input: p('M4 4.5v6a3.5 3.5 0 0 0 3.5 3.5H19M15 10l4 4-4 4'),
		output: p('M4 12h11M11.5 8l4 4-4 4M19.5 4.5v15'),
		module: p('M12 3 21 12 12 21 3 12Z') + p('M12 8.5 15.5 12 12 15.5 8.5 12Z'),
		gain: c(12, 12, 7.5) + p('M12 7.5v4M4.8 19.2l1.4-1.4M19.2 19.2l-1.4-1.4'),
		mixer: p('M8 4v16M16 4v16') + rect(5.5, 12.5, 5, 3.5, 1) + rect(13.5, 7, 5, 3.5, 1),
		lfo: p('M3 12c2.3-6.5 6.7-6.5 9 0s6.7 6.5 9 0'),
		saturation: p('M3 18c2 0 2.6-10 5.5-10h7c2.9 0 3.5 10 5.5 10'),
		curve: p('M3 16c2.5 0 3.5-9 6.5-9s3.5 11 6.5 11 3-5 5-5'),
		limiter: p('M3 5.5h18') + p('M3 15c2 0 2.5-6.5 4.5-6.5S10 17 12 17s2.5-8.5 4.5-8.5S19 15 21 15'),
		gate: p('M3 17.5h4V6.5h10v11h4'),
		compressor: p('M12 3v6M9 6l3 3 3-3M12 21v-6M9 18l3-3 3 3M4 12h16'),
		expander: p('M12 3.5v6.5M9 6.5l3-3 3 3M12 20.5V14M9 17.5l3 3 3-3M4 12h3M17 12h3'),
		stereo: c(9, 12, 5.5) + c(15, 12, 5.5),
		clock: c(12, 12, 8.5) + p('M12 7.5V12l3 2'),
		room: p('M3 12h3l1-7 1.2 13 1.3-9 1.3 6 1.2-4 1.3 2.5 1.2-1.5H21'),

		// Seções de Preferências
		'play-circle': c(12, 12, 9) + f('M10 8.4v7.2a.6.6 0 0 0 .9.5l5.6-3.6a.6.6 0 0 0 0-1l-5.6-3.6a.6.6 0 0 0-.9.5Z'),
		cabinet: rect(5.5, 3, 13, 18, 2) + c(12, 14.5, 3.5) + dot(12, 14.5, 1) + dot(12, 7.5, 1.3),
		dsp: rect(6.5, 6.5, 11, 11, 1.5) + p('M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3') + p('M8.5 12h1.2l1.2-2.2 2.2 4.4 1.2-2.2h1.2'),
		cloud: p('M7 18.4a4 4 0 0 1-.4-7.98A5.5 5.5 0 0 1 17.3 9.4a4.55 4.55 0 0 1-.3 9Z') + f('M10.8 11.7v4.4l3.7-2.2Z'),
		palette: p('M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.8-1.7h2.2a3.7 3.7 0 0 0 3.7-3.7C20.5 6.6 16.7 3.5 12 3.5Z') + dot(7.8, 11.4, 1.1) + dot(9.8, 7.7, 1.1) + dot(14.3, 7.5, 1.1) + dot(16.9, 10.7, 1.1),
		keyboard: rect(2.5, 6, 19, 12, 2) + dot(6, 9.5, .9) + dot(9, 9.5, .9) + dot(12, 9.5, .9) + dot(15, 9.5, .9) + dot(18, 9.5, .9) + dot(7.5, 12.2, .9) + dot(10.5, 12.2, .9) + dot(13.5, 12.2, .9) + dot(16.5, 12.2, .9) + p('M8 15h8'),
		puzzle: p('M8.75 6.5v-1a2 2 0 0 1 4 0v1h3.5A1.5 1.5 0 0 1 17.75 8v3.5h.5a2 2 0 0 1 0 4h-.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3.75 19V8a1.5 1.5 0 0 1 1.5-1.5Z'),
		shield: p('M12 3.5 19 6v5.5c0 4.3-2.9 7.6-7 9-4.1-1.4-7-4.7-7-9V6Z') + rect(9.5, 11.5, 5, 4, .8) + p('M10.5 11.5v-1.3a1.5 1.5 0 0 1 3 0v1.3'),

		// Severidade: forma + cor, nunca só cor (WCAG 1.4.1)
		severe: p(octagon) + p('M12 7.8v5') + dot(12, 16.3, 1.05),
		alert: p(triangle) + p('M12 9.3v4') + dot(12, 16.8, 1.05),
		ok: c(12, 12, 9) + p('M8 12.3l2.7 2.7L16 9.7')
	};
	// Abas da coleção (folders.js) usam os nomes das views.
	const aliases = { warning: 'alert', moderate: 'alert', mild: 'ok', error: 'severe', tracks: 'note', albums: 'vinyl', favorites: 'heart', radios: 'radio', folders: 'folder' };

	function has(name) { return Object.prototype.hasOwnProperty.call(shapes, aliases[name] || name); }

	function svg(name, options = {}) {
		const key = aliases[name] || name;
		const body = shapes[key] || shapes.module;
		const cls = 'icon icon-' + key + (options.className ? ' ' + options.className : '');
		const label = options.label ? ` role="img" aria-label="${String(options.label).replace(/[&<>"]/g, ch => '&#' + ch.charCodeAt(0) + ';')}"` : ' aria-hidden="true"';
		return `<svg class="${cls}" viewBox="0 0 24 24" focusable="false"${label}>${body}</svg>`;
	}

	// Versão para CSS (mask-image): traço/preenchimento preto sobre transparente, pinta com background:currentColor.
	// Com color, vira imagem pronta (background-image) para onde não há pseudo-elemento, como <select>.
	function dataURI(name, strokeWidth = 1.75, color = '#000') {
		const key = aliases[name] || name;
		const body = (shapes[key] || shapes.module).replace(/currentColor/g, color);
		const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
		return 'url("data:image/svg+xml,' + encodeURIComponent(markup).replace(/'/g, '%27') + '")';
	}

	function element(name, options) {
		const tpl = document.createElement('template');
		tpl.innerHTML = svg(name, options);
		return tpl.content.firstElementChild;
	}

	// Coloca/atualiza o ícone inicial de um botão sem tocar no texto (preserva nome acessível e testes por texto).
	function lead(el, name, text) {
		if (!el) return el;
		if (text !== undefined) {
			const span = document.createElement('span');
			span.className = 'icon-label';
			span.textContent = text;
			el.replaceChildren(element(name), span);
		} else {
			el.querySelector(':scope > svg.icon')?.remove();
			el.prepend(element(name));
		}
		el.classList.add('has-icon');
		return el;
	}

	function decorate(root = document) {
		for (const el of root.querySelectorAll('[data-lead-icon]')) {
			if (el.querySelector(':scope > svg.icon')) continue;
			lead(el, el.dataset.leadIcon);
		}
	}

	// Variáveis CSS para pseudo-elementos (::before/::after) usarem os mesmos desenhos via mask.
	const CSS_ICONS = ['check', 'alert', 'chevron-right', 'bypass'];
	function installCSSVariables(doc = document) {
		const style = doc.documentElement.style;
		for (const name of CSS_ICONS) style.setProperty('--icon-' + name, dataURI(name));
	}

	// <select> não aceita ::after nem currentColor em background-image: a seta é gerada na cor secundária da skin
	// e refeita quando a skin troca as variáveis no :root. Comparar antes de gravar evita laço no observer.
	function installSelectChevron(doc = document) {
		const root = doc.documentElement;
		const update = () => {
			const color = getComputedStyle(root).getPropertyValue('--text-secondary').trim() || '#8b939c';
			const uri = dataURI('chevron-down', 2, color);
			if (root.style.getPropertyValue('--icon-select') !== uri) root.style.setProperty('--icon-select', uri);
		};
		update();
		new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['style', 'data-skin', 'class'] });
	}

	if (typeof document !== 'undefined') {
		installCSSVariables();
		installSelectChevron();
		const run = () => decorate();
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
		else run();
	}

	return { names: Object.keys(shapes), aliases, has, svg, element, lead, decorate, dataURI, CSS_ICONS };
});
