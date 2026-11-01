# Testes vigentes — revisão16

Execute `node run-revision16.cjs` nesta pasta. A lista `revision16-tests.json` identifica as suítes atualizadas e executadas nesta revisão. Os nomes sem prefixo `test-` foram preservados como histórico das entregas anteriores; alguns têm expectativas antigas de navegação ou gabinete e não integram a suíte vigente.

Requer Node.js, Playwright e Chrome; a captura de mosaico requer Sharp. Use PLAYWRIGHT_MODULE, SHARP_MODULE e CHROME_PATH se estiverem fora da instalação padrão. Nenhuma dessas dependências é necessária para abrir o player, e não fazem parte dos pacotes nativos de tema.

Os testes usam contexto de navegador novo e WAVs/metadados sintéticos. Nunca consultam sua biblioteca pessoal. Relatórios ficam na raiz da coleção; capturas em interactive/previews. São sequenciais para evitar disputa de CPU nos testes de áudio. `v16-suite-validation.json` registra as execuções da entrega, incluindo revisões de expectativas por nova navegação/identidade do EQ. `v16-portability-validation.json` registra a verificação dos testes portáteis.

Cobertura: aceitação do player, 144 combinações, VUs reversíveis, acabamento, reflow, alvos de toque, letras/metadados/concorrência, DSP39/198 controles, knobs/sliders, PEQ32 e modos gráficos, presets/migração, instâncias compartilhadas e adicionais, áudio local/offline, portas tipadas/ciclos/histórico/A-B, recursos limitados, canal estéreo em oposição de fase e contraste dos fios. Sem build/lint configurados, scripts passam por `node --check`.

Limites: Chrome/Windows apenas; não é certificação WCAG nem teste de leitor de tela ou engine nativa. A cobertura integral do MVP continua INCOMPLETA; adaptadores ausentes mantêm configuração/ativação bloqueada com motivo.


## Revisão17 — cores neon

Execute `node test-neon.cjs` e `node test-neon-visual.cjs`. Cobrem cores globais/independentes, herança, persistência por skin/reset,120 pares skin/cor, teclado, toque e fonte200%. Os testes da revisão16 continuam disponíveis. As suítes efetivamente reexecutadas após a personalização estão em neon-regressions-validation.json.


## Revisão18 — referências desktop/mobile/mini

Execute `node layout18-layout.cjs`, `node layout18-audio.cjs`, `node layout18-visual.cjs` e `node layout18-review.cjs`. Verificam mesmas instâncias DOM/áudio, navegação,12skins/12VU mobile, proporções/reflow, foto da interface, toque44px, hit-test da identidade da faixa e nomes longos. Os testes de regressão reexecutados estão em layout18-regressions-validation.json. Nenhum recurso é importado de CDNs das referências.
