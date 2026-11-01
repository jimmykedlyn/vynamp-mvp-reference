'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const url = 'file:///' + path.join(root, 'index.html').replace(/\\/g, '/');
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(250);

  // Set font scale to 200%
  await page.click('#preferences');
  await page.selectOption('#font-scale', '200');
  await page.click('#close-preferences');

  // Open #graph-dialog and add a Reverb node to inspect
  await page.click('#audio-effects-open');
  const id = await page.evaluate(() => window.VynampGraph.store.add('reverb', 340, 180).id);
  await page.click(`#graph-node-${id} .graph-node-header`);
  await page.waitForTimeout(150);

  const check1440 = await page.evaluate(() => {
    const dialog = document.getElementById('graph-dialog');
    const search = document.getElementById('graph-search');
    const viewport = document.getElementById('graph-viewport');
    const inspector = document.getElementById('graph-inspector');
    const cs = getComputedStyle(search);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const placeholderWidth = ctx.measureText(search.placeholder).width;
    const innerWidth = search.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return {
      dialogOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
      inspectorOverflow: inspector.scrollWidth > inspector.clientWidth + 1,
      placeholderWidth: Math.round(placeholderWidth),
      searchInnerWidth: Math.round(innerWidth),
      canvasWidth: Math.round(viewport.getBoundingClientRect().width)
    };
  });

  assert(!check1440.dialogOverflow, `Dialog overflow at 1440px 200%: ${JSON.stringify(check1440)}`);
  assert(!check1440.inspectorOverflow, `Inspector overflow at 1440px 200%: ${JSON.stringify(check1440)}`);
  assert(
    check1440.searchInnerWidth >= check1440.placeholderWidth,
    `#graph-search placeholder truncated at 200%: ${JSON.stringify(check1440)}`
  );
  assert(
    check1440.canvasWidth >= 480,
    `Expected canvas width >= 480px at 1440px 200%, got ${check1440.canvasWidth}`
  );

  const previewsDir = path.join(root, 'previews');
  await page.screenshot({ path: path.join(previewsDir, 'rev40-ds09-graph-200.png') });

  // Also test at 1024px (<= 1100px drawer collapse at 200% font scale)
  await page.click('#graph-close');
  await page.setViewportSize({ width: 1024, height: 831 });
  await page.click('#audio-effects-open');
  await page.waitForTimeout(150);
  const check1024 = await page.evaluate(() => {
    const browserEl = document.getElementById('graph-browser');
    const viewport = document.getElementById('graph-viewport');
    return {
      browserCollapsed: browserEl.hidden,
      canvasWidth: Math.round(viewport.getBoundingClientRect().width)
    };
  });
  assert(check1024.browserCollapsed, 'Expected #graph-browser collapsed into drawer at 1024px 200%');
  assert(check1024.canvasWidth >= 480, `Expected canvas width >= 480px at 1024px 200%, got ${check1024.canvasWidth}`);

  await browser.close();
  console.log('rev40-ds09: ok');
})();
