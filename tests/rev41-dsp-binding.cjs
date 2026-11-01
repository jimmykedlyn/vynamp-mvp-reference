// Rev.41 R41-01 / R41-14: ligar um módulo real no painel DSP insere a instância no grafo e liga o painel a ela.
// refinement41-dsp.js é injetado aqui quando ainda não está no index.html.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
const demo = '[DEMO — sem processamento de áudio neste modo]';
(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const ctx = await browser.newContext({viewport: {width: 1300, height: 900}});
    const page = await ctx.newPage(); page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForTimeout(500);
    if (!await page.evaluate(() => !!window.VynampDSPBinder)) await page.addScriptTag({path: path.resolve(__dirname, '../refinement41-dsp.js')});
    const graph = () => page.evaluate(() => { const d = VynampGraph.store.data; return {nodes: d.nodes.map(n => ({id: n.id, type: n.type, enabled: n.enabled, params: n.params})), edges: d.edges.map(e => [e.from, e.to]), global: d.settings.enabled, past: VynampGraph.store.past.length}; });
    const before = await graph();
    assert.ok(!before.nodes.some(n => n.type === 'vinyl'));

    // R41-14: atalho Vitrola abre o painel com Vinyl selecionado e botão de um clique.
    await page.locator('[data-audio-shortcut=vinyl]').click();
    assert.ok(await page.locator('#dsp-workspace').evaluate(e => e.open), 'atalho Vitrola deve abrir o painel');
    assert.equal(await page.locator('#dsp-module-title').innerText(), 'Vinyl Simulator');
    assert.match(await page.locator('#dsp-capability').innerText(), /DEMO/);
    assert.equal((await page.locator('#dsp-enabled').innerText()).trim(), 'Ativar no áudio real');
    assert.equal(await page.locator('#dsp-ab-vinyl').isDisabled(), true);

    // Ligar: um clique, um passo de histórico, nó entre EQ e saída, painel ligado ao nó.
    await page.locator('#dsp-enabled').click();
    const on = await graph();
    const vinyl = on.nodes.filter(n => n.type === 'vinyl');
    assert.equal(vinyl.length, 1); assert.equal(vinyl[0].enabled, true);
    assert.equal(on.past, before.past + 1, 'inserção deve ser um único passo desfazível');
    assert.ok(on.edges.some(e => e[0] === 'main-eq' && e[1] === vinyl[0].id) && on.edges.some(e => e[0] === vinyl[0].id && e[1] === 'sink'), 'main-eq → vinyl → sink');
    assert.ok(!on.edges.some(e => e[0] === 'main-eq' && e[1] === 'sink'));
    assert.equal(on.global, true);
    const cap = await page.locator('#dsp-capability').innerText();
    assert.ok(/REAL/.test(cap) && !cap.includes(demo), 'status real, sem selo DEMO: ' + cap);
    assert.equal(await page.evaluate(() => VynampDSPController.boundId('vinyl')), vinyl[0].id);
    assert.equal(await page.locator('#dsp-ab-vinyl').isDisabled(), false);

    // Parâmetro do painel -> parâmetro do nó.
    const hiss = page.locator('[data-dsp-field=hiss]');
    await hiss.fill('17'); await hiss.dispatchEvent('change');
    assert.equal((await graph()).nodes.find(n => n.type === 'vinyl').params.hiss, 17);

    // A/B: bypass true/false (ou mensagem honesta se o kernel ainda não expõe o parâmetro).
    const hasBypass = 'bypass' in vinyl[0].params;
    await page.locator('#dsp-ab-vinyl').click();
    if (hasBypass) {
      assert.equal(await page.locator('#dsp-ab-vinyl').getAttribute('aria-pressed'), 'true');
      assert.equal((await graph()).nodes.find(n => n.type === 'vinyl').params.bypass, true);
      await page.locator('#dsp-ab-vinyl').click();
      assert.equal(await page.locator('#dsp-ab-vinyl').getAttribute('aria-pressed'), 'false');
      assert.equal((await graph()).nodes.find(n => n.type === 'vinyl').params.bypass, false);
    } else {
      assert.equal(await page.locator('#dsp-ab-vinyl').getAttribute('aria-pressed'), 'false');
      assert.match(await page.locator('#dsp-message').innerText(), /A\/B indisponível/);
    }
    assert.equal((await page.locator('#dsp-ab-vinyl').innerText()).trim(), 'Comparar sem efeito (A/B)');

    // Tube: entra depois do Vinyl e antes da saída; também tem A/B.
    await page.locator('[data-dsp-module=tube]').click();
    assert.equal((await page.locator('#dsp-enabled').innerText()).trim(), 'Ativar no áudio real');
    await page.locator('#dsp-enabled').click();
    const both = await graph(), tube = both.nodes.find(n => n.type === 'tube');
    assert.ok(tube && tube.enabled);
    assert.ok(both.edges.some(e => e[0] === vinyl[0].id && e[1] === tube.id) && both.edges.some(e => e[0] === tube.id && e[1] === 'sink'), 'vinyl → tube → sink');
    assert.equal(await page.locator('#dsp-ab-tube').count(), 1);

    // Desligar no painel: enabled=false, nó preservado.
    await page.locator('[data-dsp-module=vinyl]').click();
    await page.locator('#dsp-enabled').click();
    const off = await graph();
    assert.equal(off.nodes.find(n => n.type === 'vinyl').enabled, false);
    assert.equal(off.nodes.filter(n => n.type === 'vinyl').length, 1);

    // Desfazer restaura o grafo anterior e o painel não fica preso a um id inexistente.
    await page.evaluate(() => { const s = VynampGraph.store; while (s.past.length) s.undo(); });
    const undone = await graph();
    assert.deepEqual(undone.nodes.map(n => n.id), before.nodes.map(n => n.id));
    assert.deepEqual(undone.edges, before.edges);
    assert.equal(await page.evaluate(() => VynampDSPController.boundId('vinyl')), null);

    // Módulo sem adaptador real continua em DEMO e sem botão de ativação.
    const fake = await page.evaluate(() => VYNAMP_DSP_CATALOG.map(m => m.id).filter(id => id !== 'output' && !VynampGraphModel.definitions[id]?.real));
    if (fake.length) {
      await page.locator(`[data-dsp-module=${fake[0]}]`).click();
      assert.match(await page.locator('#dsp-capability').innerText(), /DEMO/);
      assert.notEqual((await page.locator('#dsp-enabled').innerText()).trim(), 'Ativar no áudio real');
    }

    // Limiter já no fim da cadeia: Vinyl entra antes dele.
    await page.evaluate(() => {
      document.getElementById('dsp-workspace').close();
      const s = VynampGraph.store, d = s.snapshot();
      d.nodes.push({id: 'lim1', type: 'limiter', x: 500, y: 300, enabled: true, collapsed: false, rack: '', legacyBypass: false, params: VynampGraphModel.freshParams(VynampGraphModel.definitions.limiter)});
      d.edges = d.edges.filter(e => !(e.from === 'main-eq' && e.to === 'sink'));
      d.edges.push({id: 'e-a', from: 'main-eq', out: 'out', to: 'lim1', in: 'in'}, {id: 'e-b', from: 'lim1', out: 'out', to: 'sink', in: 'in'});
      s.load(d);
    });
    await page.locator('[data-audio-shortcut=vinyl]').click();
    await page.locator('#dsp-enabled').click();
    const lim = await graph(), v2 = lim.nodes.find(n => n.type === 'vinyl');
    assert.ok(lim.edges.some(e => e[0] === 'main-eq' && e[1] === v2.id) && lim.edges.some(e => e[0] === v2.id && e[1] === 'lim1') && lim.edges.some(e => e[0] === 'lim1' && e[1] === 'sink'), 'main-eq → vinyl → limiter → sink');

    // Contrato A/B simulado: com o parâmetro bypass presente na definição, o botão alterna o parâmetro do nó.
    const page2 = await (await browser.newContext({viewport: {width: 1300, height: 900}})).newPage();
    await page2.goto(url); await page2.waitForTimeout(500);
    await page2.evaluate(() => { VynampGraphModel.definitions.tube.fields.push({id: 'bypass', label: 'Bypass', type: 'checkbox', value: false}); });
    await page2.locator('[data-audio-shortcut=vinyl]').click();
    await page2.locator('[data-dsp-module=tube]').click();
    await page2.locator('#dsp-enabled').click();
    const ab = page2.locator('#dsp-ab-tube');
    await ab.click();
    assert.equal(await ab.getAttribute('aria-pressed'), 'true');
    assert.equal(await page2.evaluate(() => VynampGraph.store.data.nodes.find(n => n.type === 'tube').params.bypass), true);
    await ab.click();
    assert.equal(await page2.evaluate(() => VynampGraph.store.data.nodes.find(n => n.type === 'tube').params.bypass), false);
    await page2.close();

    // ---- Integração kernel/painel (A1, A2, M1, M2, M3, B1, B4) ----
    const fresh = async (seed) => {
      const c = await browser.newContext({viewport: {width: 1300, height: 900}});
      const pg = await c.newPage(); pg.setDefaultTimeout(8000);
      pg.on('pageerror', e => errors.push(e.message));
      if (seed) await pg.addInitScript(v => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('vynamp-dsp-ui-v1', JSON.stringify(v)); sessionStorage.setItem('seeded', '1'); } } catch {} }, seed);
      await pg.goto(url); await pg.waitForTimeout(500);
      return pg;
    };
    const node = (pg, type) => pg.evaluate(t => VynampGraph.store.data.nodes.find(n => n.type === t)?.params, type);

    // A1 + B1: condição Gasto no painel -> nó e painel com valores Gasto; inspetor do Fluxo acompanha.
    const a1 = await fresh();
    await a1.locator('[data-audio-shortcut=vinyl]').click();
    await a1.locator('#dsp-enabled').click();
    await a1.locator('[data-dsp-field=condition]').selectOption('Gasto');
    await a1.waitForTimeout(100);
    let params = await node(a1, 'vinyl');
    assert.equal(params.condition, 'Gasto'); assert.equal(params.hiss, 70); assert.equal(params.crackle, 70);
    assert.equal(await a1.locator('[data-dsp-field=hiss]').inputValue(), '70');
    await a1.locator('[data-dsp-module=tube]').click();
    await a1.locator('#dsp-enabled').click();
    await a1.locator('[data-dsp-field=preset]').selectOption('Saturado');
    params = await node(a1, 'tube');
    assert.equal(params.preset, 'Saturado'); assert.equal(params.saturation, 70);
    assert.equal(await a1.locator('[data-dsp-field=saturation]').inputValue(), '70');
    // M1: macro move a Intensidade dos dois; presets legados mapeiam condição/preset; um só rótulo "Intensidade".
    await a1.locator('#vitrola-intensity').fill('60');
    assert.equal((await node(a1, 'tube')).intensity, 60);
    assert.equal((await node(a1, 'vinyl')).intensity, 60);
    assert.equal(await a1.locator('#dsp-workspace label', {hasText: /^Intensidade$/}).count(), 1);
    await a1.locator('[data-dsp-module=vinyl]').click();
    await a1.locator('#dsp-preset').selectOption('Sutil');
    await a1.locator('#dsp-preset-load').click();
    params = await node(a1, 'vinyl');
    assert.equal(params.condition, 'Bem conservado'); assert.equal(params.hiss, 24);
    assert.equal(params.intensity, 60);
    // B1: mudar a condição fora do inspetor atualiza os valores do inspetor.
    await a1.evaluate(() => document.getElementById('dsp-workspace').close());
    await a1.evaluate(() => { VynampGraph.open(document.getElementById('audio-effects-open')); const id = VynampGraph.store.data.nodes.find(n => n.type === 'vinyl').id; VynampGraph.select(id); VynampGraph.store.setParam(id, 'condition', 'Novo'); });
    await a1.waitForTimeout(100);
    assert.equal(await a1.locator('#graph-fields [data-dsp-field=hiss]').inputValue(), '14');

    // B4: "Vitrola ligada" insere Vinyl e Tube em um único passo.
    const b4 = await fresh({version: 1, selected: 'vinyl', modules: {vinyl: {enabled: true, values: {}}, tube: {enabled: true, values: {}}}});
    const pastB4 = await b4.evaluate(() => VynampGraph.store.past.length);
    await b4.locator('[data-audio-shortcut=vinyl]').click();
    await b4.locator('#vitrola-master').click();
    assert.equal(await b4.evaluate(() => VynampGraph.store.past.length), pastB4 + 1);
    assert.ok(await node(b4, 'vinyl') && await node(b4, 'tube'));

    // A2 + M2: estado salvo na rev.40 (sem condição/preset) volta a Usado/Quente; preset antigo do usuário sobrevive.
    const rev40Preset = {name: 'Meu rev40', values: {hiss: 3, crackle: 2, pops: 1, density: 4, wow: .1, flutter: .05, warp: 3, hfLoss: 2, distortion: 5, rumble: 5, context: 'Faixa avulsa', inner: true, mask: true, rpm: '33⅓', needle: false, runout: false, tail: '30 s + fade', flip: false, resonance: 13000, rolloff: 15000}};
    const a2 = await fresh({version: 1, selected: 'vinyl', modules: {vinyl: {enabled: true, values: {hiss: 8, crackle: 6, pops: 3, density: 10, context: 'Faixa avulsa'}, presets: [rev40Preset]}}});
    await a2.locator('[data-audio-shortcut=vinyl]').click();
    assert.ok((await a2.locator('#dsp-preset option').allInnerTexts()).includes('Meu rev40'), 'preset rev.40 deve sobreviver');
    await a2.locator('#dsp-enabled').click();
    params = await node(a2, 'vinyl');
    assert.equal(params.condition, 'Usado'); assert.equal(params.hiss, 40); assert.equal(params.crackle, 40); assert.equal(params.context, 'Faixa avulsa');

    // M3: ramos paralelos para a saída passam todos pelo novo nó.
    const m3 = await fresh();
    await m3.evaluate(() => {
      const s = VynampGraph.store, d = s.snapshot();
      d.nodes.push({id: 'g1', type: 'gain', x: 400, y: 320, enabled: true, collapsed: false, rack: '', legacyBypass: false, params: VynampGraphModel.freshParams(VynampGraphModel.definitions.gain)});
      d.edges.push({id: 'e-p1', from: 'main-eq', out: 'out', to: 'g1', in: 'in'}, {id: 'e-p2', from: 'g1', out: 'out', to: 'sink', in: 'in'});
      s.load(d);
    });
    await m3.locator('[data-audio-shortcut=vinyl]').click();
    await m3.locator('#dsp-enabled').click();
    const topo = await m3.evaluate(() => { const d = VynampGraph.store.data, v = d.nodes.find(n => n.type === 'vinyl').id; return {intoSink: d.edges.filter(e => e.to === 'sink').map(e => e.from), intoVinyl: d.edges.filter(e => e.to === v).map(e => e.from).sort(), v}; });
    assert.deepEqual(topo.intoSink, [topo.v]);
    assert.deepEqual(topo.intoVinyl, ['g1', 'main-eq']);
    for (const pg of [a1, b4, a2, m3]) await pg.context().close();

    assert.deepEqual(errors, []);
    console.log('rev41-dsp-binding: ok (bypass no kernel: ' + hasBypass + ')');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
