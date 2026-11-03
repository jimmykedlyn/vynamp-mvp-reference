# vynamp-mvp-reference

Freezes the Vynamp web MVP (rev.37) and extracts the reference package that the native Rust UI (egui, no browser) is measured against. The product never ships this code; it is the visual and behavioural specification.

## Layout

| Path | Content |
|---|---|
| `mvp/` | Frozen MVP: only the files the app actually loads. Do not edit; a new revision is a new commit with a new tree hash. |
| `tools/serve.cjs` | No-store static server for `mvp/`. |
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
node tools/package.cjs ../repo/assets/reference/mvp
```

Commit the tool repository before packaging so `SOURCE.json` records a clean commit.

`check-svg` passes a file only when no non-text pixel differs beyond 1px antialiasing (see the header of `tools/svgcheck.cjs`). Text is compared and recorded but judged in the main repository's font task.

## Output

- `out/themes/themes.json`: per theme, source tokens, every resolved `--*` custom property, body styles and `<html>` attributes; `unsetVars` lists the variables the sources reference that `:root` does not define, with their fallback literals and whether element CSS or a script sets them.
- `out/svg/icons/`: one standalone SVG per icon (24×24, `currentColor`), `icons.json` (names, aliases, CSS icons) and `usage.json` (where each icon appears).
- `out/svg/meters/<prefix>/`: meter source SVG plus `meta.json` (kind, channels, scale, pivots, themes, selectable, dynamic attributes); `dynamic.json` records which attributes animate while a test tone plays.
- `out/svg/rendered/`: every distinct SVG the UI renders, serialized standalone with computed presentation styles inlined; `index.json` maps each hash to the states where it appears.

Rules: attributes that scripts animate are written at rest (their value in the meter source SVG, or dropped when it has none) and listed under `neutralized` in `index.json`, so a file never depends on when it was captured; `dynamic.json` records which elements and attributes animate, not sampled values; hashes ignore width/height; `currentColor` is preserved through a sentinel colour. Two extractions of the same `mvp/` produce byte-identical output.
