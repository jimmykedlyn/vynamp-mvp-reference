// Rev.41 — Tube: presets Limpo/Quente/Saturado, intensidade, ganho de pequeno sinal unitário, autoGain, bypass e oversampling 2×.
'use strict';
const assert = require('node:assert/strict'), path = require('node:path'), fs = require('node:fs'), vm = require('node:vm');
const A = require('../advanced-dsp.js'), fs48 = 48000, BLOCK = 128;
const run = (params, L, R) => { const k = new A.Tube(fs48); k.setParams(params); const n = L.length, o = [new Float32Array(n), new Float32Array(n)]; for (let i = 0; i < n; i += BLOCK) { const m = Math.min(BLOCK, n - i), out = [new Float32Array(m), new Float32Array(m)]; k.processInto([L.subarray(i, i + m), R.subarray(i, i + m)], out); o[0].set(out[0], i); o[1].set(out[1], i); } assert(o.every(c => c.every(Number.isFinite)), 'saída finita'); return [o[0], o[1], k]; };
const sine = (f, sec, amp) => Float32Array.from({length: Math.round(sec * fs48)}, (_, i) => amp * Math.sin(2 * Math.PI * f * i / fs48));
const dB = x => 20 * Math.log10(Math.max(x, 1e-12));
const goertzel = (a, f, s = 0, e = a.length) => { let s1 = 0, s2 = 0; const c = 2 * Math.cos(2 * Math.PI * f / fs48); for (let i = s; i < e; i++) { const s0 = a[i] + c * s1 - s2; s2 = s1; s1 = s0; } return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) * 2 / (e - s); };
const base = p => A.applyPreset('tube', {profile: 'Warm pre-amp', warmup: 0, low: 25, high: 18000, intensity: 100, autoGain: true, bypass: false}, p);
const measure = (params, amp, f = 1000) => { const x = sine(f, 1.2, amp), [l] = run(params, x, x), s = fs48 * .6, f1 = goertzel(l, f, s); let h = 0; for (let k = 2; k <= 6; k++) if (f * k < 23000) h += goertzel(l, f * k, s) ** 2; return {gain: dB(f1 / amp), thd: Math.sqrt(h) / f1 * 100, h2: goertzel(l, 2 * f, s) / f1 * 100, h3: goertzel(l, 3 * f, s) / f1 * 100}; };

// Contrato e catálogo
assert.deepEqual(Object.keys(A.TUBE_PRESETS), ['Limpo', 'Quente', 'Saturado']);
const window = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dsp-catalog.js'), 'utf8'), {window});
const tube = window.VYNAMP_DSP_CATALOG.find(m => m.id === 'tube'), field = id => tube.fields.find(f => f.id === id);
assert.deepEqual([...field('preset').options], ['Limpo', 'Quente', 'Saturado']); assert.equal(field('preset').value, 'Quente');
assert.equal(field('intensity').value, 100); assert.equal(field('autoGain').value, true); assert.equal(field('bypass').value, false);
for (const [k, v] of Object.entries(A.TUBE_PRESETS.Quente)) assert.equal(field(k).value, v, 'padrão do catálogo = Quente: ' + k);

// Caráter por preset (sem autoGain para medir a curva estática)
const raw = p => ({...base(p), autoGain: false});
{ const q12 = measure(raw('Quente'), .25), l6 = measure(raw('Limpo'), .5), s6 = measure(raw('Saturado'), .5), q6 = measure(raw('Quente'), .5);
  assert(q12.thd > .5 && q12.thd < 2.5, 'Quente −12 dBFS: ' + q12.thd); assert(l6.thd < 1, 'Limpo discreto: ' + l6.thd); assert(s6.thd > 4, 'Saturado evidente: ' + s6.thd); assert(l6.thd < q6.thd && q6.thd < s6.thd, 'ordem dos presets');
  assert(q12.h2 > q12.h3, 'Warm pre-amp: H2 dominante em nível moderado'); }
// Pequeno sinal: sem o reforço de +1,7 dB da rev.40
for (const p of Object.keys(A.TUBE_PRESETS)) { const g = measure(raw(p), .0316).gain; assert(Math.abs(g) < .3, p + ' ganho de pequeno sinal ' + g); }
// autoGain: ganho percebido estável em todos os níveis (±0,5 dB)
for (const p of Object.keys(A.TUBE_PRESETS)) for (const amp of [.0316, .25, .708]) { const g = measure(base(p), amp).gain; assert(Math.abs(g) <= .5, p + ' autoGain em ' + dB(amp).toFixed(0) + ' dBFS: ' + g); }
{ // programa com dinâmica: ΔLUFS ±0,5 dB
  const n = fs48 * 8, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / fs48, env = (t % 2 < 1.6 ? 1 : 0) * Math.exp(-(t % 2) * 1.1) * (t > .5 ? 1 : 0); for (const [f, g] of [[110, .2], [220, .15], [440, .1], [1320, .05], [3960, .03]]) { L[i] += g * env * Math.sin(2 * Math.PI * f * t); R[i] += g * env * Math.sin(2 * Math.PI * f * 1.003 * t); } }
  const lufs = (a, b) => { const m = new A.LoudnessMeter(fs48); for (let i = 0; i < a.length; i++) m.add(a[i], b[i]); return m.snapshot().integrated; }, ref = lufs(L, R);
  for (const p of Object.keys(A.TUBE_PRESETS)) { const [l, r] = run(base(p), L, R), d = lufs(l, r) - ref; assert(Math.abs(d) <= .5, p + ' ΔLUFS ' + d); } }
