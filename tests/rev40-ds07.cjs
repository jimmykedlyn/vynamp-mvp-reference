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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
    await page.goto(url);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

    async function assertMinTarget(selectors, minW, minH, label) {
      const checks = await page.evaluate(({ selectors, minW, minH }) => {
        return selectors.map(sel => {
          const el = document.querySelector(sel);
          if (!el || !el.getClientRects().length) return { sel, visible: false };
          const r = el.getBoundingClientRect();
          return {
            sel,
            visible: true,
            width: Math.round(r.width * 10) / 10,
            height: Math.round(r.height * 10) / 10,
            ok: r.width >= minW - 0.5 && r.height >= minH - 0.5
          };
        });
      }, { selectors, minW, minH });
      for (const c of checks) {
        assert.equal(c.visible, true, `${label}: ${c.sel} must be visible`);
        assert.equal(c.ok, true, `${label}: ${c.sel} size ${c.width}×${c.height} must be >= ${minW}×${minH}`);
      }
    }

    // 1. Mobile Player view (390×844 & 480×660)
    for (const [w, h] of [[390, 844], [480, 660]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => {
        VynampLayout.setView('player');
        return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      await assertMinTarget([
        '.faithful-output',
        '#faithful-mobile-back',
        '#main-menu-button',
        '#favorite',
        '#shuffle',
        '#previous',
        '#play',
        '#next',
        '#repeat',
        '[data-player-action="lyrics"]',
        '[data-player-action="queue"]',
        '[data-player-action="effects"]',
        '[data-mobile-view-button="library"]',
        '[data-mobile-view-button="player"]',
        '[data-mobile-action="effects"]',
        '[data-mobile-action="preferences"]'
      ], 44, 44, `mobile player ${w}x${h}`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path: path.resolve(__dirname, '../previews/rev40-ds07-mobile-390x844.png') });

    // 2. Mobile Library and Queue views mini-transport (#previous, #play, #next >= 44×44)
    for (const view of ['library', 'queue']) {
      await page.evaluate(v => {
        VynampLayout.setView(v);
        return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      }, view);
      await assertMinTarget([
        '.faithful-output',
        '#faithful-mobile-back',
        '#main-menu-button',
        '#previous',
        '#play',
        '#next'
      ], 44, 44, `mobile ${view} 390x844`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `no overflow in mobile ${view}`);
      if (view === 'library') {
        await page.screenshot({ path: path.resolve(__dirname, '../previews/rev40-ds07-mobile-library-390x844.png') });
      }
    }

    // 3. Mini mode targets (DS-05: >= 24px mouse, >= 44px touch)
    await page.setViewportSize({ width: 1120, height: 831 });
    await page.evaluate(() => {
      VynampLayout.setLayout('mini');
      return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await assertMinTarget([
      '#preferences',
      '#layout-mini-toggle',
      '.faithful-mini-close',
      '#favorite',
      '#shuffle',
      '#repeat',
      '#previous',
      '#play',
      '#next',
      '#mute',
      '.faithful-mini-footer button'
    ], 24, 24, 'mini desktop mouse');

    await page.evaluate(() => {
      const el = document.getElementById('touch-mode');
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await assertMinTarget([
      '#preferences',
      '#layout-mini-toggle',
      '.faithful-mini-close',
      '#favorite',
      '#shuffle',
      '#repeat',
      '#previous',
      '#play',
      '#next',
      '#mute',
      '.faithful-mini-footer button'
    ], 44, 44, 'mini touch mode');

    assert.deepEqual(errors, []);
    console.log('rev40-ds07: ok');
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
