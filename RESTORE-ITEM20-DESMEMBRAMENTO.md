# Desmembramento do Item #20 — Vynamp Restore

**Data:** 2026-11-02
**Status:** Decidido
**Origem:** Análise de redundância por agente (a92b6c9bdf7d1065a)

---

## Resumo da Decisão

O item #20 original (~30 sub-funcionalidades) foi desmembrado em 4 itens independentes para o MVP JS, com fusões nos itens planejados existentes e deferimento de módulos pesados para a versão Rust nativa.

---

## Novos Itens Criados (MVP JS)

### #20a — Motor de Diagnóstico / Relatório de Saúde do Áudio
**Prioridade:** MÁXIMA
**Escopo:**
- Detecção automática de: estalos isolados, crepitação densa (canal L-R), zumbido 50/60Hz + harmônicos (sem confundir com notas), chiado, ronco <40Hz, saturação/clipping, true peak (>0 dBTP), cortes/discontinuidades, pulos/repetições (blocos 588 amostras), DC offset, limite efetivo de frequência
- Relatório estruturado por faixa: intensidade de cada defeito, timestamp de exemplos, cadeia de correção sugerida
- Integração com worker existente (`restore-worker.js`) — estender `analyze()` para retornar objeto `diagnostics` além de `peaks`/`spectrum`
- UI: painel de diagnóstico no workspace Restore, acessível via botão "Diagnosticar"

**Não inclui:** wow & flutter, reparo espectral avançado (Rust)

### #20b — Sistema de Presets de Restauração
**Prioridade:** ALTA
**Escopo:**
- Presets built-in: CD arranhado, vinil, fita K7, gravação celular, MP3 baixa qualidade
- Cada preset é um mapa de parâmetros: `{dc, hum, gate, threshold, click, clickThreshold, denoise, rumble}`
- Seletor dropdown no toolbar Restore
- Aplicar preset = carregar parâmetros sem alterar regiões/projeto
- Persistência em localStorage (`vynamp-restore-presets-v1`)
- Aviso visual quando agudos forem reduzidos >3dB acima de 8kHz (pós-denoise/hum)

### #20c — De-rumble (passa-altas fase linear)
**Prioridade:** MÉDIA-ALTA
**Escopo:**
- Filtro biquad passa-altas no kernel DSP (`restore-dsp.js`), similar ao hum notch existente
- Frequência configurável (20-80 Hz), padrão 30 Hz
- Campo `rumble` no estado (`restore-model.js`), slider na UI
- Fase linear (forward-backward) para evitar distorção de transientes
- Testes unitários: atenuação >=20dB abaixo da frequência de corte, preservação de sinal acima

### #20d — True-peak Limiter
**Prioridade:** MÉDIA
**Escopo:**
- Look-ahead limiter no pipeline de exportação (`restore-worker.js`)
- Teto padrão -1 dBTP, configurável
- Medição true peak (inter-sample) via oversampling 4x ou fórmula ITU-R BS.1770
- Aplicado apenas na exportação, não no monitor em tempo real
- Integrado com normalização existente (#9): se normalizar + limiter, aplicar limiter após normalização
- Testes: pico inter-sample resultante <= teto configurado

---

## Fusões com Itens Planejados Existentes

| Sub-item do #20 | Fundir com | Justificativa |
|---|---|---|
| De-crackle (mid/side, múltiplas passadas) | **#4** (de-crackle / de-hum adaptativo) | Mesma categoria algorítmica; #4 já planeja de-crackle |
| De-hum adaptativo (notch em pente) | **#4** | Upgrade do notch fixo atual; #4 já planeja adaptação |
| Detecção automática de cliques (para diagnóstico) | **#6** (detecção automática de cliques) | #6 já planeja pré-análise; diagnóstico usa o mesmo detector |
| Batch processing com relatório | **#5** (batch processing) | #5 já planeja fila; relatório é extensão natural |
| Preservar metadados ID3/XMP | **#13** (metadados) | #13 já planeja integração; não duplicar |
| Comparação lado-a-lado visual | **#19** (split-view) | Monitor A/B/C já existe; split-view é UX complementar |

---

## Upgrades Incrementais (sem item separado)

Estes são melhorias de módulos existentes, implementados como refinamentos quando o item principal for trabalhado:

- **De-click AR+LSAR**: upgrade do interpolador linear atual → feito junto com #6 ou #20a
- **De-hiss MMSE com perfil aprendido**: upgrade do Wiener-like atual → feito junto com #20a (perfil de ruído aprendido alimenta ambos)
- **Medição before/after**: extensão do motor de diagnóstico → parte de #20a

---

## Deferidos para Versão Rust Nativa

Módulos com complexidade algorítmica ou dependências nativas incompatíveis com JS/browser:

| Módulo | Motivo do adiamento |
|---|---|
| De-clip por reconstrução AR | Algoritmo iterativo pesado; Rust + SIMD |
| Wow & flutter correction | Análise de pitch temporal + resampling adaptativo |
| Reparo espectral avançado (inpainting) | Janelas grandes + possível ML; Rust + ONNX |
| Reparo de cortes / detector de pulos | Heurísticas complexas em nível de amostra; performance crítica |
| Exportação FLAC | Codec nativo (libflac) |
| Exportação MP3 320kbps | Codec nativo (libmp3lame) |
| Processamento interno float64 | JS é float32; Rust permite precisão dupla |

Estes devem ser documentados no roadmap da versão Rust como escopo prioritário pós-MVP.

---

## Regras Transversais (aplicam a todos os itens)

1. **Corrigir só onde há defeito** — nunca filtrar a música inteira sem necessidade (escopo = regiões ou detecção automática)
2. **Nunca reduzir agudos automaticamente** — aviso visual quando perda >3dB acima de 8kHz; usuário decide
3. **Testes com áudios sintéticos** — cada módulo deve ter testes unitários com ruídos conhecidos inseridos, medindo remoção sem alteração do resto
4. **Zero cortes ao tocar** — todas as transições devem usar fade/crossfade suave
5. **Preservar duração** — nenhum módulo pode alterar a duração total do áudio

---

## Estado Atual das Implementações

| Item | Status | Testes |
|---|---|---|
| #2 (denoise Wiener-like) | ✅ Implementado | 8/8 passando |
| #8 (preview região) | ✅ Implementado | Playwright |
| #9 (normalização exportação) | ✅ Implementado | 16/16 passando |
| #10 (prefs globais) | ✅ Implementado | Integrado |
| #11 (progresso análise) | ✅ Implementado | Worker |
| #14 (atalhos teclado) | ✅ Implementado | 14/14 passando |
| #16 (feedback visual) | ✅ Implementado | CSS + JS |
| #17 (tooltips guia) | ✅ Implementado | 26/26 UX |
| #18 (drag-and-drop) | ✅ Implementado | 26/26 UX |
| #20a (diagnóstico) | 🆕 Planejado | — |
| #20b (presets) | 🆕 Planejado | — |
| #20c (de-rumble) | 🆕 Planejado | — |
| #20d (true-peak limiter) | 🆕 Planejado | — |