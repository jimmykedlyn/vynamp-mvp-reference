# vynamp-mvp-reference

Freezes the Vynamp web MVP (rev.37) and extracts the reference package that the native Rust UI (egui, no browser) is measured against. The product never ships this code; it is the visual and behavioural specification.

## Layout

| Path | Content |
|---|---|
| `mvp/` | Frozen MVP: only the files the app actually loads. Do not edit; a new revision is a new commit with a new tree hash. |
| `tools/serve.cjs` | No-store static server for `mvp/`, loopback only. |
| `tools/verify.cjs` | Re-extracts into a temporary directory and fails when any file differs from `out/` (`check/` excluded); the second copy of each differing file is kept in `verify-diff/` (untracked). |
| `tools/extract.cjs` | Drives Chrome through every theme, layout, width and one-level click state and writes `out/`. |
| `tools/svgcheck.cjs` | Renders every extracted SVG in Chrome and in resvg (the native renderer) and reports pixel differences. |
| `tools/package.cjs` | Copies `out/` into the main repository's `assets/reference/mvp/` and writes `SOURCE.json` (tree hash, tool commit, versions, per-file sha256). |
| `out/` | Extraction output, copied into the main repository under `assets/reference/mvp/`. |

## Run

Requires Node 20+, Google Chrome (or `CHROME=<path>`) and `resvg` 0.49 (`cargo install resvg --version 0.49.0`, or `RESVG=<path>`).

```bash
npm ci
npm run serve
```

In a second shell:

```bash
npm run extract
npm run check-svg
npm run verify
node tools/package.cjs ../repo/assets/reference/mvp
```

Commit the tool repository before packaging so `SOURCE.json` records a clean commit.

`check-svg` passes a file only when no non-text pixel differs beyond 1px antialiasing (see the header of `tools/svgcheck.cjs`). Text is compared and recorded but judged in the main repository's font task. A file using a renderer gap (`pathLength`, CSS `filter:blur()`) is judged by resvg on the file after the fix the native loader must apply (dashes rescaled; blur turned into an `feGaussianBlur` with an explicit region) against Chrome on the original. Every file is compared over white and over black (white ink on transparent shows only on black) and the worse backdrop is reported (`bg`). Files with no ink over either are `empty`: nothing was compared, so they do not pass and each needs an explanation in the evidence.

## Output

- `out/themes/themes.json`: per theme, source tokens, every resolved `--*` custom property, body styles and `<html>` attributes; `unsetVars` lists the variables the sources reference that `:root` does not define, with their fallback literals and whether element CSS or a script sets them.
- `out/svg/icons/`: one standalone SVG per icon (24×24, `currentColor`), `icons.json` (names, aliases, CSS icons) and `usage.json` (where each icon appears).
- `out/svg/meters/<prefix>/`: meter source SVG plus `meta.json` (kind, channels, scale, pivots, themes whose asset entry names it, selectable, dynamic attributes); `dynamic.json` records which attributes animate while a test tone plays. Rev.37 mounts only the 9 selectable meters, so only those have dynamics.
- `out/svg/rendered/`: every distinct SVG the UI renders, serialized standalone with computed presentation styles inlined; `index.json` maps each hash to the states where it appears; `click-failures.json` lists sweep clicks that timed out.

Rules: attributes that scripts animate are written at rest (their value in the meter source SVG, or dropped when it has none) and listed under `neutralized` in `index.json`, so a file never depends on when it was captured; `dynamic.json` records which elements and attributes animate, not sampled values; hashes ignore width/height; `currentColor` is preserved through a sentinel colour. Two extractions of the same `mvp/` produce byte-identical output; `npm run verify` checks it.
