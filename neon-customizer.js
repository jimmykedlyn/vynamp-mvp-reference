'use strict';
(() => {
  const root=document.documentElement,assets=window.VYNAMP_ASSETS,key='vynamp-neon-colours-v1';
  const palette=[['lime','Lima','#B8FF38'],['cyan','Ciano','#38E8FF'],['pink','Rosa','#FF58D6'],['violet','Violeta','#B084FF'],['blue','Azul','#6DA2FF'],['green','Verde','#32FFA0'],['yellow','Amarelo','#F5FF40'],['orange','Laranja','#FFAB45'],['red','Coral','#FF647C'],['ice','Menta','#A0FFF4']];
  const colours=new Map(palette.map(([id,,hex])=>[id,hex])),parts=[['accent','Accent geral'],['wave','Waveform'],['buttons','Botões'],['sliders','Sliders e knobs'],['volume','Volume']],defaults=()=>Object.fromEntries(parts.map(([id])=>[id,null]));
  let preferences={version:1,themes:{}};
  try{const saved=JSON.parse(localStorage.getItem(key));if(saved?.version===1&&saved.themes&&typeof saved.themes==='object')for(const theme of assets.themes){const entry=saved.themes[theme.id];if(entry&&typeof entry==='object')preferences.themes[theme.id]=Object.fromEntries(parts.map(([id])=>[id,colours.has(entry[id])?entry[id]:null]));}}catch{}
  const currentTheme=()=>assets.themes.find(t=>t.id===root.dataset.skin)||assets.themes[0],snapshot=()=>({...defaults(),...preferences.themes[currentTheme().id]});
  const section=document.createElement('section');section.id='neon-customizer';section.setAttribute('aria-labelledby','neon-title');
  section.innerHTML='<div class="neon-heading"><div><h3 id="neon-title">Cores neon</h3><p>Um accent para a skin ou uma cor para cada detalhe.</p></div><button id="neon-reset" class="text-button" type="button">Cores da skin</button></div><p class="neon-note">As escolhas ficam salvas nesta skin. Use as setas para percorrer as cores.</p><div id="neon-parts"></div><p id="neon-feedback" class="neon-feedback" role="status" aria-live="polite"></p>';
  const groups=new Map();
  for(const [part,label]of parts){const field=document.createElement('fieldset');field.dataset.neonPart=part;const legend=document.createElement('legend');legend.textContent=label;const selected=document.createElement('span');selected.className='neon-choice';legend.append(selected);const group=document.createElement('div');group.className='neon-swatches';group.setAttribute('role','group');group.setAttribute('aria-label',label);
    for(const [id,name,hex]of [['inherit',part==='accent'?'Da skin':'Seguir accent',null],...palette]){const button=document.createElement('button');button.type='button';button.className='neon-swatch';button.dataset.neonColor=id;button.title=name;button.setAttribute('aria-label',label+': '+name);button.setAttribute('aria-pressed','false');const dot=document.createElement('span');dot.className='neon-dot';dot.setAttribute('aria-hidden','true');if(hex){dot.style.background=hex;dot.style.color=ink(hex);}else{dot.classList.add('neon-inherit');dot.textContent='↗';}button.append(dot);button.onclick=()=>{const values=snapshot();values[part]=id==='inherit'?null:id;preferences.themes[currentTheme().id]=values;save();apply();feedback(label+': '+name+'.');};group.append(button);}
    group.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const buttons=[...group.children],index=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+buttons.length)%buttons.length;buttons[next].click();buttons[next].focus();};field.append(legend,group);section.querySelector('#neon-parts').append(field);groups.set(part,{group,selected});
  }
  const appearance=document.querySelector('[data-pref-panel="appearance"]');appearance.insertBefore(section,appearance.querySelector('.setting'));
  function rgb(hex){return hex.replace('#','').match(/../g).map(x=>parseInt(x,16));}
  function luminance(hex){const c=rgb(hex).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
  function contrast(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  function ink(hex){return contrast(hex,'#090C14')>=contrast(hex,'#FFFFFF')?'#090C14':'#FFFFFF';}
  function readable(hex,tokens,min=4.5){const surfaces=['background','chassis','panel-inset','panel-raised','selection'].map(k=>tokens[k]).filter(x=>/^#[0-9a-f]{6}$/i.test(x));if(surfaces.every(x=>contrast(hex,x)>=min))return hex;const to=luminance(tokens.background)>.3?0:255,from=rgb(hex);for(let n=1;n<=100;n++){const value='#'+from.map(x=>Math.round(x+(to-x)*n/100).toString(16).padStart(2,'0')).join('');if(surfaces.every(x=>contrast(value,x)>=min))return value;}return tokens['text-primary'];}
  function feedback(text){document.getElementById('neon-feedback').textContent=text;}
  function save(){try{localStorage.setItem(key,JSON.stringify(preferences));}catch{feedback('Cores aplicadas nesta sessão; armazenamento indisponível.');}}
  function apply(){const theme=currentTheme(),values=snapshot(),global=colours.get(values.accent),tokens=theme.tokens;
    // Start from skin tokens each time; overrides never become the next skin's baseline.
    for(const token of ['lime','cyan'])root.style.setProperty('--'+token,tokens[token]);
    if(global){root.style.setProperty('--lime',readable(global,tokens));root.style.setProperty('--cyan',readable(global,tokens));}
    for(const [part]of parts){const {group,selected}=groups.get(part),choice=values[part]||'inherit';for(const button of group.children){const active=button.dataset.neonColor===choice;button.setAttribute('aria-pressed',String(active));button.tabIndex=active?0:-1;}selected.textContent=choice==='inherit'?(part==='accent'?'Da skin':'Seguir accent'):palette.find(x=>x[0]===choice)[1];if(part==='accent')continue;
      const custom=colours.get(values[part])||global;root.toggleAttribute('data-custom-'+part,!!custom);const colour=custom||tokens[part==='wave'?'amber':'lime'];root.style.setProperty('--neon-'+part,colour);root.style.setProperty('--neon-'+part+'-ink',ink(colour));root.style.setProperty('--neon-'+part+'-readable',readable(colour,tokens));
    }
    root.toggleAttribute('data-custom-accent',!!global);root.style.setProperty('--neon-accent',global||tokens.lime);root.style.setProperty('--neon-accent-readable',readable(global||tokens.lime,tokens));
  }
  document.getElementById('neon-reset').onclick=()=>{delete preferences.themes[currentTheme().id];save();apply();feedback('Cores originais de '+currentTheme().name+' restauradas.');};
  document.getElementById('restore-appearance').addEventListener('click',()=>{preferences={version:1,themes:{}};save();apply();feedback('Todas as cores personalizadas foram restauradas.');});
  document.addEventListener('vynamp:theme-change',()=>{apply();feedback('Cores de '+currentTheme().name+'.');});
  window.VynampNeon={snapshot,apply,palette:palette.map(([id,name,hex])=>({id,name,hex})),contrast};apply();
})();
