'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  // 1. Static check: ensure loose hex values flagged in DS-11 are gone from CSS files
  const rootDir = path.resolve(__dirname, '..');
  const faithfulCSS = fs.readFileSync(path.join(rootDir, 'faithful-layout.css'), 'utf8');
  const playerCSS = fs.readFileSync(path.join(rootDir, 'player.css'), 'utf8');
  const dspUICSS = fs.readFileSync(path.join(rootDir, 'advanced-dsp-ui.css'), 'utf8');
  const usabilityCSS = fs.readFileSync(path.join(rootDir, 'usability.css'), 'utf8');

  for (const forbidden of ['#fbbf24', '#22716e', '#e5e5e5', '#171717', '#301916', '#9e5148']) {
    assert.equal(faithfulCSS.includes(forbidden), false, `faithful-layout.css must not contain literal ${forbidden}`);
  }
  for (const forbidden of ['#101416', '#3c444a', '#080d0be8']) {
    assert.equal(playerCSS.includes(forbidden), false, `player.css must not contain literal ${forbidden}`);
  }
  for (const forbidden of ['#444', '#222', '#baff40']) {
    assert.equal(dspUICSS.includes(forbidden), false, `advanced-dsp-ui.css must not contain literal ${forbidden}`);
  }
  assert.equal(usabilityCSS.includes('outline:2px solid var(--cyan)'), true, 'usability.css must use var(--cyan) for focus outline');

  // 2. Runtime check across all 12 skins & neon accents
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1120, height: 831 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(rootDir, 'index.html')).href);

    // Focus #play via keyboard and verify focus ring on all 12 skins
    await page.evaluate(() => document.getElementById('open').focus());
    await page.keyboard.press('Tab');
    await page.screenshot({ path: path.join(rootDir, 'previews/rev40-ds11-focus-graphite.png') });

    const skinChecks = await page.evaluate(() => {
      const out = [];
      const sel = document.getElementById('theme');
      const btn = document.getElementById('open');
      const prevMotion = document.documentElement.dataset.reducedMotion;
      document.documentElement.dataset.reducedMotion = 'true';
      for (let i = 0; i < window.VYNAMP_ASSETS.themes.length; i++) {
        sel.value = String(i);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        btn.focus();
        const cs = getComputedStyle(btn);
        const rootCS = getComputedStyle(document.documentElement);
        const playAllBG = getComputedStyle(document.getElementById('play-all')).backgroundColor;
        out.push({
          skin: window.VYNAMP_ASSETS.themes[i].id,
          outlineStyle: cs.outlineStyle,
          outlineWidth: cs.outlineWidth,
          outlineColor: cs.outlineColor,
          focusRingVar: rootCS.getPropertyValue('--focus-ring').trim(),
          playAllBG
        });
      }
      document.documentElement.dataset.reducedMotion = prevMotion || 'false';
      return out;
    });

    for (const c of skinChecks) {
      assert.equal(c.outlineStyle, 'solid', `${c.skin}: focus outlineStyle must be solid`);
      assert.equal(c.outlineWidth, '2px', `${c.skin}: focus outlineWidth must be 2px`);
      assert.notEqual(c.outlineColor, 'rgba(0, 0, 0, 0)', `${c.skin}: focus outlineColor must be visible`);
    }
    const graphiteCheck = skinChecks.find(c => c.skin === 'graphite-studio');
    const arcticCheck = skinChecks.find(c => c.skin === 'arctic-library');
    assert.equal(graphiteCheck.playAllBG, 'rgb(229, 229, 229)', 'graphite-studio #play-all preserves rgb(229, 229, 229)');
    assert.notEqual(arcticCheck.playAllBG, graphiteCheck.playAllBG, 'arctic-library #play-all adapts to light skin tokens');

    // Verify Mini mode adapts to light skin (arctic-library) rather than hardcoded dark hexes
    await page.evaluate(() => {
      const idx = window.VYNAMP_ASSETS.themes.findIndex(t => t.id === 'arctic-library');
      const sel = document.getElementById('theme');
      sel.value = String(idx);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      VynampLayout.setLayout('mini');
    });
    await page.waitForTimeout(50);
    const miniSummaryBG = await page.evaluate(() => getComputedStyle(document.querySelector('.now-summary')).backgroundColor);
    assert.notEqual(miniSummaryBG, 'rgb(23, 23, 23)', 'Mini .now-summary must use var(--panel-inset), not hardcoded #171717');
    await page.screenshot({ path: path.join(rootDir, 'previews/rev40-ds11-mini-arctic.png') });

    assert.deepEqual(errors, []);
    console.log('rev40-ds11: ok');
  } finally {
    await browser.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
