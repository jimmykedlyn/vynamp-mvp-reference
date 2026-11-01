// Rev.41 — Vinyl audível e realista: condição, intensidade, máscara, cápsula, crosstalk, traçado, transporte, autoGain e bypass.
'use strict';
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), vm = require('node:vm');
const A = require('../advanced-dsp.js'), fs48 = 48000, BLOCK = 128;
const run = (params, L, R, transport) => { const k = new A.Vinyl(fs48); k.setParams(params); if (transport) k.transport(transport); const n = L.length, o = [new Float32Array(n), new Float32Array(n)]; for (let i = 0; i < n; i += BLOCK) { const m = Math.min(BLOCK, n - i), out = [new Float32Array(m), new Float32Array(m)]; k.processInto([L.subarray(i, i + m), R.subarray(i, i + m)], out); o[0].set(out[0], i); o[1].set(out[1], i); } assert(o.every(c => c.every(Number.isFinite)), 'saída finita'); return [o[0], o[1], k]; };
const sine = (f, sec, amp) => Float32Array.from({length: Math.round(sec * fs48)}, (_, i) => amp * Math.sin(2 * Math.PI * f * i / fs48));
const rms = (a, s = 0, e = a.length) => { let x = 0; for (let i = s; i < e; i++) x += a[i] * a[i]; return Math.sqrt(x / (e - s)); };
const dB = x => 20 * Math.log10(Math.max(x, 1e-12));
const goertzel = (a, f, s = 0, e = a.length) => { let s1 = 0, s2 = 0; const c = 2 * Math.cos(2 * Math.PI * f / fs48); for (let i = s; i < e; i++) { const s0 = a[i] + c * s1 - s2; s2 = s1; s1 = s0; } return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) * 2 / (e - s); };
const band = (a, lo, hi) => { // potência numa banda via soma de Goertzel em passos de 1/6 de oitava (suficiente para forma espectral)
  let p = 0; for (let f = lo; f < hi; f *= 2 ** (1 / 6)) p += goertzel(a, f, fs48, fs48 * 3) ** 2; return 10 * Math.log10(p); };
const base = c => A.applyPreset('vinyl', {context: 'Álbum em ordem', inner: true, mask: true, rpm: '33⅓', resonance: 13000, rolloff: 15000, intensity: 100, autoGain: true, bypass: false}, c);
const QUIET = {hiss: 0, crackle: 0, pops: 0, rumble: 0, density: 0}, CLEAN = {...QUIET, wow: 0, flutter: 0, warp: 0, autoGain: false};
const vt = p => ({position: 0, sideProgress: p, wear: 0, duration: 1200, offline: true});
const zero = new Float32Array(fs48 * 4);

// Contrato de parâmetros e catálogo
assert.deepEqual(Object.keys(A.VINYL_CONDITIONS), ['Novo', 'Bem conservado', 'Usado', 'Gasto', 'Realista']);
const window = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dsp-catalog.js'), 'utf8'), {window});
const vin = window.VYNAMP_DSP_CATALOG.find(m => m.id === 'vinyl'), field = id => vin.fields.find(f => f.id === id);
assert.deepEqual([...field('condition').options], ['Novo', 'Bem conservado', 'Usado', 'Gasto', 'Realista']); assert.equal(field('condition').value, 'Usado');
assert.equal(field('intensity').value, 100); assert.equal(field('intensity').max, 100); assert.equal(field('autoGain').value, true); assert.equal(field('bypass').value, false);
for (const [k, v] of Object.entries(A.VINYL_CONDITIONS.Usado)) assert.equal(field(k).value, v, 'padrão do catálogo = Usado: ' + k);
for (const c of Object.keys(A.VINYL_CONDITIONS)) for (const [k, v] of Object.entries(A.VINYL_CONDITIONS[c])) { const f = field(k); if (!f || typeof v !== 'number') continue; assert(v >= f.min && v <= f.max, c + '/' + k + ' fora da faixa'); }

