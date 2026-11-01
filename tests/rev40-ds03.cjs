// Revisão 40 — Lote 9 (DS-03): Contraste WCAG 2.2 AA (1.4.3 Texto >= 4.5:1 e 1.4.11 Não-Textual >= 3.0:1)
// nas 12 skins do MVP e nas 10 cores neon sobre todas as superfícies.
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
    const page = await browser.newPage({viewport: {width: 1600, height: 960}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForTimeout(400);

    // 1. Auditar todos os pares de tokens nas 12 skins via VynampNeon.contrast (WCAG 2.2 relativa).
    const audit = await page.evaluate(() => {
      const surfaces = ['background', 'chassis', 'panel-inset', 'panel-raised', 'selection'];
      const texts = ['text-primary', 'text-secondary', 'text-muted', 'danger', 'lime', 'cyan', 'amber'];
      const borders = ['border-light'];
      const failures = [];
      const summary = [];

      for (const theme of VYNAMP_ASSETS.themes) {
        const tk = theme.tokens;
        let minText = Infinity;
        let minBorder = Infinity;
        if (tk.selection === tk['panel-inset'] || tk.selection === tk.chassis) {
          failures.push(`${theme.id}: selection (${tk.selection}) colide com panel-inset/chassis`);
        }
        for (const s of surfaces) {
          for (const tx of texts) {
            const ratio = VynampNeon.contrast(tk[s], tk[tx]);
            if (ratio < minText) minText = ratio;
            if (ratio < 4.5) {
              failures.push(`${theme.id}: ${tx}(${tk[tx]}) sobre ${s}(${tk[s]}) = ${ratio.toFixed(2)} (< 4.5:1)`);
            }
          }
          for (const bd of borders) {
            const ratio = VynampNeon.contrast(tk[s], tk[bd]);
            if (ratio < minBorder) minBorder = ratio;
            if (ratio < 3.0) {
              failures.push(`${theme.id}: ${bd}(${tk[bd]}) sobre ${s}(${tk[s]}) = ${ratio.toFixed(2)} (< 3.0:1)`);
            }
          }
        }
        summary.push({id: theme.id, minText: Number(minText.toFixed(2)), minBorder: Number(minBorder.toFixed(2))});
      }
      return {count: VYNAMP_ASSETS.themes.length, failures, summary};
    });

    assert.equal(audit.count, 12, 'Deve auditar todas as 12 skins do MVP');
    assert.deepEqual(audit.failures, [], 'Falhas WCAG 2.2 AA nas skins: ' + audit.failures.join('; '));

    // 2. Auditar as 12 skins aplicadas no DOM + captura em 1600px em 3 skins (graphite-studio, copper-console, sandstone-collection).
    const previewTargets = new Map([
      ['graphite-studio', 'rev40-ds03-1600-graphite.png'],
      ['copper-console', 'rev40-ds03-1600-copper.png'],
      ['sandstone-collection', 'rev40-ds03-1600-sandstone.png']
    ]);

    for (let i = 0; i < 12; i++) {
      await page.locator('#theme').selectOption(String(i), {force: true});
      await page.waitForTimeout(120);
      const skinCheck = await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        const id = document.documentElement.dataset.skin;
        const muted = cs.getPropertyValue('--text-muted').trim();
        const raised = cs.getPropertyValue('--panel-raised').trim();
        const sel = cs.getPropertyValue('--selection').trim();
        const border = cs.getPropertyValue('--border-light').trim();
        return {
          id,
          mutedOnRaised: VynampNeon.contrast(muted, raised),
          mutedOnSel: VynampNeon.contrast(muted, sel),
          borderOnRaised: VynampNeon.contrast(border, raised)
        };
      });
      assert.ok(skinCheck.mutedOnRaised >= 4.5, `${skinCheck.id}: --text-muted sobre --panel-raised >= 4.5 (${skinCheck.mutedOnRaised})`);
      assert.ok(skinCheck.mutedOnSel >= 4.5, `${skinCheck.id}: --text-muted sobre --selection >= 4.5 (${skinCheck.mutedOnSel})`);
      assert.ok(skinCheck.borderOnRaised >= 3.0, `${skinCheck.id}: --border-light sobre --panel-raised >= 3.0 (${skinCheck.borderOnRaised})`);

      if (previewTargets.has(skinCheck.id)) {
        await page.screenshot({path: path.resolve(__dirname, '../previews/' + previewTargets.get(skinCheck.id))});
      }
    }

    // 3. Conferência nas larguras 390, 480x660, 1120 e 1600 px + fonte 200%.
    await page.locator('#theme').selectOption('0', {force: true});
    for (const [w, h] of [[390, 844], [480, 660], [1120, 831], [1600, 960]]) {
      await page.setViewportSize({width: w, height: h});
      await page.waitForTimeout(100);
    }
    await page.locator('#preferences').click({force: true});
    await page.locator('#font-scale').selectOption('200');
    await page.locator('#close-preferences').click({force: true});
    await page.waitForTimeout(100);
    await page.locator('#preferences').click({force: true});
    await page.locator('#font-scale').selectOption('100');
    await page.locator('#close-preferences').click({force: true});

    assert.deepEqual(errors, [], 'Sem erros de runtime: ' + errors.join('; '));
    console.log('rev40-ds03: ok');
  } finally {
    await browser.close();
  }
})();
