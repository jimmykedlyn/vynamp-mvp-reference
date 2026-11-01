# Prompt — nova rodada de melhorias (rev.41)

> Cole no agy, aberto em `outputs/vynamp-extended/interactive/`, numa conversa nova.

---

Leia `GEMINI.md` desta pasta (regras, hierarquia de decisão e registro), `../../../review/CORRECOES-REV40.md` e `../../../review/DIVERGENCIAS-SPEC.md`. Você continua como **diretor de design de produto sênior em software de áudio** e agora também como **engenheiro de DSP especializado em modelagem analógica** (toca-discos, cápsulas, amplificadores valvulados).

Esta é a **rodada rev.41**: encontrar problemas **novos** que a avaliação anterior não cobriu e corrigi-los. Não repita itens `DS-01..14` já resolvidos, a não ser que tenham regredido.

## Fase 1 — Validação e diagnóstico (sem editar nada)

1. **Regressões da rev.40:** rode os testes `tests/rev40-*.cjs` e as suítes principais de `tests/README.md`. Liste o que falha.
2. **Botões (foco principal).** Inventarie todos os botões do player em desktop (1120 e 1600 px), 480×660, mobile 390 px e mini, em pelo menos 4 skins e 3 cores neon:
   - estados: normal, hover, pressed/ativo, foco, desabilitado, ligado/desligado (toggle), carregando;
   - estado ligado/desligado distinguível sem depender só de cor (shuffle, repeat, mute, efeitos, letras, favoritos);
   - consistência: tamanho, raio, peso do ícone, alinhamento óptico, espaçamento, rótulo/tooltip/`aria-label`/`aria-pressed`;
   - alvos ≥ 24 px no mouse e ≥ 44 px no toque, sem sobreposição;
   - feedback imediato ao clicar e hierarquia (o Play domina; ações secundárias recuam);
   - botões dentro dos painéis DSP/EQ, Vinyl e Tube.
3. **Simuladores Vinyl e Tube (foco principal).** O mantenedor ouviu o Vinyl e **quase não sentiu diferença no som; ele precisa ser bem realista**. Diagnostique por quê:
   - Leia `dsp-catalog.js` (padrões atuais: perda de agudos 1,5 dB, chiado 8%, crackle 6%, pops 3%, wow 0,12%, flutter 0,05%, rumble 5%, mascaramento ligado; Tube com saturação 15%, compressão 10%), `advanced-dsp.js`, `graph-audio.js` e `DSP-AVANCADO-REV37.md`.
   - Confira se o efeito está **de fato na rota de áudio** quando o usuário o liga pela UI, se o mascaramento não está apagando quase todo o ruído e se os padrões não são sutis demais para quem liga pela primeira vez.
   - **Você não consegue ouvir**: valide por medição. Renderize offline (o mesmo caminho da exportação WAV) um trecho de música e sinais de teste (seno de 1 kHz e 3,15 kHz, ruído rosa, silêncio digital), com e sem o efeito, e meça:
     - Vinyl: resposta em frequência (queda de agudos, ressonância de cápsula), ruído de superfície em silêncio (nível e espectro, que deve pesar no grave/médio, não ser ruído branco), taxa de crackle/pops por segundo, período do wow (= 60/rpm s; 1,8 s a 33⅓), desvio de pitch em 3,15 kHz, crosstalk/separação estéreo, rumble abaixo de 30 Hz, distorção que cresce para o fim do lado.
     - Tube: THD por nível de entrada, harmônicos pares dominando no single-ended, compressão por envelope, sag em transientes, aliasing.
   - Compare com o que se espera de um LP real tocado num toca-discos médio (separação estéreo de ~20–30 dB no médio, que cai nos agudos; graves somados em mono; chiado e crackle audíveis nas pausas e entre faixas; wow perceptível em notas longas de piano). Aponte o que falta no modelo.

Entregue a Fase 1 em `../../../review/AVALIACAO-REV41.md`, no formato da avaliação anterior: itens `R41-01…` com severidade, tela/componente, problema, por que importa e correção concreta. Use uma seção própria para os botões e outra para Vinyl/Tube, com as medições numa tabela antes/depois.

## Fase 2 — Correções

Corrija por severidade, seguindo o `GEMINI.md` (folha `refinement41.css/js` carregada por último, mudança mínima, testes por lote). Para o Vinyl, o objetivo é **realismo audível**:

- **Presets de condição do disco**: "Novo", "Bem conservado", "Usado", "Gasto/sebo". O preset padrão ao ligar o efeito deve ser **audível de imediato** (sugestão: "Usado"), sem ficar caricato.
- **Macro "Intensidade"** que escala todos os parâmetros juntos, com os parâmetros detalhados recolhidos em "Avançado".
- **Realismo que faltar no modelo**: crosstalk estéreo dependente da frequência, graves abaixo de ~150 Hz somados em mono, ruído de superfície com espectro de vinil (não branco), crackle com forma e variação de clique real, distorção de traçado crescendo para o fim do lado, wow ligado à rotação.
- O mascaramento deve **reduzir**, não eliminar o ruído: nas pausas e no silêncio entre faixas o chiado tem que aparecer.
- **Bypass A/B** com o mesmo volume percebido (compense o ganho) para o usuário comparar sem viés de volume.
- Tube: mesma lógica de presets e macro, se a medição mostrar que o efeito é sutil demais.
- Mantenha o selo DEMO onde algo não processa áudio e o PRNG determinístico.

**Arquivos para o mantenedor ouvir:** gere em `../../../review/audio-rev41/` trechos WAV de 20–30 s, de música livre de direitos ou sintética. Inclua original, Vinyl antes (rev.40) e Vinyl depois, um por preset, e Tube antes e depois, com volume compensado. Liste em `CORRECOES-REV41.md` o que ouvir em cada um, como "chiado na introdução" ou "wow na nota longa em 0:12".

## Registro

Siga o `GEMINI.md`, trocando rev.40 por **rev.41**: `../ARQUIVOS-ALTERADOS-REV41.md`, `../../../review/CORRECOES-REV41.md`, `../../../review/DIVERGENCIAS-SPEC.md` (acrescentar), bloco "Revisão 41" no `../LEIA-ME.md` e capturas `previews/rev41-*`.

Ao terminar cada fase, pare e me mostre o resumo antes de seguir.
