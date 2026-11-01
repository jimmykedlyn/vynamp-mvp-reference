'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const url = 'file:///' + path.join(root, 'index.html').replace(/\\/g, '/');
const chromePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const CANONICAL_PT = '[DEMO — sem processamento de áudio neste modo]';
const CANONICAL_EN = '[DEMO — no audio processing in this mode]';
const FORBIDDEN_BADGES = [
  '[SIMULADO]',
  '[CONFIGURAÇÃO]',
  '[DEMO VISUAL]',
  '[INDISPONÍVEL PARA ÁUDIO]'
];

(async () => {
  // 1. Static check across JS/HTML files
  const filesToCheck = [
    'index.html',
    'player.js',
    'track-telemetry.js',
    'dsp-workspace.js',
    'eq-registry.js',
    'advanced-eq.js',
    'graph-editor.js',
    'refinement40.js'
  ];
  for (const file of filesToCheck) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    for (const forbidden of FORBIDDEN_BADGES) {
      assert(!content.includes(forbidden), `${file} still contains forbidden badge ${forbidden}`);
    }
    assert(!content.includes('[DEMO] '), `${file} still contains abbreviated [DEMO] badge`);
  }

  // 2. Runtime check in browser
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(250);

  const i18nCheck = await page.evaluate(() => ({
    pt: window.VYNAMP_I18N?.t('dsp.demo_badge', 'pt-BR'),
    en: window.VYNAMP_I18N?.t('dsp.demo_badge', 'en-US')
  }));
  assert.equal(i18nCheck.pt, CANONICAL_PT, 'pt-BR canonical badge mismatch');
  assert.equal(i18nCheck.en, CANONICAL_EN, 'en-US canonical badge mismatch');

  // Enable EQ in demo mode so #eq-status and #advanced-eq-status display the active demo badge
  await page.evaluate(() => {
    document.getElementById('eq-enabled')?.click();
  });
  await page.waitForTimeout(80);

  const runtimeTexts = await page.evaluate(() => {
    const source = document.getElementById('source')?.textContent || '';
    const fileInfo = document.getElementById('track-file-info')?.textContent || '';
    const eqStatus = document.getElementById('eq-status')?.textContent || '';
    const dspCap = document.getElementById('dsp-capability')?.textContent || '';
    const advEq = document.getElementById('advanced-eq-status')?.textContent || '';
    const capStyle = getComputedStyle(document.getElementById('dsp-capability'));
    const fileBox = document.getElementById('track-file-info')?.getBoundingClientRect();
    return {
      source,
      fileInfo,
      eqStatus,
      dspCap,
      advEq,
      capBorderTopWidth: capStyle.borderTopWidth,
      capBorderTopStyle: capStyle.borderTopStyle,
      fileHeight: fileBox?.height || 0
    };
  });

  assert(runtimeTexts.source.includes(CANONICAL_PT), `#source missing canonical badge: ${runtimeTexts.source}`);
  assert(runtimeTexts.fileInfo.includes(CANONICAL_PT), `#track-file-info missing canonical badge: ${runtimeTexts.fileInfo}`);
  assert(runtimeTexts.eqStatus.includes(CANONICAL_PT), `#eq-status missing canonical badge: ${runtimeTexts.eqStatus}`);
  assert(runtimeTexts.dspCap.includes(CANONICAL_PT), `#dsp-capability missing canonical badge: ${runtimeTexts.dspCap}`);
  assert(runtimeTexts.advEq.includes(CANONICAL_PT), `#advanced-eq-status missing canonical badge: ${runtimeTexts.advEq}`);
  assert.equal(runtimeTexts.capBorderTopWidth, '1px', '.capability must have 1px border');
  assert.equal(runtimeTexts.capBorderTopStyle, 'solid', '.capability must have solid border');
  assert(runtimeTexts.fileHeight <= 30, `#track-file-info must remain a compact single line (height=${runtimeTexts.fileHeight})`);

  await page.click('#eq-open');
  await page.waitForTimeout(100);
  const previewsDir = path.join(root, 'previews');
  await page.screenshot({ path: path.join(previewsDir, 'rev40-ds13-demo-badge.png') });

  await browser.close();
  console.log('rev40-ds13: ok');
})();
