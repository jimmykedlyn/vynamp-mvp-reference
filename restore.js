'use strict';
(() => {
 const $=id=>document.getElementById(id),api=window.VynampReference,M=window.VynampRestoreModel,root=document.documentElement,audio=$('audio'),engine=new VynampRestoreEngine(api),workspace=document.querySelector('.workspace');
 const icon=VynampIcons.svg('sparkle');
 const launch=document.createElement('button');launch.id='restore-open';launch.className='icon-button';launch.setAttribute('aria-label','Abrir Vynamp Restore');launch.title='Restaurar a faixa em reprodução';launch.innerHTML=icon+'<span class=restore-launch-label>Restore</span>';document.querySelector('.appbar').insertBefore(launch,$('preferences'));
 const menu=document.createElement('button');menu.type='button';menu.setAttribute('role','menuitem');VynampIcons.lead(menu,'sparkle','Vynamp Restore · restaurar faixa');menu.onclick=()=>{$('main-menu').hidePopover();open();};$('main-menu').append(menu);
 const svg=VynampIcons.svg;
 const powerIcon=svg('power');
 const panel=document.createElement('section');panel.id='restore-workspace';panel.hidden=true;panel.setAttribute('aria-labelledby','restore-title');
 panel.innerHTML=`<header class="restore-header"><div><div class="eyebrow">RESTAURAÇÃO DE ÁUDIO</div><h2 id="restore-title">Vynamp <span>Restore</span></h2><p id="restore-track"></p></div><span id="restore-state">Original</span><button id="restore-close" class="icon-button" aria-label="Fechar Restore e voltar à biblioteca">${svg('close')}</button></header>
 <div class="restore-toolbar"><button id="restore-open-audio">${svg('folder')}<span>Abrir áudio</span></button><button id="restore-diagnose" class="restore-analyze" title="Procura estalos, saturação, zumbido e ruído" aria-label="Analisar faixa">${VynampIcons.svg('diagnose')}<span>Analisar faixa</span></button><span class="restore-toolbar-gap"></span><button id="restore-enable" class="restore-primary" aria-pressed="false">Ativar tratamento</button><div class="restore-monitor" role="group" aria-label="Comparação de áudio"><button data-restore-monitor="original">Original</button><button data-restore-monitor="treated">Tratado</button><button data-restore-monitor="removed">Só removido</button></div><div class="restore-history" role="group" aria-label="Histórico de correções"><button id="restore-undo" title="Desfazer correção" aria-label="Desfazer correção">${svg('undo')}</button><button id="restore-redo" title="Refazer correção" aria-label="Refazer correção">${svg('redo')}</button></div></div>
 <section id="restore-diagnostics" class="restore-assistant" aria-label="Assistente de restauração" aria-live="polite"></section>
<div class="restore-content"><div class="restore-edit"><div class="restore-viewbar"><span id="restore-range-label"></span><div><button id="restore-zoom-in" title="Aproximar seleção" aria-label="Aproximar seleção">${svg('plus')}</button><button id="restore-zoom-out" title="Afastar" aria-label="Afastar visualização">${svg('minus')}</button><button id="restore-fit">Faixa inteira</button><button id="restore-focus-selection">Ver seleção</button></div></div>
 <div class="restore-compare-bar"><div class="restore-compare" role="group" aria-label="Comparação visual Original × Tratado"><button data-restore-compare="off">Normal</button><button data-restore-compare="wipe" title="Original à esquerda do divisor, Tratado à direita">Cortina</button><button data-restore-compare="stacked" title="Original em cima, Tratado embaixo">Empilhado</button></div><label class="restore-compare-split" hidden>Divisor <input id="restore-compare-split" type="range" min=".02" max=".98" step=".01" value=".5" aria-label="Posição do divisor Original/Tratado"></label><small id="restore-compare-stats" aria-live="polite"></small></div>
 <canvas id="restore-wave" height="140" tabindex="0" role="img" aria-label="Waveform estéreo. Arraste para selecionar uma região; use os campos de entrada e saída para ajuste por teclado."></canvas><canvas id="restore-spectrum" height="160" role="img" aria-label="Espectrograma do canal selecionado"></canvas>
 <div class="restore-axis"><span id="restore-view-start">0:00</span><span id="restore-spectrum-note">Abra áudio local para análise real</span><span id="restore-view-end">0:00</span></div>
 <div class="restore-selection"><label>Entrada <input id="restore-start" type="number" min="0" step=".01" value="0"> s</label><label>Saída <input id="restore-end" type="number" min="0" step=".01" value="0"> s</label><button id="restore-add-region">${svg('plus')}<span>Região</span></button><button id="restore-loop" aria-pressed="false">Loop da seleção</button><button id="restore-channel" title="Canal do espectrograma">Espectro L</button></div>
 <div class="restore-region-heading"><h3>REGIÕES</h3><span id="restore-region-count">0 correções</span></div><div id="restore-regions" role="group" aria-label="Regiões de correção"></div>
 <p class="restore-ai-note"><strong>Vinheta sobreposta:</strong> pode ser marcada neste editor. Separação de voz e reconstrução por IA ainda não estão implementadas; atenuar reduz toda a mistura.</p></div>
 <aside class="restore-inspector" aria-label="Tratamento e propriedades"><h3>TRATAMENTO AO VIVO</h3><div class="restore-scope" role="group" aria-label="Alcance dos filtros"><button data-restore-scope="all">Faixa inteira</button><button data-restore-scope="regions">Só regiões</button></div>
 <label class="restore-preset-label"><span>Preset</span><select id="restore-preset-select" aria-label="Preset de restauração"><option value="">— Personalizado —</option></select></label>
 <div class="restore-tool restore-tool-key"><label for="restore-declip">Anti-saturação <output id="restore-declip-value">Off</output></label><input id="restore-declip" type="range" min="0" max="12" step=".5" value="0" aria-label="Folga da anti-saturação em dB"><small>Abaixa o nível e arredonda picos acima de −1 dBFS. Resolve estalos de faixas saturadas.</small></div>
 <div class="restore-tool"><button id="restore-click" aria-pressed="false">De-click <span>Impulsos curtos</span></button><label for="restore-sensitivity">Sensibilidade <output id="restore-sensitivity-value"></output></label><input id="restore-sensitivity" type="range" min=".03" max=".9" step=".01" value=".2"><small>Limiar menor repara mais impulsos; pode afetar percussão.</small></div>
 <div class="restore-tool"><label for="restore-decrackle">De-crackle <output id="restore-decrackle-value">Off</output></label><input id="restore-decrackle" type="range" min="0" max=".5" step=".01" value="0"><div class="restore-hum" role="group" aria-label="Modo do De-crackle"><button data-restore-crackle-mode="soft">Suave</button><button data-restore-crackle-mode="strong">Forte</button></div><small>Suave corta só o excesso do estalo e preserva os agudos. Forte refaz o trecho inteiro: tira mais ruído, pode abafar. Mais alto = mais agressivo.</small></div>
 <div class="restore-tool"><label for="restore-deartifact">Artefatos MP3 <output id="restore-deartifact-value">Off</output></label><input id="restore-deartifact" type="range" min="0" max="1" step=".05" value="0"><small>Tira o chiado borbulhante dos agudos e o pré-eco antes das batidas. Atrasa ~21 ms.</small></div>
 <div class="restore-tool"><label for="restore-bwe">Extensão de agudos <output id="restore-bwe-value">Off</output></label><input id="restore-bwe" type="range" min="0" max="1" step=".05" value="0"><label for="restore-bwe-cutoff">Corte original <output id="restore-bwe-cutoff-value">16,0 kHz</output></label><input id="restore-bwe-cutoff" type="range" min="8000" max="22000" step="100" value="16000"><small>Recria os agudos acima do corte do MP3 a partir da oitava abaixo. Use o corte que o diagnóstico encontrou.</small></div>
 <div class="restore-tool"><button id="restore-dc" aria-pressed="false">DC <span>Centralizar sinal</span></button><small>Bloqueio de DC · 5 Hz</small></div>
 <div class="restore-tool"><label>Zumbido de rede</label><div class="restore-hum" role="group" aria-label="Frequência do hum"><button data-restore-hum="0">Off</button><button data-restore-hum="50">50 Hz</button><button data-restore-hum="60">60 Hz</button></div><small>Fundamental + 2 harmônicos</small></div>
 <div class="restore-tool"><button id="restore-hum-adaptive" aria-pressed="false">Hum adaptativo <span>Auto-detectar fundamental</span></button><small>Upgrade do notch fixo: detecta 50/60Hz automaticamente.</small></div>
 <div class="restore-tool"><label for="restore-rumble">De-rumble <output id="restore-rumble-value">Off</output></label><input id="restore-rumble" type="range" min="0" max="80" step="5" value="0"><small>Filtro passa-altas Butterworth 2ª ordem · fase preservada</small></div>
 <div class="restore-tool"><button id="restore-gate" aria-pressed="false">Gate <span>Ruído em pausas</span></button><label for="restore-threshold">Limiar <output id="restore-threshold-value">−45 dB</output></label><input id="restore-threshold" type="range" min="-72" max="-12" step="1" value="-45"><small>Não é redução espectral de chiado</small></div>
 <div class="restore-region-properties"><h3>REGIÃO SELECIONADA</h3><div class="restore-kind" role="group" aria-label="Tipo de vinheta"><button data-restore-kind="between">Entre faixas</button><button data-restore-kind="overlay">Sobreposta · IA</button></div><label for="restore-region-gain">Atenuação <output id="restore-gain-value">0 dB</output></label><input id="restore-region-gain" type="range" min="-90" max="0" step="1" value="0"><label for="restore-fade">Fade nas bordas <output id="restore-fade-value">20 ms</output></label><input id="restore-fade" type="range" min="5" max="500" step="5" value="20"><button id="restore-preview-region">Ouvir região</button><button id="restore-mute-region">Silenciar região</button><button id="restore-remove-region">Remover correção</button><small>Mantém a duração original. Fechar espaços e reconstrução de voz são etapas futuras.</small></div>
 <div class="restore-files"><button id="restore-project-save">Salvar projeto JSON</button><button id="restore-project-load">Importar projeto</button><label class="restore-normalize-label"><input id="restore-normalize" type="checkbox"> Normalizar para −1 dBFS</label><label class="restore-limiter-label" title="True-peak limiter look-ahead aplicado apenas na exportação"><input id="restore-limiter" type="checkbox" checked> Limiter −1 dBTP</label><button id="restore-export" class="restore-primary">Exportar tratado · WAV</button><button id="restore-cancel" hidden>Cancelar exportação</button><small id="restore-export-detail">Exporta cópia float32, usando Tratado. Original preservado.</small><input id="restore-project-file" type="file" accept=".json,application/json" hidden></div>
 <details class="restore-more"><summary>Lote · vários arquivos</summary><div class="restore-batch"><label class="restore-batch-pick"><input id="restore-batch-files" type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.opus" multiple hidden><button id="restore-batch-select">Selecionar arquivos</button></label><button id="restore-batch-run" disabled>Processar fila</button><button id="restore-batch-cancel" hidden>Cancelar</button><div id="restore-batch-list" role="list" aria-label="Fila de batch"></div><div id="restore-batch-report" hidden></div><small id="restore-batch-detail">Até 32 arquivos. Cada um é diagnosticado e exportado com os parâmetros atuais.</small></div></details></aside></div><footer id="restore-feedback" role="status" aria-live="polite">Abra uma música local para ouvir e exportar o tratamento.</footer>`;
 workspace.append(panel);const projects=new Map();let originLayout='full',openedView='player';let store=new M.Store(0),projectKey='',boundId='',decoded=null,worker=null,workerReady=false,workerURL='',job=0,analysisId=0,exportId=0,exportDSP=null,exportTransport=null,analysis=null,spectrumCache=null,lastPlaying=null,selection={start:0,end:0},selected='',kind='between',view={start:0,end:0},channel=0,loop=false,active=false,drag=null,renderPending=false,savedTimer=0,activation=0;
 // #19 — Split-view Original × Tratado na waveform (render da janela visível no worker)
 const Compare=window.VynampRestoreCompare,COMPARE_KEY='vynamp-restore-compare-v1';let compareMode='off',compareSplit=.5,comparison=null,compareId=0,compareKey='',compareTimer=0,splitDrag=false;
 try{const saved=JSON.parse(localStorage.getItem(COMPARE_KEY));if(saved&&Compare){compareMode=Compare.validMode(saved.mode);compareSplit=Compare.clampSplit(saved.split);}}catch{}
 function saveCompare(){try{localStorage.setItem(COMPARE_KEY,JSON.stringify({mode:compareMode,split:compareSplit}));}catch{}}
 function setSplit(ratio){compareSplit=Compare.clampSplit(ratio);$('restore-compare-split').value=compareSplit;saveCompare();scheduleDraw();}
 function scheduleCompare(){if(!Compare||compareMode==='off'||!workerReady||!worker||view.end<=view.start)return;const s=store.snapshot(),key=[view.start,view.end,s.scope,JSON.stringify(s.tools),JSON.stringify(s.regions)].join('|');if(key===compareKey)return;compareKey=key;clearTimeout(compareTimer);compareTimer=setTimeout(()=>{if(!worker||!workerReady)return;$('restore-compare-stats').textContent='Calculando comparação…';worker.postMessage({type:'compare',id:(compareId=++job),start:view.start,end:view.end,columns:384,state:s});},150);}
 const sec=t=>{const v=Math.max(0,t||0);return Math.floor(v/60)+':'+Math.floor(v%60).toString().padStart(2,'0')+(view.end-view.start<10?'.'+Math.floor(v%1*100).toString().padStart(2,'0'):'');};
 function message(text,tone){const el=$('restore-feedback');el.dataset.tone=tone||'';el.replaceChildren();if(tone==='warning')el.append(VynampIcons.element('alert'));el.append(text);}
 const currentRegion=()=>store.state.regions.find(r=>r.id===selected);
 function fingerprint(t){return t.file?[t.file.name,t.file.size,t.file.lastModified].join('|'):t.id;}
 const PREFS_KEY='vynamp-restore-prefs-v1';
	// ─── Assistente: analisar → corrigir → comparar ─────────────────────────
	// Cada defeito do diagnóstico traz `fix` (valores de ferramentas); o assistente aplica, desfaz e mostra o estado.
	let diagnosticsJob=0,lastReport=null;
	const fixUndo=new Map();
	const DIAG_SEVERITY_LABELS={severe:'Grave',moderate:'Moderado',mild:'Leve'};
	const DIAG_TYPE_LABELS={band_limit:'Agudos cortados',click:'Cliques',crackle:'Crepitação',hum50:'Zumbido 50 Hz',hum60:'Zumbido 60 Hz',hiss:'Chiado',rumble:'Ronco grave',clipping:'Saturação',true_peak:'Picos acima de 0 dB',discontinuity:'Saltos na onda',skip:'Pulos/repetições',dc_offset:'Linha de base deslocada'};
	// Valor "desligado" de cada ferramenta que um `fix` pode tocar.
	const TOOL_OFF={declip:0,click:false,clickThreshold:.2,decrackle:0,hum:0,rumble:0,dc:false,deartifact:0,bwe:0,bweCutoff:16000};
	const escText=text=>String(text??'').replace(/[&<>"]/g,c=>'&#'+c.charCodeAt(0)+';');
	const recommended=d=>!!d.fix&&d.severity!=='mild';
	function fixApplied(fix){return!!fix&&Object.entries(fix).every(([k,v])=>store.state.tools[k]===v);}
	function defectDetail(d){
		if(d.type==='band_limit')return'Corte em '+(d.cutoff/1000).toFixed(1).replace('.',',')+' kHz · degrau de '+Math.round(d.dropDB)+' dB';
		if(d.type==='clipping')return(d.overs?'Picos até '+(d.peakDB>=0?'+':'')+d.peakDB.toFixed(1)+' dBFS · ':'')+d.contiguousBlocks+' trechos achatados';
		if(d.perMinute!==undefined)return d.count+' no total · '+d.perMinute.toLocaleString('pt-BR')+' por minuto';
		if(d.frequency)return d.frequency+' Hz'+(d.harmonics?.length?' e harmônicos':'');
		if(d.truePeakDB!==undefined)return'True peak '+d.truePeakDB.toFixed(1)+' dBTP';
		if(d.rmsDB!==undefined)return'Graves a '+d.rmsDB.toFixed(1)+' dBFS';
		if(d.energyRatio!==undefined)return Math.round(d.energyRatio*100)+'% da energia nos agudos';
		if(Array.isArray(d.channels))return'Deslocamento de '+Math.max(...d.channels.map(c=>Math.abs(c.offset))).toFixed(3);
		if(d.count!==undefined)return d.count+' ocorrência(s)';
		return'';
	}
	async function applyFixes(defects){
		const list=defects.filter(d=>d.fix&&!fixApplied(d.fix));if(!list.length)return;
		for(const d of list)fixUndo.set(d.type,Object.fromEntries(Object.keys(d.fix).map(k=>[k,store.state.tools[k]])));
		store.change(s=>{for(const d of list)Object.assign(s.tools,d.fix);s.monitor='treated';});
		// Corrigir sem ouvir não ajuda: liga o tratamento junto.
		if(!store.state.enabled)await $('restore-enable').onclick();
		if(!store.state.enabled)return;
		message((list.length===1?'Corrigido: '+DIAG_TYPE_LABELS[list[0].type]:list.length+' correções aplicadas')+'. Alterne Original e Tratado para comparar.');
	}
	function undoFix(d){
		const previous=fixUndo.get(d.type)||Object.fromEntries(Object.keys(d.fix).map(k=>[k,TOOL_OFF[k]]));
		fixUndo.delete(d.type);store.change(s=>Object.assign(s.tools,previous));
		message('Correção desfeita: '+(DIAG_TYPE_LABELS[d.type]||d.type)+'.');
	}
	function renderDiagnosticsPanel(report){
		const box=$('restore-diagnostics');if(!box)return;
		lastReport=report&&Array.isArray(report.defects)?report:null;fixUndo.clear();box.dataset.state=lastReport?'report':'intro';
		if(!lastReport){box.innerHTML='<div class="assist-intro">'+VynampIcons.svg('diagnose')+'<p><strong>Comece pela análise.</strong> O Restore procura estalos, saturação, zumbido e ruído e sugere a correção de cada problema.</p><ol class="assist-steps"><li>Analisar faixa</li><li>Corrigir</li><li>Comparar Original × Tratado</li></ol></div>';return;}
		const defects=lastReport.defects;
		let html='<div class="assist-head"><p class="assist-summary">'+escText(lastReport.summary)+'</p>';
		if(defects.some(recommended))html+='<button id="diag-fix-all" class="restore-primary">'+VynampIcons.svg('sparkle')+'<span>Corrigir recomendados</span></button>';
		html+='</div>';
		if(defects.length){
			html+='<ul class="assist-list">';
			defects.forEach((d,i)=>{
				const severity=DIAG_SEVERITY_LABELS[d.severity];
				html+='<li class="assist-row" data-severity="'+escText(d.severity)+'"><span class="assist-sev">'+VynampIcons.svg(severity?d.severity:'info',{className:'diag-severity-'+(severity?d.severity:'none')})+'<em>'+(severity||'Info')+'</em></span>';
				html+='<div class="assist-text"><strong>'+escText(DIAG_TYPE_LABELS[d.type]||d.type)+'</strong><small>'+escText(defectDetail(d))+'</small><p>'+escText(d.suggestion)+'</p>';
				if(d.examples?.length)html+='<div class="assist-times"><span>Ouvir em</span>'+d.examples.slice(0,4).map(t=>'<button class="diag-ts" data-ts="'+t.toFixed(3)+'">'+sec(t)+'</button>').join('')+'</div>';
				html+='</div><div class="assist-fix">'+(d.fix?'<button class="assist-fix-btn" data-fix="'+i+'"></button>':'<small>Sem correção automática</small>')+'</div></li>';
			});
			html+='</ul><p class="assist-foot">Depois de corrigir, alterne <b>Original</b> e <b>Tratado</b> no topo. Ajuste fino fica em Tratamento ao vivo.</p>';
		}
		box.innerHTML=html;syncAssistant();
	}
	// Atualiza só os botões: render() roda a cada mudança e não pode recriar a lista (perderia o foco).
	function syncAssistant(){
		const box=$('restore-diagnostics');if(!box||!lastReport)return;
		for(const btn of box.querySelectorAll('.assist-fix-btn')){const on=fixApplied(lastReport.defects[+btn.dataset.fix].fix);btn.textContent=on?'Desfazer':'Corrigir';btn.setAttribute('aria-pressed',String(on));btn.closest('.assist-row').dataset.fixed=String(on);}
		const all=$('diag-fix-all');if(all){const done=lastReport.defects.filter(recommended).every(d=>fixApplied(d.fix));all.disabled=done;all.lastElementChild.textContent=done?'Recomendados aplicados':'Corrigir recomendados';}
	}
	$('restore-diagnostics').onclick=e=>{
		const time=e.target.closest('.diag-ts');if(time){const t=+time.dataset.ts;if(Number.isFinite(t)){seekTo(t);message('Indo para '+sec(t)+'.');}return;}
		const fix=e.target.closest('.assist-fix-btn');if(fix&&lastReport){const d=lastReport.defects[+fix.dataset.fix];if(fixApplied(d.fix))undoFix(d);else applyFixes([d]);return;}
		if(e.target.closest('#diag-fix-all')&&lastReport)applyFixes(lastReport.defects.filter(recommended));
	};
	$('restore-diagnose').onclick=()=>{
		if(!workerReady||!worker){message('Abra uma música local antes de analisar.');return;}
		const id=++job;diagnosticsJob=id;
		const box=$('restore-diagnostics');lastReport=null;box.dataset.state='busy';box.innerHTML='<p class="assist-busy">Analisando a faixa inteira…</p>';
		message('Analisando a faixa…');
		worker.postMessage({type:'diagnose',id});
	};
	renderDiagnosticsPanel(null);
	const defaultTools={dc:false,hum:0,gate:false,threshold:-45,click:false,clickThreshold:.2};
	function loadPrefs(){try{const raw=JSON.parse(localStorage.getItem(PREFS_KEY));if(!raw||typeof raw!=='object')return{...defaultTools};const t={...defaultTools};for(const k of Object.keys(defaultTools))if(k in raw&&typeof raw[k]===typeof defaultTools[k])t[k]=raw[k];return t;}catch{return{...defaultTools};}}
	function savePrefs(tools){try{localStorage.setItem(PREFS_KEY,JSON.stringify({dc:tools.dc,hum:tools.hum,gate:tools.gate,threshold:tools.threshold,click:tools.click,clickThreshold:tools.clickThreshold}));}catch{}}
	function stopWorker(){if(worker)worker.terminate();worker=null;workerReady=false;comparison=null;compareKey='';clearTimeout(compareTimer);if(workerURL)URL.revokeObjectURL(workerURL);workerURL='';exportId=0;$('restore-cancel').hidden=true;}
 function saveDraft(){clearTimeout(savedTimer);const key=projectKey,state=store.snapshot();savedTimer=setTimeout(()=>{try{const all=JSON.parse(localStorage.getItem('vynamp-restore-projects-v1')||'{}');all[key]=state;const keys=Object.keys(all);while(keys.length>12)delete all[keys.shift()];localStorage.setItem('vynamp-restore-projects-v1',JSON.stringify(all));}catch{message('Projeto ativo; não foi possível salvar o rascunho local. Use Salvar projeto JSON.');}},250);}
 function bindTrack(){const track=api.getTrackSnapshot(),key=fingerprint(track);if(boundId===track.id&&store.duration===track.duration)return;renderDiagnosticsPanel(null);activation++;boundId=track.id;projectKey=key;stopWorker();decoded=null;analysis=null;selection={start:0,end:Math.min(5,track.duration)};selected='';loop=false;view={start:0,end:track.duration};let saved=projects.get(key);if(!saved)try{saved=JSON.parse(localStorage.getItem('vynamp-restore-projects-v1')||'{}')[key];}catch{}const prefs=loadPrefs();try{store=new M.Store(track.duration,saved?{...saved,enabled:false,monitor:'treated',tools:{...prefs,...saved.tools}}:{...M.initial(track.duration),tools:prefs});}catch{store=new M.Store(track.duration);}store.on(()=>{projects.set(projectKey,store.snapshot());engine.sync(store.snapshot());saveDraft();render();});engine.sync(store.snapshot(),true);$('restore-track').textContent=track.title+' · '+(track.demo?'DEMO silenciosa':'Arquivo local');message(track.demo?'DEMO: regiões configuráveis. Abra áudio local para processamento real.':'Projeto em bypass. Ative o tratamento para ouvir as correções.');render();if(active)ensureAnalysis();}
 function loadWorker(){const buffer=api.getDecodedAudioBuffer();if(!buffer){message(api.isDemo()?'DEMO: o espectrograma requer áudio local.':'Preparando dados da faixa…');return false;}if(buffer.numberOfChannels>2||buffer.length*buffer.numberOfChannels*4>96*1024*1024){message('Esta referência edita até 96 MiB de PCM e dois canais. A reprodução continua disponível.');return false;}if(worker&&decoded===buffer)return workerReady;stopWorker();decoded=buffer;const key=projectKey;workerURL=URL.createObjectURL(new Blob([VynampRestoreWorkerSource()],{type:'text/javascript'}));try{worker=new Worker(workerURL);}catch(error){message('Análise indisponível: '+error.message);return false;}worker.onerror=()=>{stopWorker();message('Falha na análise. Áudio e controles de reprodução preservados.');};worker.onmessage=event=>{if(key!==projectKey)return;const m=event.data;if(m.type==='ready'){workerReady=true;requestAnalysis();render();}else if(m.type==='analysis'&&m.id===analysisId){analysis=m;spectrumCache=null;$('restore-spectrum-note').textContent='Espectrograma real · '+(channel?'R':'L')+' · 40 Hz–'+Math.round(Math.min(20000,decoded.sampleRate/2)/1000)+' kHz';draw();}else if(m.type==='progress'&&m.id===analysisId)$('restore-spectrum-note').textContent='Analisando… '+Math.round(m.value*100)+'%';else if(m.type==='progress'&&m.id===exportId)message('Exportando cópia tratada… '+Math.round(m.value*100)+'%');else if(m.type==='rendered'&&m.id===exportId){finishExport(m,key);}else if(m.type==='comparison'&&m.id===compareId){comparison=m;$('restore-compare-stats').textContent=Compare.summary(m.stats);draw();}else if(m.type==='diagnostics'&&m.id===diagnosticsJob){renderDiagnosticsPanel(m.report);message(m.report.defects.length?'Análise concluída: '+m.report.defects.length+' problema(s). Use Corrigir em cada um ou Corrigir recomendados.':'Análise concluída: nenhum problema encontrado.');}else if(m.type==='batch-progress'&&m.id===batchJob){if(batchQueue&&batchQueue.items[m.index]){const item=batchQueue.items[m.index];if(m.error)Batch.markFailed(batchQueue,item.id,m.error);else{Batch.markProcessing(batchQueue,item.id);Batch.updateProgress(batchQueue,item.id,m.value||0);}}renderBatchList();}else if(m.type==='batch-done'&&m.id===batchJob){batchRunning=false;if(batchQueue&&Array.isArray(m.results)){for(const result of m.results){const item=batchQueue.items.find(i=>i.name===result.name);if(!item)continue;if(result.error)Batch.markFailed(batchQueue,item.id,result.error);else Batch.markDone(batchQueue,item.id,result.report);if(result.buffer){const name=safeName(result.name.replace(/\.[^.]+$/,''))+'-restaurado.wav';withMetadata(result.buffer,batchFiles.get(item.id)).then(tagged=>download(tagged.bytes,'audio/wav',name));}}}renderBatchList();message('Batch concluído — '+(batchQueue?Batch.aggregate(batchQueue).summary:''));}else if(m.type==='error'){exportId=0;$('restore-cancel').hidden=true;message('Falha na operação: '+m.error);render();}};const copies=Array.from({length:buffer.numberOfChannels},(_,ch)=>buffer.getChannelData(ch).slice());worker.postMessage({type:'load',channels:copies,rate:buffer.sampleRate},copies.map(c=>c.buffer));return false;}
 function ensureAnalysis(){if(!active)return;if(api.getTrackSnapshot().radio){message('Restore por regiões requer um arquivo local. A rádio continua no transporte principal.');return;}if(loadWorker())requestAnalysis();}
 function requestAnalysis(){if(!workerReady||!worker||view.end<=view.start)return;worker.postMessage({type:'analyze',id:(analysisId=++job),start:view.start,end:view.end,channel:Math.min(channel,decoded.numberOfChannels-1)});$('restore-spectrum-note').textContent='Analisando a região visível…';}
 function scheduleDraw(){if(renderPending)return;renderPending=true;requestAnimationFrame(()=>{renderPending=false;draw();});}
 function draw(){if(!active||!panel.offsetWidth)return;for(const [id,height]of [['restore-wave',140],['restore-spectrum',160]]){const canvas=$(id),w=Math.max(200,Math.round(canvas.clientWidth)),ratio=Math.min(2,devicePixelRatio||1);if(canvas.width!==w*ratio||canvas.height!==height*ratio){canvas.width=w*ratio;canvas.height=height*ratio;}const c=canvas.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);const styles=getComputedStyle(root),ink=styles.getPropertyValue('--text-primary').trim()||'#ddd',muted=styles.getPropertyValue('--text-secondary').trim()||'#aaa',accent=styles.getPropertyValue('--lime').trim()||'#b9ed4a';c.fillStyle=styles.getPropertyValue('--panel-inset').trim()||'#14191d';c.fillRect(0,0,w,height);const span=Math.max(.01,view.end-view.start),x=t=>(t-view.start)/span*w;
   if(id==='restore-wave'){const lanes=(peaks,top,laneHeight,color)=>{for(let ch=0;ch<2;ch++){const values=peaks[Math.min(ch,peaks.length-1)]||[],lane=laneHeight/2,mid=top+lane*ch+lane/2+1,amp=lane/2-6;c.strokeStyle=muted;c.globalAlpha=.25;c.beginPath();c.moveTo(0,mid);c.lineTo(w,mid);c.stroke();c.globalAlpha=1;c.strokeStyle=ch?muted:color;c.beginPath();values.forEach((v,i)=>{const px=i*w/Math.max(1,values.length-1),h=Math.min(1,v)*amp;c.moveTo(px,mid-h);c.lineTo(px,mid+h);});c.stroke();c.fillStyle=ink;c.font='10px Segoe UI';c.fillText(ch?'R':'L',6,mid-amp+8);}};
    const live=Compare&&compareMode!=='off'&&comparison&&comparison.start===view.start&&comparison.end===view.end,treatedColor=styles.getPropertyValue('--cyan').trim()||'#5fd3e6';
    if(live){const L=Compare.layout(compareMode,w,height,compareSplit),tag=(text,tx,ty,align)=>{c.font='bold 9px Segoe UI';c.textAlign=align;c.fillStyle=ink;c.fillText(text,tx,ty);c.textAlign='left';};
     if(L.mode==='wipe'){c.save();c.beginPath();c.rect(0,0,L.divider,height);c.clip();lanes(comparison.original,0,height,accent);c.restore();c.save();c.beginPath();c.rect(L.divider,0,w-L.divider,height);c.clip();lanes(comparison.treated,0,height,treatedColor);c.restore();c.strokeStyle=ink;c.lineWidth=2;c.beginPath();c.moveTo(L.divider,0);c.lineTo(L.divider,height);c.stroke();c.lineWidth=1;c.fillStyle=ink;c.fillRect(L.divider-4,height/2-12,8,24);if(L.divider>70)tag('ORIGINAL',L.divider-8,height-6,'right');if(w-L.divider>70)tag('TRATADO',L.divider+8,height-6,'left');}
     else{lanes(comparison.original,0,L.original.h,accent);lanes(comparison.treated,L.treated.y,L.treated.h,treatedColor);c.strokeStyle=ink;c.beginPath();c.moveTo(0,L.treated.y+.5);c.lineTo(w,L.treated.y+.5);c.stroke();tag('ORIGINAL',w-6,12,'right');tag('TRATADO',w-6,L.treated.y+12,'right');}}
    else lanes(analysis?.peaks||[api.getWaveformSnapshot().peaks,api.getWaveformSnapshot().peaks],0,height,accent);}
   else if(analysis){const max=Math.min(20000,analysis.rate/2);if(!spectrumCache){const image=c.createImageData(analysis.columns,160);for(let py=0;py<160;py++){const hz=40*(max/40)**(1-py/159),bin=Math.min(analysis.bins-1,Math.round(hz/(analysis.rate/2)*(analysis.bins-1)));for(let px=0;px<analysis.columns;px++){const value=Math.max(0,Math.min(1,(analysis.spectrum[px*analysis.bins+bin]+85)/75)),at=(py*analysis.columns+px)*4;image.data[at]=Math.round(12+230*value**1.7);image.data[at+1]=Math.round(18+140*value);image.data[at+2]=Math.round(28+110*Math.sin(value*Math.PI));image.data[at+3]=255;}}const temp=document.createElement('canvas');temp.width=analysis.columns;temp.height=160;temp.getContext('2d').putImageData(image,0,0);spectrumCache=temp;}c.drawImage(spectrumCache,0,0,w,160);c.fillStyle='#e5edf5';c.font='10px Segoe UI';c.fillText(Math.round(max/1000)+' kHz',6,13);c.fillText('1 kHz',6,Math.log(max/1000)/Math.log(max/40)*159);c.fillText('40 Hz',6,153);}
   else{c.fillStyle=muted;c.font='12px Segoe UI';c.fillText(api.isDemo()?'Abra áudio local para visualizar frequências reais.':'Preparando espectrograma…',16,height/2);}
   for(const r of store.state.regions){const a=x(r.start),b=x(r.end);c.fillStyle=r.kind==='overlay'?'#b990e52b':'#d5a24b30';c.fillRect(a,0,b-a,height);c.strokeStyle=r.id===selected?accent:'#d5a24b';c.strokeRect(a+.5,.5,b-a-1,height-1);}if(selection.end>selection.start){c.fillStyle='#8bb9ec22';c.fillRect(x(selection.start),0,x(selection.end)-x(selection.start),height);c.strokeStyle='#8bb9ec';c.strokeRect(x(selection.start),.5,x(selection.end)-x(selection.start),height-1);}const position=api.getTrackSnapshot().position;c.strokeStyle=ink;c.lineWidth=1;c.beginPath();c.moveTo(x(position),0);c.lineTo(x(position),height);c.stroke();}}

 async function finishExport(m,key){const id=m.id,dsp=exportDSP,transport=exportTransport;try{let bytes=m.buffer,peak=m.peak;if(dsp?.settings.enabled){message('Aplicando EQ/DSP à cópia restaurada…');const v=new DataView(bytes),channels=v.getUint16(22,true),rate=v.getUint32(24,true),frames=v.getUint32(40,true)/(channels*4),latency=VynampGraphAudio.latencyFrames(dsp,rate),offline=new OfflineAudioContext(2,frames+latency,rate),input=offline.createBuffer(channels,frames,rate);for(let ch=0;ch<channels;ch++){const a=input.getChannelData(ch);for(let i=0;i<frames;i++)a[i]=v.getFloat32(44+(i*channels+ch)*4,true);}await VynampGraphAudio.prepare(offline,dsp);if(key!==projectKey||id!==exportId)return;const chain=VynampGraphAudio.compile(offline,dsp,{transport}),source=offline.createBufferSource();source.buffer=input;source.connect(chain.entry);chain.exit.connect(offline.destination);source.start();let rendered;try{rendered=await offline.startRendering();if(chain.error)throw chain.error;}finally{chain.dispose();}if(key!==projectKey||id!==exportId)return;bytes=new ArrayBuffer(44+frames*8);const w=new DataView(bytes),ascii=(at,text)=>[...text].forEach((c,i)=>w.setUint8(at+i,c.charCodeAt(0)));ascii(0,'RIFF');w.setUint32(4,bytes.byteLength-8,true);ascii(8,'WAVEfmt ');w.setUint32(16,16,true);w.setUint16(20,3,true);w.setUint16(22,2,true);w.setUint32(24,rate,true);w.setUint32(28,rate*8,true);w.setUint16(32,8,true);w.setUint16(34,32,true);ascii(36,'data');w.setUint32(40,frames*8,true);peak=0;for(let ch=0;ch<2;ch++){const a=rendered.getChannelData(ch);for(let i=0;i<frames;i++){const x=a[i+latency];if(!Number.isFinite(x))throw Error('A cadeia produziu áudio inválido.');peak=Math.max(peak,Math.abs(x));w.setFloat32(44+(i*2+ch)*4,x,true);}}}if(key!==projectKey||id!==exportId)return;const normalize=$('restore-normalize').checked,targetDBFS=-1;let gainApplied=1;if(normalize&&Number.isFinite(peak)&&peak>0){const peakDBFS=20*Math.log10(Math.max(1e-9,peak));gainApplied=Math.pow(10,(targetDBFS-peakDBFS)/20);const v2=new DataView(bytes),channels=v2.getUint16(22,true),frames=v2.getUint32(40,true)/(channels*4);for(let i=0;i<frames*channels;i++){const off=44+i*4;let s=v2.getFloat32(off,true)*gainApplied;if(s>1)s=1;else if(s<-1)s=-1;v2.setFloat32(off,s,true);}peak=0;for(let i=0;i<frames*channels;i++){const s=Math.abs(v2.getFloat32(44+i*4,true));if(s>peak)peak=s;}}const peakDBFS=(20*Math.log10(Math.max(1e-9,peak))).toFixed(1);const wasClipping=!normalize&&Number.isFinite(m.peak)&&m.peak>1;const tagged=await withMetadata(bytes,api.getTrackSnapshot().file);if(key!==projectKey||id!==exportId)return;exportId=0;$('restore-cancel').hidden=true;download(tagged.bytes,'audio/wav',safeName(api.getTrackSnapshot().title)+'-restaurado.wav');message((wasClipping?'⚠ Pico original acima de 0 dBFS (clipping). Marque "Normalizar" para corrigir. Exportado com pico '+peakDBFS+' dBFS.'+(normalize?' Normalizado para '+targetDBFS+' dBFS.':''):'Cópia WAV float32 exportada. Pico amostral '+peakDBFS+' dBFS'+(normalize?' · normalizado para '+targetDBFS+' dBFS':'')+' · original preservado.')+' '+tagged.note+'.');render();}catch(error){if(key!==projectKey||id!==exportId)return;exportId=0;$('restore-cancel').hidden=true;message('Exportação não concluída: '+error.message);render();}}
 function render(){const focusID=document.activeElement?.dataset.region;const s=store.state,r=currentRegion(),local=!!api.getTrackSnapshot().file;root.dataset.restoreProcessing=String(s.enabled&&local);launch.setAttribute('aria-label','Abrir Vynamp Restore'+(s.enabled&&local?' · '+(s.monitor==='original'?'comparando original':'tratamento ativo'):''));VynampIcons.lead(menu,'sparkle','Vynamp Restore · '+(s.enabled&&local?(s.monitor==='original'?'comparando original':'ativo'):'restaurar faixa'));$('restore-enable').disabled=!local;$('restore-enable').innerHTML=powerIcon+'<span>'+(s.enabled?'Tratamento ativo':'Ativar tratamento')+'</span>';$('restore-enable').setAttribute('aria-pressed',String(s.enabled));$('restore-state').textContent=api.isDemo()?'DEMO':s.enabled?(api.state.playing?'AO VIVO':'Pronto · tratado'):'Bypass · original';$('restore-state').dataset.live=String(s.enabled&&api.state.playing&&!api.isDemo());for(const b of panel.querySelectorAll('[data-restore-monitor]'))b.setAttribute('aria-pressed',String(b.dataset.restoreMonitor===s.monitor));for(const b of panel.querySelectorAll('[data-restore-scope]'))b.setAttribute('aria-pressed',String(b.dataset.restoreScope===s.scope));for(const b of panel.querySelectorAll('[data-restore-hum]'))b.setAttribute('aria-pressed',String(+b.dataset.restoreHum===s.tools.hum));for(const b of panel.querySelectorAll('[data-restore-crackle-mode]'))b.setAttribute('aria-pressed',String(b.dataset.restoreCrackleMode===(s.tools.decrackleMode||'strong')));for(const key of ['dc','gate','click'])$('restore-'+key).setAttribute('aria-pressed',String(s.tools[key]));for(const [id,value]of [['restore-threshold',s.tools.threshold],['restore-sensitivity',s.tools.clickThreshold],['restore-rumble',s.tools.rumble??0],['restore-decrackle',s.tools.decrackle??0],['restore-declip',-(s.tools.declip||0)],['restore-deartifact',s.tools.deartifact||0],['restore-bwe',s.tools.bwe||0],['restore-bwe-cutoff',s.tools.bweCutoff||16000],['restore-region-gain',r?.gainDB||0],['restore-fade',(r?.fade||.02)*1000]])$(id).value=value;$('restore-threshold-value').textContent=s.tools.threshold+' dB';$('restore-sensitivity-value').textContent=s.tools.clickThreshold.toFixed(2);$('restore-rumble-value').textContent=(s.tools.rumble||0)?s.tools.rumble+' Hz':'Off';$('restore-decrackle-value').textContent=(s.tools.decrackle||0)?'Ativo ('+Number(s.tools.decrackle).toFixed(2)+')':'Off';$('restore-deartifact-value').textContent=s.tools.deartifact?'Ativo ('+Number(s.tools.deartifact).toFixed(2)+')':'Off';$('restore-bwe-value').textContent=s.tools.bwe?'Ativo ('+Number(s.tools.bwe).toFixed(2)+')':'Off';$('restore-bwe-cutoff-value').textContent=((s.tools.bweCutoff||16000)/1000).toFixed(1).replace('.',',')+' kHz';$('restore-declip-value').textContent=s.tools.declip?String(-s.tools.declip).replace('.',',')+' dB de folga':'Off';syncAssistant();$('restore-hum-adaptive').setAttribute('aria-pressed',String(!!s.tools.humAdaptive));$('restore-gain-value').textContent=r?(r.gainDB<=-80?'Silêncio':r.gainDB+' dB'):'Selecione região';$('restore-fade-value').textContent=Math.round((r?.fade||.02)*1000)+' ms';$('restore-start').value=selection.start.toFixed(3);$('restore-end').value=selection.end.toFixed(3);for(const id of ['restore-start','restore-end'])$(id).max=store.duration;$('restore-undo').disabled=!store.past.length;$('restore-redo').disabled=!store.future.length;$('restore-loop').setAttribute('aria-pressed',String(loop));$('restore-region-count').textContent=s.regions.length+(s.regions.length===1?' correção':' correções');$('restore-view-start').textContent=sec(view.start);$('restore-view-end').textContent=sec(view.end);$('restore-range-label').textContent='Waveform estéreo · '+sec(view.end-view.start)+' visíveis';for(const b of panel.querySelectorAll('[data-restore-kind]'))b.setAttribute('aria-pressed',String(b.dataset.restoreKind===(r?.kind||kind)));for(const id of ['restore-region-gain','restore-fade','restore-mute-region','restore-remove-region'])$(id).disabled=!r;$('restore-export').disabled=!decoded||!workerReady||!s.enabled||!!exportId;$('restore-export-detail').textContent=decoded?'WAV float32 · '+(decoded.sampleRate/1000).toLocaleString('pt-BR')+' kHz · '+(VynampGraph.store.data.settings.enabled?2:decoded.numberOfChannels)+' canais. Restore → EQ/DSP → proteção final, antes do volume. Compensa latência fixa; rituais não são adicionados. Usa Tratado; original preservado.':'Abra áudio local para exportar uma cópia tratada.';$('restore-channel').textContent='Espectro '+(channel?'R':'L');for(const b of panel.querySelectorAll('[data-restore-compare]')){b.setAttribute('aria-pressed',String(b.dataset.restoreCompare===compareMode));b.disabled=!decoded&&b.dataset.restoreCompare!=='off';}panel.querySelector('.restore-compare-split').hidden=compareMode!=='wipe';$('restore-compare-split').value=compareSplit;if(compareMode==='off')$('restore-compare-stats').textContent='';else if(!decoded)$('restore-compare-stats').textContent='Abra áudio local para comparar.';scheduleCompare();
   const list=$('restore-regions');list.replaceChildren();if(!s.regions.length){const empty=document.createElement('p');empty.className='restore-empty';empty.textContent='Arraste na wave e crie uma região. O arquivo original é preservado.';list.append(empty);}for(const region of s.regions){const row=document.createElement('button');row.className='restore-region-row';row.dataset.region=region.id;row.setAttribute('aria-pressed',String(region.id===selected));const label=document.createElement('span');label.textContent=sec(region.start)+' — '+sec(region.end);const type=document.createElement('span');type.textContent=region.kind==='overlay'?'Sobreposição · IA pendente':'Entre faixas';const gain=document.createElement('span');gain.textContent=region.gainDB<=-80?'Silêncio':region.gainDB+' dB';row.append(label,type,gain);row.onclick=()=>{selected=region.id;selection={start:region.start,end:region.end};render();};list.append(row);}if(focusID)[...list.querySelectorAll('[data-region]')].find(el=>el.dataset.region===focusID)?.focus({preventScroll:true});scheduleDraw();}
 function attempt(fn){try{fn();}catch(error){message(error.message);}}
 function open(){if(!active)originLayout=root.dataset.layout||'full';if(originLayout==='mini')VynampLayout.setLayout('full');openedView=root.dataset.mobileView;active=true;root.dataset.restoreActive='true';panel.hidden=false;bindTrack();render();ensureAnalysis();$('restore-close').focus({preventScroll:true});}
 function close(){if(store.state.monitor==='removed')store.change(s=>s.monitor='treated');active=false;loop=false;root.dataset.restoreActive='false';panel.hidden=true;if(originLayout==='mini')VynampLayout.setLayout('mini');launch.offsetWidth?launch.focus():$('main-menu-button').focus();}
 function seekTo(t){$('seek').value=Math.max(0,Math.min(store.duration,t));$('seek').dispatchEvent(new Event('input',{bubbles:true}));}
 function zoom(start,end){if(!store.duration)return;const span=Math.max(.05,Math.min(store.duration,end-start));view={start:Math.max(0,Math.min(start,store.duration-span)),end:0};view.end=view.start+span;analysis=null;render();ensureAnalysis();}
 launch.onclick=open;$('restore-close').onclick=close;$('restore-open-audio').onclick=()=>$('open').click();$('restore-enable').onclick=async()=>{if(store.state.enabled){store.change(s=>s.enabled=false);return;}const token=++activation,key=projectKey;message('Ativando processador de áudio…');try{engine.sync(store.snapshot());await engine.ensure();if(token!==activation||key!==projectKey)return;store.change(s=>s.enabled=true);message('Tratamento ativo na mesma reprodução. Compare Original / Tratado / Só removido.');}catch(error){message(error.message);}};engine.onError=text=>{store.change(s=>s.enabled=false,false);message(text);};
 for(const b of panel.querySelectorAll('[data-restore-monitor]'))b.onclick=()=>store.change(s=>s.monitor=b.dataset.restoreMonitor);for(const b of panel.querySelectorAll('[data-restore-scope]'))b.onclick=()=>store.change(s=>s.scope=b.dataset.restoreScope);for(const b of panel.querySelectorAll('[data-restore-hum]'))b.onclick=()=>store.change(s=>s.tools.hum=+b.dataset.restoreHum);for(const b of panel.querySelectorAll('[data-restore-crackle-mode]'))b.onclick=()=>store.change(s=>s.tools.decrackleMode=b.dataset.restoreCrackleMode);for(const key of ['dc','gate','click'])$('restore-'+key).onclick=()=>store.change(s=>s.tools[key]=!s.tools[key]);for(const b of panel.querySelectorAll('[data-restore-kind]'))b.onclick=()=>{kind=b.dataset.restoreKind;if(currentRegion())store.patch(selected,{kind});else render();};
 function slider(id,fn){let first=true;$(id).oninput=()=>attempt(()=>{fn(+$(id).value,first);first=false;});$(id).onchange=()=>first=true;}
 slider('restore-threshold',(v,record)=>store.change(s=>s.tools.threshold=v,record));slider('restore-sensitivity',(v,record)=>store.change(s=>s.tools.clickThreshold=v,record));slider('restore-rumble',(v,record)=>store.change(s=>s.tools.rumble=v,record));slider('restore-decrackle',(v,record)=>store.change(s=>s.tools.decrackle=v,record));slider('restore-declip',(v,record)=>store.change(s=>s.tools.declip=-v,record));slider('restore-deartifact',(v,record)=>store.change(s=>s.tools.deartifact=v,record));slider('restore-bwe',(v,record)=>store.change(s=>s.tools.bwe=v,record));slider('restore-bwe-cutoff',(v,record)=>store.change(s=>s.tools.bweCutoff=v,record));slider('restore-region-gain',(v,record)=>store.patch(selected,{gainDB:v},record));slider('restore-fade',(v,record)=>store.patch(selected,{fade:v/1000},record));
	 $('restore-hum-adaptive').onclick=()=>{const on=!store.state.tools.humAdaptive;store.change(s=>s.tools.humAdaptive=on);if(on){const detected=store.state.diagnostics?.defects?.find(d=>d.type==='hum50'||d.type==='hum60');if(detected)store.change(s=>s.tools.hum=detected.frequency);message('Hum adaptativo ativado'+(detected?' — detectado '+detected.frequency+'Hz no diagnóstico.':'. Use "Diagnosticar" para detectar a frequência.'));}else message('Hum adaptativo desativado.');};
 $('restore-add-region').onclick=()=>attempt(()=>{if(selection.end-selection.start<.01-1e-9)throw Error('Selecione pelo menos 10 ms.');const id=store.add({...selection,gainDB:kind==='between'?-90:0,fade:.02,kind});selected=id;render();message(kind==='overlay'?'Sobreposição marcada. Separação/reconstrução IA pendente; nenhuma voz foi removida.':'Região criada com silêncio e fades, preservando a duração. '+(store.state.enabled?'Tratamento já está aplicado.':'Ative o tratamento para ouvir.'));});let regionPreviewOrigin=null;
$('restore-preview-region').onclick=()=>{const r=currentRegion();if(!r){message('Selecione uma região para ouvir.');return;}regionPreviewOrigin=api.state.position;seekTo(r.start);loop=true;render();message('Reproduzindo região '+sec(r.start)+' — '+sec(r.end)+'. Clique novamente ou desative loop para voltar.');};
$('restore-mute-region').onclick=()=>attempt(()=>store.patch(selected,{gainDB:-90}));$('restore-remove-region').onclick=()=>{store.remove(selected);selected='';render();};function syncSelection(){const r=currentRegion()||store.state.regions.find(r=>Math.abs(r.start-selection.start)<.001&&Math.abs(r.end-selection.end)<.001);if(r){selected=r.id;selection={start:r.start,end:r.end};}else selected='';} $('restore-undo').onclick=()=>{store.undo();syncSelection();render();};$('restore-redo').onclick=()=>{store.redo();syncSelection();render();};
 for(const id of ['restore-start','restore-end'])$(id).onchange=()=>attempt(()=>{const start=+$('restore-start').value,end=+$('restore-end').value;if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>store.duration||end-start<.01-1e-9)throw Error('Confira a seleção: entrada menor que saída, dentro da faixa, mínimo 10 ms.');if(currentRegion())store.patch(selected,{start,end});selection={start,end};render();});$('restore-loop').onclick=()=>{if(selection.end-selection.start<.01-1e-9){message('Selecione uma região para o loop.');return;}loop=!loop;if(loop)seekTo(selection.start);render();};
 $('restore-zoom-in').onclick=()=>zoom((view.start+view.end)/2-(view.end-view.start)/4,(view.start+view.end)/2+(view.end-view.start)/4);$('restore-zoom-out').onclick=()=>zoom(view.start-(view.end-view.start)/2,view.end+(view.end-view.start)/2);$('restore-fit').onclick=()=>zoom(0,store.duration);$('restore-focus-selection').onclick=()=>zoom(selection.start,selection.end);$('restore-channel').onclick=()=>{channel=channel?0:1;analysis=null;ensureAnalysis();render();};
 const canvas=$('restore-wave');canvas.onpointerdown=e=>{if(compareMode==='wipe'&&comparison){const b=canvas.getBoundingClientRect();if(Math.abs(e.clientX-b.left-b.width*compareSplit)<=8){splitDrag=true;canvas.setPointerCapture(e.pointerId);return;}}if(!store.duration)return;const r=canvas.getBoundingClientRect(),t=Math.max(view.start,Math.min(view.end,view.start+(e.clientX-r.left)/r.width*(view.end-view.start))),found=store.state.regions.find(v=>t>=v.start&&t<=v.end);if(found&&!e.shiftKey){selected=found.id;selection={start:found.start,end:found.end};render();return;}selected='';drag=t;selection={start:t,end:t};canvas.setPointerCapture(e.pointerId);render();};canvas.onpointermove=e=>{if(splitDrag){const b=canvas.getBoundingClientRect();setSplit((e.clientX-b.left)/b.width);return;}if(drag===null)return;const r=canvas.getBoundingClientRect(),t=Math.max(0,Math.min(store.duration,view.start+(e.clientX-r.left)/r.width*(view.end-view.start)));selection={start:Math.min(drag,t),end:Math.max(drag,t)};render();};canvas.onpointerup=()=>{drag=null;splitDrag=false;};canvas.onpointercancel=canvas.onpointerup;for(const b of panel.querySelectorAll('[data-restore-compare]'))b.onclick=()=>{compareMode=Compare.validMode(b.dataset.restoreCompare);compareKey='';saveCompare();render();};$('restore-compare-split').oninput=e=>setSplit(e.target.value);canvas.onkeydown=e=>{if(e.altKey||e.ctrlKey||e.metaKey)return;if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const delta=e.key==='ArrowRight'?.1:-.1;if(e.shiftKey){const end=Math.max(selection.start+.01,Math.min(store.duration,selection.end+delta));attempt(()=>{if(currentRegion())store.patch(selected,{end});selection.end=end;render();});}else seekTo(api.state.position+delta);}};
 function safeName(name){return name.replace(/[<>:"/\\|?*]/g,'-').slice(0,100)||'audio';}// #13 — grava no WAV exportado as tags (INFO/ID3/XMP) do arquivo de origem; falha nunca bloqueia a exportação.
async function withMetadata(bytes,file){const Meta=window.VynampRestoreMetadata;if(!Meta||!file)return{bytes,note:'Sem metadados na origem'};try{const meta=await Meta.prepare(file);return{bytes:Meta.embed(bytes,meta),note:Meta.describe(meta)};}catch(error){return{bytes,note:'Metadados não gravados ('+error.message+')'};}}
function download(data,type,name){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
 $('restore-project-save').onclick=()=>download(JSON.stringify({format:'vynamp-restore',version:1,source:{name:api.getTrackSnapshot().file?.name||'demo',fingerprint:projectKey},state:store.snapshot()},null,2),'application/json',safeName(api.getTrackSnapshot().title)+'-restore.json');$('restore-project-load').onclick=()=>$('restore-project-file').click();$('restore-project-file').onchange=async()=>{const file=$('restore-project-file').files[0],key=projectKey;if(!file)return;try{if(file.size>256*1024)throw Error('Projeto excede 256 KiB.');const project=JSON.parse(await file.text());if(key!==projectKey)throw Error('Faixa mudou durante a leitura.');if(project.format!=='vynamp-restore'||project.version!==1||project.source?.fingerprint!==projectKey)throw Error('Projeto pertence a outro arquivo ou versão.');store.load({...project.state,enabled:false,monitor:'treated'});selected='';render();message('Projeto importado em bypass. Ative para ouvir.');}catch(error){message('Importação recusada: '+error.message);}finally{$('restore-project-file').value='';}};
 $('restore-export').onclick=async()=>{if(!store.state.enabled||!loadWorker()||exportId)return;const id=++job;exportId=id;exportDSP=VynampGraph.store.snapshot();exportTransport=window.VynampAdvancedTransport?.snapshotForExport();$('restore-cancel').hidden=false;render();message('Renderizando Restore antes do EQ/DSP e da proteção final…');worker.postMessage({type:'render',id,state:store.snapshot()});};$('restore-cancel').onclick=()=>{stopWorker();message('Exportação cancelada; original preservado.');ensureAnalysis();render();};
 document.addEventListener('vynamp:waveform-data',()=>{if(active)ensureAnalysis();});document.addEventListener('vynamp:playback',()=>{bindTrack();if(lastPlaying!==api.state.playing){lastPlaying=api.state.playing;engine.sync(store.snapshot());}engine.clock();if(active){$('restore-state').textContent=api.isDemo()?'DEMO':store.state.enabled?(api.state.playing?'AO VIVO':'Pronto · tratado'):'Bypass · original';scheduleDraw();}});for(const event of ['seeking','seeked','playing'])audio.addEventListener(event,()=>engine.clock(true));document.addEventListener('vynamp:theme-change',scheduleDraw);new ResizeObserver(scheduleDraw).observe(panel);setInterval(()=>{if(active&&loop&&api.state.playing&&(api.isDemo()?api.state.position:audio.currentTime)>=selection.end)seekTo(selection.start);},25);
 new MutationObserver(entries=>{if(active&&(root.dataset.layout==='mini'||innerWidth<=900&&root.dataset.mobileView!==openedView))close();}).observe(root,{attributes:true,attributeFilter:['data-mobile-view','data-layout']});document.addEventListener('click',event=>{if(active&&innerWidth<=900&&event.target.closest('[data-mobile-view-button]'))close();},true);window.addEventListener('pagehide',()=>{stopWorker();clearTimeout(savedTimer);});panel.addEventListener('keydown',e=>{if(e.defaultPrevented)return;const tag=document.activeElement?.tagName;if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();store.undo();syncSelection();render();return;}if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey)||(e.key==='Z'&&e.shiftKey))){e.preventDefault();store.redo();syncSelection();render();return;}if(e.key==='r'||e.key==='R'){if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||document.activeElement?.isContentEditable)return;e.preventDefault();attempt(()=>{if(selection.end-selection.start<.01-1e-9)throw Error('Selecione pelo menos 10 ms.');const id=store.add({...selection,gainDB:kind==='between'?-90:0,fade:.02,kind});selected=id;render();message(kind==='overlay'?'Sobreposição marcada via atalho R.':'Região criada via atalho R.');});}});$('restore-wave').addEventListener('wheel',e=>{if(!e.ctrlKey&&!e.metaKey||!store.duration)return;e.preventDefault();const r=e.currentTarget.getBoundingClientRect(),cursor=view.start+(e.clientX-r.left)/r.width*(view.end-view.start),span=view.end-view.start,factor=e.deltaY>0?1.2:1/1.2,newSpan=Math.max(.05,Math.min(store.duration,span*factor)),ratio=(cursor-view.start)/span;view.start=Math.max(0,Math.min(cursor-newSpan*ratio,store.duration-newSpan));view.end=view.start+newSpan;analysis=null;render();ensureAnalysis();},{passive:false});window.VynampRestore={open,close,getState:()=>store.snapshot(),get engine(){return engine;},get analysis(){return analysis;}};bindTrack();

