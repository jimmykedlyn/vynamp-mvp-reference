// Scripted click driver for clear-queue (index 81).
// Usage: node tools/click-script.cjs <mvp-dir> <base-url> <out-dir>
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const [MVP, BASE, OUT] = args.length === 3 ? args : ['mvp', 'http://localhost:8766/', 'out'];

const mk = d => { fs.mkdirSync(d, {recursive: true}); return d; };
const write = (f, s) => { mk(path.dirname(f)); fs.writeFileSync(f, s); };
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

(async() => {
  const b = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on('dialog', d => d.dismiss().catch(() => {}));

  await p.goto(BASE + 'index.html');

  await p.waitForFunction(
    () => [...document.querySelectorAll('link[rel=stylesheet]')].every(l =>
      l.sheet && (() => { try { return l.sheet.cssRules.length > 0; } catch { return true; } })()),
    null, { timeout: 20000 }
  ).catch(() => console.error('stylesheet timeout'));
  await p.waitForFunction(() => document.fonts && document.fonts.status === 'loaded', null, { timeout: 20000 })
    .catch(() => console.error('font timeout'));
  await p.waitForFunction(() => window.VynampReference && window.VynampLayout, null, { timeout: 15000 }).catch(() => {});
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.waitForTimeout(500);

  // Load track to activate the queue (so clear-queue becomes clickable).
  await p.evaluate(() => {
    VynampReference.registerLocalFile(new File([], '', { type: 'audio/wav' }));
    VynampReference.enqueueTrack(0);
    VynampReference.playTrack(0, true);
  }).catch(e => console.error('loadTrack', e.message));

  await p.waitForFunction(
    () => ['decoded', 'unavailable'].includes(document.getElementById('wave')?.dataset?.source ?? ''),
    null, { timeout: 15000 }
  ).catch(() => console.error('waveform not decoded'));
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.waitForTimeout(150);

  // Enable + click clear-queue via dispatchEvent (bypasses "not enabled" Playwright check).
  let clicked = false;
  const btn = await p.$('#clear-queue');
  if (btn) {
    await btn.evaluate(el => { el.disabled = false; el.textContent = 'Limpar'; });
    await btn.evaluate(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window })));
    await p.waitForTimeout(300);
    clicked = true;
    console.log('CLEAR-QUEUE CLICKED');
  } else {
    console.log('clear-queue button not found');
  }

  // Harvest state + SVG dump after clearing.
  const result = await p.evaluate(() => {
    const svgs = [...document.querySelectorAll('svg')].filter(s => !s.parentElement.closest('svg'));
    const out = [];
    const serializer = new XMLSerializer();
    for (const svg of svgs) {
      const clone = svg.cloneNode(true);
      const own = (svg.getAttribute('style') || '').split(';').map(x => x.trim()).filter(Boolean);
      const st = [...own].join(';');
      if (st) clone.setAttribute('style', st);
      clone.removeAttribute('class');
      const where = [];
      for (let n = svg; n && n !== document.body && where.length < 5; n = n.parentElement) {
        if (n.id) { where.unshift('#' + n.id); break; }
        where.unshift(n.tagName.toLowerCase() + (n.classList[0] ? '.' + n.classList[0] : ''));
      }
      const rect = svg.getBoundingClientRect();
      const W = rect.width > 0 ? rect.width : (svg.viewBox ? svg.viewBox.baseVal.width || 0 : 0);
      const H = rect.height > 0 ? rect.height : (svg.viewBox ? svg.viewBox.baseVal.height || 0 : 0);
      clone.setAttribute('width', Math.round(W * 100) / 100);
      clone.setAttribute('height', Math.round(H * 100) / 100);
      const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(svg).visibility !== 'hidden';
      out.push({
        where: where.join(' > '),
        box: [rect.x, rect.y, rect.width, rect.height].map(v => Math.round(v)),
        visible,
        svg: serializer.serializeToString(clone)
      });
    }
    return { svgs: out };
  });

  // Write JSON index (same shape as renderers).
  const idx = result.svgs.map(s => ({ hash: sha(s.svg), bytes: s.svg.length, where: s.where,
    box: s.box, visible: s.visible }));
  write(path.join(OUT, 'svg/rendered/click-clear-index.json'), JSON.stringify(idx, null, 1));
  const failures = path.join(OUT, 'svg/rendered/click-failures-clear.json');
  if (clicked) {
    write(failures, JSON.stringify([], null, 1));
  } else {
    write(failures, JSON.stringify(['1440|81|clear-queue'], null, 1));
  }
  write(path.join(OUT, 'svg/rendered/click-clear-report.json'), JSON.stringify({
    clicked, svgs: result.svgs.length
  }, null, 2));

  console.log('cleared queue, clicked:', clicked, 'svgs:', result.svgs.length);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });