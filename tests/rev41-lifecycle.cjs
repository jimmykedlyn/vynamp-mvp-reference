// Rev.41 — ciclo de vida das cadeias: reconstruir o grafo várias vezes durante a reprodução não pode deixar
// processadores AudioWorklet antigos rodando (o relógio do AudioContext desacelerava e o áudio "sumia").
'use strict';
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright'), assert = require('node:assert/strict'), path = require('node:path'), {pathToFileURL} = require('node:url');
(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--autoplay-policy=no-user-gesture-required']});
  try {
    const p = await browser.newPage({viewport: {width: 1440, height: 1000}}), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(() => { const O = window.AudioContext; window.__ctxs = []; window.AudioContext = class extends O { constructor(...a) { super(...a); window.__ctxs.push(this); } }; });
    await p.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await p.evaluate(async () => {
      const frames = 48000 * 60, b = new ArrayBuffer(44 + frames * 8), v = new DataView(b), txt = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      txt(0, 'RIFF'); v.setUint32(4, b.byteLength - 8, true); txt(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 3, true); v.setUint16(22, 2, true); v.setUint32(24, 48000, true); v.setUint32(28, 384000, true); v.setUint16(32, 8, true); v.setUint16(34, 32, true); txt(36, 'data'); v.setUint32(40, frames * 8, true);
      for (let i = 0; i < frames; i++) { const x = .2 * Math.sin(2 * Math.PI * 440 * i / 48000); v.setFloat32(44 + i * 8, x, true); v.setFloat32(48 + i * 8, x, true); }
      const id = VynampReference.registerLocalFile(new File([b], 'lifecycle.wav')); await VynampReference.playTrack(id, false);
      const s = VynampGraph.store, meter = s.add('loudness-meter');
      s.change(d => { d.settings.enabled = true; for (const e of d.edges) if (e.to === 'sink') e.to = meter.id; d.edges.push({id: 'life-m', from: meter.id, out: 'out', to: 'sink', in: 'in'}); });
      window.lifeMeter = meter.id; await VynampGraph.synchronizeAudio();
    });
    await p.locator('#play').click();
    await p.waitForFunction(() => VynampReference.state.mediaStatus === 'playing' && VynampReference.state.position > .5, null, {timeout: 15000});
    const clockRate = async ms => { const a = await p.evaluate(() => ({c: window.__ctxs.map(c => c.currentTime), w: performance.now()})); await p.waitForTimeout(ms); const b = await p.evaluate(() => ({c: window.__ctxs.map(c => c.currentTime), w: performance.now()})); return Math.max(...b.c.map((x, i) => (x - a.c[i]) * 1000 / (b.w - a.w))); };
    const rate0 = await p.evaluate(() => window.__ctxs.map(c => c.sampleRate).join(','));
    const baseline = await clockRate(2000); console.log('AudioContext a ' + rate0 + ' Hz; relógio antes das reconstruções: ' + baseline.toFixed(2));
    // Sete reconstruções: insere Vinyl, insere Tube, desliga/religa o grafo, muda parâmetro, remove o Tube e o insere de novo
    // (termina com Vinyl + Tube + medidor, a cadeia que o usuário ouvia travar).
    const builds0 = await p.evaluate(() => VynampGraph.engine.builds);
    const insert = type => p.evaluate(async t => { const s = VynampGraph.store, n = s.add(t); s.change(d => { const e = d.edges.find(e => e.to === lifeMeter); e.to = n.id; d.edges.push({id: 'life-' + n.id, from: n.id, out: 'out', to: lifeMeter, in: 'in'}); }); await VynampGraph.synchronizeAudio(); return n.id; }, type);
    const vinyl = await insert('vinyl'); await p.waitForTimeout(250);
    const tube = await insert('tube'); await p.waitForTimeout(250);
    for (const on of [false, true]) { await p.evaluate(async on => { VynampGraph.store.change(d => { d.settings.enabled = on; }); await VynampGraph.synchronizeAudio(); }, on); await p.waitForTimeout(250); }
    await p.evaluate(async id => { VynampGraph.store.setParam(id, 'condition', 'Gasto'); await VynampGraph.synchronizeAudio(); }, vinyl); await p.waitForTimeout(250);
    await p.evaluate(async ({tube, vinyl}) => { const s = VynampGraph.store; s.change(d => { d.nodes = d.nodes.filter(n => n.id !== tube); d.edges = d.edges.filter(e => e.from !== tube && e.to !== tube); d.edges.push({id: 'life-back', from: vinyl, out: 'out', to: lifeMeter, in: 'in'}); }); await VynampGraph.synchronizeAudio(); }, {tube, vinyl});
    await p.waitForTimeout(250); await insert('tube');
    const builds = await p.evaluate(() => VynampGraph.engine.builds);
    assert(builds - builds0 >= 6, 'reconstruções insuficientes: ' + (builds - builds0));
    await p.waitForTimeout(1000); // deixa os ramos aposentados terminarem o crossfade e o JIT aquecer o Tube novo
    const a = await p.evaluate(() => ({c: window.__ctxs.map(c => c.currentTime), w: performance.now(), pos: VynampReference.state.position}));
    await p.waitForTimeout(10000);
    const b = await p.evaluate(() => ({c: window.__ctxs.map(c => c.currentTime), w: performance.now(), pos: VynampReference.state.position, m: VynampAdvancedTransport.metrics(lifeMeter)}));
    const rates = b.c.map((x, i) => (x - a.c[i]) * 1000 / (b.w - a.w)), rate = Math.max(...rates), advanced = b.pos - a.pos;
    console.log(`reconstruções ${builds - builds0}; relógio do AudioContext ${rate.toFixed(2)}× tempo real; posição avançou ${advanced.toFixed(2)} s em 10 s; momentary ${b.m?.momentary?.toFixed?.(1)}; processadores vivos no worklet ${b.m?.liveProcessors}`);
    assert(rate >= .98, 'relógio do AudioContext lento (underrun no thread de áudio): ' + rate.toFixed(2) + ' a ' + rate0 + ' Hz');
    assert(advanced >= 9.5, 'reprodução travada: ' + advanced.toFixed(2));
    assert(b.m && Number.isFinite(b.m.momentary), 'medidor de loudness sem sinal (mudo)');
    assert.deepEqual(errors, []);
    console.log('PASS rev41 lifecycle: cadeias antigas liberadas, relógio ≥ 0,98 por 10 s com Vinyl + Tube + medidor e áudio presente após 7 reconstruções');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
