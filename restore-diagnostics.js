// Motor de Diagnóstico / Relatório de Saúde do Áudio (#20a)
// Funções puras para análise offline — sem dependências de DOM ou AudioWorklet.
// Uso: no worker (restore-worker.js) e em testes unitários.
(function(root, factory) {
	const api = factory();
	// __factory (não-enumerável) permite embutir este módulo no source do worker,
	// que roda num Blob isolado sem acesso ao escopo global da página.
	Object.defineProperty(api, '__factory', { value: factory, enumerable: false });
	if (typeof module === 'object' && module.exports) module.exports = api;
	else root.VynampRestoreDiagnostics = api;
})(globalThis, () => {
	'use strict';

	// ─── Utilitários ────────────────────────────────────────────────────────
	function rms(arr, start = 0, end = arr.length) {
		let sum = 0;
		for (let i = start; i < end; i++) sum += arr[i] * arr[i];
		return Math.sqrt(sum / (end - start));
	}

	function dbFromLinear(v) {
		return 20 * Math.log10(Math.max(1e-10, v));
	}

	function fft(real, imag) {
		const n = real.length;
		for (let i = 1, j = 0; i < n; i++) {
			let bit = n >> 1;
			for (; j & bit; bit >>= 1) j ^= bit;
			j ^= bit;
			if (i < j) { [real[i], real[j]] = [real[j], real[i]]; }
		}
		for (let len = 2; len <= n; len <<= 1) {
			const wr = Math.cos(-2 * Math.PI / len), wi = Math.sin(-2 * Math.PI / len);
			for (let i = 0; i < n; i += len) {
				let ar = 1, ai = 0;
				for (let j = 0; j < len / 2; j++) {
					const k = i + j, l = k + len / 2;
					const br = real[l] * ar - imag[l] * ai, bi = real[l] * ai + imag[l] * ar;
					real[l] = real[k] - br; imag[l] = imag[k] - bi;
					real[k] += br; imag[k] += bi;
					const next = ar * wr - ai * wi; ai = ar * wi + ai * wr; ar = next;
				}
			}
		}
	}

	// Frequências musicais padrão (A4=440Hz) para descartar tons sustentados
	function isMusicalTone(freq, tolerance = 0.03) {
		// Verifica se a frequência está próxima de uma nota musical (temperamento igual)
		if (freq < 20 || freq > 20000) return false;
		const midi = 69 + 12 * Math.log2(freq / 440);
		const nearest = Math.round(midi);
		const deviation = Math.abs(midi - nearest);
		return deviation < tolerance;
	}

	// ─── Detectores individuais ─────────────────────────────────────────────

	/**
	 * Detecta cliques isolados por diferença entre amostra e média dos vizinhos.
	 * Retorna { count, examples[] } por canal.
	 */
	function detectClicks(channels, rate, threshold = 0.15, maxExamples = 10) {
		const results = channels.map(() => ({ count: 0, examples: [] }));
		for (let ch = 0; ch < channels.length; ch++) {
			const data = channels[ch];
			for (let i = 1; i < data.length - 1; i++) {
				const expected = (data[i - 1] + data[i + 1]) * 0.5;
				const diff = Math.abs(data[i] - expected);
				const neighborDiff = Math.abs(data[i - 1] - data[i + 1]);
				if (diff > threshold && neighborDiff < threshold * 0.75) {
					results[ch].count++;
					if (results[ch].examples.length < maxExamples) {
						results[ch].examples.push(i / rate);
					}
				}
			}
		}
		return results;
	}

	/**
	 * Detecta crepitação densa no canal lateral (L-R)/2.
	 * Se taxa lateral > 2x taxa mid, marca como predominante.
	 */
	function detectCrackle(channels, rate, threshold = 0.08, maxExamples = 10) {
		if (channels.length < 2) return null;
		const left = channels[0], right = channels[1];
		let sideCount = 0, midCount = 0;
		const sideExamples = [];
		for (let i = 1; i < left.length - 1; i++) {
			const side = (left[i] - right[i]) * 0.5;
			const mid = (left[i] + right[i]) * 0.5;
			const sideExpected = ((left[i - 1] - right[i - 1]) + (left[i + 1] - right[i + 1])) * 0.25;
			const midExpected = ((left[i - 1] + right[i - 1]) + (left[i + 1] + right[i + 1])) * 0.25;
			if (Math.abs(side - sideExpected) > threshold) {
				sideCount++;
				if (sideExamples.length < maxExamples) sideExamples.push(i / rate);
			}
			if (Math.abs(mid - midExpected) > threshold) midCount++;
		}
		const dominant = sideCount > midCount * 2;
		if (sideCount === 0 && midCount === 0) return null;
		return {
			count: sideCount,
			midCount,
			lateralDominant: dominant,
			examples: sideExamples
		};
	}

	/**
	 * Detecta zumbido 50/60Hz e harmônicos via FFT.
	 * Descarta picos que coincidem com notas musicais.
	 */
	function detectHum(channels, rate, fftSize = 4096) {
		const candidates = [50, 60];
		const detected = [];
		const data = channels[0];
		const windowFn = Float64Array.from({ length: fftSize }, (_, i) =>
			0.5 - 0.5 * Math.cos(2 * Math.PI * i / (fftSize - 1))
		);

		// Preparar uma janela FFT central para comparação com vizinhos
		const centerOffset = Math.max(0, Math.floor(data.length / 2) - Math.floor(fftSize / 2));
		const realCenter = new Float64Array(fftSize);
		const imagCenter = new Float64Array(fftSize);
		for (let i = 0; i < fftSize && centerOffset + i < data.length; i++) {
			realCenter[i] = (data[centerOffset + i] || 0) * windowFn[i];
		}
		fft(realCenter, imagCenter);

		for (const baseFreq of candidates) {
			const harmonics = [];
			let peakBinDB = -Infinity;
			let allProminent = true;

			for (let h = 1; h <= 4; h++) {
				const freq = baseFreq * h;
				if (freq >= rate * 0.45) break;
				const binIndex = Math.round(freq * fftSize / rate);
				if (binIndex < 1 || binIndex >= fftSize / 2) break;

				// Energia no bin do harmônico (janela central)
				const mag = Math.hypot(realCenter[binIndex], imagCenter[binIndex]) / fftSize * 4;
				const energyDB = dbFromLinear(mag);

				// Média dos vizinhos (±5 bins, excluindo o próprio)
				let neighborAvg = 0;
				let neighborCount = 0;
				for (let b = Math.max(1, binIndex - 5); b <= Math.min(fftSize / 2 - 1, binIndex + 5); b++) {
					if (b === binIndex) continue;
					neighborAvg += Math.hypot(realCenter[b], imagCenter[b]) / fftSize * 4;
					neighborCount++;
				}
				if (neighborCount > 0) neighborAvg /= neighborCount;
				const neighborDB = dbFromLinear(neighborAvg);
				const prominence = energyDB - neighborDB;

				if (prominence > 10) {
					harmonics.push({ frequency: freq, prominence });
					peakBinDB = Math.max(peakBinDB, prominence);
				} else {
					allProminent = false;
				}
			}

			// Exige pelo menos o fundamental proeminente; harmônicos são opcionais
			if (harmonics.length > 0 && harmonics[0].frequency === baseFreq) {
				const fundamentalIsMusical = isMusicalTone(baseFreq, 0.05);
				if (!fundamentalIsMusical || harmonics.length >= 2) {
					detected.push({
						frequency: baseFreq,
						harmonics: harmonics.map(h => h.frequency),
						prominence: peakBinDB
					});
				}
			}
		}
		return detected;
	}

	/**
	 * Detecta chiado (hiss): energia alta em bandas agudas com espectro plano.
	 */
	function detectHiss(channels, rate, fftSize = 4096) {
		const data = channels[0];
		const windowFn = Float64Array.from({ length: fftSize }, (_, i) =>
			0.5 - 0.5 * Math.cos(2 * Math.PI * i / (fftSize - 1))
		);

		let totalEnergy = 0, highEnergy4_8 = 0, highEnergy8_16 = 0;
		let windowCount = 0;
		const step = Math.max(1, Math.floor(data.length / 8));

		for (let offset = 0; offset + fftSize <= data.length; offset += step) {
			const real = new Float64Array(fftSize);
			const imag = new Float64Array(fftSize);
			for (let i = 0; i < fftSize; i++) {
				real[i] = (data[offset + i] || 0) * windowFn[i];
			}
			fft(real, imag);

			let winTotal = 0, win4_8 = 0, win8_16 = 0;
			for (let k = 1; k <= fftSize / 2; k++) {
				const freq = k * rate / fftSize;
				const mag = Math.hypot(real[k], imag[k]);
				winTotal += mag * mag;
				if (freq >= 4000 && freq < 8000) win4_8 += mag * mag;
				if (freq >= 8000 && freq < 16000) win8_16 += mag * mag;
			}
			totalEnergy += winTotal;
			highEnergy4_8 += win4_8;
			highEnergy8_16 += win8_16;
			windowCount++;
		}

		if (windowCount === 0 || totalEnergy === 0) return null;
		highEnergy4_8 /= windowCount;
		highEnergy8_16 /= windowCount;
		totalEnergy /= windowCount;

		const ratio4_8 = highEnergy4_8 / totalEnergy;
		const ratio8_16 = highEnergy8_16 / totalEnergy;
		const highRatio = ratio4_8 + ratio8_16;

		// Chiado: >30% da energia acima de 4kHz com distribuição relativamente plana
		if (highRatio > 0.30) {
			// Verificar "planura": variância espectral baixa nas bandas altas
			return {
				energyRatio: highRatio,
				ratio4_8,
				ratio8_16,
				flatness: ratio4_8 > 0 && ratio8_16 > 0 ? Math.min(ratio4_8, ratio8_16) / Math.max(ratio4_8, ratio8_16) : 0
			};
		}
		return null;
	}

	/**
	 * Detecta ronco (<40Hz): RMS na banda 5-40Hz.
	 */
	function detectRumble(channels, rate, fftSize = 4096) {
		const data = channels[0];
		const windowFn = Float64Array.from({ length: fftSize }, (_, i) =>
			0.5 - 0.5 * Math.cos(2 * Math.PI * i / (fftSize - 1))
		);

		let rumbleEnergy = 0, windowCount = 0;
		const step = Math.max(1, Math.floor(data.length / 8));

		for (let offset = 0; offset + fftSize <= data.length; offset += step) {
			const real = new Float64Array(fftSize);
			const imag = new Float64Array(fftSize);
			for (let i = 0; i < fftSize; i++) {
				real[i] = (data[offset + i] || 0) * windowFn[i];
			}
			fft(real, imag);

			let bandEnergy = 0;
			for (let k = 1; k <= fftSize / 2; k++) {
				const freq = k * rate / fftSize;
				if (freq >= 5 && freq < 40) {
					bandEnergy += Math.hypot(real[k], imag[k]) ** 2;
				}
			}
			rumbleEnergy += bandEnergy / (fftSize * fftSize);
			windowCount++;
		}

		if (windowCount === 0) return null;
		const rmsValue = Math.sqrt(rumbleEnergy / windowCount);
		const dbValue = dbFromLinear(rmsValue);

		if (dbValue > -30) {
			return { rmsDB: dbValue, rmsLinear: rmsValue };
		}
		return null;
	}

	/**
	 * Detecta saturação/clipping: amostras com |x| > 0.999.
	 */
	function detectClipping(channels, rate, maxExamples = 10) {
		let totalSaturated = 0;
		let contiguousBlocks = 0;
		const examples = [];
		let inBlock = false;

		for (let ch = 0; ch < channels.length; ch++) {
			const data = channels[ch];
			inBlock = false;
			for (let i = 0; i < data.length; i++) {
				if (Math.abs(data[i]) > 0.999) {
					totalSaturated++;
					if (!inBlock) {
						contiguousBlocks++;
						inBlock = true;
						if (examples.length < maxExamples) examples.push(i / rate);
					}
				} else {
					inBlock = false;
				}
			}
		}

		if (totalSaturated === 0) return null;
		return {
			saturatedSamples: totalSaturated,
			contiguousBlocks,
			examples
		};
	}

	/**
	 * Estima true peak via interpolação linear 2x.
	 */
	function detectTruePeak(channels) {
		let maxInterpolated = 0;
		for (let ch = 0; ch < channels.length; ch++) {
			const data = channels[ch];
			for (let i = 0; i < data.length - 1; i++) {
				// Interpolação linear entre amostras adjacentes
				const mid = Math.abs((data[i] + data[i + 1]) * 0.5);
				maxInterpolated = Math.max(maxInterpolated, mid, Math.abs(data[i]));
			}
		}
		if (maxInterpolated > 1.0) {
			return { truePeak: maxInterpolated, truePeakDB: dbFromLinear(maxInterpolated) };
		}
		return null;
	}

	/**
	 * Detecta cortes/discontinuidades: saltos > 0.3 entre amostras adjacentes.
	 */
	function detectDiscontinuities(channels, rate, threshold = 0.3, maxExamples = 10) {
		const examples = [];
		let count = 0;
		for (let ch = 0; ch < channels.length; ch++) {
			const data = channels[ch];
			for (let i = 1; i < data.length; i++) {
				const jump = Math.abs(data[i] - data[i - 1]);
				if (jump > threshold) {
					// Excluir cliques isolados (já detectados separadamente)
					const prevJump = i > 1 ? Math.abs(data[i - 1] - data[i - 2]) : 0;
					const nextJump = i < data.length - 1 ? Math.abs(data[i + 1] - data[i]) : 0;
					if (prevJump > threshold * 0.3 || nextJump > threshold * 0.3) {
						count++;
						if (examples.length < maxExamples) examples.push(i / rate);
					}
				}
			}
		}
		if (count === 0) return null;
		return { count, examples };
	}

	/**
	 * Detecta pulos/repetições: correlação cruzada entre blocos consecutivos de 588 amostras.
	 */
	function detectSkips(channels, rate, blockSize = 588, threshold = 0.95, maxExamples = 10) {
		const data = channels[0];
		const examples = [];
		let count = 0;

		for (let offset = 0; offset + blockSize * 2 <= data.length; offset += blockSize) {
			let dotProduct = 0, normA = 0, normB = 0;
			for (let i = 0; i < blockSize; i++) {
				const a = data[offset + i];
				const b = data[offset + blockSize + i];
				dotProduct += a * b;
				normA += a * a;
				normB += b * b;
			}
			const denom = Math.sqrt(normA * normB);
			if (denom > 1e-10) {
				const correlation = dotProduct / denom;
				if (correlation > threshold) {
					count++;
					if (examples.length < maxExamples) examples.push(offset / rate);
				}
			}
		}

		if (count === 0) return null;
		return { count, blockSize, examples };
	}

	/**
	 * Detecta DC offset: média por canal.
	 */
	function detectDCOffset(channels, rate, threshold = 0.005) {
		const results = [];
		for (let ch = 0; ch < channels.length; ch++) {
			const data = channels[ch];
			let sum = 0;
			for (let i = 0; i < data.length; i++) sum += data[i];
			const mean = sum / data.length;
			if (Math.abs(mean) > threshold) {
				results.push({ channel: ch, offset: mean, offsetDB: dbFromLinear(Math.abs(mean)) });
			}
		}
		return results.length > 0 ? results : null;
	}

	/**
	 * Estima limite efetivo de frequência: frequência mais alta com energia > -60dBFS.
	 */
	function estimateEffectiveNyquist(channels, rate, fftSize = 4096) {
		const data = channels[0];
		const windowFn = Float64Array.from({ length: fftSize }, (_, i) =>
			0.5 - 0.5 * Math.cos(2 * Math.PI * i / (fftSize - 1))
		);

		// Acumular espectro médio
		const spectrumSum = new Float64Array(fftSize / 2 + 1);
		let windowCount = 0;
		const step = Math.max(1, Math.floor(data.length / 8));

		for (let offset = 0; offset + fftSize <= data.length; offset += step) {
			const real = new Float64Array(fftSize);
			const imag = new Float64Array(fftSize);
			for (let i = 0; i < fftSize; i++) {
				real[i] = (data[offset + i] || 0) * windowFn[i];
			}
			fft(real, imag);
			for (let k = 0; k <= fftSize / 2; k++) {
				spectrumSum[k] += Math.hypot(real[k], imag[k]);
			}
			windowCount++;
		}

		if (windowCount === 0) return rate / 2;

		// Normalizar e encontrar corte
		let maxMag = 0;
		for (let k = 0; k <= fftSize / 2; k++) {
			spectrumSum[k] /= windowCount;
			maxMag = Math.max(maxMag, spectrumSum[k]);
		}

		const threshold = maxMag * 1e-3; // -60dB
		let effectiveFreq = 20;
		for (let k = fftSize / 2; k >= 1; k--) {
			if (spectrumSum[k] > threshold) {
				effectiveFreq = k * rate / fftSize;
				break;
			}
		}

		return Math.min(effectiveFreq, rate / 2);
	}

	// ─── Orquestrador principal ─────────────────────────────────────────────

	/**
	 * Executa todos os detectores e monta o relatório estruturado.
	 * @param {Float32Array[]} channels - Array de canais de áudio
	 * @param {number} rate - Sample rate
	 * @returns {Object} Relatório de diagnóstico
	 */
	function analyze(channels, rate) {
		const duration = channels[0].length / rate;
		const defects = [];

		// 1. Cliques
		const clicks = detectClicks(channels, rate);
		const totalClicks = clicks.reduce((sum, c) => sum + c.count, 0);
		if (totalClicks > 0) {
			const allExamples = clicks.flatMap(c => c.examples).sort((a, b) => a - b).slice(0, 10);
			defects.push({
				type: 'click',
				severity: totalClicks > 100 ? 'severe' : totalClicks > 20 ? 'moderate' : 'mild',
				count: totalClicks,
				examples: allExamples,
				suggestion: `Ativar de-click com sensibilidade ${totalClicks > 100 ? '0.25' : totalClicks > 20 ? '0.15' : '0.10'}`
			});
		}

		// 2. Crepitação
		const crackle = detectCrackle(channels, rate);
		if (crackle && crackle.count > 0) {
			defects.push({
				type: 'crackle',
				severity: crackle.lateralDominant ? 'moderate' : 'mild',
				count: crackle.count,
				lateralDominant: crackle.lateralDominant,
				examples: crackle.examples.slice(0, 10),
				suggestion: crackle.lateralDominant
					? 'Crepitação predominante no canal lateral — verificar fonte estéreo'
					: 'Ativar de-crackle adaptativo'
			});
		}

		// 3. Zumbido
		const hums = detectHum(channels, rate);
		for (const hum of hums) {
			defects.push({
				type: hum.frequency === 50 ? 'hum50' : 'hum60',
				severity: hum.prominence > 20 ? 'severe' : 'moderate',
				frequency: hum.frequency,
				harmonics: hum.harmonics.filter(h => h !== hum.frequency),
				examples: [0, duration / 2].filter(t => t < duration),
				suggestion: `Ativar hum notch em ${hum.frequency} Hz`
			});
		}

		// 4. Chiado
		const hiss = detectHiss(channels, rate);
		if (hiss) {
			defects.push({
				type: 'hiss',
				severity: hiss.energyRatio > 0.5 ? 'severe' : hiss.energyRatio > 0.35 ? 'moderate' : 'mild',
				energyRatio: hiss.energyRatio,
				examples: [duration * 0.25, duration * 0.75].filter(t => t < duration),
				suggestion: 'Ativar denoise espectral — ajustar intensidade conforme perfil de ruído'
			});
		}

		// 5. Ronco
		const rumble = detectRumble(channels, rate);
		if (rumble) {
			defects.push({
				type: 'rumble',
				severity: rumble.rmsDB > -20 ? 'severe' : 'moderate',
				rmsDB: rumble.rmsDB,
				examples: [0],
				suggestion: 'Ativar filtro passa-altas em 30 Hz (de-rumble)'
			});
		}

		// 6. Saturação
		const clipping = detectClipping(channels, rate);
		if (clipping) {
			defects.push({
				type: 'clipping',
				severity: clipping.saturatedSamples > 1000 ? 'severe' : clipping.saturatedSamples > 100 ? 'moderate' : 'mild',
				saturatedSamples: clipping.saturatedSamples,
				contiguousBlocks: clipping.contiguousBlocks,
				examples: clipping.examples,
				suggestion: 'Aplicar limiter true-peak antes da exportação'
			});
		}

		// 7. True peak
		const truePeak = detectTruePeak(channels);
		if (truePeak) {
			defects.push({
				type: 'true_peak',
				severity: truePeak.truePeak > 1.1 ? 'severe' : 'moderate',
				truePeak: truePeak.truePeak,
				truePeakDB: truePeak.truePeakDB,
				examples: [],
				suggestion: 'Aplicar true-peak limiter com teto -1 dBTP'
			});
		}

		// 8. Discontinuidades
		const discontinuities = detectDiscontinuities(channels, rate);
		if (discontinuities) {
			defects.push({
				type: 'discontinuity',
				severity: discontinuities.count > 50 ? 'severe' : 'moderate',
				count: discontinuities.count,
				examples: discontinuities.examples,
				suggestion: 'Verificar integridade do arquivo — possíveis erros de leitura/gravação'
			});
		}

		// 9. Pulos/repetições
		const skips = detectSkips(channels, rate);
		if (skips) {
			defects.push({
				type: 'skip',
				severity: skips.count > 10 ? 'severe' : 'moderate',
				count: skips.count,
				blockSize: skips.blockSize,
				examples: skips.examples,
				suggestion: 'Arquivo possivelmente corrompido — verificar origem'
			});
		}

		// 10. DC offset
		const dcOffsets = detectDCOffset(channels, rate);
		if (dcOffsets) {
			defects.push({
				type: 'dc_offset',
				severity: dcOffsets.some(d => Math.abs(d.offset) > 0.02) ? 'severe' : 'moderate',
				channels: dcOffsets,
				examples: [0],
				suggestion: 'Ativar correção DC offset'
			});
		}

		// 11. Limite efetivo de frequência
		const effectiveNyquist = estimateEffectiveNyquist(channels, rate);

		// Montar cadeia sugerida
		const chain = buildChain(defects);

		// Resumo textual
		const summary = buildSummary(defects, duration);

		return {
			duration,
			sampleRate: rate,
			channels: channels.length,
			defects,
			chain,
			effectiveNyquist: Math.round(effectiveNyquist),
			summary
		};
	}

	/**
	 * Constrói cadeia de correção sugerida baseada nos defeitos encontrados.
	 * Ordem: dc → hum → rumble → click → crackle → denoise → limiter
	 */
	function buildChain(defects) {
		const order = ['dc_offset', 'hum50', 'hum60', 'rumble', 'click', 'crackle', 'hiss', 'clipping', 'true_peak'];
		const moduleMap = {
			dc_offset: 'dc',
			hum50: 'hum',
			hum60: 'hum',
			rumble: 'rumble',
			click: 'click',
			crackle: 'denoise',
			hiss: 'denoise',
			clipping: 'limiter',
			true_peak: 'limiter'
		};

		const seen = new Set();
		const chain = [];
		for (const type of order) {
			if (defects.some(d => d.type === type)) {
				const mod = moduleMap[type];
				if (mod && !seen.has(mod)) {
					seen.add(mod);
					chain.push(mod);
				}
			}
		}
		return chain;
	}

	/**
	 * Gera resumo textual do diagnóstico.
	 */
	function buildSummary(defects, duration) {
		if (defects.length === 0) {
			return `Áudio limpo — ${duration.toFixed(1)}s sem defeitos detectados.`;
		}

		const parts = [];
		const severe = defects.filter(d => d.severity === 'severe');
		const moderate = defects.filter(d => d.severity === 'moderate');
		const mild = defects.filter(d => d.severity === 'mild');

		const labelMap = {
			click: 'cliques', crackle: 'crepitação', hum50: 'zumbido de 50Hz',
			hum60: 'zumbido de 60Hz', hiss: 'chiado', rumble: 'ronco grave',
			clipping: 'saturação', true_peak: 'true peak excedido',
			discontinuity: 'descontinuidades', skip: 'pulos/repetições',
			dc_offset: 'DC offset'
		};

		for (const group of [severe, moderate, mild]) {
			for (const d of group) {
				const label = labelMap[d.type] || d.type;
				const sevPt = d.severity === 'severe' ? 'severo' : d.severity === 'moderate' ? 'moderado' : 'leve';
				if (d.count !== undefined) {
					parts.push(`${d.count} ${label} (${sevPt})`);
				} else {
					parts.push(`${label} ${sevPt}`);
				}
			}
		}

		return `Faixa com ${parts.join(', ')}.`;
	}

	return {
		analyze,
		detectClicks,
		detectCrackle,
		detectHum,
		detectHiss,
		detectRumble,
		detectClipping,
		detectTruePeak,
		detectDiscontinuities,
		detectSkips,
		detectDCOffset,
		estimateEffectiveNyquist,
		buildChain,
		buildSummary
	};
});