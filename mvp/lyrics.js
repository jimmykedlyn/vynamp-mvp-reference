'use strict';
(() => {
  const api=window.VynampReference,metadata=window.VynampLyricsMetadata,$=id=>document.getElementById(id),storage='vynamp-inline-lyrics-v1';
  const state={version:1,enabled:true,instrumental:new Set(),entries:new Map()};
  try{const saved=JSON.parse(localStorage.getItem(storage));if(saved?.version===1){state.enabled=saved.enabled!==false;if(Array.isArray(saved.instrumental))state.instrumental=new Set(saved.instrumental.filter(v=>typeof v==='string'&&v.length<2000).slice(0,2000));}}catch{}
  api.state.lyrics=state;
  const keyOf=t=>t.demo?t.id:t.file?'file:'+t.file.name+'|'+t.file.size+'|'+t.file.lastModified:t.id;
  const demoText=['A cidade desacelera','O som atravessa a noite','Cada luz encontra um caminho','E a música continua','Entre o silêncio e o horizonte','Deixo o tempo respirar','Uma nota guarda a memória','Outra me faz caminhar'];
  const requests=new Map(),imports=new Map(),noSource={kind:'none',source:''};let activeKey='',activeIndex=-2,activeSource=null,animation=null,generation=0,presentedKey='',presentedEntry=null,presentedMode='',preferenceRevision=0;
  const panel=document.createElement('section');panel.id='lyrics-panel';panel.setAttribute('aria-labelledby','lyrics-title');
  panel.innerHTML='<div class="lyrics-heading"><h3 id="lyrics-title">LETRA</h3><span id="lyrics-origin-badge"></span><button id="lyrics-menu-button" class="icon-button" aria-label="Opções da letra" aria-haspopup="menu" aria-expanded="false" aria-controls="lyrics-options-menu">'+VynampIcons.svg('more')+'</button></div><div id="lyrics-window" aria-label="Letra sincronizada"><div id="lyrics-strip"></div></div><p id="lyrics-empty"></p><div class="lyrics-footer"><span id="lyrics-source"></span><button id="lyrics-full" class="plain" hidden>Ver letra completa</button><button id="lyrics-import-inline" class="plain" hidden>Importar LRC</button></div><p id="lyrics-message" role="status" aria-live="polite"></p>';
  $('meter-stage').after(panel);
  const menu=document.createElement('div');menu.id='lyrics-options-menu';menu.className='lyrics-options-menu';menu.setAttribute('popover','auto');menu.setAttribute('role','menu');menu.setAttribute('aria-label','Exibição da letra');
  for(const [mode,text]of [['on','Mostrar letra'],['off','Desligar letra'],['instrumental','Música instrumental / sem letra']]){const b=document.createElement('button');b.type='button';b.dataset.lyricsMode=mode;b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked','false');b.textContent=text;menu.append(b);}
  for(const [id,text]of [['lyrics-import','Importar letra sincronizada (.lrc)…'],['lyrics-metadata-reload','Usar letra dos metadados']]){const b=document.createElement('button');b.id=id;b.setAttribute('role','menuitem');b.textContent=text;menu.append(b);}
  document.body.append(menu);
  const file=document.createElement('input');file.id='lyrics-file';file.type='file';file.accept='.lrc,text/plain';file.hidden=true;document.body.append(file);
  const full=document.createElement('dialog');full.id='lyrics-full-dialog';full.setAttribute('aria-labelledby','lyrics-full-title');full.innerHTML='<div class="dialog-head"><h2 id="lyrics-full-title">Letra completa</h2><button id="lyrics-full-close" class="icon-button" aria-label="Fechar letra completa">'+VynampIcons.svg('close')+'</button></div><p class="secondary">Texto da letra · os tempos só aparecem quando fornecidos pela fonte.</p><div id="lyrics-full-text"></div>';document.body.append(full);
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const reduced=()=>media.matches||api.state.reducedMotion||document.hidden;
  function save(){try{localStorage.setItem(storage,JSON.stringify({version:1,enabled:state.enabled,instrumental:[...state.instrumental]}));}catch{announce('Preferência mantida apenas nesta sessão.');}}
  function announce(message){$('lyrics-message').textContent=message;}
  function stopAnimation(){generation++;if(animation){animation.cancel();animation=null;} $('lyrics-strip').style.transform='';}
  function makeLine(text,position,note=false){const line=document.createElement('div');line.className='lyrics-line '+position;if(!text&&note)line.innerHTML=VynampIcons.svg('note',{label:'Trecho instrumental'});else line.textContent=text||'\u00a0';line.title=text||'';if(position==='current'){line.id='lyrics-current';line.setAttribute('aria-current','true');}else{line.id=position==='previous'?'lyrics-previous':'lyrics-next';line.setAttribute('aria-hidden','true');}return line;}
  function drawLines(entry,index){const strip=$('lyrics-strip');strip.replaceChildren(makeLine(entry.lines[index-1]?.text,'previous'),makeLine(index<0?'Aguardando a primeira linha':entry.lines[index]?.text||'','current',true),makeLine(entry.lines[index+1]?.text,'next'));}
  function setIndex(entry,index,playing){
    if(index===activeIndex){if((!playing||reduced())&&animation){stopAnimation();drawLines(entry,index);}return;}
    const previous=activeIndex;activeIndex=index;
    const strip=$('lyrics-strip');
    if(playing&&!reduced()&&previous>=0&&index===previous+1&&strip.children.length===3){
      stopAnimation();const token=generation,old=[...strip.children];old[0].removeAttribute('id');old[0].className='lyrics-line outgoing';old[1].id='lyrics-previous';old[1].className='lyrics-line previous';old[1].removeAttribute('aria-current');old[1].setAttribute('aria-hidden','true');old[2].id='lyrics-current';old[2].className='lyrics-line current';old[2].removeAttribute('aria-hidden');old[2].setAttribute('aria-current','true');strip.append(makeLine(entry.lines[index+1]?.text,'next'));
      const height=old[1].getBoundingClientRect().height;animation=strip.animate([{transform:'translateY(0)'},{transform:`translateY(-${height}px)`}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)',fill:'forwards'});panel.dataset.upwardTransitions=String((+panel.dataset.upwardTransitions||0)+1);
      animation.finished.then(()=>{if(token!==generation)return;stopAnimation();drawLines(entry,index);}).catch(()=>{});
    }else{stopAnimation();drawLines(entry,index);}
  }
  function currentMode(){return !state.enabled?'off':state.instrumental.has(activeKey)?'instrumental':'on';}
  function syncMenu(){const mode=currentMode();menu.querySelectorAll('[data-lyrics-mode]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.lyricsMode===mode)));$('lyrics-metadata-reload').disabled=!api.getTrackSnapshot().file;$('lyrics-metadata-reload').title=$('lyrics-metadata-reload').disabled?'Disponível ao abrir um arquivo local.':'';}
  function update(){
    const track=api.getTrackSnapshot(),key=keyOf(track);if(key!==activeKey){stopAnimation();activeKey=key;activeIndex=-2;activeSource=null;announce('');}
    const mode=currentMode();let entry=state.entries.get(key);
    if(!entry&&mode==='on'){if(track.demo){entry={kind:'synced',source:'DEMO · letra original de exemplo',demo:true,lines:demoText.map((text,i)=>({time:i*5,text})),text:demoText.join('\n')};state.entries.set(key,entry);}else if(track.radio){entry={kind:'unsupported',source:'Web rádio',notice:'Letra indisponível para transmissão ao vivo.'};state.entries.set(key,entry);}else{entry={kind:'loading',source:'Lendo metadados…'};state.entries.set(key,entry);probe(track,key);}}
    entry??=noSource;
    if(presentedKey!==key||presentedEntry!==entry||presentedMode!==mode){
      presentedKey=key;presentedEntry=entry;presentedMode=mode;
      syncMenu();panel.dataset.mode=mode;panel.dataset.kind=entry.kind;$('lyrics-window').hidden=mode!=='on'||entry.kind!=='synced';$('lyrics-empty').hidden=mode==='on'&&entry.kind==='synced';$('lyrics-full').hidden=mode!=='on'||!entry.text;$('lyrics-import-inline').hidden=mode!=='on'||entry.kind==='synced';
      $('lyrics-origin-badge').textContent=mode==='off'?'DESLIGADA':mode==='instrumental'?'INSTRUMENTAL':entry.demo?'DEMO':entry.kind==='synced'?'SINCRONIZADA':'';
      $('lyrics-source').textContent=mode==='off'?'':mode==='instrumental'?'Definido para esta faixa':entry.source||'';
    }
    if(mode==='off'){$('lyrics-empty').textContent='Letra desligada';stopAnimation();return;}
    if(mode==='instrumental'){$('lyrics-empty').textContent='Música instrumental · sem letra';stopAnimation();return;}
    if(entry.kind!=='synced'){stopAnimation();$('lyrics-empty').textContent=entry.kind==='loading'?'Procurando letra nos metadados…':entry.kind==='plain'?'A letra está nos metadados, mas não tem sincronização.':entry.kind==='unsupported'||entry.kind==='error'?entry.notice:'Nenhuma letra encontrada nos metadados.';return;}
    if(activeSource!==entry){stopAnimation();activeIndex=-2;activeSource=entry;}
    const position=track.position;let lo=0,hi=entry.lines.length-1,index=-1;while(lo<=hi){const middle=(lo+hi)>>1;if(entry.lines[middle].time<=position){index=middle;lo=middle+1;}else hi=middle-1;}
    setIndex(entry,index,api.state.playing);
  }
  async function probe(track,key){const token=(requests.get(key)||0)+1;requests.set(key,token);try{if(!track.file)throw Error('Arquivo local indisponível para leitura de metadados.');const entry=await metadata.read(track.file);if(requests.get(key)!==token||state.entries.get(key)?.imported)return;state.entries.set(key,entry);if(keyOf(api.getTrackSnapshot())===key)update();}catch(error){if(requests.get(key)!==token||state.entries.get(key)?.imported)return;state.entries.set(key,{kind:'error',source:'metadados',notice:'Não foi possível ler a letra: '+error.message});if(keyOf(api.getTrackSnapshot())===key)update();}}
  $('lyrics-menu-button').onclick=()=>{syncMenu();menu.showPopover();const r=$('lyrics-menu-button').getBoundingClientRect(),m=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-m.width-8,r.right-m.width))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-m.height-8,r.bottom+4))+'px';menu.querySelector('[aria-checked="true"]')?.focus({preventScroll:true});};
  menu.addEventListener('toggle',e=>$('lyrics-menu-button').setAttribute('aria-expanded',String(e.newState==='open')));
  menu.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const items=[...menu.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();});
  menu.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;menu.hidePopover();$('lyrics-menu-button').focus({preventScroll:true});if(b.dataset.lyricsMode){preferenceRevision++;const mode=b.dataset.lyricsMode;state.enabled=mode!=='off';if(mode==='instrumental')state.instrumental.add(activeKey);else if(mode==='on')state.instrumental.delete(activeKey);save();activeIndex=-2;update();announce(mode==='off'?'Exibição da letra desligada.':mode==='instrumental'?'Faixa marcada como instrumental / sem letra.':'Exibição da letra ligada.');}else if(b.id==='lyrics-import')file.click();else if(b.id==='lyrics-metadata-reload'){preferenceRevision++;imports.set(activeKey,(imports.get(activeKey)||0)+1);state.enabled=true;state.instrumental.delete(activeKey);state.entries.delete(activeKey);activeIndex=-2;save();update();}});
  $('lyrics-import-inline').onclick=()=>file.click();
  file.onchange=async()=>{const selected=file.files[0],track=api.getTrackSnapshot(),key=keyOf(track);if(!selected)return;const token=(imports.get(key)||0)+1,revision=preferenceRevision;imports.set(key,token);try{if(selected.size>512*1024)throw Error('O arquivo LRC excede 512 KiB.');const text=await selected.text(),lines=metadata.parseLRC(text);if(imports.get(key)!==token)return;state.entries.set(key,{kind:'synced',lines,text,imported:true,source:'LRC local · '+selected.name});if(preferenceRevision===revision&&keyOf(api.getTrackSnapshot())===key){state.enabled=true;state.instrumental.delete(key);}save();if(keyOf(api.getTrackSnapshot())===key){activeSource=null;update();announce('Letra sincronizada importada para '+track.title+'.');}}catch(error){if(imports.get(key)===token&&keyOf(api.getTrackSnapshot())===key)announce('Letra não alterada: '+error.message);}finally{file.value='';}};
  $('lyrics-full').onclick=()=>{const entry=state.entries.get(activeKey);$('lyrics-full-title').textContent='Letra · '+api.getTrackSnapshot().title;$('lyrics-full-text').textContent=entry?.text||'';full.showModal();};$('lyrics-full-close').onclick=()=>full.close();full.addEventListener('close',()=>($('lyrics-full').hidden?$('lyrics-menu-button'):$('lyrics-full')).focus({preventScroll:true}));
  document.addEventListener('vynamp:playback',update);media.addEventListener('change',()=>{stopAnimation();activeIndex=-2;update();});document.addEventListener('visibilitychange',()=>{stopAnimation();activeIndex=-2;if(!document.hidden)update();});window.addEventListener('pagehide',stopAnimation);
  for(const id of ['reduce-motion','font-scale'])$(id).addEventListener('change',()=>{stopAnimation();activeIndex=-2;update();});
  update();
})();
