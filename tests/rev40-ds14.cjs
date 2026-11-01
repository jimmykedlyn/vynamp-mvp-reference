'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const url = 'file:///' + path.join(root, 'index.html').replace(/\\/g, '/');
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(250);

  const restCheck = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#queue-list .queue-item')];
    return items.map(item => {
      const handle = item.querySelector(':scope > .queue-drag-handle');
      const remove = item.querySelector('[data-remove]');
      const more = item.querySelector('.queue-more');
      const hRect = handle?.getBoundingClientRect();
      const rRect = remove?.getBoundingClientRect();
      return {
        hasHandle: !!handle,
        handleText: handle?.textContent,
        handleW: Math.round(hRect?.width || 0),
        handleH: Math.round(hRect?.height || 0),
        removeW: Math.round(rRect?.width || 0),
        removeH: Math.round(rRect?.height || 0),
        removeOpacity: getComputedStyle(remove).opacity,
        moreOpacity: getComputedStyle(more).opacity
      };
    });
  });

  assert(restCheck.length >= 7, 'Expected queue items in #queue-list');
  for (const row of restCheck) {
    assert(row.hasHandle && row.handleText === '⋮⋮', `Missing drag handle: ${JSON.stringify(row)}`);
    assert.equal(row.handleW, 16, `Expected 16px drag handle width, got ${row.handleW}`);
    assert.equal(row.handleH, 28, `Expected 28px drag handle height, got ${row.handleH}`);
    assert(row.removeW >= 28 && row.removeH >= 28, `Expected >=28x28 remove button, got ${row.removeW}x${row.removeH}`);
    assert.equal(row.removeOpacity, '0.65', `Expected remove opacity 0.65 at rest, got ${row.removeOpacity}`);
  }

  // Hover on first row -> opacity 1
  await page.locator('#queue-list .queue-item').first().hover();
  await page.waitForTimeout(150);
  const hoverOpacity = await page.locator('#queue-list .queue-item').first().locator('[data-remove]').evaluate(
    el => getComputedStyle(el).opacity
  );
  assert.equal(hoverOpacity, '1', `Expected opacity 1 on hover, got ${hoverOpacity}`);

  // Drag handle reorder test
  const beforeQueue = await page.evaluate(() => window.VynampReference.state.queue.slice());
  await page.locator('#queue-list .queue-drag-handle').first().dragTo(
    page.locator('#queue-list .queue-item').nth(2)
  );
  await page.waitForTimeout(100);
  const afterQueue = await page.evaluate(() => window.VynampReference.state.queue.slice());
  assert.equal(afterQueue[3], beforeQueue[1], 'Dragging .queue-drag-handle should reorder queue item');

  const previewsDir = path.join(root, 'previews');
  await page.screenshot({ path: path.join(previewsDir, 'rev40-ds14-queue.png') });

  await browser.close();
  console.log('rev40-ds14: ok');
})();