// Ruído de superfície audível, ordenado por condição; espectro rosado com ênfase média e queda nos agudos
const silence = {}; for (const c of Object.keys(A.VINYL_CONDITIONS)) silence[c] = dB(rms(run(base(c), zero, zero, vt(.2))[0], fs48));
assert(silence.Usado > -61 && silence.Usado < -55, 'Usado ≈ −58 dBFS: ' + silence.Usado);
assert(silence.Novo > -72 && silence.Novo < silence['Bem conservado'] && silence['Bem conservado'] < silence.Usado && silence.Usado < silence.Gasto, JSON.stringify(silence));
{ const [l] = run({...base('Usado'), crackle: 0, pops: 0, rumble: 0}, zero, zero, vt(.2));
  const mid = band(l, 400, 2000), high = band(l, 9000, 18000), low = band(l, 40, 90);
  assert(mid - high > 15, 'chiado cai acima de ~8 kHz: ' + (mid - high)); assert(mid - low > 3, 'ênfase 200 Hz–2 kHz sobre o grave: ' + (mid - low)); }
{ const [l] = run({...base('Usado'), hiss: 0, rumble: 0}, zero, zero, vt(.2)); let n = 0, hold = 0; for (let i = fs48; i < l.length; i++) { if (hold > 0) { hold--; continue; } if (Math.abs(l[i]) > .002) { n++; hold = 144; } } assert(n / 3 >= 3 && n / 3 <= 25, 'cliques audíveis por segundo (Usado): ' + n / 3); }
{ const [l] = run({...base('Usado'), hiss: 0, crackle: 0, pops: 0}, zero, zero, vt(.2)); assert(dB(rms(l, fs48)) > -75, 'rumble não some no silêncio'); }

// Máscara: ruído pleno no silêncio, reduzido (mas nunca eliminado) sob música alta
{ const s = sine(440, 4, .25), [full] = run(base('Usado'), s, s, vt(.2)), [clean] = run({...base('Usado'), ...QUIET}, s, s, vt(.2)), [sil] = run(base('Usado'), zero, zero, vt(.2));
  const under = rms(full.map((x, i) => x - clean[i]), fs48), quiet = rms(sil, fs48);
  assert(under < quiet, 'silêncio tem mais ruído que música alta'); assert(under > .3 * quiet, 'ruído nunca eliminado: ' + under / quiet); }

// Cápsula e fim do lado
const resp = (f, prog, c = 'Usado') => { const x = sine(f, .5, .1); return dB(goertzel(run({...base(c), ...CLEAN}, x, x, vt(prog))[0], f, fs48 / 4) / .1); };
{ const s10 = resp(10000, 0), e10 = resp(10000, 1), s12 = resp(12000, 0);
  assert(s10 > -1.5 && s10 < 0, 'início do lado: perda leve a 10 kHz ' + s10); assert(e10 > -6.5 && e10 < -3, 'fim do lado: 3–6 dB a 10 kHz ' + e10); assert(s10 - e10 > 2.5 && s10 - e10 < 6.5, 'perda progressiva'); assert(s12 < .3, 'ressonância sem pico: ' + s12);
  assert(Math.abs(resp(1000, 1)) < .2 && Math.abs(resp(100, 1)) < .2, 'graves/médios planos'); }

// Crosstalk dependente da frequência e graves em mono
const sep = f => { const x = sine(f, .5, .25), z = new Float32Array(x.length), [l, r] = run({...base('Usado'), ...CLEAN}, x, z, vt(0)); return dB(goertzel(l, f, fs48 / 4) / goertzel(r, f, fs48 / 4)); };
{ const s1 = sep(1000), s10 = sep(10000), s80 = sep(80); assert(s1 > 20 && s1 < 30, 'separação 1 kHz ≈ 25 dB: ' + s1); assert(s10 > 11 && s10 < 19, 'separação 10 kHz ≈ 15 dB: ' + s10); assert(Math.abs(s80) < 1.5, '80 Hz somado em mono: ' + s80); }

