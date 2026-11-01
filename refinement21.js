'use strict';
(() => {
  const $=id=>document.getElementById(id),registry=window.VynampEQRegistry,controller=window.VynampEQController;
  const menuEQ=document.querySelector('[data-command="eq"]'),classicEQ=menuEQ.cloneNode(true);classicEQ.dataset.classicEq='true';classicEQ.textContent='Editor clássico · 10 bandas';menuEQ.after(classicEQ);
  // Presentation follows the shared primary instance, including undo/import/restore.
  const modeLabel=document.createElement('span');modeLabel.className='eq-mode-label';$('eq-open').append(modeLabel);
  function syncEQ(){const mode=registry.get().mode,name=mode==='parametric'?'paramétrico':mode+' bandas';modeLabel.textContent=mode==='parametric'?'PEQ':mode;$('eq-open').dataset.eqMode=mode;
    for(const id of ['eq-open','preferences-eq']){const el=$(id);el.setAttribute('aria-label','Abrir equalizador '+name);el.title='Equalizador '+name+' · mesma configuração do DSP';if(id==='preferences-eq')el.textContent='Abrir equalizador '+name;}menuEQ.textContent='Equalizador '+name;
  }
  window.VynampGraph.store.on(syncEQ);syncEQ();
  function openCurrent(invoker){controller.open();$('advanced-eq-dialog').addEventListener('close',()=>{const target=invoker.offsetWidth?invoker:$('preferences').offsetWidth?$('preferences'):$('main-menu-button');target.focus({preventScroll:true});},{once:true});}
  for(const id of ['eq-open','preferences-eq'])$(id).addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();if(id==='preferences-eq')$('preferences-dialog').close();openCurrent($(id));},true);
  $('main-menu').addEventListener('click',event=>{if(event.target.closest('button')!==menuEQ)return;event.preventDefault();event.stopImmediatePropagation();$('main-menu').hidePopover();openCurrent($('main-menu-button'));},true);
  $('lyrics-full').textContent='Letra completa';$('lyrics-full').insertAdjacentHTML('beforeend','<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>');
  document.querySelector('.instrument h2').textContent='VU estéreo';
  const originals=new WeakMap(),analogs=new Set(['analog-vintage','analog-dark','twin']);let pending=false;
  function embedTypography(svg){
    const ns='http://www.w3.org/2000/svg',style=document.createElementNS(ns,'style');style.dataset.instrumentTypography='true';
    style.textContent='svg[data-readable="true"] text.meter-readable-scale{font-family:Arial,Helvetica,sans-serif;font-size:var(--readable-size);font-weight:600;letter-spacing:0}svg[data-readable="true"] text.meter-readable-copy{font-family:Arial,Helvetica,sans-serif;font-size:var(--readable-size);letter-spacing:0}svg[data-readable="true"] text.meter-readable-minor,svg[data-trimmed="true"] text.meter-enclosure-label{display:none}svg text.meter-channel-mark{display:none}svg[data-trimmed="true"] text.meter-channel-mark{display:block;font-family:Arial,Helvetica,sans-serif;font-size:var(--channel-size,24px);font-weight:600;letter-spacing:0}';svg.append(style);
    if(analogs.has(svg.dataset.model))for(const channel of svg.querySelectorAll('[data-role="channel"]')){
      const panel=[...channel.children].filter(el=>el.localName==='rect')[1];if(!panel)continue;
      const label=document.createElementNS(ns,'text');label.classList.add('meter-channel-mark');label.textContent=channel.dataset.channel;
      label.setAttribute('x',+panel.getAttribute('x')+(+panel.getAttribute('width'))-22);label.setAttribute('y',+panel.getAttribute('y')+(+panel.getAttribute('height'))-20);label.setAttribute('text-anchor','end');label.setAttribute('fill',channel.querySelector('[data-role="scale"] text')?.getAttribute('fill')||'#dfe8ee');channel.append(label);
    }
  }
  function prepare(host){const svg=host.querySelector('svg');if(!svg)return;const width=svg.getBoundingClientRect().width;if(!width)return;
    let records=originals.get(svg);if(!records){embedTypography(svg);records=[...svg.querySelectorAll('text:not(.meter-channel-mark)')].map(el=>({el,text:el.textContent,size:parseFloat(el.getAttribute('font-size'))||12}));originals.set(svg,records);}
    if(host.id==='meter-stage'&&svg.dataset.trimmed==='true'&&analogs.has(svg.dataset.model))svg.viewBox.baseVal.height=Math.min(svg.viewBox.baseVal.height,286);
    const compact=host.id==='meter-stage'&&width<500&&svg.dataset.finish!=='original',factor=width/svg.viewBox.baseVal.width;
    svg.dataset.readable=String(compact);
    svg.style.setProperty('--channel-size',Math.max(22,9.5/factor)+'px');
    for(const {el,text,size} of records){el.classList.remove('meter-readable-scale','meter-readable-minor','meter-readable-copy');el.style.removeProperty('--readable-size');if(svg.dataset.model==='circular'&&/^[LR] CHANNEL$/.test(text))el.textContent=compact?text[0]:text;
      if(!compact)continue;
      const numeric=/^[+−-]?\d+(\.\d+)?$/.test(text.trim());
      if(size<=16&&(numeric||/^(L|R)$/.test(text.trim())||svg.dataset.model==='spectrum'&&/^\d+(\.\d+)?k( Hz)?$/.test(text)||svg.dataset.model==='circular'&&/^[LR] CHANNEL$/.test(text))&&!el.hasAttribute('data-role')){
        el.classList.add('meter-readable-scale');el.style.setProperty('--readable-size',Math.max(size,9.5/factor)+'px');
        if(analogs.has(svg.dataset.model)&&numeric&&!['-20','-10','-5','0','+3'].includes(text.trim()))el.classList.add('meter-readable-minor');
      }else if(size<10){el.classList.add('meter-readable-copy');el.style.setProperty('--readable-size',Math.max(size,6/factor)+'px');}
      if(svg.dataset.model==='spectrum'&&(text==='-24'&&el.getAttribute('x')==='124'||text==='dBFS'&&el.getAttribute('x')==='96'||['63','630','6.3k'].includes(text)))el.classList.add('meter-readable-minor');
    }
  }
  function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;prepare($('meter-stage'));prepare($('large-meter'));});}
  for(const id of ['meter-stage','large-meter']){const host=$(id);new MutationObserver(schedule).observe(host,{childList:true});new ResizeObserver(schedule).observe(host);}
  $('meter-finish').addEventListener('change',schedule);$('restore-appearance').addEventListener('click',schedule);schedule();
  const mobile=matchMedia('(max-width:900px)'),instrumentAvailable=()=>document.documentElement.dataset.layout!=='mini'&&!mobile.matches;
  function closeHiddenInstrument(){if(instrumentAvailable())return;const menu=$('meter-menu'),wasOpen=$('meter-dialog').open||!menu.hidden;if($('meter-dialog').open)$('meter-dialog').close();if(!menu.hidden){menu.hidden=true;document.querySelectorAll('[aria-controls="meter-menu"]').forEach(el=>el.setAttribute('aria-expanded','false'));}if(wasOpen){const target=$('main-menu-button').offsetWidth?$('main-menu-button'):$('layout-mini-toggle');target?.focus({preventScroll:true});}}
  new MutationObserver(closeHiddenInstrument).observe(document.documentElement,{attributes:true,attributeFilter:['data-layout']});mobile.addEventListener('change',closeHiddenInstrument);
  document.addEventListener('keydown',event=>{if(instrumentAvailable()||event.key.toLowerCase()!=='v'||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;if(!event.ctrlKey&&!event.metaKey||event.ctrlKey&&event.shiftKey&&!event.metaKey){event.preventDefault();event.stopImmediatePropagation();}},true);closeHiddenInstrument();
})();
