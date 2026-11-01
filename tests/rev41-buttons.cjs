'use strict';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const shots = path.resolve(__dirname, '../previews');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
    await page.goto(url);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

    // R41-12: aria-pressed desde o carregamento + 3 estados.
    assert.equal(await page.getAttribute('#repeat', 'aria-pressed'), 'false', 'repeat aria-pressed=false no load');
    for (const [expected, mode] of [['true', 'queue'], ['true', 'track'], ['false', 'off']]) {
      await page.click('#repeat');
      assert.equal(await page.getAttribute('#repeat', 'aria-pressed'), expected);
      assert.equal(await page.getAttribute('#repeat', 'data-repeat-mode'), mode);
      assert.ok((await page.getAttribute('#repeat', 'aria-label')).length > 8);
    }
    for (const sel of ['#shuffle', '#mute', '#meter-off', '#favorite', '#layout-mini-toggle']) {
      assert.ok(['true', 'false'].includes(await page.getAttribute(sel, 'aria-pressed')), sel + ' aria-pressed');
    }

    // R41-13/15: escala e raio no desktop, sem mexer no cabecalho.
    const size = id => page.evaluate(i => { const e = document.querySelector(i); const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), rad: getComputedStyle(e).borderRadius }; }, id);
    for (const id of ['#shuffle', '#repeat', '#dsp-open', '#mute']) { const s = await size(id); assert.deepEqual([s.w, s.h, s.rad], [32, 32, '6px'], id + ' ' + JSON.stringify(s)); }
    { const s = await size('#eq-open'); assert.equal(s.h, 32); assert.equal(s.rad, '6px'); }
    for (const id of ['#previous', '#next']) { const s = await size(id); assert.deepEqual([s.w, s.h, s.rad], [36, 36, '6px'], id); }
    { const s = await size('#play'); assert.deepEqual([s.w, s.h], [48, 48]); assert.notEqual(s.rad, '6px', 'play mantem forma propria'); }
    { const s = await size('#favorite'); assert.equal(s.rad, '50%'); }
    for (const id of ['#main-menu-button', '#preferences', '#help']) { const s = await size(id); assert.deepEqual([s.w, s.h, s.rad], [34, 34, '8px'], 'cabecalho ' + id); }
    const rows = await page.evaluate(() => [...document.querySelectorAll('.track-row .icon-button')].slice(0, 3).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), getComputedStyle(e).borderRadius]; }));
    for (const r of rows) assert.deepEqual(r, [28, 28, '6px']);

    const fontBad = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => [b.id || b.className, parseFloat(getComputedStyle(b).fontSize)]).filter(([, f]) => f < 11 || f !== Math.round(f)));
    assert.deepEqual(fontBad, [], 'fontes fracionarias/<11: ' + JSON.stringify(fontBad));

    // R41-11: ligado vs desligado difere em fundo/borda, indicador >= 3:1.
    const skins = [0, 1, 4, 11], neons = ['lime', 'violet', 'orange'];
    const probe = () => page.evaluate(() => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
      const rgba = (col, under) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = under || '#000'; cx.fillRect(0, 0, 1, 1); cx.fillStyle = col; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const lum = c => { const v = c.map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4; }); return v[0] * .2126 + v[1] * .7152 + v[2] * .0722; };
      const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      const root = getComputedStyle(document.documentElement);
      const out = {};
      for (const id of ['shuffle', 'repeat', 'mute', 'meter-off', 'favorite']) {
        const el = document.getElementById(id); if (!el.getClientRects().length) continue;
        const wasOn = el.getAttribute('aria-pressed') === 'true';
        const snap = () => { const c = getComputedStyle(el); return { bg: c.backgroundColor, bd: c.borderColor }; };
        el.style.transition = 'none';
        el.setAttribute('aria-pressed', 'false'); const off = snap();
        el.setAttribute('aria-pressed', 'true'); const on = snap();
        const after = getComputedStyle(el, '::after'); const bar = rgba(after.backgroundColor);
        const under = root.getPropertyValue('--panel-inset').trim() || '#000';
        const bg = rgba(on.bg, under);
        out[id] = { differs: off.bg !== on.bg || off.bd !== on.bd, hasBar: after.content !== 'none' && after.content !== 'normal', ratio: ratio(bar, bg) };
        el.setAttribute('aria-pressed', String(wasOn));
      }
      return out;
    });
    for (const skin of skins) {
      for (const neon of neons) {
        await page.evaluate(({ skin, neon }) => {
          const sel = document.getElementById('theme'); sel.value = skin; sel.dispatchEvent(new Event('change', { bubbles: true }));
          document.querySelector('[data-neon-part="accent"] [data-neon-color="' + neon + '"]').click();
        }, { skin, neon });
        const r = await probe();
        for (const [id, v] of Object.entries(r)) {
          assert.ok(v.differs, `skin ${skin} ${neon} #${id}: ligado/desligado devem diferir em fundo ou borda`);
          assert.ok(v.hasBar, `#${id}: indicador ausente`);
          assert.ok(v.ratio >= 3, `skin ${skin} ${neon} #${id}: indicador ${v.ratio.toFixed(2)}:1 < 3:1`);
        }
      }
    }

    // Capturas desktop: transporte + estado ligado.
    await page.evaluate(() => { const s = document.getElementById('theme'); s.value = 0; s.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-neon-part="accent"] [data-neon-color="inherit"]').click(); });
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shots, 'rev41-buttons-transport-off.png'), clip: { x: 0, y: 760, width: 1440, height: 140 } });
    await page.click('#shuffle'); await page.click('#repeat'); await page.click('#repeat'); await page.click('#mute');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shots, 'rev41-buttons-transport-on.png'), clip: { x: 0, y: 760, width: 1440, height: 140 } });
    await page.screenshot({ path: path.join(shots, 'rev41-buttons-1440.png') });
    await page.click('#mute'); await page.click('#shuffle'); await page.click('#repeat');

    // Mobile: alvos >= 44.
    for (const [w, h, name] of [[375, 812, '375'], [480, 660, '480']]) {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => { VynampLayout.setView('player'); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
      const small = await page.evaluate(() => ['#favorite', '#shuffle', '#repeat', '#previous', '#next', '#play', '#main-menu-button'].map(s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return [s, r.width, r.height]; }).filter(Boolean).filter(([, a, b]) => a < 43.5 || b < 43.5));
      assert.deepEqual(small, [], 'mobile < 44 ' + w + ': ' + JSON.stringify(small));
      await page.click('#shuffle');
      await page.screenshot({ path: path.join(shots, `rev41-buttons-${name}.png`) });
      await page.click('#shuffle');
    }
    assert.deepEqual(errors, []);
    console.log('rev41-buttons: ok');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