// Oversampling 2×: aliasing de 9 kHz a −3 dBFS no Saturado bem abaixo da fundamental
{ const x = sine(9000, 1, .708), [l] = run(raw('Saturado'), x, x), s = fs48 / 2, f1 = goertzel(l, 9000, s);
  for (const f of [3000, 6000, 12000, 15000, 21000]) { const a = dB(goertzel(l, f, s) / f1); assert(a < -60, 'alias em ' + f + ' Hz: ' + a); } }
{ // meia-banda: passa 1 kHz unitário e rejeita acima de ~26 kHz (a 96 kHz)
  const hb = new A.Halfband(); let pe = 0; const n = 4096, buf = []; for (let i = 0; i < n; i++) { hb.up(Math.sin(2 * Math.PI * 1000 * i / fs48)); buf.push(hb.down(hb.even, hb.odd)); } for (let i = 2048; i < n; i++) pe = Math.max(pe, Math.abs(buf[i])); assert(Math.abs(dB(pe)) < .05, 'meia-banda unitária ' + dB(pe)); }
// Intensidade 0 ≈ transparente; bypass = entrada (latência 0); determinismo
{ const t = measure({...base('Saturado'), intensity: 0, autoGain: false}, .5); assert(t.thd < .05 && Math.abs(t.gain) < .1, 'intensidade 0: ' + JSON.stringify(t)); }
{ const x = Float32Array.from({length: fs48 / 2}, (_, i) => Math.sin(i * .02) * .6), [l, r, k] = run({...base('Saturado'), bypass: true}, x, x); const D = k.latencyFrames; assert.equal(D, 3); assert.equal(A.latencyFrames('tube', {}, fs48), D, 'latência declarada = kernel'); for (let i = 0; i < x.length; i++) { const e = i < D ? 0 : x[i - D]; assert(l[i] === e && r[i] === e, 'bypass = entrada atrasada em ' + i); } assert.equal(k.snapshot().bypass, true); assert.equal(k.snapshot().latencyMs, D / fs48 * 1000); }
{ // ramo paralelo seco (compensado pela latência declarada) + Tube quase linear: sem notch de pente
  const D = A.latencyFrames('tube', {}, fs48), lin = {...base('Quente'), intensity: 0, autoGain: false};
  const sum = f => { const x = sine(f, .3, .25), [l] = run(lin, x, x); let s1 = 0; const st = fs48 * .15; const y = l.map((v, i) => v + (i >= D ? x[i - D] : 0)); return dB(goertzel(y, f, st) / (2 * .25)); };
  const ref = sum(1000); for (const f of [4000, 6000, 8000, 10000, 12000]) { const d = sum(f) - ref; assert(Math.abs(d) < 1, 'pente em ' + f + ' Hz: ' + d.toFixed(2) + ' dB'); }
  const p = new A.Processor(fs48, 'tube', base('Quente'), false), o = [new Float32Array(BLOCK), new Float32Array(BLOCK)], imp = new Float32Array(BLOCK); imp[0] = 1; p.processInto([imp, imp], o); assert.equal(o[0][D], 1, 'pausado: mesma latência'); }
{ const x = sine(997, .5, .6), a = run(base('Saturado'), x, x), b = run(base('Saturado'), x, x); assert.deepEqual(a[0], b[0]); }
{ const p = new A.Processor(fs48, 'tube', base('Quente'), false), out = [new Float32Array(BLOCK), new Float32Array(BLOCK)]; p.transport({active: true, volume: 1}); p.processInto([sine(997, BLOCK / fs48, .3), sine(997, BLOCK / fs48, .3)], out); assert(out[0].every(Number.isFinite)); }
{ // modelo do grafo: preset grava valores-base; nó salvo antes da rev.41 migra mantendo perfil/transformador
  globalThis.VYNAMP_DSP_CATALOG = window.VYNAMP_DSP_CATALOG; globalThis.VynampAdvancedDSP = A; delete require.cache[require.resolve('../graph-model.js')];
  const M = require('../graph-model.js'), s = new M.Store(), t = s.add('tube'); assert.equal(s.node(t.id).params.preset, 'Quente'); s.setParam(t.id, 'preset', 'Saturado'); assert.equal(s.node(t.id).params.saturation, 70);
  const snap = s.snapshot(), legacy = snap.nodes.find(n => n.id === t.id); legacy.params = {profile: 'Single-ended', warmup: 3, saturation: 15, compression: 10, sag: 8, low: 40, high: 18000, couple: false};
  const migrated = M.validate(snap).nodes.find(n => n.id === t.id).params; assert.equal(migrated.preset, 'Quente'); assert.equal(migrated.saturation, 35); assert.equal(migrated.profile, 'Single-ended'); assert.equal(migrated.low, 40); }
console.log('PASS rev41 tube: presets, ganho de pequeno sinal unitário, autoGain ±0,5 dB, oversampling 2× contra aliasing, intensidade, bypass, determinismo, migração');
