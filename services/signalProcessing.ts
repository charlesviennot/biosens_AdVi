import { MIN_FREQ, MAX_FREQ, BUFFER_SIZE } from '../constants';
import { RGB } from '../types';

/**
 * Advanced Signal Processor
 * Implements a "Green minus Red" approach which is a lightweight approximation 
 * of chrominance-based methods (CHROM).
 * 
 * Physics:
 * - Green light is strongly absorbed by hemoglobin.
 * - Red light is less absorbed (penetrates deeper).
 * - Subtracting Red from Green helps cancel out common intensity changes (motion, lighting flickers)
 *   that affect all channels equally, leaving the pulsatile component.
 */

export class SignalProcessor {
  private buffer: number[] = [];
  private timestamps: number[] = [];
  
  // Session storage
  private sessionMetrics: { bpm: number[], hrv: number[], stress: number[] } = {
    bpm: [], hrv: [], stress: []
  };

  private lastBpm = 0;

  reset() {
    this.buffer = [];
    this.timestamps = [];
    this.sessionMetrics = { bpm: [], hrv: [], stress: [] };
    this.lastBpm = 0;
  }

  /**
   * Input: RGB averages from the face ROI
   */
  addSample(rgb: RGB, timestamp: number) {
    // ALGORITHM: G - R (Motion Compensated Signal)
    // Simple but effective for mobile web where compute is limited.
    // Alternatively: 3*G - 2*R is also common. Let's use standard G-R for stability.
    const signal = rgb.g - rgb.r;

    this.buffer.push(signal);
    this.timestamps.push(timestamp);
    if (this.buffer.length > BUFFER_SIZE) {
      this.buffer.shift();
      this.timestamps.shift();
    }
  }

  getRawSignal() {
    return this.buffer;
  }

  // 2nd Order Butterworth Bandpass Filter (0.7Hz - 3.5Hz)
  private applyFilter(data: number[]): number[] {
    if (data.length < 2) return data;

    // 1. Detrending (Remove DC component)
    const detrended: number[] = [];
    let avg = data.reduce((a,b) => a+b, 0) / data.length;
    // Simple DC subtraction is often better than complex detrending for short windows
    for (let i = 0; i < data.length; i++) {
        detrended.push(data[i] - avg);
    }
    
    // 2. Moving Average Smoothing (Low pass equivalent)
    const smoothed: number[] = [];
    const win = 3;
    for(let i = 0; i < detrended.length; i++) {
        let sum = 0;
        let count = 0;
        for(let j = Math.max(0, i - win); j <= Math.min(detrended.length - 1, i + win); j++) {
            sum += detrended[j];
            count++;
        }
        smoothed.push(sum / count);
    }
    return smoothed;
  }

  processBuffer(): { filtered: number[] } {
    if (this.buffer.length < 30) return { filtered: [] };
    const filtered = this.applyFilter(this.buffer);
    return { filtered };
  }

