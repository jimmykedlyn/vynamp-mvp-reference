'use strict';
/* Revisão 41 — R41-12: #repeat expõe aria-pressed desde o carregamento e o modo (off/fila/faixa) em data-repeat-mode. */
(() => {
  const repeat = document.getElementById('repeat');
  if (!repeat) return;
  const sync = () => {
    const text = (repeat.getAttribute('aria-label') || '') + ' ' + (document.getElementById('repeat-label')?.textContent || '');
    const mode = /faixa/i.test(text) && /repetir/i.test(text) ? 'track' : /fila/i.test(text) && /repetir/i.test(text) ? 'queue' : 'off';
    repeat.dataset.repeatMode = mode;
    const on = mode !== 'off';
    if (repeat.getAttribute('aria-pressed') !== String(on)) repeat.setAttribute('aria-pressed', String(on));
    repeat.title = mode === 'track' ? 'Repetir faixa — clique para desligar' : mode === 'queue' ? 'Repetir fila — clique para repetir a faixa' : 'Repetição desligada — clique para repetir a fila';
  };
  sync();
  const obs = new MutationObserver(sync);
  obs.observe(repeat, { attributes: true, attributeFilter: ['aria-label'] });
  const label = document.getElementById('repeat-label');
  if (label) obs.observe(label, { childList: true, characterData: true, subtree: true });
})();
