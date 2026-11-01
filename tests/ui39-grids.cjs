// Revisão 39 — grades da biblioteca e da fila pelas leis de UX do projeto (notas #1 e #2).
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const url=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 const p=await browser.newPage({viewport:{width:1175,height:846}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.waitForTimeout(700);
 // Biblioteca: Filtros, Playlists e Ordem numa barra só (proximidade).
 const bar=await p.evaluate(()=>{const tools=document.getElementById('library-tools'),sort=document.getElementById('sort'),t=tools.getBoundingClientRect(),s=sort.getBoundingClientRect();return {inside:tools.contains(sort),sameRow:s.top>=t.top-1&&s.bottom<=t.bottom+1,filterbarRows:Math.round(document.querySelector('.filterbar').getBoundingClientRect().height)};});
 assert.ok(bar.inside&&bar.sameRow,'ordenação fora da barra de ferramentas: '+JSON.stringify(bar));assert.ok(bar.filterbarRows<=56,'busca ainda ocupa mais de uma linha: '+bar.filterbarRows);
 // Fila: linhas com as mesmas bordas do cartão "Agora", número fora da capa e duração em todas as linhas.
 const q=await p.evaluate(()=>{const items=[...document.querySelectorAll('#queue-list .queue-item')],now=document.getElementById('current-queue').getBoundingClientRect(),r=items[1].getBoundingClientRect();return {left:r.left-now.left,right:r.right-now.right,numberInCover:items.some(i=>i.querySelector('.queue-cover .number')),withTime:items.filter(i=>/\d:\d\d|AO VIVO/.test(i.querySelector(':scope>.time')?.textContent||'')).length,total:items.length,height:Math.round(r.height)};});
 assert.ok(Math.abs(q.left)<1&&Math.abs(q.right)<1,'linhas da fila fora das bordas do cartão Agora: '+JSON.stringify(q));
 assert.ok(!q.numberInCover,'número ainda sobre a capa');assert.equal(q.withTime,q.total,'linhas da fila sem duração');assert.ok(q.height<=60,'linha da fila alta demais: '+q.height);
 // Com mouse, ações só na linha sob o cursor; o título não é cortado por ações ocultas.
 const actions=()=>p.evaluate(()=>[...document.querySelectorAll('#queue-list .queue-item')].map(i=>getComputedStyle(i.querySelector('[data-remove]')).opacity==='1'));
 assert.ok((await actions()).every(v=>!v),'ações visíveis sem hover');
 assert.ok(await p.evaluate(()=>[...document.querySelectorAll('#queue-list [data-remove]')].every(b=>getComputedStyle(b).display!=='none'&&b.getClientRects().length)),'ações ocultas saíram da árvore de acessibilidade');
 await p.locator('#queue-list .queue-item').nth(1).hover();await p.waitForTimeout(250);assert.deepEqual((await actions()).map((v,i)=>i===1?v:!v).every(Boolean),true,'hover não revela as ações só da linha');
 await p.locator('#queue-list .queue-item').nth(1).locator('.track-name').focus();await p.mouse.move(0,0);await p.waitForTimeout(250);assert.ok((await actions())[1],'foco por teclado não revela as ações');
 // Toque: ações sempre visíveis.
 const t=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const m=await t.newPage();await m.goto(url);await m.waitForTimeout(700);
 // Mobile: na aba Biblioteca a lista aparece na primeira tela.
 await m.getByRole('button',{name:/Biblioteca/}).last().click();await m.waitForTimeout(500);
 const [first,screen]=await m.evaluate(()=>[document.querySelector('#library>.track-row').getBoundingClientRect().top,innerHeight]);assert.ok(first<screen-120,'lista da biblioteca fora da primeira tela no mobile: '+first);
 const touch=await m.evaluate(()=>matchMedia('(hover:hover) and (pointer:fine)').matches?null:[...document.querySelectorAll('#queue-list .queue-item [data-remove]')].every(b=>getComputedStyle(b).display!=='none'));
 assert.notEqual(touch,false,'ações escondidas no toque');
 assert.deepEqual(errors,[]);console.log('ui39-grids: ok');
}finally{await browser.close();}})().catch(e=>{console.error(e.message||e);process.exit(1);});
