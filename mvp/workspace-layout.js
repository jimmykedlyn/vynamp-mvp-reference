'use strict';
(() => {
  const $=id=>document.getElementById(id),graph=window.VynampGraph,dialog=$('graph-dialog');
  const settings=document.createElement('div');settings.id='graph-settings-menu';settings.className='graph-settings-menu';settings.setAttribute('popover','auto');settings.setAttribute('aria-label','Configurações do fluxo');const heading=document.createElement('h3');heading.textContent='APRESENTAÇÃO DO FLUXO';settings.append(heading);const glow=$('graph-glow').closest('label');glow.append(Object.assign(document.createElement('span'),{textContent:'0 desliga o brilho',className:'secondary'}));settings.append(glow);const paletteLabel=document.createElement('label');paletteLabel.textContent='Paleta das conexões';paletteLabel.append($('graph-palette'));settings.append(paletteLabel,$('graph-motion'));dialog.append(settings);
  const button=document.createElement('button');button.id='graph-settings-button';button.textContent='Configurações';button.setAttribute('popovertarget','graph-settings-menu');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-label','Configurações de brilho, cores e animação');dialog.querySelector('.graph-toolbar').append(button);
  settings.addEventListener('toggle',e=>{if(e.newState==='open'){const b=button.getBoundingClientRect(),r=settings.getBoundingClientRect();settings.style.left=Math.max(8,Math.min(b.right-r.width,innerWidth-r.width-8))+'px';settings.style.top=Math.min(b.bottom+8,innerHeight-r.height-8)+'px';}});dialog.addEventListener('close',()=>{if(settings.matches(':popover-open'))settings.hidePopover();});
  for(const id of ['audio-effects-open'])$(id).addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();graph.open(e.currentTarget);},true);
  $('graph-legacy').textContent='Configuração avançada';dialog.querySelector('.graph-header .eyebrow').textContent='ÁUDIO / ROTEAMENTO';
  dialog.querySelector('.graph-canvas-column').append(dialog.querySelector('.graph-hint'));
  const caption=document.querySelector('.meter-caption > span');caption.textContent='Clique alterna · botão direito escolhe';$('graph-shortcut').hidden=true;
})();
