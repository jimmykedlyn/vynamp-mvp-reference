'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1120, height: 831 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
    await page.goto(url);

    async function assertInViewport(selectors, vw, vh, label) {
      const results = await page.evaluate(({ selectors, vw, vh }) => {
        const nav = document.querySelector('.mobile-navigation');
        const navRect = nav && nav.offsetWidth ? nav.getBoundingClientRect() : null;
        return selectors.map(sel => {
          const el = document.querySelector(sel);
          if (!el || !el.getClientRects().length) {
            return { sel, visible: false };
          }
          const r = el.getBoundingClientRect();
          const insideX = r.left >= -1 && r.right <= vw + 1 && r.width > 0;
          const insideY = r.top >= -1 && r.bottom <= vh + 1 && r.height > 0;
          const aboveNav = !navRect || r.bottom <= navRect.top + 1;
          return {
            sel,
            visible: true,
            rect: { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) },
            insideX,
            insideY,
            aboveNav
          };
        });
      }, { selectors, vw, vh });
      for (const item of results) {
        assert.equal(item.visible, true, `${label}: ${item.sel} should be visible`);
        assert.equal(item.insideX, true, `${label}: ${item.sel} horizontal bounds ${JSON.stringify(item.rect)} outside 0..${vw}`);
        assert.equal(item.insideY, true, `${label}: ${item.sel} vertical bounds ${JSON.stringify(item.rect)} outside 0..${vh}`);
        assert.equal(item.aboveNav, true, `${label}: ${item.sel} overlaps .mobile-navigation ${JSON.stringify(item.rect)}`);
      }
    }

    // 1. Validate 480×660 (< 600 px: uses mobile bottom navigation without clipping transport/time)
    await page.setViewportSize({ width: 480, height: 660 });
    await page.waitForTimeout(50);
    assert.equal(await page.locator('html').getAttribute('data-mobile-nav'), 'true');
    assert.equal(await page.locator('.mobile-navigation').isVisible(), true);
    await assertInViewport(['#elapsed', '#duration', '#wave', '#play', '#previous', '#next', '#shuffle', '#repeat'], 480, 660, '480x660');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, '480x660 no horizontal overflow');
    await page.screenshot({ path: path.resolve(__dirname, '../previews/rev40-ds02-480x660.png') });

    // 2. Validate 600×760 on desktop (pointer: fine, >= 600 px: no mobile bottom bar, transport & time not clipped)
    await page.setViewportSize({ width: 600, height: 760 });
    await page.waitForTimeout(50);
    assert.equal(await page.locator('html').getAttribute('data-mobile-nav'), 'false');
    assert.equal(await page.locator('.mobile-navigation').isVisible(), false, '600x760 desktop must not show .mobile-navigation');
    assert.equal(await page.locator('#faithful-mobile-back').isVisible(), false);
    assert.equal(await page.locator('.faithful-output').isVisible(), false);
    assert.equal(await page.locator('.now-summary').isVisible(), true);
    assert.equal(await page.locator('.collection').isVisible(), true);
    assert.equal(await page.locator('.transport').isVisible(), true);
    await assertInViewport(['#elapsed', '#duration', '#wave', '#play', '#previous', '#next', '#shuffle', '#repeat', '#mute', '#volume', '#eq-open'], 600, 760, '600x760 desktop');
    const overflow600 = await page.evaluate(() => {
      return [document.documentElement, document.querySelector('.appbar'), document.querySelector('.faithful-body'), document.querySelector('.transport')]
        .filter(el => el && el.offsetWidth && el.scrollWidth > el.clientWidth + 1)
        .map(el => el.className || el.localName);
    });
    assert.deepEqual(overflow600, [], '600x760 desktop must not overflow horizontally');
    await page.screenshot({ path: path.resolve(__dirname, '../previews/rev40-ds02-600x760.png') });

    // 3. Validate 3 skins + 200% font scale across 390, 480×660, 600×760, 1120 and 1600 px
    for (const skin of ['graphite-studio', 'high-contrast-wide', 'arctic-library']) {
      await page.evaluate(id => {
        const idx = window.VYNAMP_ASSETS.themes.findIndex(t => t.id === id);
        const sel = document.getElementById('theme');
        sel.value = String(idx);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }, skin);
      for (const font of ['100', '200']) {
        await page.evaluate(val => {
          const el = document.getElementById('font-scale');
          el.value = val;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, font);
        for (const [w, h] of [[390, 844], [480, 660], [600, 760], [1120, 831], [1600, 960]]) {
          await page.setViewportSize({ width: w, height: h });
          await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
          await assertInViewport(['#elapsed', '#duration', '#play', '#previous', '#next', '#shuffle', '#repeat'], w, h, `${skin} font=${font} ${w}x${h}`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `no overflow ${skin} font=${font} ${w}x${h}`);
        }
      }
    }

    // 4. Validate pointer: coarse at 600×760 activates mobile bottom bar without clipping transport/time
    const coarseContext = await browser.newContext({ viewport: { width: 600, height: 760 }, hasTouch: true, isMobile: true });
    const coarsePage = await coarseContext.newPage();
    await coarsePage.goto(url);
    await coarsePage.waitForTimeout(50);
    assert.equal(await coarsePage.locator('html').getAttribute('data-mobile-nav'), 'true');
    assert.equal(await coarsePage.locator('.mobile-navigation').isVisible(), true);
    const coarseTransportOk = await coarsePage.evaluate(() => {
      const nav = document.querySelector('.mobile-navigation').getBoundingClientRect();
      return ['#elapsed', '#duration', '#play', '#previous', '#next', '#shuffle', '#repeat'].every(sel => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return r.top >= 0 && r.bottom <= nav.top + 1 && r.left >= 0 && r.right <= 600 + 1;
      });
    });
    assert.equal(coarseTransportOk, true, '600x760 coarse pointer must keep transport visible above bottom nav');
    await coarseContext.close();

    assert.deepEqual(errors, []);
    console.log('rev40-ds02: ok');
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
