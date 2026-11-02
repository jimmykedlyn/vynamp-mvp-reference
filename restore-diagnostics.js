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

	const CLIP_LEVEL = 0.9;
	const MAX_EVENTS = 20000;

	function nearFullScale(channels, i, radius = 3) {
		for (const data of channels) {
			for (let j = Math.max(0, i - radius); j <= Math.min(data.length - 1, i + radius); j++) {
				if (Math.abs(data[j]) >= CLIP_LEVEL) return true;
			}
		}
		return false;
	}

	/**
	 * Impulsos adaptativos: resíduo da 2ª diferença acima de um piso absoluto E `ratio`× acima da média
	 * dos últimos 10 ms. Eventos a menos de 2 ms se fundem; os encostados no fundo de escala (±3 amostras
	 * ≥ 0.9) vão para `nearClip`, porque nesse caso o estalo é saturação, não clique.
	 * Retorna { count, nearClip, events: [[tempo, intensidade]] }.
	 */
	function findImpulses(data, rate, floor, clipChannels, ratio = 20) {
		const n = data.length, mergeGap = Math.round(rate * 0.002), residuals = new Float32Array(n);
		for (let i = 1; i < n - 1; i++) residuals[i] = Math.abs(data[i] - (data[i - 1] + data[i + 1]) * 0.5);
		const mean = centredMean(residuals, Math.max(4, Math.round(rate * 0.005)));
		const events = [];
		let count = 0, nearClip = 0, last = -Infinity, lastEvent = null;
		for (let i = 1; i < n - 1; i++) {
			const residual = residuals[i];
			if (residual > floor && residual > ratio * mean(i) && Math.abs(data[i - 1] - data[i + 1]) < residual * 0.75) {
				if (i - last <= mergeGap) {
					if (lastEvent && residual > lastEvent[1]) lastEvent[1] = residual;
				} else if (nearFullScale(clipChannels, i)) {
					nearClip++;
					lastEvent = null;
				} else {
					count++;
					lastEvent = [i / rate, residual];
					if (events.length < MAX_EVENTS) events.push(lastEvent);
				}
				last = i;
			}
		}
		return { count, nearClip, events };
	}

	/**
	 * Média móvel centrada (janela 2·half+1) consultada em ordem crescente de índice.
	 * Centrada para não confundir o ataque de uma nota depois de um trecho calmo com um clique.
	 */
	function centredMean(values, half) {
		let sum = 0, lo = 0, hi = -1;
		return i => {
			const from = Math.max(0, i - half), to = Math.min(values.length - 1, i + half);
			while (hi < to) sum += values[++hi];
			while (lo < from) sum -= values[lo++];
			return sum / (to - from + 1);
		};
	}

	/**
	 * Escolhe até `max` instantes espalhados pela faixa: o evento mais forte de cada fatia de tempo.
	 * Evita a lista de "0:00, 0:00, 0:00" dos primeiros N eventos.
	 */
	function spreadCollector(duration, max = 6) {
		const best = new Array(max).fill(null);
		return {
			add(time, strength) {
				const slot = Math.min(max - 1, Math.max(0, Math.floor(time / Math.max(1e-9, duration) * max)));
				if (!best[slot] || strength > best[slot][1]) best[slot] = [time, strength];
			},
			times: () => best.filter(Boolean).map(e => e[0]).sort((a, b) => a - b)
		};
	}

	function spreadExamples(events, duration, max = 6) {
		if (events.length <= max) return events.map(e => e[0]).sort((a, b) => a - b);
		const spread = spreadCollector(duration, max);
		for (const e of events) spread.add(e[0], e[1]);
		return spread.times();
	}

	function mergeEvents(lists, gap) {
		const all = lists.flat().sort((a, b) => a[0] - b[0]), merged = [];
		for (const e of all) {
			const prev = merged[merged.length - 1];
			if (prev && e[0] - prev[0] <= gap) { if (e[1] > prev[1]) prev[1] = e[1]; }
			else merged.push([e[0], e[1]]);
		}
		return merged;
	}

	/**
	 * Detecta cliques isolados (impulsos adaptativos, ver findImpulses).
	 * Retorna por canal { count, nearClip, examples[], events[] }.
	 */
	function detectClicks(channels, rate, threshold = 0.02, maxExamples = 6) {
		const duration = (channels[0]?.length || 0) / rate;
		return channels.map(data => {
			const found = findImpulses(data, rate, threshold, channels);
			return { ...found, examples: spreadExamples(found.events, duration, maxExamples) };
		});
	}

	/**
	 * Detecta crepitação no canal lateral (L-R)/2 com o mesmo detector adaptativo.
	 * Se a taxa lateral > 2× a do mid, marca como predominante (típico de vinil gasto).
	 */
	function detectCrackle(channels, rate, threshold = 0.02, maxExamples = 6) {
		if (channels.length < 2) return null;
		const left = channels[0], right = channels[1], n = left.length;
		const side = new Float32Array(n), mid = new Float32Array(n);
		for (let i = 0; i < n; i++) { side[i] = (left[i] - right[i]) * 0.5; mid[i] = (left[i] + right[i]) * 0.5; }
		const sideFound = findImpulses(side, rate, threshold, channels);
		const midFound = findImpulses(mid, rate, threshold, channels);
		if (sideFound.count === 0 && midFound.count === 0) return null;
		return {
			count: sideFound.count,
			midCount: midFound.count,
			nearClip: sideFound.nearClip,
			lateralDominant: sideFound.count > midFound.count * 2,
			events: sideFound.events,
			examples: spreadExamples(sideFound.events, n / rate, maxExamples)
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
	function detectClipping(channels, rate, maxExamples = 6) {
		let totalSaturated = 0, contiguousBlocks = 0, overs = 0, peak = 0;
		const spread = spreadCollector((channels[0]?.length || 0) / rate, maxExamples);
		let inBlock = false;

		for (let ch = 0; ch < channels.length; ch++) {
			const data = channels[ch];
			inBlock = false;
			for (let i = 0; i < data.length; i++) {
				const magnitude = Math.abs(data[i]);
				if (magnitude > peak) peak = magnitude;
				if (magnitude > 1) overs++;
				if (magnitude > 0.999) {
					totalSaturated++;
					if (!inBlock) {
						contiguousBlocks++;
						inBlock = true;
					}
					spread.add(i / rate, magnitude);
				} else {
					inBlock = false;
				}
			}
		}

		if (totalSaturated === 0) return null;
		const peakDB = dbFromLinear(peak);
		return {
			saturatedSamples: totalSaturated,
			contiguousBlocks,
			overs,
			peak,
			peakDB,
			// Ganho de folga do anti-saturação: leva o pico para ~-1 dBFS (mínimo -1 dB, máximo -12 dB).
			headroomDB: -Math.min(12, Math.max(1, Math.ceil(peakDB + 1))),
			examples: spread.times()
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
	function detectDiscontinuities(channels, rate, threshold = 0.3, maxExamples = 6) {
		const events = [], mergeGap = Math.round(rate * 0.002), half = Math.max(4, Math.round(rate * 0.005));
		let count = 0, last = -Infinity;
		for (let ch = 0; ch < channels.length; ch++) {
			const data = channels[ch], jumps = new Float32Array(data.length);
			for (let i = 1; i < data.length; i++) jumps[i] = Math.abs(data[i] - data[i - 1]);
			const mean = centredMean(jumps, half);
			last = -Infinity;
			for (let i = 1; i < data.length; i++) {
				const jump = jumps[i];
				// Música com agudos fortes salta muito entre amostras: só conta o salto fora do padrão do entorno.
				if (jump > threshold && jump > 12 * mean(i)) {
					// Excluir cliques isolados (já detectados separadamente) e saltos em picos saturados
					const prevJump = i > 1 ? Math.abs(data[i - 1] - data[i - 2]) : 0;
					const nextJump = i < data.length - 1 ? Math.abs(data[i + 1] - data[i]) : 0;
					if ((prevJump > threshold * 0.3 || nextJump > threshold * 0.3) && i - last > mergeGap && !nearFullScale(channels, i)) {
						count++;
						if (events.length < MAX_EVENTS) events.push([i / rate, jump]);
					}
					last = i;
				}
			}
		}
		if (count === 0) return null;
		return { count, examples: spreadExamples(events.sort((a, b) => a[0] - b[0]), (channels[0]?.length || 0) / rate, maxExamples) };
	}

	/**
	 * Detecta pulos/repetições: correlação cruzada entre blocos consecutivos de 588 amostras.
	 */
	function detectSkips(channels, rate, blockSize = 588, threshold = 0.995, maxExamples = 6) {
		const data = channels[0];
		const events = [];
		let count = 0, previous = -Infinity;

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
				// Blocos seguidos com a mesma repetição contam como um pulo só.
				if (correlation > threshold) {
					if (offset - previous > blockSize) {
						count++;
						if (events.length < MAX_EVENTS) events.push([offset / rate, correlation]);
					}
					previous = offset;
				}
			}
		}

		if (count === 0) return null;
		return { count, blockSize, examples: spreadExamples(events, data.length / rate, maxExamples) };
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
		const minutes = Math.max(duration / 60, 1 / 60);
		const perMinute = count => Math.round(count / minutes * 10) / 10;
		const byRate = (count, severe, moderate) => {
			const value = count / minutes;
			return value > severe ? 'severe' : value > moderate ? 'moderate' : 'mild';
		};
		const defects = [];

		// 1. Saturação primeiro: decide se estalos encostados em 0 dBFS são cliques ou distorção.
		const clipping = detectClipping(channels, rate);
		if (clipping) {
			defects.push({
				type: 'clipping',
				severity: clipping.overs > 0 || clipping.contiguousBlocks / minutes > 60 ? 'severe' : clipping.contiguousBlocks / minutes > 10 ? 'moderate' : 'mild',
				count: clipping.contiguousBlocks,
				perMinute: perMinute(clipping.contiguousBlocks),
				saturatedSamples: clipping.saturatedSamples,
				contiguousBlocks: clipping.contiguousBlocks,
				overs: clipping.overs,
				peakDB: clipping.peakDB,
				examples: clipping.examples,
				suggestion: clipping.overs > 0
					? `Picos chegam a ${clipping.peakDB >= 0 ? '+' : ''}${clipping.peakDB.toFixed(1)} dBFS: é daí que vêm os estalos. Anti-saturação com ${clipping.headroomDB} dB de folga.`
					: `Ondas achatadas em 0 dBFS. Anti-saturação com ${clipping.headroomDB} dB de folga suaviza os picos.`,
				fix: { declip: clipping.headroomDB }
			});
		}

		// 2. True peak (só quando não há saturação, que já leva a mesma correção)
		const truePeak = detectTruePeak(channels);
		if (truePeak && !clipping) {
			defects.push({
				type: 'true_peak',
				severity: truePeak.truePeak > 1.1 ? 'severe' : 'moderate',
				truePeak: truePeak.truePeak,
				truePeakDB: truePeak.truePeakDB,
				examples: [],
				suggestion: 'Picos entre amostras passam de 0 dBFS. Anti-saturação com 2 dB de folga.',
				fix: { declip: -2 }
			});
		}

		// 3. Cliques (eventos dos dois canais fundidos: um clique estéreo conta uma vez)
		const clicks = detectClicks(channels, rate);
		const clickEvents = mergeEvents(clicks.map(c => c.events), 0.002);
		const clipClicks = clicks.reduce((sum, c) => sum + c.nearClip, 0);
		if (clickEvents.length > 0) {
			const strengths = clickEvents.map(e => e[1]).sort((a, b) => a - b);
			const typical = strengths[Math.floor(strengths.length * 0.2)];
			defects.push({
				type: 'click',
				severity: byRate(clickEvents.length, 30, 5),
				count: clickEvents.length,
				perMinute: perMinute(clickEvents.length),
				nearClip: clipClicks,
				examples: spreadExamples(clickEvents, duration),
				suggestion: 'De-click repara cada impulso com a média dos vizinhos.',
				fix: { click: true, clickThreshold: Math.round(Math.min(0.3, Math.max(0.03, typical * 0.6)) * 100) / 100 }
			});
		}

		// 4. Crepitação
		const crackle = detectCrackle(channels, rate);
		if (crackle && crackle.count > 0) {
			defects.push({
				type: 'crackle',
				severity: byRate(crackle.count, 120, 20),
				count: crackle.count,
				perMinute: perMinute(crackle.count),
				lateralDominant: crackle.lateralDominant,
				examples: crackle.examples,
				suggestion: crackle.lateralDominant
					? 'Estalos concentrados no lado estéreo (típico de vinil). De-crackle repara sem tocar no centro.'
					: 'De-crackle repara os estalos mais curtos.',
				fix: { decrackle: crackle.lateralDominant ? 0.2 : 0.15 }
			});
		}

		// 5. Zumbido (defeito contínuo: sem instantes)
		const hums = detectHum(channels, rate);
		for (const hum of hums) {
			defects.push({
				type: hum.frequency === 50 ? 'hum50' : 'hum60',
				severity: hum.prominence > 20 ? 'severe' : 'moderate',
				frequency: hum.frequency,
				harmonics: hum.harmonics.filter(h => h !== hum.frequency),
				examples: [],
				suggestion: `Filtro de zumbido em ${hum.frequency} Hz e harmônicos.`,
				fix: { hum: hum.frequency }
			});
		}

		// 6. Chiado
		const hiss = detectHiss(channels, rate);
		if (hiss) {
			defects.push({
				type: 'hiss',
				severity: hiss.energyRatio > 0.5 ? 'severe' : hiss.energyRatio > 0.35 ? 'moderate' : 'mild',
				energyRatio: hiss.energyRatio,
				examples: [],
				suggestion: 'Chiado de fundo. Use o portão de ruído nas pausas.',
				fix: null
			});
		}

		// 7. Ronco
		const rumble = detectRumble(channels, rate);
		if (rumble) {
			defects.push({
				type: 'rumble',
				severity: rumble.rmsDB > -20 ? 'severe' : 'moderate',
				rmsDB: rumble.rmsDB,
				examples: [],
				suggestion: 'Passa-altas em 30 Hz remove o ronco grave.',
				fix: { rumble: 30 }
			});
		}

		// 8. Descontinuidades
		const discontinuities = detectDiscontinuities(channels, rate);
		if (discontinuities) {
			defects.push({
				type: 'discontinuity',
				severity: byRate(discontinuities.count, 20, 3),
				count: discontinuities.count,
				perMinute: perMinute(discontinuities.count),
				examples: discontinuities.examples,
				suggestion: 'Saltos bruscos na onda. Ouça os trechos: podem ser cortes de edição ou erro de leitura.',
				fix: null
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
				suggestion: 'Trechos repetidos. Arquivo possivelmente corrompido: verifique a origem.',
				fix: null
			});
		}

		// 10. DC offset
		const dcOffsets = detectDCOffset(channels, rate);
		if (dcOffsets) {
			defects.push({
				type: 'dc_offset',
				severity: dcOffsets.some(d => Math.abs(d.offset) > 0.02) ? 'severe' : 'moderate',
				channels: dcOffsets,
				examples: [],
				suggestion: 'Linha de base deslocada. Correção de DC recentraliza a onda.',
				fix: { dc: true }
			});
		}

		// 11. Limite efetivo de frequência
		const effectiveNyquist = estimateEffectiveNyquist(channels, rate);

		const rank = { severe: 0, moderate: 1, mild: 2 };
		defects.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));

		// Montar cadeia sugerida
		const chain = buildChain(defects);

		// Resumo textual
		const summary = buildSummary(defects, duration, clipClicks);

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
	function buildSummary(defects, duration, clipClicks = 0) {
		if (defects.length === 0) {
			return `Áudio limpo — ${duration.toFixed(1)}s sem defeitos detectados.`;
		}

		const labelMap = {
			click: 'cliques', crackle: 'crepitação', hum50: 'zumbido de 50 Hz',
			hum60: 'zumbido de 60 Hz', hiss: 'chiado', rumble: 'ronco grave',
			clipping: 'saturação', true_peak: 'picos acima de 0 dBFS',
			discontinuity: 'saltos na onda', skip: 'pulos/repetições',
			dc_offset: 'DC offset'
		};
		const sevPt = { severe: 'grave', moderate: 'moderado', mild: 'leve' };
		const parts = defects.map(d => `${labelMap[d.type] || d.type} (${sevPt[d.severity] || 'leve'})`);
		const clipping = defects.find(d => d.type === 'clipping');
		const cause = clipping && clipClicks > 0
			? ` Os estalos audíveis vêm da saturação: ${clipClicks} impulsos encostam no fundo de escala.`
			: '';
		return `Encontrado: ${parts.join(', ')}.${cause}`;
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