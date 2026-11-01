// Revisão 39 — anotações #5 (miniaturas fiéis), #7 (linha inteira), #8 (altura dos botões), #9 (VU em alta definição)
// logotipo igual ao do miniplayer em todos os layouts e ícone de cada instrumento no seletor de VU.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const lockup=page=>page.evaluate(()=>{const s=document.querySelector('.appbar .vynamp-brand-symbol svg').getBoundingClientRect(),n=document.querySelector('.appbar .faithful-brand-name'),c=getComputedStyle(n);return [Math.round(s.width),Math.round(n.getBoundingClientRect().left-s.right),c.fontFamily,c.fontSize,c.fontWeight,c.textTransform,c.letterSpacing].join('|');});
const url=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const p=await browser.newPage({viewport:{width:1175,height:846}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.waitForTimeout(600);
 // #5: estilos com degradê real usam o mesmo degradê (classes de parada da waveform) na miniatura; formas espelhadas onde o real é espelhado.
 const thumbs=await p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('[data-wave-menu]')].map(b=>{const s=b.querySelector('.wave-preview-icon');return [b.dataset.waveMenu,{gradient:!!s.querySelector('stop.wave-aurora-a,stop.wave-prisma-a'),paths:s.querySelectorAll('path').length,html:s.innerHTML}];})));
 for(const id of ['prisma-neon','aurora-neon','spectrum-aurora','spectrum-ribbon','aurora-weave','neon-crystal','aurora-constellation','aurora-layers'])assert.ok(thumbs[id].gradient,'miniatura sem o degradê real: '+id);
 assert.ok(thumbs['spectrum-stereo'].html.includes('wave-spectrum-right-color'),'estéreo sem a cor real do canal R');
 assert.ok(!/#39dfff/.test(Object.values(thumbs).map(t=>t.html).join('')),'miniaturas ainda usam o ciano fixo no lugar da cor da skin');
 // #7: o destaque da linha cobre exatamente a grade: mesmas bordas do cabeçalho (sem passar dele) e colunas alinhadas.
 await p.locator('#library>.track-row').nth(1).hover();
 const grid=await p.evaluate(()=>{const h=document.querySelector('.collection>.column-head').getBoundingClientRect(),row=document.querySelectorAll('#library>.track-row')[1],r=row.getBoundingClientRect(),hc=[...document.querySelector('.collection>.column-head').children].map(c=>c.getBoundingClientRect().left),rc=[...row.children].map(c=>c.getBoundingClientRect().left);return {left:r.left-h.left,right:r.right-h.right,cols:Math.max(...hc.slice(1).map((x,i)=>Math.abs(x-rc[i+1]))),hover:getComputedStyle(row).backgroundColor!==getComputedStyle(document.querySelectorAll('#library>.track-row')[2]).backgroundColor};});
 assert.ok(Math.abs(grid.left)<1&&Math.abs(grid.right)<1,'linha fora dos limites da grade: '+JSON.stringify(grid));assert.ok(grid.cols<1,'colunas desalinhadas do cabeçalho: '+JSON.stringify(grid));assert.ok(grid.hover,'hover sem destaque na linha');
 // #8: botões visíveis do cabeçalho com a mesma altura, no completo e no miniplayer.
 const heights=()=>p.evaluate(()=>[...document.querySelectorAll('.appbar button')].filter(e=>e.offsetWidth).map(e=>Math.round(e.getBoundingClientRect().height)));
 assert.equal(new Set(await heights()).size,1,'alturas diferentes no cabeçalho: '+(await heights()));
 // Seletor de VU: um ícone por instrumento, distintos entre si, dentro da tela.
 await p.evaluate(()=>document.getElementById('meter-options').click());await p.waitForTimeout(300);
 const meters=await p.evaluate(()=>{const m=document.getElementById('meter-menu'),b=m.getBoundingClientRect(),items=[...m.querySelectorAll('[data-meter]')];return {items:items.length,icons:items.filter(i=>i.querySelector('.meter-preview-icon')?.childElementCount).length,unique:new Set(items.map(i=>i.querySelector('.meter-preview-icon')?.innerHTML)).size,inside:b.right<=innerWidth&&b.left>=0};});
 assert.ok(meters.items>=9&&meters.icons===meters.items&&meters.unique===meters.items&&meters.inside,'seletor de VU sem ícones próprios: '+JSON.stringify(meters));
 await p.keyboard.press('Escape');
 // #9: no tamanho do painel, nenhum traço do VU fica abaixo de 1 pixel físico.
 const thinnest=sel=>p.evaluate(sel=>{const svg=document.querySelector(sel);const unit=svg.viewBox.baseVal.width/(svg.getBoundingClientRect().width*devicePixelRatio);let min=Infinity;for(const el of svg.querySelectorAll('line,path,circle')){const cs=getComputedStyle(el);if(cs.stroke!=='none'&&cs.display!=='none')min=Math.min(min,parseFloat(cs.strokeWidth)/unit);}return min;},sel);
 assert.ok(await thinnest('#meter-stage svg[viewBox]')>=.99,'traço do VU abaixo de 1 px');
 // No medidor ampliado os traços continuam como desenhados (sem estilo inline).
 await p.locator('#enlarge').click();await p.waitForTimeout(500);
 const inline=await p.evaluate(()=>{const svg=document.querySelector('#large-meter svg[viewBox]');const unit=svg.viewBox.baseVal.width/(svg.getBoundingClientRect().width*devicePixelRatio);return [...svg.querySelectorAll('line,path,circle')].filter(e=>e.style.strokeWidth&&parseFloat(getComputedStyle(e).strokeWidth)>unit*1.01).length;});
 assert.equal(inline,0,'medidor ampliado teve traços engrossados além de 1 px');
 await p.keyboard.press('Escape');
 const desktopLogo=await lockup(p);await p.locator('#layout-mini-toggle').click();await p.waitForTimeout(600);const miniLogo=await lockup(p);assert.equal(desktopLogo,miniLogo,'logotipo do desktop difere do miniplayer');
 assert.equal(new Set(await heights()).size,1,'alturas diferentes no miniplayer: '+(await heights()));
 // Mobile mantém o alvo de toque maior.
 const m=await browser.newPage({viewport:{width:390,height:844}});await m.goto(url);await m.waitForTimeout(600);
 const mobile=await m.evaluate(()=>[...document.querySelectorAll('.appbar .icon-button')].filter(e=>e.offsetWidth).map(e=>Math.round(e.getBoundingClientRect().height)));
 assert.ok(mobile.length&&mobile.every(h=>h>=38),'botões de toque encolheram no mobile: '+mobile);
 assert.equal(await lockup(m),miniLogo,'logotipo do mobile difere do miniplayer');
 assert.deepEqual(errors,[]);console.log('ui39-notes: ok');
}finally{await browser.close();}})().catch(e=>{console.error(e.message||e);process.exit(1);});
