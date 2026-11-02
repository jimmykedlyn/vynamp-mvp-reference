(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VynampRestoreDSP=api;})(globalThis,()=>{
	'use strict';
	class Kernel{
	// Crepitação densa (CD arranhado/MP3): resíduo de um modelo AR (ordem 48) para frente E para trás aponta as amostras
	// que a música não explica; o buraco é refeito por interpolação AR de mínimos quadrados (LSAR) com os vizinhos.
	// Atraso fixo de `latency` amostras por estágio; o Kernel encadeia duas passadas.
	static Repair=class{
		// soft: só o excesso do resíduo é cortado (o agudo da música fica); interpolação só para estalo forte e curto.
		constructor(threshold,soft=false){
			const P=48,maxGap=soft?96:480;
			this.soft=soft;this.P=P;this.maxGap=maxGap;this.pad=3;this.latency=2*P+maxGap+40;this.threshold=threshold;
			this.mask=4095;this.raw=new Float32Array(4096);this.fix=new Float32Array(4096);this.n=-1;
			this.a=new Float64Array(P+1);this.a[0]=1;this.r=new Float64Array(P+1);this.tmp=new Float64Array(P+1);this.c=new Float64Array(P+1);
			this.window=Float64Array.from({length:1024},(_,i)=>.5-.5*Math.cos(2*Math.PI*(i+.5)/1024));this.frame=new Float64Array(1024);
			this.A=new Float64Array((maxGap+1)*(maxGap+1));this.b=new Float64Array(maxGap+1);this.keep=new Float32Array(maxGap+1);
			this.env=0;this.d2env=0;this.open=false;this.waiting=false;this.quiet=0;this.gapStart=0;this.gapEnd=0;this.repairs=0;this.clips=0;this.tail=new Float64Array(4096);
		}
		fit(){
			const P=this.P,N=1024,x=this.frame,r=this.r,a=this.a,t=this.tmp,m=this.mask,base=this.n-this.latency-N+1;
			for(let i=0;i<N;i++)x[i]=this.fix[(base+i)&m]*this.window[i];
			for(let k=0;k<=P;k++){let s=0;for(let i=k;i<N;i++)s+=x[i]*x[i-k];r[k]=s;}
			if(r[0]<1e-9)return;
			r[0]*=1.001;a.fill(0);a[0]=1;let e=r[0];
			for(let i=1;i<=P;i++){let acc=r[i];for(let j=1;j<i;j++)acc+=a[j]*r[i-j];const k=-acc/e;t.set(a);for(let j=1;j<i;j++)a[j]=t[j]+k*t[i-j];a[i]=k;e*=1-k*k;if(e<=0)break;}
		}
		push(x){
			const n=++this.n,m=this.mask,P=this.P,a=this.a,raw=this.raw;
			raw[n&m]=x;this.fix[n&m]=x;
			if(n>=1024+this.latency&&(n&255)===0)this.fit();
			const s=n-P;
			let excess=0;
			if(s>=1024+this.latency){
				let forward=raw[s&m],backward=forward;
				for(let j=1;j<=P;j++){forward+=a[j]*raw[(s-j)&m];backward+=a[j]*raw[(s+j)&m];}
				const e=Math.min(Math.abs(forward),Math.abs(backward)),d2=Math.abs(raw[s&m]-(raw[(s-1)&m]+raw[(s+1)&m])*.5);
				// Rajada de agudos em fundo de escala (MP3 de master saturado): 2ª diferença grande em absoluto.
				const burst=d2>.25&&d2>6*this.d2env;
				if(!burst)this.d2env+=(d2-this.d2env)/960;
				// Primeiras 256 amostras só calibram o resíduo típico; sem isso o envelope inicial marcaria tudo.
				if(s<1024+this.latency+256)this.env+=(e-this.env)/64;
				else{
					// Mediana móvel (~5 ms) do resíduo: a crepitação densa não infla o limiar como uma média inflaria.
					this.env=Math.max(1e-5,this.env*(e>this.env?1.004:.996));
					const hit=burst||e>this.threshold*this.env&&e>1e-3;
					if(hit&&this.soft&&!this.open&&!burst&&e<=1.5*this.threshold*this.env){
						// Corte do excesso: só o que o resíduo para frente passa do limiar vira correção (filtrada abaixo).
						excess=Math.sign(forward)*Math.max(0,Math.abs(forward)-this.threshold*this.env);this.clips++;
					}else if(hit){
						// Margem de `pad` amostras: a borda do estalo fica abaixo do limiar, mas também é dano.
						if(!this.open){
							if(this.waiting&&s-this.pad-this.gapEnd<=P)this.waiting=false;
							else{if(this.waiting)this.finish();this.gapStart=s-this.pad;}
							this.open=true;
						}
						this.quiet=0;this.gapEnd=s+this.pad;
						// Buraco longo demais para interpolar com segurança: fica como está.
						if(this.gapEnd-this.gapStart>this.maxGap){this.open=false;this.waiting=false;}
					}else if(this.open&&++this.quiet>=4){this.open=false;this.waiting=true;}
				}
			}
			// Excesso de excitação passa pelo filtro de síntese 1/A: tira o estalo junto com a cauda que ele deixa na música.
			// O resíduo vem do sinal original, não do reparado: é um filtro linear sobre o excesso, sem realimentação do corte.
			if(this.soft&&s>=0){let z=excess;for(let j=1;j<=P;j++)z-=a[j]*this.tail[(s-j)&m];this.tail[s&m]=z;this.fix[s&m]-=z;}
			if(this.waiting&&n>=this.gapEnd+P)this.finish();
			return n<this.latency?0:this.fix[(n-this.latency)&m];
		}
		finish(){
			this.waiting=false;
			const P=this.P,a=this.a,c=this.c,A=this.A,b=this.b,fix=this.fix,m=this.mask,s=this.gapStart,len=this.gapEnd-s+1;
			let around=0;for(let d=1;d<=8;d++)around=Math.max(around,Math.abs(fix[(s-d)&m]),Math.abs(fix[(s+len-1+d)&m]));
			for(let i=0;i<len;i++)this.keep[i]=fix[(s+i)&m];
			for(let d=0;d<=P;d++){let v=0;for(let k=0;k+d<=P;k++)v+=a[k]*a[k+d];c[d]=v;}
			for(let i=0;i<len;i++){
				for(let j=Math.max(0,i-P);j<=i;j++)A[i*len+j]=c[i-j];
				let v=0;const t=s+i;
				for(let d=1;d<=P;d++){if(i-d<0)v+=c[d]*fix[(t-d)&m];if(i+d>=len)v+=c[d]*fix[(t+d)&m];}
				b[i]=-v;
			}
			// Cholesky em banda (largura P): O(len·P²), cabe num quantum de áudio.
			for(let j=0;j<len;j++){
				let d=A[j*len+j];for(let k=Math.max(0,j-P);k<j;k++)d-=A[j*len+k]*A[j*len+k];
				if(!(d>1e-12))return;
				d=Math.sqrt(d);A[j*len+j]=d;
				for(let i=j+1;i<=Math.min(len-1,j+P);i++){let v=A[i*len+j];for(let k=Math.max(0,i-P);k<j;k++)v-=A[i*len+k]*A[j*len+k];A[i*len+j]=v/d;}
			}
			for(let i=0;i<len;i++){let v=b[i];for(let k=Math.max(0,i-P);k<i;k++)v-=A[i*len+k]*b[k];b[i]=v/A[i*len+i];}
			for(let i=len-1;i>=0;i--){let v=b[i];for(let k=i+1;k<=Math.min(len-1,i+P);k++)v-=A[k*len+i]*b[k];b[i]=v/A[i*len+i];}
			let peak=0;for(let i=0;i<len;i++)peak=Math.max(peak,Math.abs(b[i]));
			// Interpolação que estoura muito acima dos vizinhos é pior que o estalo: descarta.
			if(!(peak<=2*around+1e-3))return;
			for(let i=0;i<len;i++)fix[(s+i)&m]=b[i];
			this.repairs++;
		}
	};
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
			this.decrackleSens=0;this.decrackleSoft=false;
			this.state={enabled:false,monitor:'treated',scope:'all',tools:{},regions:[]};
			this.fadeTable=Float32Array.from({length:257},(_,i)=>.5-.5*Math.cos(Math.PI*i/256));
			this.noiseEnv=[0,0];
			this.noiseAlpha=Math.exp(-1/(.5*rate));
			this.denoiseSmooth=Math.exp(-1/(.01*rate));
			this.denoiseGain=[1,1];
			// De-click adaptativo: envelope do resíduo de 2ª diferença (5 ms) por canal.
			this.clickEnv=[0,0];
			this.clickAlpha=Math.exp(-1/(.005*rate));
			// Reparo AR (crepitação): duas passadas por canal; o original é atrasado junto para Original × Tratado alinhar.
			this.repair=null;
			this.repairLP=null;
			this.originalDelay=null;
			this.pendingOriginal=[0,0];
			this.blocks=null;
			// FIR passa-baixa de fase linear, 63 coeficientes (sinc com janela de Kaiser, β=6), corte em 18 kHz.
			const cut=Math.min(18000,.4*rate)/rate,I0=v=>{let sum=1,term=1;for(let k=1;k<30;k++){term*=(v/(2*k))**2;sum+=term;}return sum;};
			this.lpTaps=Float32Array.from({length:63},(_,i)=>{const t=i-31,w=I0(6*Math.sqrt(1-(t/31)**2))/I0(6);return(t?Math.sin(2*Math.PI*cut*t)/(Math.PI*t):2*cut)*w;});
			const tapSum=this.lpTaps.reduce((p,q)=>p+q,0);for(let i=0;i<63;i++)this.lpTaps[i]/=tapSum;
			// Atraso total do kernel em amostras (exportação desconta).
			this.latency=1;
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
			const decrackle=state.tools?.decrackle||0,soft=state.tools?.decrackleMode==='soft';
			if(decrackle!==this.decrackleSens||soft!==this.decrackleSoft){
				this.decrackleSens=decrackle;this.decrackleSoft=soft;
				// Intensidade 0,05–0,5 → limiar de 5,5 a 3× a mediana do resíduo (mais alto = mais agressivo; 0,15 → 4,5).
				const limit=Math.max(3,6-10*decrackle);
				this.repair=decrackle>0?[0,1].map(()=>[new Kernel.Repair(limit,soft),new Kernel.Repair(limit,soft)]):null;
				// Passa-baixa de fase linear (~18 kHz): a interpolação deixa resíduo acima da banda do MP3, que soa como chiado fino.
				this.repairLP=this.repair?[0,1].map(()=>({line:new Float32Array(this.lpTaps.length),index:0})):null;
				const delay=this.repair?this.repair[0][0].latency*2+(this.lpTaps.length-1)/2:0;
				this.originalDelay=this.repair?[0,1].map(()=>({buffer:new Float32Array(delay),index:0})):null;
				this.latency=1+delay;
			}
		}
		processInto(input,output,start){
			const state=this.state,t=state.tools||{},n=output[0]?.length||0,chCount=output.length,fs=this.rate;
			const attack=Math.exp(-1/(.003*fs)),release=Math.exp(-1/(.12*fs)),smooth=Math.exp(-1/(.006*fs));
			const threshold=10**((t.threshold??-45)/20),denoiseAmount=t.denoise||0;
			// Anti-saturação: headroom (dB) + joelho suave acima de -1 dBFS. Recupera masters/MP3 que passam de 0 dBFS.
			const declip=t.declip||0,declipGain=10**(declip/20),knee=.89;
			let targetOriginal=state.enabled&&state.monitor!=='original'?state.monitor==='removed'?1:0:1;
			let targetTreated=state.enabled&&state.monitor!=='original'?state.monitor==='removed'?-1:1:0;
			let originalInput=input;
			if(this.repair){
				if(!this.blocks||this.blocks.length<n*4)this.blocks=new Float32Array(n*4);
				const repaired=[0,1].map(ch=>this.blocks.subarray(ch*n,(ch+1)*n)),delayed=[0,1].map(ch=>this.blocks.subarray((2+ch)*n,(3+ch)*n));
				for(let ch=0;ch<chCount;ch++){
					const [first,second]=this.repair[ch],line=this.originalDelay[ch],buffer=line.buffer,lp=this.repairLP[ch],taps=this.lpTaps,len=taps.length;
					for(let i=0;i<n;i++){
						const x=input[ch]?.[i]||0;
						lp.line[lp.index]=second.push(first.push(x));
						let y=0;for(let k=0,j=lp.index;k<len;k++,j=j?j-1:len-1)y+=taps[k]*lp.line[j];
						lp.index=(lp.index+1)%len;repaired[ch][i]=y;
						delayed[ch][i]=buffer[line.index];buffer[line.index]=x;line.index=(line.index+1)%buffer.length;
					}
				}
				input=repaired;originalInput=delayed;
			}
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
				for(let ch=0;ch<chCount;ch++){
					const incoming=input[ch]?.[i]||0,raw=this.pending[ch]||0,previous=this.previous[ch]||0;
					const original=this.repair?this.pendingOriginal[ch]:raw;
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
					if(declip){
						value*=declipGain;
						const magnitude=Math.abs(value);
						if(magnitude>knee)value=Math.sign(value)*(knee+(1-knee)*Math.tanh((magnitude-knee)/(1-knee)));
					}
					const treated=(original+(value-original)*scope)*gain;
					output[ch][i]=original*this.originalWeight+treated*this.treatedWeight;
					this.previous[ch]=raw;
					this.pending[ch]=incoming;
					this.pendingOriginal[ch]=originalInput[ch]?.[i]||0;
				}
			}
		}
	}
	function workletSource(){return 'const RestoreKernel='+Kernel.toString()+`;class VynampRestoreProcessor extends AudioWorkletProcessor{constructor(){super();this.kernel=new RestoreKernel(sampleRate);this.offset=0;this.port.onmessage=e=>{if(e.data.type==='reset'){this.kernel=new RestoreKernel(sampleRate);this.kernel.setState(e.data.state);}else if(e.data.type==='state')this.kernel.setState(e.data.state);else if(e.data.type==='clock')this.offset=e.data.offset;};}process(inputs,outputs){this.kernel.processInto(inputs[0]||[],outputs[0],currentTime+this.offset);return true;}}registerProcessor('vynamp-restore',VynampRestoreProcessor);`;}
	return{Kernel,workletSource};
});