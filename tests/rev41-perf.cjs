// Rev.41 — orçamento de CPU do Vinyl e do Tube (Processor.processInto, blocos de 128 a 48 kHz, padrões, offline=true).
// Limite folgado (25 % de 2,667 ms) para não oscilar em máquina carregada; imprime os números para acompanhamento.
'use strict';
const assert = require('node:assert/strict'), A = require('../advanced-dsp.js');
const B = 128, budget = B / 48000 * 1e6, blocks = 1500, rounds = 7;
const input = [new Float32Array(B), new Float32Array(B)], output = [new Float32Array(B), new Float32Array(B)];
let phase = 0; const fill = () => { for (let i = 0; i < B; i++) { phase += 2 * Math.PI * 440 / 48000; input[0][i] = .3 * Math.sin(phase); input[1][i] = .27 * Math.sin(phase + .3); } };
function bench(type) {
  const p = new A.Processor(48000, type, {}, true); p.transport({active: true, phase: 'playing', position: 0, offline: true, sideProgress: .3, duration: 1200});
  for (let k = 0; k < 3000; k++) { fill(); p.processInto(input, output); }
  const times = [];
  for (let r = 0; r < rounds; r++) { const t = process.hrtime.bigint(); for (let k = 0; k < blocks; k++) { fill(); p.processInto(input, output); } times.push(Number(process.hrtime.bigint() - t) / 1e3 / blocks); }
  times.sort((a, b) => a - b); return {median: times[rounds >> 1], best: times[0]};
}
const out = {};
for (const type of ['vinyl', 'tube']) { const r = bench(type); out[type] = r; console.log(`${type}: mediana ${r.median.toFixed(0)} µs/bloco (${(r.median / budget * 100).toFixed(1)} % do orçamento), melhor ${r.best.toFixed(0)} µs`); }
for (const type of ['vinyl', 'tube']) assert(out[type].median < budget * .25, `${type} acima de 25 % do orçamento em tempo real`);
assert(output.every(c => c.every(Number.isFinite)));
console.log('PASS rev41 perf: Vinyl e Tube abaixo de 25 % do orçamento de tempo real');
