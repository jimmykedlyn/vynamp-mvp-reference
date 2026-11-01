'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const url = 'file:///' + path.join(root, 'index.html').replace(/\\/g, '/');
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function checkMinFontFloor(page, label) {
  const result = await page.evaluate(() => {
    const r = getComputedStyle(document.documentElement).getPropertyValue('--r').trim();
    const violations = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (!(node instanceof SVGElement) && !node.closest('svg')) {
        const cs = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        const hasDirectText = [...node.childNodes].some(
          c => c.nodeType === Node.TEXT_NODE && c.textContent.trim().length > 0
        ) || (node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'BUTTON');
        if (
          hasDirectText &&
          cs.display !== 'none' &&
          cs.visibility !== 'hidden' &&
          parseFloat(cs.opacity) > 0 &&
          rect.width > 1 &&
          rect.height > 1
        ) {
          const fs = parseFloat(cs.fontSize);
          if (fs > 0 && fs < 10.95) {
            violations.push({
              tag: node.tagName,
              id: node.id,
              cls: node.className,
              text: (node.textContent || '').trim().slice(0, 30),
              fontSize: fs
            });
          }
        }
      }
      node = walker.nextNode();
    }
    return { r, violations };
  });
  assert(result.r.length > 0, `${label}: --r must be preserved`);
  assert.equal(
    result.violations.length,
    0,
    `${label}: found elements with font-size < 11px: ${JSON.stringify(result.violations.slice(0, 8))}`
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(250);

  await checkMinFontFloor(page, 'desktop-1280');

  // Check #graph-dialog
  await page.click('#audio-effects-open');
  await page.waitForTimeout(120);
  await checkMinFontFloor(page, 'graph-dialog');
  await page.click('#graph-close');
  await page.waitForTimeout(80);

  // Check #advanced-eq-dialog
  await page.click('#eq-open');
  await page.waitForTimeout(120);
  await checkMinFontFloor(page, 'advanced-eq-dialog');
  await page.click('#advanced-eq-close');
  await page.waitForTimeout(80);

  // Check mobile 390x844
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(120);
  await checkMinFontFloor(page, 'mobile-390');

  // Check mini mode
  await page.setViewportSize({ width: 560, height: 640 });
  await page.evaluate(() => window.VynampLayout?.setLayout('mini'));
  await page.waitForTimeout(120);
  await checkMinFontFloor(page, 'mini-560');

  await browser.close();
  console.log('rev40-ds10: ok');
})();
