'use strict';
// Revisão 40 — garantias de runtime da triagem de design (DS-01+).
(() => {
  // DS-13: Selo de honestidade de áudio unificado via chave canônica dsp.demo_badge (pt-BR / en-US).
  const DEMO_BADGES = Object.freeze({
    'pt-BR': '[DEMO — sem processamento de áudio neste modo]',
    pt: '[DEMO — sem processamento de áudio neste modo]',
    'en-US': '[DEMO — no audio processing in this mode]',
    en: '[DEMO — no audio processing in this mode]'
  });
  window.VYNAMP_I18N = Object.freeze({
    'pt-BR': Object.freeze({ 'dsp.demo_badge': DEMO_BADGES['pt-BR'] }),
    'en-US': Object.freeze({ 'dsp.demo_badge': DEMO_BADGES['en-US'] }),
    en: Object.freeze({ 'dsp.demo_badge': DEMO_BADGES.en }),
    t(key, lang = document.documentElement.lang || 'pt-BR') {
      if (key === 'dsp.demo_badge') return DEMO_BADGES[lang] || DEMO_BADGES[lang.split('-')[0]] || DEMO_BADGES['pt-BR'];
      return key;
    }
  });
  window.VynampI18n = window.VYNAMP_I18N;

  // DS-01 + DS-03: Garante que as 12 skins do MVP atendam WCAG 2.2 AA (texto >= 4.5:1 e bordas >= 3.0:1)
  // sobre todas as superfícies (background, chassis, panel-inset, panel-raised, selection),
  // preservando preto neutro + neon em graphite-studio e contraste real em high-contrast-wide.
  const themes = window.VYNAMP_ASSETS?.themes;
  if (!Array.isArray(themes)) return;
  const LIGHT_SKINS = new Set(['arctic-library', 'ivory-atelier', 'pearl-workspace', 'sandstone-collection']);
  for (const theme of themes) {
    const tk = theme?.tokens;
    if (!tk || theme.id === 'high-contrast-wide') continue;
    if (theme.id === 'graphite-studio') {
      tk['text-muted'] = '#8E8E8E';
      tk.selection = '#1F2412';
      tk['border-light'] = '#727272';
    } else if (LIGHT_SKINS.has(theme.id)) {
      tk.cyan = '#00627A';
    } else {
      tk['text-muted'] = '#A2ACBF';
      tk.selection = '#26382E';
      tk.danger = '#FF8591';
      if (tk['border-light'] === '#677086') tk['border-light'] = '#80899F';
    }
  }
  const activeTheme = themes.find(t => t.id === document.documentElement.dataset.skin);
  if (activeTheme?.tokens) {
    for (const [k, v] of Object.entries(activeTheme.tokens)) {
      document.documentElement.style.setProperty('--' + k, v);
    }
    window.VynampNeon?.apply?.();
  }

  // DS-14: Handle de arraste permanente (⋮⋮, 16×28 px, text-muted) à esquerda de cada item de #queue-list.
  function decorateQueueHandles() {
    const queueList = document.getElementById('queue-list');
    if (!queueList) return;
    for (const row of queueList.querySelectorAll('.queue-item')) {
      const idxAttr = row.querySelector('[data-queue-index]')?.dataset.queueIndex ?? row.dataset.orderIndex;
      if (idxAttr === undefined) continue;
      let handle = row.querySelector(':scope > .queue-drag-handle');
      if (!handle) {
        handle = document.createElement('span');
        handle.className = 'queue-drag-handle';
        handle.setAttribute('draggable', 'true');
        handle.setAttribute('aria-hidden', 'true');
        handle.title = 'Arraste para reordenar (ou Alt + ↑ / ↓)';
        handle.textContent = '⋮⋮';
        row.prepend(handle);
      }
      handle.dataset.dragIndex = String(idxAttr);
    }
  }
  const queueListEl = document.getElementById('queue-list');
  if (queueListEl) {
    new MutationObserver(decorateQueueHandles).observe(queueListEl, { childList: true });
    decorateQueueHandles();
  }

  // DS-09: Em 200% de fonte e tela <= 1100 px, recolhe inicialmente #graph-browser em gaveta
  // para garantir largura útil ao canvas central sem truncar #graph-search quando aberto.
  const graphDialog = document.getElementById('graph-dialog');
  if (graphDialog) {
    new MutationObserver(() => {
      if (!graphDialog.open) return;
      if (document.documentElement.dataset.fontScaled === 'true' && window.innerWidth <= 1100) {
        const browser = document.getElementById('graph-browser');
        const toggle = document.getElementById('graph-processors');
        if (browser && toggle) {
          browser.hidden = true;
          toggle.setAttribute('aria-expanded', 'false');
        }
      }
    }).observe(graphDialog, { attributes: true, attributeFilter: ['open'] });
  }
})();