// ─── #17 — Modo Guia (tooltip educativo) ──────────────────────────────
// ─── #20b — Sistema de Presets de Restauração ──────────────────────────
const Presets = window.VynampRestorePresets;
let activePresetId = '';
function populatePresetSelect() {
	const sel = $('restore-preset-select'); if (!sel || !Presets) return;
	const current = sel.value;
	sel.replaceChildren();
	const optNone = document.createElement('option'); optNone.value = ''; optNone.textContent = '— Personalizado —'; sel.append(optNone);
	const groups = { true: document.createElement('optgroup'), false: document.createElement('optgroup') };
	groups.true.label = 'Integrados'; groups.false.label = 'Meus presets';
	for (const p of Presets.listAll()) {
 const opt = document.createElement('option'); opt.value = p.id; opt.textContent = p.name;
 if (p.description) opt.title = p.description;
 groups[!!p.builtIn].append(opt);
	}
	for (const g of [groups.true, groups.false]) if (g.children.length) sel.append(g);
	sel.value = activePresetId || current || '';
}
$('restore-preset-select').onchange = () => {
	const id = $('restore-preset-select').value;
	if (!id) { activePresetId = ''; message('Modo personalizado — ajuste os parâmetros manualmente.'); return; }
	const preset = Presets.listAll().find(p => p.id === id);
	if (!preset) return;
	activePresetId = id;
	store.change(s => { s.tools = Presets.applyToTools(preset, s.tools); });
	if (Presets.shouldWarnHighFreqLoss(preset)) {
 message('Preset "' + preset.name + '" pode reduzir agudos acima de 8 kHz. Compare Original/Tratado para verificar.','warning');
	} else {
 message('Preset "' + preset.name + '" aplicado. ' + (preset.description || ''));
	}
};
populatePresetSelect();

