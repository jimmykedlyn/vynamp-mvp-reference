// Revisão 38 — regressões de UI do fluxo de áudio: status de bypass obsoleto, Organizar em tela estreita e vista por modo.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const url=pathToFileURL(path.resolve(__dirname,'../index.html')).href;
const graphWithChorus=()=>{const M=VynampGraphModel,d=VynampGraph.store.snapshot(),s=new M.Store(),n=s.add('chorus');d.nodes=d.nodes.filter(x=>['source','sink','primary-eq'].includes(x.type)).concat(s.snapshot().nodes.filter(x=>x.id===n.id));d.edges=[{id:'e1',from:'source',out:'out',to:'main-eq',in:'in'},{id:'e2',from:'main-eq',out:'out',to:'sink',in:'in'}];VynampGraph.store.load(d);return n.id;};
// Segmento entre portas conectadas não pode atravessar o retângulo de outro nó.
const crossings=()=>{const rect=id=>document.getElementById('graph-node-'+id).getBoundingClientRect(),port=(id,dir)=>{const r=rect(id);return dir==='out'?{x:r.right,y:r.top+r.height/2}:{x:r.left,y:r.top+r.height/2};},hit=(a,b,r)=>{for(let t=0;t<=1;t+=.01){const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(x>r.left+2&&x<r.right-2&&y>r.top+2&&y<r.bottom-2)return true;}return false;},d=VynampGraph.store.data,out=[];for(const e of d.edges){const a=port(e.from,'out'),b=port(e.to,'in');for(const n of d.nodes)if(n.id!==e.from&&n.id!==e.to&&hit(a,b,rect(n.id)))out.push(e.from+'>'+e.to+' atravessa '+n.type);}return out;};
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});try{
 // 1. Status de erro não sobrevive a uma aplicação bem-sucedida.
 {const p=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);await p.evaluate(()=>VynampGraph.open());
  await p.evaluate(async()=>{const M=VynampGraphModel,d=VynampGraph.store.snapshot(),s=new M.Store(),n=s.add('normalization');d.nodes=d.nodes.concat(s.snapshot().nodes.filter(x=>x.id===n.id));d.edges=[{id:'a',from:'source',out:'out',to:n.id,in:'in'},{id:'b',from:n.id,out:'out',to:'sink',in:'in'}];d.settings.enabled=true;VynampGraph.store.load(d);await VynampGraph.synchronizeAudio();});
  await p.waitForTimeout(300);assert.match(await p.locator('#graph-status').innerText(),/aguardando configuração/);assert.equal(await p.evaluate(()=>VynampGraph.store.data.settings.enabled),true);
  // Usuário remove a normalização; a cadeia continua ativa.
  await p.evaluate(()=>{const d=VynampGraph.store.snapshot();d.nodes=d.nodes.filter(n=>n.type!=='normalization');d.edges=[{id:'a',from:'source',out:'out',to:'main-eq',in:'in'},{id:'b',from:'main-eq',out:'out',to:'sink',in:'in'}];VynampGraph.store.load(d);});
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(()=>VynampGraph.store.data.settings.enabled),true,'cadeia reativada');
  assert.equal(await p.locator('#graph-status').innerText(),'Cadeia ativa.','status obsoleto do módulo removido');
  assert.deepEqual(errors,[]);await p.close();}
 // 2. Organizar em tela estreita: legível e sem nó solto no caminho dos fios.
 {const ctx=await browser.newContext({viewport:{width:490,height:966}}),p=await ctx.newPage();await p.goto(url);await p.evaluate(()=>VynampGraph.open());await p.evaluate(graphWithChorus);
  await p.locator('#graph-arrange').click();await p.waitForTimeout(200);
  assert.deepEqual(await p.evaluate(crossings),[],'Organizar deixou fio atravessando nó');
  const scale=await p.evaluate(()=>VynampGraph.store.data.view.scale);assert.ok(scale>=.5,'zoom ilegível após Organizar em tela estreita: '+scale);
  const mobileView=await p.evaluate(()=>({...VynampGraph.store.data.view}));
  // 3. A vista do mobile não é herdada pelo desktop, e cada modo recupera a sua.
  await p.setViewportSize({width:1440,height:900});await p.waitForTimeout(250);await p.reload();await p.evaluate(()=>VynampGraph.open());await p.waitForTimeout(200);
  const desk=await p.evaluate(()=>{const v=document.getElementById('graph-viewport').getBoundingClientRect(),d=VynampGraph.store.data,visible=d.nodes.filter(n=>{const r=document.getElementById('graph-node-'+n.id).getBoundingClientRect();return r.left>=v.left-1&&r.right<=v.right+1&&r.top>=v.top-1&&r.bottom<=v.bottom+1;}).length;return {view:{...d.view},visible,total:d.nodes.length};});
  assert.notDeepEqual(desk.view,mobileView,'desktop herdou a vista do mobile');assert.equal(desk.visible,desk.total,'nem todos os nós visíveis no desktop');assert.ok(desk.view.scale>=.5,'desktop com zoom ilegível');
  await p.evaluate(()=>VynampGraph.store.view({scale:.8,x:10,y:10}));await p.waitForTimeout(250);
  await p.setViewportSize({width:490,height:966});await p.waitForTimeout(250);await p.reload();await p.evaluate(()=>VynampGraph.open());await p.waitForTimeout(200);
  const back=await p.evaluate(()=>({...VynampGraph.store.data.view}));for(const k of ['scale','x','y'])assert.ok(Math.abs(back[k]-mobileView[k])<.01,'vista do mobile não recuperada: '+JSON.stringify(back));
  await ctx.close();}
 console.log('dsp38-graph-ui: ok');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