// Distorção de traçado: ~0,5 % no início, 1–3 % no fim, H2 dominante, cresce com o nível
const thd = (prog, amp) => { const x = sine(1000, .5, amp), [l] = run({...base('Usado'), ...CLEAN}, x, x, vt(prog)), a = fs48 / 4, f1 = goertzel(l, 1000, a); let h = 0; for (let k = 2; k <= 6; k++) h += goertzel(l, 1000 * k, a) ** 2; return {thd: Math.sqrt(h) / f1 * 100, h2: goertzel(l, 2000, a), h3: goertzel(l, 3000, a)}; };
{ const s = thd(0, .5), e = thd(1, .5), low = thd(1, .1); assert(s.thd > .3 && s.thd < .8, 'THD início ' + s.thd); assert(e.thd >= 1 && e.thd <= 3, 'THD fim ' + e.thd); assert(e.h2 > 3 * e.h3, '2ª harmônica dominante'); assert(low.thd < e.thd / 2, 'depende do nível'); }

// Transporte: wow segue a rotação; empeno 5 % ≈ ±0,1 %, 100 % ≈ ±0,5 %
const pitch = extra => { const x = sine(3150, 7, .25), [l] = run({...base('Usado'), ...QUIET, flutter: 0, autoGain: false, ...extra}, x, x, vt(0)), z = []; for (let i = fs48; i < l.length; i++) if (l[i - 1] < 0 && l[i] >= 0) z.push(i - l[i - 1] / (l[i] - l[i - 1])); const t = [], v = []; for (let i = 16; i < z.length; i += 16) { t.push(z[i] / fs48); v.push(16 * fs48 / (z[i] - z[i - 16])); } const mean = v.reduce((a, b) => a + b) / v.length, ups = []; let st = v[0] > mean; for (let i = 1; i < v.length; i++) { if (!st && v[i] > mean) { st = true; ups.push(t[i]); } else if (st && v[i] < mean) st = false; } return {dev: Math.max(...v.map(x => Math.abs(x - mean))) / 3150 * 100, period: (ups[ups.length - 1] - ups[0]) / (ups.length - 1)}; };
{ const w33 = pitch({warp: 0, rpm: '33⅓'}), w45 = pitch({warp: 0, rpm: '45'}); assert(Math.abs(w33.period - 1.8) < .06, 'wow 33⅓ = 60/33,33 s: ' + w33.period); assert(Math.abs(w45.period - 4 / 3) < .06, 'wow 45 = 60/45 s: ' + w45.period);
  const p5 = pitch({wow: 0, warp: 5}).dev, p100 = pitch({wow: 0, warp: 100}).dev; assert(p5 > .07 && p5 < .13, 'empeno 5 %: ' + p5); assert(p100 > .4 && p100 < .6, 'empeno 100 %: ' + p100); }