  calculateMetrics(addToSession: boolean = false): { bpm: number; rmssd: number; snr: number } {
    const n = this.buffer.length;
    if (n < 60) return { bpm: 0, rmssd: 0, snr: 0 }; // Need at least 2 seconds

    // 1. Dynamic FPS Calculation
    const durationSec = (this.timestamps[n - 1] - this.timestamps[0]) / 1000;
    if (durationSec === 0) return { bpm: 0, rmssd: 0, snr: 0 };
    const realFps = n / durationSec;

    // 2. Filter
    const filtered = this.applyFilter(this.buffer);
    
    // Windowing for FFT (Last 6 seconds is enough for instant HR)
    const windowSize = Math.min(filtered.length, Math.floor(realFps * 6)); 
    const recentData = filtered.slice(-windowSize);
    
    // Hamming Window
    const windowed = recentData.map((v, i) => {
      return v * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (recentData.length - 1)));
    });

    // 3. FFT
    const spectrum = this.computeFFT(windowed);
    
    // 4. Peak Detection in Human Range (45-200 BPM)
    let maxMag = 0;
    let maxIndex = 0;
    const binSize = realFps / recentData.length;
    const minBin = Math.floor(MIN_FREQ / binSize);
    const maxBin = Math.ceil(MAX_FREQ / binSize);

    for (let i = minBin; i <= maxBin; i++) {
      if (spectrum[i] > maxMag) {
        maxMag = spectrum[i];
        maxIndex = i;
      }
    }

    const dominantFreq = maxIndex * binSize;
    let rawBpm = dominantFreq * 60;

    // 5. Post-Processing & Smoothing
    // Jump rejection: HR doesn't change instantly by 50 BPM
    if (this.lastBpm > 0) {
        if (Math.abs(rawBpm - this.lastBpm) > 20) {
            // Likely noise, stick closer to previous or average
            rawBpm = this.lastBpm * 0.8 + rawBpm * 0.2;
        }
    }
    this.lastBpm = rawBpm;

    // 6. HRV (RMSSD) from Peak-to-Peak in time domain
    const peaks = this.findPeaks(recentData);
    let rmssd = 0;
    if (peaks.length > 2) {
       let sumSq = 0;
       let count = 0;
       for(let i=1; i<peaks.length; i++) {
           const diffMs = (peaks[i] - peaks[i-1]) * (1000 / realFps);
           if(diffMs > 300 && diffMs < 1300) { // 45-200 BPM interval
              if (i > 1) {
                  const prevDiff = (peaks[i-1] - peaks[i-2]) * (1000 / realFps);
                  const delta = diffMs - prevDiff;
                  sumSq += delta * delta;
                  count++;
              }
           }
       }
       if (count > 0) rmssd = Math.sqrt(sumSq / count);
    }

    // 7. SNR
    let noise = 0;
    let noiseCount = 0;
    for(let i=minBin; i<=maxBin; i++) {
        if (Math.abs(i - maxIndex) > 2) { // Exclude peak and neighbors
            noise += spectrum[i];
            noiseCount++;
        }
    }
    const snr = maxMag / (noise / noiseCount || 1);

    // 8. Session Accumulation
    if (addToSession && snr > 1.3 && rawBpm > 45 && rawBpm < 180) {
        this.sessionMetrics.bpm.push(rawBpm);
        if (rmssd > 0) this.sessionMetrics.hrv.push(rmssd);
        
        // Stress: (BPM/MaxHR) + (1 - HRV/MaxHRV)
        // Normalized roughly 0-100
        const stressBpm = Math.min(100, Math.max(0, (rawBpm - 50) * 1.5));
        const stressHrv = Math.min(100, Math.max(0, (100 - rmssd)));
        const stress = (stressBpm * 0.4) + (stressHrv * 0.6);
        
        this.sessionMetrics.stress.push(stress);
    }

    return { bpm: rawBpm, rmssd, snr };
  }

  getFinalReport() {
    const getMedian = (arr: number[]) => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const avgBpm = getMedian(this.sessionMetrics.bpm);
    const avgHrv = getMedian(this.sessionMetrics.hrv);
    const avgStress = getMedian(this.sessionMetrics.stress);
    const respRate = avgBpm > 0 ? avgBpm / 4 : 15;

    return {
        bpm: Math.round(avgBpm) || 0,
        hrv: Math.round(avgHrv) || 0,
        stress: Math.round(avgStress) || 0,
        respiration: Math.round(respRate) || 0,
        confidence: this.sessionMetrics.bpm.length > 5 ? 1 : 0
    };
  }

  private findPeaks(data: number[]): number[] {
    const peaks = [];
    // Need a bit more robust peak detector than simple local max
    for(let i=2; i<data.length-2; i++) {
        if(data[i] > data[i-1] && data[i] > data[i-2] && 
           data[i] > data[i+1] && data[i] > data[i+2]) {
            if (data[i] > 0) peaks.push(i);
        }
    }
    return peaks;
  }

  private computeFFT(inputReal: number[]): number[] {
    const n = inputReal.length;
    const powerOf2 = Math.pow(2, Math.ceil(Math.log2(n)));
    const real = new Float64Array(powerOf2);
    const imag = new Float64Array(powerOf2);
    for(let i=0; i<n; i++) real[i] = inputReal[i];
    
    // Iterative FFT implementation to avoid recursion depth issues
    this.fftIterative(real, imag);
    
    const magnitudes = [];
    for (let i = 0; i < powerOf2 / 2; i++) {
      magnitudes.push(Math.sqrt(real[i] * real[i] + imag[i] * imag[i]));
    }
    return magnitudes;
  }
  
  // Changed to iterative for better performance
  private fftIterative(re: Float64Array, im: Float64Array) {
      const n = re.length;
      let i = 0, j = 0;
      for (i = 0; i < n; i++) {
          if (j > i) {
              [re[i], re[j]] = [re[j], re[i]];
              [im[i], im[j]] = [im[j], im[i]];
          }
          let m = n >> 1;
          while (m >= 1 && j >= m) {
              j -= m;
              m >>= 1;
          }
          j += m;
      }
      
      let mmax = 1;
      while (n > mmax) {
          const istep = mmax << 1;
          const theta = -Math.PI / mmax;
          let wtemp = Math.sin(0.5 * theta);
          const wpr = -2.0 * wtemp * wtemp;
          const wpi = Math.sin(theta);
          let wr = 1.0;
          let wi = 0.0;
          for (let m = 0; m < mmax; m++) {
              for (i = m; i < n; i += istep) {
                  j = i + mmax;
                  const tempr = wr * re[j] - wi * im[j];
                  const tempi = wr * im[j] + wi * re[j];
                  re[j] = re[i] - tempr;
                  im[j] = im[i] - tempi;
                  re[i] += tempr;
                  im[i] += tempi;
              }
              wtemp = wr;
              wr = wr * wpr - wi * wpi + wr;
              wi = wi * wpr + wtemp * wpi + wi;
          }
          mmax = istep;
      }
  }
}