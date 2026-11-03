'use strict';
window.VynampAudioControl=(()=>{
  let editor,editing;
  const number=(value,unit)=>value.toLocaleString('pt-BR',{maximumFractionDigits:3})+(unit===':1'?':1':unit?' '+unit:'');
  function exactEditor(){
    if(editor)return editor;
    editor=document.createElement('dialog');editor.id='parameter-exact-dialog';editor.setAttribute('aria-labelledby','parameter-exact-title');
    editor.innerHTML='<form id="parameter-exact-form"><h2 id="parameter-exact-title">Valor exato</h2><label id="parameter-exact-label" for="parameter-exact-value"></label><input id="parameter-exact-value" type="number" required><p id="parameter-exact-error" role="alert"></p><div class="parameter-exact-actions"><button id="parameter-exact-cancel" class="text-button" type="button">Cancelar</button><button id="parameter-exact-apply" class="text-button" type="submit">Confirmar</button></div></form>';
    document.body.append(editor);
    const input=editor.querySelector('input');
    editor.querySelector('form').onsubmit=e=>{e.preventDefault();if(!editing||editing.input.disabled||!editing.input.isConnected){editor.close();return;}if(!input.checkValidity()){input.reportValidity();return;}editing.input.value=input.value;editing.input.dispatchEvent(new Event('input',{bubbles:true}));if(editing.input.dataset.changeRejected==='true'){editor.querySelector('#parameter-exact-error').textContent=editing.input.dataset.rejectionMessage||'Verifique os limites deste parâmetro.';input.setAttribute('aria-invalid','true');input.focus();return;}editing.input.dispatchEvent(new Event('change',{bubbles:true}));editor.close();};
    editor.querySelector('#parameter-exact-cancel').onclick=()=>editor.close();
    editor.addEventListener('close',()=>{editing?.button?.isConnected&&editing.button.focus({preventScroll:true});editing=null;});
    return editor;
  }
  function create(f,value,{id,disabled=false,title=''}={}){
    const wrapper=document.createElement('div');wrapper.className='dsp-field audio-control';
    const label=document.createElement('label');label.className='parameter-label';label.htmlFor=id;label.textContent=f.label;
    const input=document.createElement(f.type==='select'?'select':'input');input.id=id;input.dataset.dspField=f.id;input.disabled=disabled;input.title=title;
    wrapper.append(label);
    if(f.type==='checkbox'){
      wrapper.classList.add('switch-control');input.type='checkbox';input.checked=value;input.setAttribute('role','switch');wrapper.append(input);return wrapper;
    }
    if(f.type==='select'){
      f.options.forEach(v=>input.add(new Option(v,v)));input.value=value;wrapper.append(input);return wrapper;
    }
    if(f.type==='text'){
      input.type='text';input.value=value;input.maxLength=200;wrapper.append(input);return wrapper;
    }
    const slider=['ms','s','samples'].includes(f.unit)||['mix','width','balance','pan','tempo','strength','smoothing','density'].includes(f.id);
    const log=!slider&&f.min>0&&(f.unit==='Hz'||f.id==='q')&&f.max/f.min>=10;
    wrapper.classList.add(slider?'slider-control':'knob-control');
    // Imported values inside the documented limits remain exact; step controls gestures.
    input.type='range';input.min=f.min;input.max=f.max;input.step='any';input.value=value;
    const fraction=v=>log?Math.log(v/f.min)/Math.log(f.max/f.min):(v-f.min)/(f.max-f.min);
    const fromFraction=p=>log?f.min*(f.max/f.min)**p:f.min+p*(f.max-f.min);
    const snap=v=>Math.max(f.min,Math.min(f.max,+(f.min+Math.round((v-f.min)/f.step)*f.step).toFixed(6)));
    const stage=document.createElement('div');stage.className='parameter-stage';
    if(!slider){stage.innerHTML='<svg class="knob-face" viewBox="0 0 80 80" aria-hidden="true"><path class="knob-track" d="M18.787 61.213A30 30 0 1 1 61.213 61.213" pathLength="100"/><path class="knob-fill" d="M18.787 61.213A30 30 0 1 1 61.213 61.213" pathLength="100"/><circle class="knob-dial" cx="40" cy="40" r="23"/><path class="knob-pointer" d="M40 25V20"/></svg>';input.className='knob-input';}
    else input.className='parameter-slider';
    stage.append(input);wrapper.append(stage);
    const readout=document.createElement('button');readout.type='button';readout.className='parameter-readout';readout.dataset.editParameter=f.id;readout.disabled=disabled;readout.setAttribute('aria-label','Editar '+f.label+', valor exato');wrapper.append(readout);
    const paint=()=>{const v=+input.value,p=fraction(v);readout.textContent=number(v,f.unit);input.setAttribute('aria-valuetext',number(v,f.unit));wrapper.style.setProperty('--parameter-position',Math.max(0,Math.min(1,p)));if(!slider){stage.querySelector('.knob-fill').style.strokeDasharray=`${p*100} 100`;stage.querySelector('.knob-pointer').setAttribute('transform',`rotate(${-135+p*270} 40 40)`);}};
    input.addEventListener('input',paint);input.addEventListener('change',paint);input.addEventListener('parameter-sync',paint);
    const set=(v,quantize=true)=>{input.value=quantize?snap(v):Math.max(f.min,Math.min(f.max,+v.toFixed(6)));input.dispatchEvent(new Event('input',{bubbles:true}));if(input.dataset.changeRejected!=='true')input.dispatchEvent(new Event('change',{bubbles:true}));};
    if(!slider){
      let gesture;
      input.addEventListener('pointerdown',e=>{if(input.disabled||e.button!==0)return;e.preventDefault();input.focus({preventScroll:true});gesture={y:e.clientY,p:fraction(+input.value),fine:e.shiftKey};input.setPointerCapture(e.pointerId);});
      input.addEventListener('pointermove',e=>{if(!gesture)return;const p=Math.max(0,Math.min(1,gesture.p+(gesture.y-e.clientY)/(gesture.fine?1200:180)));set(fromFraction(p));});
      input.addEventListener('pointerup',()=>{gesture=null;});input.addEventListener('pointercancel',()=>{gesture=null;});
    }
    input.addEventListener('keydown',e=>{if(!['ArrowUp','ArrowRight','ArrowDown','ArrowLeft','Home','End','PageUp','PageDown'].includes(e.key))return;e.preventDefault();const direction=['ArrowUp','ArrowRight','PageUp'].includes(e.key)?1:-1;set(e.key==='Home'?f.min:e.key==='End'?f.max:+input.value+direction*(e.key.startsWith('Page')?(f.max-f.min)/10:log?Math.max(f.step/10,+input.value*(e.shiftKey?.001:.01)):f.step/(e.shiftKey?10:1)),false);});
    input.addEventListener('dblclick',()=>{if(!input.disabled)set(f.value);});
    readout.onclick=()=>{
      if(input.disabled)return;const modal=exactEditor(),field=modal.querySelector('input');editing={input,button:readout};modal.querySelector('h2').textContent=f.label;modal.querySelector('label').textContent=`Valor em ${f.unit||'unidades'} · ${f.min} a ${f.max}`;field.min=f.min;field.max=f.max;field.step='any';field.value=input.value;field.setAttribute('aria-invalid','false');modal.querySelector('#parameter-exact-error').textContent='';modal.showModal();field.focus();field.select();
    };
    paint();return wrapper;
  }
  return {create};
})();