// Determinismo, intensidade, latência, bypass e autoGain
{ const s = sine(997, 1, .2), a = run(base('Gasto'), s, s, vt(.5)), b = run(base('Gasto'), s, s, vt(.5)); assert.deepEqual(a[0], b[0]); assert.deepEqual(a[1], b[1]); }
{ const [l] = run({...base('Gasto'), intensity: 0}, zero, zero, vt(.5)); assert(rms(l) < 1e-6, 'intensidade 0 sem imperfeições'); }
{ const k = new A.Vinyl(fs48); k.setParams(base('Usado')); assert.equal(k.snapshot().latencyMs, 12); assert.equal(k.latencyFrames, 576); }
{ const x = Float32Array.from({length: fs48}, (_, i) => Math.sin(i * .01) * .3 + Math.sin(i * .37) * .1), y = x.map(v => -v), [l, r, k] = run({...base('Gasto'), bypass: true}, x, y, vt(.5));
  for (let i = 0; i < x.length; i++) { assert(l[i] === (i < 576 ? 0 : x[i - 576]) && r[i] === (i < 576 ? 0 : y[i - 576]), 'bypass = entrada atrasada em ' + i); } assert.equal(k.snapshot().bypass, true); }
{ // alternar A/B em execução converge para entrada atrasada exata, sem descontinuidade grande
  const x = sine(500, 1, .3), k = new A.Vinyl(fs48); k.setParams(base('Usado')); const o = [new Float32Array(fs48), new Float32Array(fs48)];
  for (let i = 0; i < fs48; i += BLOCK) { if (i === 23936) k.setParams({...base('Usado'), bypass: true}); const out = [new Float32Array(BLOCK), new Float32Array(BLOCK)]; k.processInto([x.subarray(i, i + BLOCK), x.subarray(i, i + BLOCK)], out); o[0].set(out[0], i); o[1].set(out[1], i); }
  for (let i = 23936 + 4800; i < fs48; i++) assert.equal(o[0][i], x[i - 576]); let jump = 0; for (let i = 23936 - 10; i < 23936 + 600; i++) jump = Math.max(jump, Math.abs(o[0][i] - o[0][i - 1])); assert(jump < .1, 'transição suave'); }
{ // programa (acordes com notas sustentadas, pausas): ±0,5 dB integrado com autoGain
  const n = fs48 * 10, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / fs48, on = t > 1 && t < 4.5 || t > 6; if (!on) continue; const env = Math.exp(-((t - 1) % 1.5) * 1.3); for (const [f, g] of [[220, .12], [277, .08], [330, .08], [1760, .03], [5280, .02]]) { L[i] += g * env * Math.sin(2 * Math.PI * f * t); R[i] += g * env * Math.sin(2 * Math.PI * f * 1.002 * t + .3); } }
  const lufs = (a, b) => { const m = new A.LoudnessMeter(fs48); for (let i = 0; i < a.length; i++) m.add(a[i], b[i]); return m.snapshot().integrated; }, ref = lufs(L, R);
  for (const c of Object.keys(A.VINYL_CONDITIONS)) { const [l, r] = run({...base(c), inner: true}, L, R, vt(.9)); const d = lufs(l, r) - ref; assert(Math.abs(d) <= .5, c + ' ΔLUFS ' + d); } }
{ // Processor: pausa = silêncio exato, worklet compila
  const p = new A.Processor(fs48, 'vinyl', base('Gasto'), false), out = [new Float32Array(BLOCK), new Float32Array(BLOCK)]; p.processInto([new Float32Array(BLOCK), new Float32Array(BLOCK)], out); assert(out[0].every(x => x === 0));
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', A.workletSource())(class { constructor() { this.port = {}; } }, () => {}, 48000); }
{ // Modelo do grafo: condição grava os valores-base; nó salvo antes da rev.41 migra para os padrões audíveis
  globalThis.VYNAMP_DSP_CATALOG = window.VYNAMP_DSP_CATALOG; globalThis.VynampAdvancedDSP = A; delete require.cache[require.resolve('../graph-model.js')];
  const M = require('../graph-model.js'), s = new M.Store(), v = s.add('vinyl'); assert.equal(s.node(v.id).params.condition, 'Usado'); s.setParam(v.id, 'condition', 'Gasto'); assert.equal(s.node(v.id).params.hiss, A.VINYL_CONDITIONS.Gasto.hiss);
  const snap = s.snapshot(), legacy = snap.nodes.find(n => n.id === v.id); legacy.params = {context: 'Faixa avulsa', inner: true, hfLoss: 1.5, distortion: 8, hiss: 8, crackle: 6, pops: 3, density: 15, mask: true, rpm: '45', wow: .12, flutter: .05, warp: 5, needle: false, runout: false, tail: '30 s + fade', flip: false, resonance: 12000, rolloff: 16000, rumble: 5};
  const migrated = M.validate(snap).nodes.find(n => n.id === v.id).params; assert.equal(migrated.condition, 'Usado'); assert.equal(migrated.hiss, 40); assert.equal(migrated.rpm, '45'); assert.equal(migrated.context, 'Faixa avulsa'); }
console.log('PASS rev41 vinyl: condições audíveis, máscara direta, cápsula/fim do lado, crosstalk e graves mono, traçado H2, wow por rotação, empeno, determinismo, bypass atrasado, autoGain ±0,5 dB, migração');