// ─── #5 — Batch Processing com relatório ──────────────────────────────
const Batch=window.VynampRestoreBatch;
let batchQueue=null,batchJob=0,batchRunning=false;
// A fila pura guarda apenas metadados; os objetos File ficam aqui, separados.
const batchFiles=new Map();
function renderBatchList(){
 const list=$('restore-batch-list');if(!list||!Batch)return;
 list.replaceChildren();
 if(!batchQueue){$('restore-batch-run').disabled=true;return;}
 for(const item of batchQueue.items){
  const row=document.createElement('div');row.className='restore-batch-row';row.dataset.status=item.status;row.setAttribute('role','listitem');
  const name=document.createElement('span');name.className='restore-batch-name';name.textContent=item.name;
  const status=document.createElement('span');status.className='restore-batch-status';status.textContent=item.status===Batch.STATUS.DONE?'OK':item.status===Batch.STATUS.FAILED?'Falha':item.status===Batch.STATUS.PROCESSING?'Processando…':item.status===Batch.STATUS.CANCELLED?'Cancelado':'Pendente';
  const bar=document.createElement('span');bar.className='restore-batch-bar';
  const fill=document.createElement('i');fill.style.width=Math.round(item.progress*100)+'%';bar.append(fill);
  row.append(name,status,bar);
  if(item.error){const err=document.createElement('small');err.className='restore-batch-error';err.textContent=item.error;row.append(err);}
  list.append(row);
 }
 $('restore-batch-run').disabled=batchRunning||!batchQueue.items.some(i=>i.status===Batch.STATUS.PENDING);
 $('restore-batch-cancel').hidden=!batchRunning;
 const agg=batchQueue?Batch.aggregate(batchQueue):null;
 if(agg)renderBatchReport(agg);
}
function renderBatchReport(agg){
 const box=$('restore-batch-report');if(!box)return;
 box.hidden=false;
 let html='<h4>Relatório agregado</h4><p class="restore-batch-summary">'+agg.summary+'</p>';
 if(agg.defects.length){
  html+='<ul class="restore-batch-defects">';
  for(const d of agg.defects.slice(0,8)){
   const label=Batch.DEFECT_LABELS[d.type]||d.type;
   html+='<li><span class="restore-batch-sev" data-sev="'+d.severity+'"></span>'+d.count+' '+label+'</li>';
  }
  html+='</ul>';
 }
 if(agg.chains.length){
  html+='<p class="restore-batch-chain">Cadeia mais comum: <strong>'+agg.chains[0].chain.join(' → ')+'</strong> ('+agg.chains[0].count+' arquivos)</p>';
 }
 box.innerHTML=html;
}
$('restore-batch-select').onclick=()=>$('restore-batch-files').click();
$('restore-batch-files').onchange=()=>attempt(()=>{
 const files=[...$('restore-batch-files').files];
 if(!files.length)return;
 batchQueue=Batch.createQueue(files);
 batchFiles.clear();
 batchQueue.items.forEach((item,index)=>batchFiles.set(item.id,files[index]));
 $('restore-batch-files').value='';
 renderBatchList();
 message(files.length+' arquivo(s) na fila. Ajuste os parâmetros e clique em "Processar fila".');
});
$('restore-batch-run').onclick=async()=>{
 if(!Batch||!batchQueue||batchRunning)return;
 if(!loadWorker()){message('Carregue um áudio local antes de processar o batch.');return;}
 const pending=Batch.nextPending(batchQueue,Batch.MAX_ITEMS_PER_JOB);
 if(!pending.length)return;
 batchRunning=true;
 const id=++job;batchJob=id;
 $('restore-batch-cancel').hidden=false;
 renderBatchList();
 message('Processando '+pending.length+' arquivo(s)…');
 const decodedItems=[];
 for(const item of pending){
  const raw=batchFiles.get(item.id)||null;
  if(!raw){Batch.markFailed(batchQueue,item.id,'Arquivo indisponível.');continue;}
  try{
   const arrayBuffer=await raw.arrayBuffer();
   const audioCtx=new (window.AudioContext||window.webkitAudioContext)();
   const decoded=await audioCtx.decodeAudioData(arrayBuffer);
   await audioCtx.close();
   const channels=[];for(let ch=0;ch<decoded.numberOfChannels;ch++)channels.push(decoded.getChannelData(ch).slice());
   Batch.markProcessing(batchQueue,item.id);
   decodedItems.push({name:raw.name,channels,rate:decoded.sampleRate});
  }catch(error){Batch.markFailed(batchQueue,item.id,'Falha ao decodificar: '+error.message);}
 }
 renderBatchList();
 if(decodedItems.length){
  worker.postMessage({type:'batch',id,items:decodedItems,state:store.snapshot()});
 }else{
  batchRunning=false;
  renderBatchList();
  message('Nenhum arquivo pôde ser decodificado.');
 }
};
$('restore-batch-cancel').onclick=()=>{
 if(!batchQueue||!Batch)return;
 Batch.cancelAll(batchQueue);
 batchRunning=false;
 renderBatchList();
 message('Fila de batch cancelada. Arquivos já exportados foram preservados.');
};
// Hook: resposta do worker para batch
const _batchWorkerMessages=new Set(['batch-progress','batch-done']);

