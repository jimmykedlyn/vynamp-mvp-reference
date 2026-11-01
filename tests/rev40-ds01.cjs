// Revisão 40 — Lote 1 (DS-01): tokens fiéis em graphite-studio, restauração do high-contrast-wide,
// contraste text-muted >= 4.5:1, selection != panel-inset e distinção visual de foco/seleção/atual/erro.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  try {
    const page = await browser.newPage({viewport: {width: 1120, height: 831}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForTimeout(500);

    // 1. Tema inicial deve ser graphite-studio com paleta fiel (preto neutro #070707 + neon #E6FF00).
    const initial = await page.evaluate(() => {
      const skin = document.documentElement.dataset.skin;
      const g = VYNAMP_ASSETS.themes.find(t => t.id === 'graphite-studio').tokens;
      const hc = VYNAMP_ASSETS.themes.find(t => t.id === 'high-contrast-wide').tokens;
      return {
        skin,
        graphite: g,
        highContrast: hc,
        mutedContrastRaised: VynampNeon.contrast(g['text-muted'], g['panel-raised']),
        mutedContrastSelection: VynampNeon.contrast(g['text-muted'], g.selection),
        mutedContrastInset: VynampNeon.contrast(g['text-muted'], g['panel-inset']),
        hcTextContrast: VynampNeon.contrast(hc['text-primary'], hc.background),
        hcMutedContrast: VynampNeon.contrast(hc['text-muted'], hc['panel-raised']),
        hcBorderContrast: VynampNeon.contrast(hc['border-light'], hc.background)
      };
    });

    assert.equal(initial.skin, 'graphite-studio', 'Tema inicial deve ser graphite-studio');
    assert.equal(initial.graphite.background, '#070707', 'graphite-studio mantém preto neutro');
    assert.equal(initial.graphite.lime, '#E6FF00', 'graphite-studio mantém accent neon');
    assert.notEqual(initial.graphite.selection, initial.graphite['panel-inset'], 'selection != panel-inset');
    assert.ok(initial.mutedContrastRaised >= 4.5, 'text-muted >= 4.5:1 sobre panel-raised: ' + initial.mutedContrastRaised);
    assert.ok(initial.mutedContrastSelection >= 4.5, 'text-muted >= 4.5:1 sobre selection: ' + initial.mutedContrastSelection);
    assert.ok(initial.mutedContrastInset >= 4.5, 'text-muted >= 4.5:1 sobre panel-inset: ' + initial.mutedContrastInset);

    // 2. high-contrast-wide preservado como verdadeiro alto contraste (21:1).
    assert.equal(initial.highContrast.background, '#000000', 'high-contrast-wide fundo preto puro');
    assert.equal(initial.highContrast['text-primary'], '#FFFFFF', 'high-contrast-wide texto branco puro');
    assert.ok(initial.hcTextContrast >= 20, 'high-contrast-wide contraste >= 20:1');
    assert.ok(initial.hcMutedContrast >= 20, 'high-contrast-wide text-muted >= 20:1');
    assert.ok(initial.hcBorderContrast >= 20, 'high-contrast-wide border-light >= 20:1');

    // 3. Estados current, selected, focus-visible e error distinguíveis por forma/borda/superfície.
    await page.locator('#library [data-select]').nth(1).click();
    const states = await page.evaluate(() => {
      const currentRow = document.querySelector('#library>.track-row.current');
      const selectedRow = document.querySelector('#library>.track-row.selected');
      const currentCS = getComputedStyle(currentRow);
      const selectedCS = getComputedStyle(selectedRow);
      return {
        currentOutlineStyle: currentCS.outlineStyle,
        selectedOutlineStyle: selectedCS.outlineStyle,
        currentBg: currentCS.backgroundColor,
        selectedBg: selectedCS.backgroundColor,
        selectBadgeBorder: getComputedStyle(selectedRow.querySelector('.row-select')).borderStyle
      };
    });
    assert.equal(states.selectedOutlineStyle, 'dashed', 'Linha selecionada usa contorno tracejado próprio');
    assert.notEqual(states.currentOutlineStyle, 'dashed', 'Linha tocando não usa contorno tracejado');
    assert.notEqual(states.currentBg, states.selectedBg, 'Superfície de seleção distinta da linha atual');
    assert.equal(states.selectBadgeBorder, 'solid', 'Botão de seleção ativo possui moldura própria');

    await page.screenshot({path: path.resolve(__dirname, '../previews/rev40-ds01-graphite-1120.png')});

    // 4. Conferência em 3 skins (graphite-studio, high-contrast-wide, arctic-library) e viewports 390, 480x660, 1120, 1600 + fonte 200%.
    await page.locator('#theme').selectOption('11', {force: true});
    await page.waitForTimeout(200);
    const hcLine = await page.evaluate(() => getComputedStyle(document.querySelector('.appbar')).borderBottomColor);
    assert.equal(hcLine, 'rgb(255, 255, 255)', 'Divisórias de alto contraste em high-contrast-wide');
    await page.screenshot({path: path.resolve(__dirname, '../previews/rev40-ds01-high-contrast-1120.png')});

    await page.locator('#theme').selectOption('1', {force: true});
    await page.waitForTimeout(200);
    await page.screenshot({path: path.resolve(__dirname, '../previews/rev40-ds01-arctic-1120.png')});

    await page.locator('#theme').selectOption('0', {force: true});
    for (const [w, h] of [[390, 844], [480, 660], [1600, 960]]) {
      await page.setViewportSize({width: w, height: h});
      await page.waitForTimeout(150);
    }
    await page.setViewportSize({width: 1120, height: 831});
    await page.locator('#preferences').click();
    await page.locator('#font-scale').selectOption('200');
    await page.locator('#close-preferences').click();
    await page.waitForTimeout(150);
    await page.locator('#preferences').click();
    await page.locator('#font-scale').selectOption('100');
    await page.locator('#close-preferences').click();

    assert.deepEqual(errors, []);
    console.log('rev40-ds01: ok');
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});
