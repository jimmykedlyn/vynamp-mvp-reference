const fs=require('fs'), path=require('path');

const base = path.resolve(process.cwd());
const idx = JSON.parse(fs.readFileSync(base + '/out/svg/rendered/index.json','utf8'));
const themes = JSON.parse(fs.readFileSync(base + '/out/themes/themes.json','utf8'));

const fontUsage = new Map();

idx.forEach(svg => {
  const svgPath = path.join(base, 'out/svg/rendered', svg.hash + '.svg');
  if(!fs.existsSync(svgPath)) return;
  const content = fs.readFileSync(svgPath, 'utf8');
  // Match font-family: followed by font names until ; or > (next tag)
  const re = /font-family\s*:\s*([^;>]+)/g;
  let m;
  while((m = re.exec(content)) !== null) {
    const family = m[1].replace(/\s+/g, ' ').trim().replace(/"/g, '"');
    fontUsage.set(family, (fontUsage.get(family) || 0) + 1);
  }
});

console.log('=== Font-family usage across rendered SVGs ===');
for(const [family, count] of [...fontUsage.entries()].sort((a,b)=>b[1]-a[1])) {
  console.log(JSON.stringify(family), '->', count, 'SVGs');
}

console.log('\n=== Font-family values found in MVP CSS files ===');
for(const f of fs.readdirSync(base + '/mvp')) {
  if(!f.endsWith('.css')) continue;
  const txt = fs.readFileSync(base + '/mvp/' + f, 'utf8');
  const re = /font-family\s*[:=]\s*['"]?([^;}"'\n]+)/gi;
  let m;
  while((m = re.exec(txt)) !== null) {
    console.log(f+':', JSON.stringify(m[1].trim()));
  }
}

console.log('\n=== Theme font-body ===');
themes.themes.forEach(t => {
  if(t.body && t.body.fontFamily) {
    console.log(t.name, ':', t.body.fontFamily);
  }
});