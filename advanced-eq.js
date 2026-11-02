'use strict';
(() => {
  const api=window.VynampReference, $=id=>document.getElementById(id);
  if(!api)throw new Error('VynampReference adapter unavailable');
  const key='vynamp-advanced-eq-v1', modes=['10','20','31','64','parametric'];
  const centers={10:[31,62,125,250,500,1000,2000,4000,8000,16000],31:[20,25,31.5,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500,16000,20000]};
  for(const n of [20,64])centers[n]=Array.from({length:n},(_,i)=>20*1000**(i/(n-1)));
  const types={peaking:'Pico',lowshelf:'Low shelf',highshelf:'High shelf',lowpass:'Passa-baixas',highpass:'Passa-altas',notch:'Notch',bandpass:'Passa-banda'};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const empty=mode=>({preamp:0,gains:mode==='parametric'?[]:Array(+mode).fill(0),filters:[]});
  const initial={version:1,mode:'10',enabled:api.state.eqEnabled,scope:'session',device:'Perfil local',modes:Object.fromEntries(modes.map(m=>[m,empty(m)])),presets:[],baseline:{}};
  initial.modes['10'].gains=api.state.eqBands.slice();initial.modes['10'].preamp=api.state.eqPreamp;
  const inRange=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
  function validMode(v,m){return v&&inRange(v.preamp,-24,12)&&Array.isArray(v.gains)&&v.gains.length===(m==='parametric'?0:+m)&&v.gains.every(n=>inRange(n,-15,15))&&Array.isArray(v.filters)&&v.filters.length<=32&&v.filters.every(f=>f&&Object.hasOwn(types,f.type)&&inRange(f.frequency,10,40000)&&inRange(f.gain,-24,24)&&inRange(f.q,.1,18)&&[12,24,36,48].includes(f.slope)&&['Both','Left','Right'].includes(f.channel)&&typeof f.enabled==='boolean');}
  let model=initial;
  try{const loaded=JSON.parse(localStorage.getItem(key));if(loaded?.version===1&&modes.includes(loaded.mode)&&modes.every(m=>validMode(loaded.modes?.[m],m))&&typeof loaded.enabled==='boolean'&&['session','device'].includes(loaded.scope)&&typeof loaded.device==='string'&&Array.isArray(loaded.presets)&&loaded.presets.length<=100&&loaded.presets.every(p=>typeof p.name==='string'&&p.name.length<=80&&modes.includes(p.mode)&&validMode(p.value,p.mode)&&['session','device'].includes(p.scope)&&typeof p.device==='string'))model={...initial,...loaded,baseline:{}};}catch{}
  api.state.advancedEQ=model;
  const history=[],responseCache=new Map(),base=()=>model.modes[model.mode];let validationContext,dragging=null,frame=0;
  function context(){if(!validationContext||validationContext.sampleRate!==api.getSampleRate()){validationContext=new OfflineAudioContext(2,1,api.getSampleRate());responseCache.clear();}return validationContext;}
  const maximum=()=>Math.min(40000,.45*context().sampleRate);
  const labelHz=f=>f>=1000?(f/1000).toLocaleString('pt-BR',{maximumFractionDigits:2})+' kHz':f.toLocaleString('pt-BR',{maximumFractionDigits:1})+' Hz';
  const note=text=>{$('advanced-eq-feedback').textContent=text;};
  function remember(){if(api.equalizerRegistry)return;history.push(clone({mode:model.mode,value:base(),enabled:model.enabled}));if(history.length>100)history.shift();}
  function persist(){try{localStorage.setItem(key,JSON.stringify(model));}catch{note('Não foi possível salvar as preferências neste navegador.');}}
  function sync(){
    api.state.eqEnabled=model.enabled;api.state.eqBands=model.modes['10'].gains.slice();api.state.eqPreamp=model.modes['10'].preamp;api.applyEQ();
    $('advanced-eq-enabled').setAttribute('aria-pressed',String(model.enabled));$('advanced-eq-enabled').textContent=model.enabled?'EQ ligado':'EQ desligado';
    const demo=api.isDemo();$('advanced-eq-status').textContent=api.equalizerRegistry?api.equalizerRegistry.status():(demo?'[DEMO — sem processamento de áudio neste modo]':'EQ principal · aguardando registro compartilhado');
    $('advanced-eq-mode').value=model.mode;$('advanced-preamp').value=base().preamp;$('advanced-preamp-value').textContent=base().preamp+' dB';
    $('advanced-dirty').textContent=JSON.stringify(base())===(model.baseline[model.mode]||JSON.stringify(empty(model.mode)))?'Flat / salvo':'Modificado *';
    $('advanced-undo').disabled=api.equalizerRegistry?!api.equalizerRegistry.canUndo():!history.length;
    persist();draw();
  }
  document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="advanced-eq.css">');
  const launch=document.createElement('button');launch.id='eq-advanced-open';launch.className='text-button';launch.textContent='Editor avançado…';$('eq-dialog').querySelector('.eq-toolbar').append(launch);
  const dialog=document.createElement('dialog');dialog.id='advanced-eq-dialog';dialog.setAttribute('aria-labelledby','advanced-eq-title');
  dialog.innerHTML=`<div class="dialog-head"><div><div class="eyebrow">AUDIO / EQUALIZATION</div><h2 id="advanced-eq-title">Equalizador avançado</h2></div><button id="advanced-eq-close" class="icon-button" aria-label="Fechar editor avançado" title="Fechar editor avançado">${VynampIcons.svg('close')}</button></div>
    <div class="advanced-toolbar"><label>Modo<select id="advanced-eq-mode"><option value="10">10 bandas</option><option value="20">20 bandas</option><option value="31">31 bandas</option><option value="64">64 bandas</option><option value="parametric">Paramétrico</option></select></label><button id="advanced-eq-enabled" class="text-button" aria-pressed="false">EQ desligado</button><button id="advanced-reset" class="text-button">Restaurar flat</button><button id="advanced-undo" class="text-button">Desfazer</button><span id="advanced-dirty" class="secondary"></span></div>
    <p id="advanced-eq-status" class="capability"></p>
    <div class="response-wrap"><div class="response-scale"><span>+24 dB</span><span>0 dB</span><span>−24 dB</span></div><svg id="advanced-eq-graph" viewBox="0 0 860 180" role="img" aria-label="Curva de resposta calculada; linha contínua L e tracejada R"><path class="response-grid" d="M0 0H860M0 45H860M0 90H860M0 135H860M0 180H860M215 0V180M430 0V180M645 0V180"/><path id="advanced-eq-response"/><path id="advanced-eq-response-right"/><g id="advanced-eq-points"></g></svg></div><div class="response-axis"><span>10 Hz</span><span>100 Hz</span><span>1 kHz</span><span id="advanced-max-hz"></span></div>
    <div class="advanced-toolbar"><label class="preamp-inline">Pré-amplificação <input id="advanced-preamp" type="range" min="-24" max="12" step="0.5" value="0"><output id="advanced-preamp-value">0 dB</output></label><button id="advanced-add-filter" class="text-button">Adicionar filtro</button></div>
    <p id="advanced-scheme" class="secondary"></p><div id="advanced-bands" tabindex="0" aria-label="Bandas do equalizador, role horizontalmente"></div>
    <div id="advanced-filter-table" class="filter-scroll"><table><thead><tr><th>Ativo</th><th>Tipo</th><th>Frequência Hz</th><th>Ganho dB</th><th>Q</th><th>Inclinação dB/oit.</th><th>Canal</th><th>Ação</th></tr></thead><tbody id="advanced-filters"></tbody></table></div>
    <p id="advanced-headroom" class="secondary"></p>
    <details class="preset-panel" open><summary>Presets e escopo</summary><p class="secondary">Precedência de referência: sessão → faixa → gênero → dispositivo → global. Neste editor, os escopos persistidos são sessão e perfil de dispositivo.</p><div class="advanced-toolbar"><label>Escopo<select id="advanced-preset-scope"><option value="session">Sessão</option><option value="device">Dispositivo (perfil)</option></select></label><label>Perfil<input id="advanced-device" maxlength="60" value="Perfil local"></label><label>Preset<select id="advanced-preset"><option value="">Escolher…</option></select></label><label>Nome<input id="advanced-preset-name" maxlength="80" placeholder="Meu ajuste"></label></div><div class="advanced-toolbar"><button id="advanced-preset-load" class="text-button">Carregar</button><button id="advanced-preset-save" class="text-button">Salvar como</button><button id="advanced-preset-rename" class="text-button">Renomear</button><button id="advanced-preset-duplicate" class="text-button">Duplicar</button><button id="advanced-preset-delete" class="text-button">Excluir</button><button id="advanced-preset-import" class="text-button">Importar JSON</button><button id="advanced-preset-export" class="text-button">Exportar JSON</button></div><input id="advanced-preset-file" type="file" accept=".json,application/json" hidden></details>
    <p id="advanced-eq-feedback" role="status" aria-live="polite">Curva calculada da mesma instância compartilhada pelo painel rápido e pelo fluxo DSP.</p>`;
  document.body.append(dialog);
  $('advanced-eq-close').innerHTML='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  if(!document.getElementById('eq-flat-style')){const s=document.createElement('style');s.id='eq-flat-style';s.textContent='.advanced-band[data-flat]{opacity:.55}.advanced-band[data-flat] output::after{content:"";display:inline-block;width:.9em;height:.9em;margin-left:.3em;vertical-align:-.1em;background:currentColor;-webkit-mask:var(--icon-bypass) center/contain no-repeat;mask:var(--icon-bypass) center/contain no-repeat;color:var(--text-muted)}';document.head.append(s);}
  function renderPresets(){const select=$('advanced-preset'),selected=select.value;select.replaceChildren(new Option('Escolher…',''));model.presets.forEach((p,i)=>{if(p.mode===model.mode&&p.scope===model.scope&&(p.scope!=='device'||p.device===model.device))select.add(new Option(p.name,String(i)));});select.value=selected;}
  function renderBands(){
    $('advanced-bands').hidden=model.mode==='parametric';$('advanced-filter-table').hidden=model.mode!=='parametric';$('advanced-add-filter').hidden=model.mode!=='parametric';
    $('advanced-add-filter').disabled=base().filters.length>=32;
    $('advanced-scheme').textContent=model.mode==='31'?'31 centros normalizados de 1/3 de oitava.':model.mode==='20'||model.mode==='64'?`${model.mode} centros logarítmicos: f(i) = 20 × 1000^(i / (${model.mode} − 1)) Hz; 20 Hz a 20 kHz.`:model.mode==='10'?'10 centros fixos · ganho ±15 dB no editor avançado. O painel clássico mantém ±12 dB.':'Até 32 filtros independentes. Inclinação aplicada em cascata para passa-altas/baixas. Canal L contínuo, R tracejado.';
    $('advanced-bands').replaceChildren();$('advanced-filters').replaceChildren();
    if(model.mode!=='parametric')centers[model.mode].forEach((hz,i)=>{const g=base().gains[i];const label=document.createElement('label');label.className='advanced-band';if(g===0)label.dataset.flat='true';label.append(Object.assign(document.createElement('span'),{textContent:labelHz(hz)}));const input=Object.assign(document.createElement('input'),{type:'range',min:-15,max:15,step:.5,value:g,disabled:hz>maximum()});input.dataset.graphic=i;input.setAttribute('aria-label',labelHz(hz)+', ganho em decibéis'+(g===0?' · bypass interno por ganho zero':''));input.title=hz>maximum()?'Indisponível: frequência acima de 0,45 × Fs':g===0?'Ganho 0 dB: banda em bypass interno para desempenho. Duplo clique para ajustar.':'Duplo clique: 0 dB. Shift + seta: 2 dB.';const out=document.createElement('output');out.textContent=g+' dB';label.append(input,out);$('advanced-bands').append(label);});
    else base().filters.forEach((f,i)=>{const row=document.createElement('tr');row.dataset.filterRow=i;
      const field=(name,input)=>{const td=document.createElement('td');input.dataset.field=name;input.setAttribute('aria-invalid','false');input.setAttribute('aria-label',`Filtro ${i+1}: ${name}`);td.append(input);row.append(td);return input;};
      field('enabled',Object.assign(document.createElement('input'),{type:'checkbox',checked:f.enabled}));const type=field('type',document.createElement('select'));Object.entries(types).forEach(([v,t])=>type.add(new Option(t,v)));type.value=f.type;
      for(const [name,min,max,step] of [['frequency',10,maximum(),.1],['gain',-24,24,.5],['q',.1,18,.1]]){
        const input=field(name,Object.assign(document.createElement('input'),{type:'number',min,max,step,value:f[name]}));
        if(name==='gain'&&!['peaking','lowshelf','highshelf'].includes(f.type)){input.disabled=true;input.title='Este tipo de filtro não possui controle de ganho.';}
        if(name==='frequency'&&f.frequency>maximum()){input.setAttribute('aria-invalid','true');input.title='Acima de 0,45 × Fs: filtro indisponível, sem reajuste oculto. Reduza a frequência para habilitá-lo.';}
      }
      const slope=field('slope',document.createElement('select'));[12,24,36,48].forEach(n=>slope.add(new Option(n,n)));slope.value=f.slope;slope.disabled=!['lowpass','highpass'].includes(f.type);slope.title=slope.disabled?'Inclinação aplicável a filtros passa-altas e passa-baixas':'Cascata de seções de 12 dB/oitava';
      const channel=field('channel',document.createElement('select'));['Both','Left','Right'].forEach(c=>channel.add(new Option({Both:'Ambos',Left:'Esquerdo',Right:'Direito'}[c],c)));channel.value=f.channel;
      const td=document.createElement('td'),remove=document.createElement('button');remove.className='text-button';remove.textContent='Remover';remove.dataset.removeFilter=i;remove.setAttribute('aria-label','Remover filtro '+(i+1));td.append(remove);row.append(td);$('advanced-filters').append(row);
    });renderPresets();sync();
  }
  function filterDescriptions(){return model.mode==='parametric'?base().filters:centers[model.mode].map((hz,i)=>({type:'peaking',frequency:hz,gain:base().gains[i],q:window.VynampEqualizerState.qFor(+model.mode),enabled:true,channel:'Both',slope:12}));}
  function draw(){
    const n=320,frequencies=Float32Array.from({length:n},(_,i)=>10*(maximum()/10)**(i/(n-1))),responses=[new Float32Array(n).fill(base().preamp),new Float32Array(n).fill(base().preamp)];
    for(const [index,f] of filterDescriptions().entries()){
      if(!f.enabled||f.frequency>maximum())continue;
      const key=model.mode+':'+index,signature=[context().sampleRate,f.type,f.frequency,f.gain,f.q,f.slope].join('|');
      let cached=responseCache.get(key);
      if(!cached){cached={node:context().createBiquadFilter(),response:new Float32Array(n),magnitude:new Float32Array(n),phase:new Float32Array(n)};responseCache.set(key,cached);}
      if(cached.signature!==signature){
        const {node,magnitude,phase}=cached;node.type=f.type;node.frequency.value=f.frequency;node.gain.value=f.gain;node.Q.value=f.q;
        node.getFrequencyResponse(frequencies,magnitude,phase);const repetitions=['lowpass','highpass'].includes(f.type)?f.slope/12:1;
        for(let i=0;i<n;i++)cached.response[i]=20*Math.log10(Math.max(1e-8,magnitude[i]))*repetitions;
        cached.signature=signature;
      }
      for(let ch=0;ch<2;ch++)if(f.channel==='Both'||(ch===0&&f.channel==='Left')||(ch===1&&f.channel==='Right'))for(let i=0;i<n;i++)responses[ch][i]+=cached.response[i];
    }
    const maximumGain=Math.max(...responses[0],...responses[1]);
    $('advanced-headroom').textContent=maximumGain>.05?`Atenção: pico de resposta combinado ≈ +${maximumGain.toFixed(1)} dB. Reduza o pré-amplificador para preservar headroom. Não é uma medição de true peak.`:`Pico de resposta combinado ≈ ${maximumGain.toFixed(1)} dB. Estimativa da configuração, não medição de true peak.`;
    responses.forEach((values,ch)=>{$(ch?'advanced-eq-response-right':'advanced-eq-response').setAttribute('d',Array.from(values,(value,i)=>(i?'L':'M')+(i*860/(n-1)).toFixed(2)+' '+Math.max(0,Math.min(180,90-value*3.75)).toFixed(2)).join(''));});
    $('advanced-max-hz').textContent=labelHz(maximum());
    document.querySelectorAll('.response-axis span').forEach((el,i)=>{const hz=[10,100,1000,maximum()][i];el.style.left=(Math.log(hz/10)/Math.log(maximum()/10)*100)+'%';});
    const points=$('advanced-eq-points');points.replaceChildren();filterDescriptions().forEach((f,i)=>{if(!f.enabled||f.frequency>maximum())return;const c=document.createElementNS('http://www.w3.org/2000/svg','circle');c.setAttribute('cx',Math.log(f.frequency/10)/Math.log(maximum()/10)*860);c.setAttribute('cy',Math.max(3,Math.min(177,90-f.gain*3.75)));c.setAttribute('r','5');c.dataset.point=i;points.append(c);});
  }
  launch.addEventListener('click',()=>{$('eq-dialog').close();model.enabled=api.state.eqEnabled;model.modes['10'].gains=api.state.eqBands.slice();model.modes['10'].preamp=api.state.eqPreamp;validationContext=null;$('advanced-preset-scope').value=model.scope;$('advanced-device').value=model.device;renderBands();dialog.showModal();});
  $('advanced-eq-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>$('eq-open').focus());
  $('advanced-eq-mode').onchange=e=>{model.mode=e.target.value;note('Modo alterado; ajustes dos outros modos foram preservados.');renderBands();};
  $('advanced-eq-enabled').onclick=()=>{remember();model.enabled=!model.enabled;sync();};
  $('advanced-reset').onclick=()=>{remember();model.modes[model.mode]=empty(model.mode);renderBands();note('Modo atual restaurado para flat. Os demais modos foram preservados.');};
  $('advanced-undo').onclick=()=>{if(api.equalizerRegistry){api.equalizerRegistry.undo();return;}const previous=history.pop();if(!previous)return;model.mode=previous.mode;model.modes[model.mode]=previous.value;model.enabled=previous.enabled;renderBands();note('Última edição desfeita.');};
  $('advanced-preamp').oninput=e=>{remember();base().preamp=+e.target.value;sync();};
  $('advanced-bands').oninput=e=>{if(e.target.dataset.graphic===undefined)return;remember();base().gains[+e.target.dataset.graphic]=+e.target.value;e.target.nextElementSibling.textContent=e.target.value+' dB';e.target.setAttribute('aria-valuetext',e.target.value+' decibéis');sync();};
  $('advanced-bands').ondblclick=e=>{if(e.target.matches('input')){e.target.value=0;e.target.dispatchEvent(new Event('input',{bubbles:true}));}};
  $('advanced-bands').onkeydown=e=>{if(e.shiftKey&&e.target.matches('input')&&['ArrowUp','ArrowDown','ArrowRight','ArrowLeft'].includes(e.key)){e.preventDefault();e.target.value=Math.max(-15,Math.min(15,+e.target.value+(['ArrowUp','ArrowRight'].includes(e.key)?2:-2)));e.target.dispatchEvent(new Event('input',{bubbles:true}));}};
  $('advanced-add-filter').onclick=()=>{if(base().filters.length>=32)return;remember();base().filters.push({type:'peaking',frequency:1000,gain:0,q:1,slope:12,channel:'Both',enabled:true});renderBands();};
  $('advanced-filters').addEventListener('change',e=>{const field=e.target.dataset.field,row=e.target.closest('[data-filter-row]');if(!field||!row)return;let value=e.target.type==='checkbox'?e.target.checked:e.target.type==='number'||field==='slope'?+e.target.value:e.target.value;
    if(e.target.type==='number'&&(!e.target.value||!e.target.checkValidity())){e.target.setAttribute('aria-invalid','true');note(field==='frequency'?`Frequência inválida: use 10 a ${maximum()} Hz (0,45 × Fs).`:`Valor inválido: ${e.target.min} a ${e.target.max}.`);return;}
    e.target.setAttribute('aria-invalid','false');remember();base().filters[+row.dataset.filterRow][field]=value;if(field==='type')renderBands();else sync();note('Filtro atualizado na instância compartilhada. '+(api.equalizerRegistry?api.equalizerRegistry.status():'Configuração de referência.'));});
  $('advanced-filters').addEventListener('click',e=>{const button=e.target.closest('[data-remove-filter]');if(button){remember();base().filters.splice(+button.dataset.removeFilter,1);renderBands();$('advanced-add-filter').focus();}});
  $('advanced-eq-graph').addEventListener('pointerdown',e=>{if(e.target.dataset.point===undefined)return;remember();dragging=+e.target.dataset.point;e.currentTarget.setPointerCapture(e.pointerId);});
  $('advanced-eq-graph').addEventListener('pointermove',e=>{if(dragging===null)return;const matrix=e.currentTarget.getScreenCTM();if(!matrix)return;const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),gain=Math.max(-24,Math.min(24,(90-point.y)/3.75));if(model.mode==='parametric'){const f=base().filters[dragging];f.frequency=Math.max(10,Math.min(maximum(),10*(maximum()/10)**(point.x/860)));f.gain=Math.round(gain*2)/2;}else base().gains[dragging]=Math.max(-15,Math.min(15,Math.round(gain*2)/2));if(!frame)frame=requestAnimationFrame(()=>{frame=0;renderBands();});});
  $('advanced-eq-graph').addEventListener('pointerup',()=>{dragging=null;});$('advanced-eq-graph').addEventListener('pointercancel',()=>{dragging=null;});
  $('advanced-preset-scope').onchange=e=>{model.scope=e.target.value;renderPresets();persist();};$('advanced-device').onchange=e=>{model.device=e.target.value.trim()||'Perfil local';renderPresets();persist();};
  const chosen=()=>model.presets[+$('advanced-preset').value];
  const presetName=()=>$('advanced-preset-name').value.trim();
  $('advanced-preset-save').onclick=()=>{if(!presetName()){note('Digite um nome para o preset.');$('advanced-preset-name').focus();return;}if(model.presets.length>=100){note('Limite de 100 presets. Exclua um antes de salvar.');return;}model.presets.push({name:presetName(),mode:model.mode,scope:model.scope,device:model.device,value:clone(base())});model.baseline[model.mode]=JSON.stringify(base());renderPresets();$('advanced-preset').value=model.presets.length-1;sync();note('Preset salvo neste modo e escopo.');};
  $('advanced-preset-load').onclick=()=>{if($('advanced-preset').value===''){note('Escolha um preset para carregar.');return;}remember();model.modes[model.mode]=clone(chosen().value);model.baseline[model.mode]=JSON.stringify(base());renderBands();note('Preset carregado.');};
  $('advanced-preset-rename').onclick=()=>{if($('advanced-preset').value===''||!presetName()){note('Selecione um preset e digite o novo nome.');return;}chosen().name=presetName();renderPresets();persist();note('Preset renomeado.');};
  $('advanced-preset-duplicate').onclick=()=>{if($('advanced-preset').value===''||model.presets.length>=100){note('Escolha um preset; máximo de 100.');return;}const p=clone(chosen());p.name=(p.name+' (cópia)').slice(0,80);model.presets.push(p);renderPresets();persist();note('Preset duplicado.');};
  $('advanced-preset-delete').onclick=()=>{if($('advanced-preset').value===''){note('Escolha um preset para excluir.');return;}const index=+$('advanced-preset').value;if(confirm('Excluir este preset? Os ajustes atuais serão preservados.')){model.presets.splice(index,1);renderPresets();persist();note('Preset excluído.');}};
  $('advanced-preset-export').onclick=()=>{const data={version:1,mode:model.mode,name:presetName()||'Vynamp EQ',value:base(),origin:'Ajuste local do usuário',license:'Definida pelo usuário'};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='vynamp-eq-'+model.mode+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);note('Preset exportado como JSON.');};
  $('advanced-preset-import').onclick=()=>$('advanced-preset-file').click();$('advanced-preset-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1024*1024)throw Error('Arquivo maior que 1 MiB.');const p=JSON.parse(await file.text());if(p.version!==1||!modes.includes(p.mode)||!validMode(p.value,p.mode)||typeof p.name!=='string'||p.name.length>80)throw Error('Formato, versão ou valores fora dos limites.');if(p.value.filters.some(f=>f.frequency>maximum()))throw Error('Frequência acima de 0,45 × Fs; nenhuma correção automática foi aplicada.');remember();model.mode=p.mode;model.modes[p.mode]=clone(p.value);renderBands();note(`Importado: ${p.name}. Origem: ${typeof p.origin==='string'?p.origin:'não informada'}. Licença: ${typeof p.license==='string'?p.license:'não informada'}.`);}catch(error){note('Erro de preset: '+error.message);}finally{e.target.value='';}};
  // The classic editor and advanced editor share the ten-band values and enable state.
  function adoptClassic(){model.mode='10';model.modes['10'].gains=api.state.eqBands.slice();model.modes['10'].preamp=api.state.eqPreamp;model.enabled=api.state.eqEnabled;api.applyEQ();persist();}
  $('eq-dialog').addEventListener('input',adoptClassic);
  $('eq-enabled').addEventListener('click',adoptClassic);$('eq-reset').addEventListener('click',adoptClassic);
  window.VynampEQController={
    shared:()=>window.VynampEqualizerState.validate({version:1,mode:model.mode,enabled:model.enabled,modes:model.modes}),
    adopt:(snapshot,render=true)=>{const value=window.VynampEqualizerState.validate(snapshot);model={...model,...value};api.state.advancedEQ=model;if(render&&dialog.open)renderBands();else sync();},
    refresh:()=>sync(),open:()=>launch.click()
  };
  sync();
})();
