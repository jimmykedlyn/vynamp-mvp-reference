(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VynampRestoreDSP=api;})(globalThis,()=>{
	'use strict';
	class Kernel{
		constructor(rate){
			this.rate=rate;
			this.pending=[0,0];
			this.previous=[0,0];
			this.dcX=[0,0];
			this.dcY=[0,0];
			this.dcR=Math.exp(-2*Math.PI*5/rate);
			this.sections=[[],[]];
			this.rumbleHP=[null,null];
			this.env=0;
			this.gateGain=1;
			this.originalWeight=1;
			this.treatedWeight=0;
			this.regions=[];
			this.regionIndex=0;
			this.lastTime=-Infinity;
			this.hum=0;
			this.humAdaptive=false;
			this.rumbleFreq=0;
			this.decrackleSens=0;
			this.sideEnv=0;
			this.sideAlpha=Math.exp(-1/(.05*rate));
			this.state={enabled:false,monitor:'treated',scope:'all',tools:{},regions:[]};
			this.fadeTable=Float32Array.from({length:257},(_,i)=>.5-.5*Math.cos(Math.PI*i/256));
			this.noiseEnv=[0,0];
			this.noiseAlpha=Math.exp(-1/(.5*rate));
			this.denoiseSmooth=Math.exp(-1/(.01*rate));
			this.denoiseGain=[1,1];
			// De-click adaptativo: envelope do resíduo de 2ª diferença (5 ms) por canal.
			this.clickEnv=[0,0];
			this.clickAlpha=Math.exp(-1/(.005*rate));
		}
		setState(state){
			this.state=state;
			this.regions=(state.regions||[]).map(r=>({...r,target:r.gainDB<=-80?0:10**(r.gainDB/20)}));
			this.regionIndex=0;
			this.lastTime=-Infinity;
			const hum=state.tools?.hum||0;
			const humAdaptive=!!state.tools?.humAdaptive;
			if(hum!==this.hum||humAdaptive!==this.humAdaptive){
				this.hum=hum;
				this.humAdaptive=humAdaptive;
				// #4 — Hum adaptativo: sem frequência explícita, atenua 50 e 60 Hz
				// simultaneamente (cobre ambas as normas elétricas).
				const bases=humAdaptive&&hum===0?[50,60]:(hum?[hum]:[]);
				this.sections=[0,1].map(()=>bases.flatMap(base=>[1,2,3]
					.filter(n=>n*base<this.rate*.45)
					.map(n=>{
						const w=2*Math.PI*n*base/this.rate;
						const a=Math.sin(w)/(2*30);
						const b=1/(1+a);
						return{b0:b,b1:-2*Math.cos(w)*b,b2:b,a1:-2*Math.cos(w)*b,a2:(1-a)*b,z1:0,z2:0};
					})));
			}
			const rumble=state.tools?.rumble||0;
			if(rumble!==this.rumbleFreq){
				this.rumbleFreq=rumble;
				this.rumbleHP=rumble>0?[0,1].map(()=>{
					const w=2*Math.PI*rumble/this.rate,Q=0.7071,alpha=Math.sin(w)/(2*Q),cosW=Math.cos(w);
					const b0=(1+cosW)/2,b1=-(1+cosW),b2=(1+cosW)/2,a0=1+alpha,a1=-2*cosW,a2=1-alpha;
					return{b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0,z1:0,z2:0};
				}):[null,null];
			}
			const decrackle=state.tools?.decrackle||0;
			if(decrackle!==this.decrackleSens){
				this.decrackleSens=decrackle;
				this.sideEnv=0;
			}
		}
		processInto(input,output,start){
			const state=this.state,t=state.tools||{},n=output[0]?.length||0,chCount=output.length,fs=this.rate;
			const attack=Math.exp(-1/(.003*fs)),release=Math.exp(-1/(.12*fs)),smooth=Math.exp(-1/(.006*fs));
			const threshold=10**((t.threshold??-45)/20),denoiseAmount=t.denoise||0,decrackleSens=this.decrackleSens;
			// Anti-saturação: headroom (dB) + joelho suave acima de -1 dBFS. Recupera masters/MP3 que passam de 0 dBFS.
			const declip=t.declip||0,declipGain=10**(declip/20),knee=.89;
			let targetOriginal=state.enabled&&state.monitor!=='original'?state.monitor==='removed'?1:0:1;
			let targetTreated=state.enabled&&state.monitor!=='original'?state.monitor==='removed'?-1:1:0;
			for(let i=0;i<n;i++){
				const time=start+(i-1)/fs;
				if(time<this.lastTime)this.regionIndex=0;
				while(this.regionIndex<this.regions.length&&time>=this.regions[this.regionIndex].end)this.regionIndex++;
				this.lastTime=time;
				const region=this.regions[this.regionIndex],inside=region&&time>=region.start&&time<region.end;
				let fade=0,gain=1;
				if(inside){
					const distance=Math.min(time-region.start,region.end-time),position=Math.min(1,distance/region.fade);
					fade=this.fadeTable[Math.max(0,Math.min(256,Math.floor(position*256)))];
					gain=1+(region.target-1)*fade;
				}
				const scope=state.scope==='regions'?fade:1;
				const amplitude=Math.max(Math.abs(this.pending[0]),Math.abs(this.pending[1]));
				this.env=amplitude+(this.env-amplitude)*(amplitude>this.env?attack:release);
				const gateTarget=t.gate&&this.env<threshold?0:1;
				this.gateGain=gateTarget+(this.gateGain-gateTarget)*smooth;
				this.originalWeight=targetOriginal+(this.originalWeight-targetOriginal)*smooth;
				this.treatedWeight=targetTreated+(this.treatedWeight-targetTreated)*smooth;
				// #4 — De-crackle mid/side: detecta impulso no canal lateral (L-R)/2
				// e recompõe preservando o mid intacto.
				let crackleL=null,crackleR=null;
				if(decrackleSens>0&&chCount>=2){
					const lPrev=this.pending[0],rPrev=this.pending[1];
					const lCur=input[0]?.[i]||0,rCur=input[1]?.[i]||0;
					const sidePrev=(lPrev-rPrev)*0.5,sideCur=(lCur-rCur)*0.5;
					const sidePred=(sidePrev+sideCur)*0.5;
					const midPrev=(lPrev+rPrev)*0.5;
					const sideAbs=Math.abs(sidePrev);
					this.sideEnv=sideAbs+(this.sideEnv-sideAbs)*this.sideAlpha;
					const envFloor=Math.max(1e-8,this.sideEnv);
					const residual=Math.abs(sidePrev-sidePred);
					// Com os vizinhos perto do fundo de escala o "estalo" é saturação: repará-lo aqui só espalharia distorção.
					const nearClip=Math.max(Math.abs(this.previous[0]),Math.abs(this.previous[1]),Math.abs(lCur),Math.abs(rCur))>=.9;
					if(!nearClip&&residual>decrackleSens*envFloor&&residual>decrackleSens*0.5){
						crackleL=midPrev+sidePred;
						crackleR=midPrev-sidePred;
					}
				}
				for(let ch=0;ch<chCount;ch++){
					const incoming=input[ch]?.[i]||0,raw=this.pending[ch]||0,previous=this.previous[ch]||0;
					let value=raw;
					// Clique = resíduo acima do limiar E 8× acima do resíduo típico recente. Vizinhos perto de 0 dBFS = saturação, fica para o anti-saturação.
					const clickResidual=Math.abs(raw-(previous+incoming)*.5),clickLimit=t.clickThreshold??.2;
					if(t.click&&clickResidual>clickLimit&&clickResidual>8*this.clickEnv[ch]&&Math.abs(previous-incoming)<clickLimit*.75&&Math.max(Math.abs(previous),Math.abs(incoming))<.9)value=(previous+incoming)*.5;
					this.clickEnv[ch]=clickResidual+(this.clickEnv[ch]-clickResidual)*this.clickAlpha;
					const dc=value-this.dcX[ch]+this.dcR*this.dcY[ch];
					this.dcX[ch]=value;
					this.dcY[ch]=dc;
					if(t.dc)value=dc;
					const hp=this.rumbleHP?.[ch];
					if(hp){
						const filtered=hp.b0*value+hp.z1;
						hp.z1=hp.b1*value-hp.a1*filtered+hp.z2;
						hp.z2=hp.b2*value-hp.a2*filtered;
						value=filtered;
					}
					for(const section of this.sections[ch]||[]){
						const filtered=section.b0*value+section.z1;
						section.z1=section.b1*value-section.a1*filtered+section.z2;
						section.z2=section.b2*value-section.a2*filtered;
						value=filtered;
					}
					if(t.gate)value*=this.gateGain;
					if(denoiseAmount>0){
						const absVal=Math.abs(value);
						this.noiseEnv[ch]=absVal+(this.noiseEnv[ch]-absVal)*this.noiseAlpha;
						const noiseFloor=this.noiseEnv[ch]+1e-10;
						const powerRatio=(value*value)/(noiseFloor*noiseFloor);
						const wiener=Math.max(.25,powerRatio/(powerRatio+1));
						const targetGain=1-denoiseAmount*(1-wiener);
						this.denoiseGain[ch]=targetGain+(this.denoiseGain[ch]-targetGain)*this.denoiseSmooth;
						value*=this.denoiseGain[ch];
					}
					if(crackleL!==null)value=ch===0?crackleL:crackleR;
					if(declip){
						value*=declipGain;
						const magnitude=Math.abs(value);
						if(magnitude>knee)value=Math.sign(value)*(knee+(1-knee)*Math.tanh((magnitude-knee)/(1-knee)));
					}
					const treated=(raw+(value-raw)*scope)*gain;
					output[ch][i]=raw*this.originalWeight+treated*this.treatedWeight;
					this.previous[ch]=raw;
					this.pending[ch]=incoming;
				}
			}
		}
	}
	function workletSource(){return 'const RestoreKernel='+Kernel.toString()+`;class VynampRestoreProcessor extends AudioWorkletProcessor{constructor(){super();this.kernel=new RestoreKernel(sampleRate);this.offset=0;this.port.onmessage=e=>{if(e.data.type==='reset'){this.kernel=new RestoreKernel(sampleRate);this.kernel.setState(e.data.state);}else if(e.data.type==='state')this.kernel.setState(e.data.state);else if(e.data.type==='clock')this.offset=e.data.offset;};}process(inputs,outputs){this.kernel.processInto(inputs[0]||[],outputs[0],currentTime+this.offset);return true;}}registerProcessor('vynamp-restore',VynampRestoreProcessor);`;}
	return{Kernel,workletSource};
});