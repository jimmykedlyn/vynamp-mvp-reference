'use strict';
// Rev.41 / R41-01 + R41-14: ligar um módulo do painel DSP insere (ou ativa) a instância real no grafo.
// Carregado por último; o painel (dsp-workspace.js) consulta window.VynampDSPBinder de forma opcional.
(() => {
  const G = window.VynampGraph, M = window.VynampGraphModel, C = window.VynampDSPController, catalog = window.VYNAMP_DSP_CATALOG;
  if (!G || !M || !C || !catalog) return;
  const store = G.store;
  const PRE = new Set(['input', 'replaygain', 'normalization']);
  const TAIL = new Set(['limiter', 'sample-limiter', 'clip', 'loudness-meter', 'meter', 'spectrum', 'dither']);
  const count = type => store.data.nodes.filter(n => n.type === type).length;
  // Mesma decisão do grafo: módulo do catálogo cuja definição tem adaptador real. Só insere quando não há instância.
  const canBind = type => type !== 'output' && catalog.some(m => m.id === type) && !!M.definitions[type]?.real && count(type) === 0;
  let seq = 0;
  const uid = p => p + '-' + Date.now().toString(36) + '-' + (++seq).toString(36);
  const audioEdge = (data, e) => M.port(data.nodes.find(n => n.id === e.from), e.out, 'out')?.kind === 'audio';
  // Arestas de áudio onde o nó entra. Ramos paralelos para a saída (ou saindo da entrada) são todos
  // redirecionados pelo novo nó, para que nenhum ramo escape do efeito.
  function pickEdges(data, type) {
    const into = id => data.edges.filter(e => e.to === id && audioEdge(data, e));
    const node = id => data.nodes.find(n => n.id === id);
    if (PRE.has(type)) return data.edges.filter(e => e.from === 'source' && audioEdge(data, e));
    const sinkEdges = into('sink');
    if (sinkEdges.length !== 1 || TAIL.has(type)) return sinkEdges;
    let edge = sinkEdges[0];
    for (;;) {
      const from = node(edge.from), ins = from ? into(from.id) : [];
      if (!from || ins.length !== 1 || !(TAIL.has(from.type) || (type === 'vinyl' && from.type === 'tube'))) return [edge];
      edge = ins[0];
    }
  }
  function addNode(data, type, values, enabled, useValues) {
    const def = M.definitions[type], params = M.freshParams(def);
    if (useValues) for (const key of Object.keys(params)) if (values && key in values) params[key] = JSON.parse(JSON.stringify(values[key]));
    const edges = pickEdges(data, type), id = uid('n');
    const from = edges.length && data.nodes.find(n => n.id === edges[0].from), to = edges.length && data.nodes.find(n => n.id === edges[0].to);
    const x = Math.max(-5000, Math.min(5000, from && to ? (from.x + to.x) / 2 : 340)), y = Math.max(-5000, Math.min(5000, from && to ? Math.max(from.y, to.y) + 120 : 300));
    data.nodes.push({ id, type, x, y, enabled: !!enabled, collapsed: false, legacyBypass: false, rack: '', params });
    if (edges.length) {
      const drop = new Set(edges.map(e => e.id)), target = edges[0];
      data.edges = data.edges.filter(e => !drop.has(e.id));
      const seen = new Set();
      for (const e of edges) { const k = e.from + ':' + e.out; if (!seen.has(k)) { seen.add(k); data.edges.push({ id: uid('e'), from: e.from, out: e.out, to: id, in: 'in' }); } }
      data.edges.push({ id: uid('e'), from: id, out: 'out', to: target.to, in: target.in });
    } else data.edges.push({ id: uid('e'), from: 'source', out: 'out', to: id, in: 'in' }, { id: uid('e'), from: id, out: 'out', to: 'sink', in: 'in' });
    if (enabled) data.settings.enabled = true; // bypass global desligado anularia o efeito que o usuário acabou de ligar
    return id;
  }
  function build(items, useValues) {
    const data = store.snapshot(), ids = [];
    for (const it of items) ids.push(addNode(data, it.type, it.values, it.enabled !== false, useValues));
    return { data, ids };
  }
  // Um único passo de histórico (store.load) para um ou mais módulos; params do painel quando válidos, senão padrão.
  function insertMany(items) {
    for (const it of items) if (!canBind(it.type)) throw Error('Já existe instância de ' + it.type + ' no fluxo.');
    let built = build(items, true);
    try { store.load(built.data); } catch { built = build(items, false); store.load(built.data); }
    return built.ids;
  }
  const insert = (type, values, enabled = true) => insertMany([{ type, values, enabled }])[0];
  // Efeitos com processamento real adicionados pela paleta do Fluxo entram já em série antes da saída
  // (antes entravam soltos e não mudavam o som). Um passo de histórico; nós de controle/estrutura ficam soltos.
  const LOOSE = new Set(['source', 'sink', 'primary-eq', 'lfo', 'mix']);
  const wirable = type => !!M.definitions[type]?.real && !LOOSE.has(type);
  function addWired(type, x, y) {
    if (!wirable(type)) return null;
    const data = store.snapshot(), id = addNode(data, type, null, true, false), n = data.nodes.find(n => n.id === id);
    if (Number.isFinite(x)) n.x = x; if (Number.isFinite(y)) n.y = y;
    store.load(data);
    return store.data.nodes.find(n => n.id === id);
  }
  // Nó já existente sem nenhuma conexão (ex.: adicionado solto em revisões anteriores) entra na rota.
  function wire(id) {
    const data = store.snapshot(), n = data.nodes.find(n => n.id === id);
    if (!n || !wirable(n.type) || data.edges.some(e => e.from === id || e.to === id)) return false;
    const edges = pickEdges(data, n.type);
    if (!edges.length) return false;
    const drop = new Set(edges.map(e => e.id)), target = edges[0], seen = new Set();
    data.edges = data.edges.filter(e => !drop.has(e.id));
    for (const e of edges) { const k = e.from + ':' + e.out; if (!seen.has(k)) { seen.add(k); data.edges.push({ id: uid('e'), from: e.from, out: e.out, to: id, in: 'in' }); } }
    data.edges.push({ id: uid('e'), from: id, out: 'out', to: target.to, in: target.in });
    data.settings.enabled = true;
    store.load(data);
    return true;
  }
  window.VynampDSPBinder = { canBind, insert, insertMany, addWired, wire };

  // R41-14: atalhos de módulo real sem instância abrem o painel com o módulo selecionado e o botão "Ativar".
  document.addEventListener('click', e => {
    const button = e.target.closest?.('[data-audio-shortcut],#dsp-vitrola-shortcut');
    if (!button) return;
    const type = button.id === 'dsp-vitrola-shortcut' ? 'vinyl' : button.dataset.audioShortcut;
    if (type === 'eq' || !canBind(type)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    C.setInvoker(button); C.open(type);
  }, true);

  // Desfazer/refazer/importar pode remover a instância ligada ao painel: reabre o vínculo sem deixar id obsoleto.
  store.on((data, reason) => {
    if (!['history', 'import'].includes(reason)) return;
    const dialog = document.getElementById('dsp-workspace');
    if (!dialog?.open) return;
    const stale = ['vinyl', 'tube', 'compressor'].concat(catalog.map(m => m.id)).some(t => { const id = C.boundId(t); return id && !data.nodes.some(n => n.id === id); });
    if (stale) C.rebind();
  });
})();