const GUIDE_KEY='vynamp-restore-guide-v1';
const guideBtn=document.createElement('button');guideBtn.type='button';guideBtn.className='restore-guide-btn icon-button';guideBtn.setAttribute('aria-label','Modo guia');guideBtn.setAttribute('aria-pressed','false');guideBtn.title='Ativar/desativar dicas explicativas';guideBtn.innerHTML=VynampIcons.svg('help');
const toolbar=panel.querySelector('.restore-toolbar');if(toolbar)toolbar.insertBefore(guideBtn,$('restore-open-audio'));
function loadGuide(){try{return localStorage.getItem(GUIDE_KEY)==='true';}catch{return false;}}
function saveGuide(on){try{localStorage.setItem(GUIDE_KEY,String(on));}catch{}}
let guideActive=loadGuide();root.dataset.restoreGuide=String(guideActive);guideBtn.setAttribute('aria-pressed',String(guideActive));
guideBtn.onclick=()=>{guideActive=!guideActive;root.dataset.restoreGuide=String(guideActive);guideBtn.setAttribute('aria-pressed',String(guideActive));saveGuide(guideActive);};
const guideTexts={'restore-dc':'Remove deslocamento constante da linha de base. Use quando a waveform não está centrada no zero.','restore-gate':'Silencia trechos abaixo do limiar. Útil para ruído de fundo em pausas, mas não substitui redução espectral.','restore-click':'Repara impulsos curtos (estalidos). Sensibilidade menor detecta mais cliques, mas pode afectar percussão.'};
for(const [id,text] of Object.entries(guideTexts)){const el=$(id);if(el&&!el.parentElement.querySelector('.restore-guide-tooltip')){const tip=document.createElement('div');tip.className='restore-guide-tooltip';tip.textContent=text;el.closest('.restore-tool')?.append(tip);}}
const humTool=panel.querySelector('.restore-hum');if(humTool&&!humTool.closest('.restore-tool').querySelector('.restore-guide-tooltip')){const tip=document.createElement('div');tip.className='restore-guide-tooltip';tip.textContent='Elimina zumbido de rede eléctrica (50/60 Hz). Escolha a frequência da sua região.';humTool.closest('.restore-tool').append(tip);}
const regionProps=panel.querySelector('.restore-region-properties');if(regionProps&&!regionProps.querySelector('.restore-guide-tooltip')){const tip=document.createElement('div');tip.className='restore-guide-tooltip';tip.textContent='Região Entre faixas: silêncio/vinheta entre músicas, atenua sem alterar duração. Sobreposta: remover elementos sobrepostos (requer IA futura).';regionProps.append(tip);}

// ─── #18 — Drag-and-drop de áudio ─────────────────────────────────────
const dropOverlay=document.createElement('div');dropOverlay.className='restore-drop-overlay';dropOverlay.textContent='Solte o áudio aqui';panel.append(dropOverlay);
let dragCounter=0;
panel.addEventListener('dragenter',e=>{e.preventDefault();dragCounter++;panel.classList.add('restore-drop-active');});
panel.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});
panel.addEventListener('dragleave',e=>{e.preventDefault();dragCounter--;if(dragCounter<=0){dragCounter=0;panel.classList.remove('restore-drop-active');}});
panel.addEventListener('drop',e=>{e.preventDefault();dragCounter=0;panel.classList.remove('restore-drop-active');const file=e.dataTransfer?.files?.[0];if(!file)return;const audioTypes=['audio/','video/ogg'];if(!audioTypes.some(t=>file.type.startsWith(t))&&!/\.(mp3|wav|flac|ogg|m4a|aac|opus|wma|aiff?|webm)$/i.test(file.name)){message('Formato não suportado para drag-and-drop. Use Abrir áudio.');return;}const input=$('open');if(input){const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));message('Carregando '+file.name+'…');}else{message('Input de arquivo não encontrado.');}});
})();
