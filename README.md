# vynamp-mvp-reference

[English](#vynamp-mvp-reference) · [Português](#português--vynamp-mvp-reference)

Home of the Vynamp web MVP (rev.38) and of the tools that extract the reference package the native Rust UI (egui, no browser) is measured against. The product never ships this code; it is the visual and behavioural specification. This is the only copy of the MVP: edit it here.

## Layout

| Path | Content |
|---|---|
| `mvp/` | The MVP: only the files the app loads (no tests, previews or tooling). Keep LF line endings; each revision is a commit, and the main repository pins that commit (see Pinning). Open `http://localhost:8766/index.html` after `npm run serve`. |
| `tools/serve.cjs` | No-store static server for `mvp/`, loopback only. |
| `tools/verify.cjs` | Re-extracts into a temporary directory and fails when any file differs from `out/` (`check/` excluded); the second copy of each differing file is kept in `verify-diff/` (untracked). |
| `tools/extract.cjs` | Drives Chrome through every theme, layout, width and one-level click state and writes `out/`. |
| `tools/svgcheck.cjs` | Renders every extracted SVG in Chrome and in resvg (the native renderer) and reports pixel differences. |
| `tools/pin.cjs` | Prints the pin record for a commit (`npm run pin -- [ref]`, default `HEAD`): commit, content hash, git tree, file count and bytes of `mvp/`, and the git tree of `out/`. Reads git objects only, so line endings in the working copy do not change it. |
| `out/` | Extraction output. The main repository cites it in place (`out/...` at the pinned commit) and copies none of it. |

## Run

Requires Node 20+, Google Chrome (or `CHROME=<path>`) and `resvg` 0.49 (`cargo install resvg --version 0.49.0`, or `RESVG=<path>`).

Extraction pins the page's audio sample rate to 48000 Hz (`VYNAMP_SAMPLE_RATE` overrides it), by passing `sampleRate` to the `AudioContext` the page constructs. Two outputs depend on the rate: the advanced EQ places its points at `log(f/10)/log(min(40000,.45*Fs)/10)*860`, and `decodeAudioData` resamples the synthetic WAV before its peaks become the waveform path. On a host whose device runs at 44100 -- most laptops -- both would differ from `out/` and `npm run verify` would fail over a spec that did not change. The pin has to reach the constructor, not just the getter the page reads: pinning only `sampleRate` leaves the real graph decoding at the device rate and reproduces neither side. Pinning makes the output a function of `mvp/` alone, which is what "two extractions produce identical output" has to mean.

```bash
npm ci
npm run serve
```

In a second shell:

```bash
npm run extract
npm run check-svg
npm run verify
```

## Pinning

The main repository (`jimmykedlyn/vynamp`) does not copy `mvp/` or `out/`. Its specs cite `vynamp-mvp-reference@<commit>` with paths under `mvp/...` and `out/...` (see its `design/07-pin-mvp.md`). To move the pin to a new revision, commit here, then run:

```bash
npm run pin -- <commit>
```

Copy the printed values into `design/07-pin-mvp.md` of the main repository. The content hash is the sha256 of the `<sha256> *./<path>` lines (`sha256sum --binary` format, LF-terminated, sorted by path) over every file of `mvp/`, read from the commit's blobs.

`check-svg` passes a file only when no non-text pixel differs beyond 1px antialiasing (see the header of `tools/svgcheck.cjs`). Text is compared and recorded but judged in the main repository's font task. A file using a renderer gap (`pathLength`, CSS `filter:blur()`) is judged by resvg on the file after the fix the native loader must apply (dashes rescaled; blur turned into an `feGaussianBlur` with an explicit region) against Chrome on the original. Every file is compared over white and over black (white ink on transparent shows only on black) and the worse backdrop is reported (`bg`). Files with no ink over either are `empty`: nothing was compared, so they do not pass and each needs an explanation in the evidence. `npm run check-svg` prints its report and exits 0 whatever the report says -- the maintainer runs it to look at the rendered diffs, and a tool that refuses to finish is useless for that. Pass `--check` to make a failing file set a non-zero exit status; that is the form a CI gate would use, and it is not the default because `out/check/report.json` currently lists 6 failing files (one `empty`, one `pathLength`, four `blurFn`) that are evidence awaiting the font and loader tasks, not a regression.

## Output

- `out/themes/themes.json`: per theme, source tokens, every resolved `--*` custom property, body styles and `<html>` attributes; `unsetVars` lists the variables the sources reference that `:root` does not define, with their fallback literals and whether element CSS or a script sets them.
- `out/svg/icons/`: one standalone SVG per icon (24×24, `currentColor`), `icons.json` (names, aliases, CSS icons) and `usage.json` (where each icon appears).
- `out/svg/meters/<prefix>/`: meter source SVG plus `meta.json` (kind, channels, scale, pivots, themes whose asset entry names it, selectable, dynamic attributes); `dynamic.json` records which attributes animate while a test tone plays. Rev.38 makes all 16 meters selectable, so every one has dynamics.
- `out/svg/rendered/`: every distinct SVG the UI renders, serialized standalone with computed presentation styles inlined; `index.json` maps each hash to the states where it appears; `click-failures.json` lists sweep clicks that timed out.

Rules: attributes that scripts animate are written at rest (their value in the meter source SVG, or dropped when it has none) and listed under `neutralized` in `index.json`, so a file never depends on when it was captured; `dynamic.json` records which elements and attributes animate, not sampled values; hashes ignore width/height; `currentColor` is preserved through a sentinel colour. Two extractions of the same `mvp/` produce byte-identical output; `npm run verify` checks it.

---

# Português — vynamp-mvp-reference

[English](#vynamp-mvp-reference) · **Português**

Lar do MVP web do Vynamp (rev.38) e das ferramentas que extraem o pacote de
referência contra o qual a UI nativa em Rust (egui, sem navegador) é medida. O
produto nunca distribui este código; ele é a especificação visual e de
comportamento. Esta é a única cópia do MVP: edite aqui.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `mvp/` | O MVP: só os arquivos que o app carrega (sem testes, previews ou ferramentas). Manter fim de linha LF; cada revisão é um commit, e o repositório principal fixa esse commit (ver Fixação). Abrir `http://localhost:8766/index.html` depois de `npm run serve`. |
| `tools/serve.cjs` | Servidor estático sem cache para `mvp/`, só em loopback. |
| `tools/verify.cjs` | Reextrai para um diretório temporário e reprova quando qualquer arquivo difere de `out/` (`check/` fica de fora); a segunda cópia de cada arquivo divergente é guardada em `verify-diff/` (não versionado). |
| `tools/extract.cjs` | Dirige o Chrome por todos os temas, layouts, larguras e um nível de estado de clique, e escreve `out/`. |
| `tools/svgcheck.cjs` | Renderiza cada SVG extraído no Chrome e no resvg (o renderizador nativo) e reporta diferenças de pixel. |
| `tools/pin.cjs` | Imprime o registro de fixação de um commit (`npm run pin -- [ref]`, padrão `HEAD`): commit, hash de conteúdo, git tree, contagem de arquivos e bytes de `mvp/`, e o git tree de `out/`. Lê só objetos do git, então o fim de linha na cópia de trabalho não o altera. |
| `out/` | Saída da extração. O repositório principal cita no lugar (`out/...` no commit fixado) e não copia nada dela. |

## Execução

Requer Node 20+, Google Chrome (ou `CHROME=<caminho>`) e `resvg` 0.49
(`cargo install resvg --version 0.49.0`, ou `RESVG=<caminho>`).

A extração fixa a taxa de amostragem da página em 48000 Hz (`VYNAMP_SAMPLE_RATE`
sobrepõe), passando `sampleRate` para o `AudioContext` que a página constrói.
Duas saídas dependem dela: o EQ avançado põe os pontos em
`log(f/10)/log(min(40000,.45*Fs)/10)*860`, e o `decodeAudioData` reamostra o WAV
sintético antes de os picos virarem o caminho da waveform. Num host cujo
dispositivo roda a 44100 — a maioria dos notebooks — as duas sairiam diferentes
de `out/` e o `npm run verify` reprovaria por uma spec que não mudou. A fixação
precisa atingir o construtor, não só o getter que a página lê: fixar apenas
`sampleRate` deixa o grafo real decodificando na taxa do dispositivo e não
reproduz nem um lado nem o outro. Fixar torna a saída função só de `mvp/`, que é
o que "duas extrações produzem saída idêntica" tem de significar.

```bash
npm ci
npm run serve
```

Em outro shell:

```bash
npm run extract
npm run check-svg
npm run verify
```

## Fixação

O repositório principal (`jimmykedlyn/vynamp`) não copia `mvp/` nem `out/`. As
specs dele citam `vynamp-mvp-reference@<commit>` com caminhos em `mvp/...` e
`out/...` (ver `design/07-pin-mvp.md`). Para mover a fixação para uma revisão
nova, commitar aqui e rodar:

```bash
npm run pin -- <commit>
```

Copiar os valores impressos para `design/07-pin-mvp.md` do repositório
principal. O hash de conteúdo é o sha256 das linhas `<sha256> *./<caminho>`
(formato `sha256sum --binary`, terminadas em LF, ordenadas por caminho) sobre
todo arquivo de `mvp/`, lidas dos blobs do commit.

`check-svg` aprova um arquivo só quando nenhum pixel não-texto difere além de
1px de antialiasing (ver o cabeçalho de `tools/svgcheck.cjs`). Texto é comparado
e registrado, mas julgado na task de fontes do repositório principal. Um arquivo
que usa uma lacuna do renderizador (`pathLength`, `filter:blur()` do CSS) é
julgado pelo resvg no arquivo depois da correção que o carregador nativo precisa
aplicar (traços reescalados; blur virado em `feGaussianBlur` com região
explícita) contra o Chrome no original. Todo arquivo é comparado sobre branco e
sobre preto (tinta branca em transparente só aparece no preto) e o pior fundo é
reportado (`bg`). Arquivos sem tinta em nenhum dos dois são `empty`: nada foi
comparado, então não passam, e cada um precisa de explicação na evidência.
`npm run check-svg` imprime o relatório e sai com 0 seja o que for que o
relatório diga — quem mantém roda para olhar os diffs renderizados, e uma
ferramenta que se recusa a terminar não serve para isso. Passe `--check` para um
arquivo reprovado virar saída diferente de zero; é a forma que um portão de CI
usaria, e não é o padrão porque `out/check/report.json` hoje lista 6 arquivos
reprovados (um `empty`, um `pathLength`, quatro `blurFn`) que são evidência à
espera das tasks de fonte e de carregador, não regressão.

## Saída

- `out/themes/themes.json`: por tema, tokens de origem, toda custom property `--*`
  resolvida, estilos de `body` e atributos de `<html>`; `unsetVars` lista as
  variáveis que as fontes referenciam e `:root` não define, com os literais de
  fallback e se o CSS de elemento ou um script as define.
- `out/svg/icons/`: um SVG standalone por ícone (24×24, `currentColor`),
  `icons.json` (nomes, aliases, ícones CSS) e `usage.json` (onde cada ícone aparece).
- `out/svg/meters/<prefixo>/`: SVG fonte do medidor mais `meta.json` (tipo, canais,
  escala, pivôs, temas cuja entrada de asset o cita, selecionável, atributos
  dinâmicos); `dynamic.json` registra quais atributos animam enquanto um tom de
  teste toca. A rev.38 torna os 16 medidores selecionáveis, então todos têm dinâmica.
- `out/svg/rendered/`: todo SVG distinto que a UI renderiza, serializado standalone
  com os estilos de apresentação computados embutidos; `index.json` mapeia cada
  hash para os estados em que aparece; `click-failures.json` lista cliques da
  varredura que estouraram o tempo.

Regras: atributos que scripts animam são gravados em repouso (o valor no SVG fonte
do medidor, ou descartados quando não há nenhum) e listados em `neutralized` no
`index.json`, então nenhum arquivo depende de quando foi capturado; `dynamic.json`
registra quais elementos e atributos animam, não valores amostrados; hashes ignoram
largura/altura; `currentColor` é preservado por meio de uma cor sentinela. Duas
extrações do mesmo `mvp/` produzem saída idêntica byte a byte; `npm run verify`
verifica isso.
