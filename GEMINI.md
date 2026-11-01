# Vynamp MVP — regras de design para o agente (Gemini / Antigravity)

Esta pasta é o MVP web do Vynamp (rev.39, sobre o DSP da rev.37). Ele é a **referência visual e comportamental** da UI nativa futura (Rust + egui), não código de produto. Seu trabalho aqui é melhorar o design do MVP seguindo a **linha de design atual do MVP**, e não a spec canônica ao pé da letra.

## Hierarquia de decisão (da mais forte para a mais fraca)

1. **Inegociáveis** (seção abaixo): nunca quebre, nem com justificativa.
2. **Linha de design atual do MVP** (princípios abaixo): é o critério principal das correções.
3. **Comportamento atual do MVP**: preserve o que funciona; mude só o que a correção exige.
4. **Spec canônica** (`../../../../repo/docs/design/*.md`, `../../../../repo/assets/design-tokens.json`, `../SKIN-REQUIREMENTS-CODEX.md`): é uma **referência anterior** (direção "Classic Graphite"). Use para regras de acessibilidade, honestidade de áudio e viabilidade; **não** use para impor paleta, marca, geometria ou layout que o MVP já superou.

Em conflito entre 2 e 4, vale a 2. Em dúvida real, não mude: anote em `../../../review/DUVIDAS.md`.

**Antes de corrigir**, leia a triagem no topo de `../../../AVALIACAO-DESIGN-GEMINI.md`: ela diz quais itens `DS-xx` aplicar, adaptar ou ignorar.

## Fontes da linha de design atual (leia antes de mexer na área)

- `../UX-UI-REV20.md` — tradução fiel das referências HTML do mantenedor (desktop/mobile/mini) em `faithful-layout.js/css`.
- `../CORES-NEON.md` — dez cores neon por skin e por componente.
- `../MARCA-E-ICONES-REV35.md` — marca **Vértice** e famílias de ícones.
- `../LEIA-ME.md` — histórico por revisão (17 → 39).
- `refinement39.css/js` — ajustes mais recentes, vindos de anotações do mantenedor. Não desfaça.

## Inegociáveis

- **Originalidade:** nenhum asset, skin, ícone, geometria, sprite ou marca de terceiros (inclusive Winamp). Nada de CDN ou recurso externo.
- **Marca:** logomarca **Vértice** (rev.35), nome "Vynamp". Cor padrão "Seguir accent", ou uma das dez neon própria por skin. Não redesenhe, não troque para outra marca, não mude o lockup da rev.39.
- **Acessibilidade:** contraste WCAG 2.2 AA (texto 4,5:1; ícones/bordas/estados 3:1) em **todas** as 12 skins e cores neon; alvos ≥ 24 px (mouse) e ≥ 44 px (toque); foco visível; teclado; estados nunca só por cor; `prefers-reduced-motion`; fonte a 200% sem perda de função. O tema **high-contrast-wide** precisa ser de fato alto contraste.
- **Honestidade de áudio:** onde o processamento é simulado ou ausente, o selo é exatamente `[DEMO — sem processamento de áudio neste modo]` (pt-BR) / `[DEMO — no audio processing in this mode]` (en). Não esconda nem invente variações.
- **Cores por token:** componentes usam variáveis do tema/skin e do sistema neon, nunca hex solto. Pode ajustar valores de token de uma skin (registrando).
- **Viável em egui:** evite introduzir blur, backdrop-filter, máscaras, sombras pesadas ou gradientes complexos novos. Os existentes podem ficar no MVP; só troque se o item pedir.
- **Preservar o aprovado:** 12 VUs, waves, espectros, skins, rádios, DSP (rev.36/37) e EQ compartilhado continuam funcionando.
- **Não mexer** em `../../../../repo/`, em `.git`, em credenciais ou scripts de autenticação.

## Linha de design atual (o que guia as correções)

- **Fidelidade às referências do mantenedor (rev.20):** composição de appbar, workspace e transporte; mobile com navegação inferior; mini em card. Corrija defeitos dentro dessa composição, não substitua por outra.
- **Base escura neutra + accent neon:** superfícies pretas/grafite neutras e um accent neon escolhido por skin/componente. O accent destaca o que importa (play, item tocando, progresso); estados de foco, seleção e erro precisam continuar distinguíveis entre si mesmo com um só accent — use forma, borda, peso ou superfície, não só cor.
- **Personalização sem quebrar:** qualquer combinação skin × cor neon deve manter contraste e hierarquia.
- **Densidade com respiro:** compacta e eficiente, alinhamentos limpos, gaps consistentes; densa ≠ apertada; texto nunca abaixo de 11 px.
- **Hierarquia clara:** primeiro o que toca (tempo, faixa), depois o transporte, depois o resto. Ações secundárias recuam.
- **Movimento contido:** visualizadores vivos, interface calma, transições curtas.
- **Amigável ao leigo, profundo para o entusiasta:** básico óbvio; DSP/EQ avançado acessível sem poluir.
- **Coerência entre desktop, mobile, mini e skins:** muda o acabamento, não a linguagem.

## Como trabalhar nas correções

1. Siga a triagem e corrija por severidade, em lotes pequenos e coesos.
2. Mudança mínima: não reescreva arquivos inteiros nem refatore o que o item não pede. Prefira uma folha nova `refinement40.css/js` carregada por último a espalhar edições.
3. Depois de cada lote, rode os testes relevantes em `tests/` (`node tests/<suite>.cjs`, ver `tests/README.md`) e confira no navegador (localhost) em 390, 480×660, 1120 e 1600 px, em pelo menos 3 skins e com fonte 200%.
4. Se um teste falhar por expectativa que a correção tornou obsoleta, não o apague: atualize a expectativa e explique no registro.

## Registro (obrigatório)

- `../ARQUIVOS-ALTERADOS-REV40.md`: tabela de arquivos alterados/novos (formato das revisões anteriores).
- `../../../review/CORRECOES-REV40.md`: para cada `DS-xx`, o que foi feito, arquivos e status (corrigido / parcial / não feito + motivo).
- `../../../review/DIVERGENCIAS-SPEC.md`: toda divergência relevante da spec canônica (arquivo + seção, regra da spec, o que o MVP faz, justificativa). Divergência sem registro é proibida.
- Atualize `../LEIA-ME.md` com o bloco "Revisão 40" no topo, no estilo dos anteriores.
- Capturas novas em `previews/` com prefixo `rev40-`.
