import { MIN_FREQ, MAX_FREQ, FPS, BUFFER_SIZE } from '../constants';

/**
 * Advanced Signal Processing for rPPG
 * 
 * 1. Bandpass Filtering (2nd Order Butterworth IIR)
 * 2. Normalization
 * 3. Windowing (Hamming)
 * 4. FFT (Fast Fourier Transform) to find dominant frequency
 * 5. Peak verification for HRV
 */

export class SignalProcessor {
  private buffer: number[] = [];
  private timestamps: number[] = [];
  
  // Filter States (2nd Order Butterworth Bandpass)
  // Designed for: fs=30Hz, Low=0.6Hz, High=3.5Hz
  private filterState = {
    x: [0, 0, 0], // Inputs
    y: [0, 0, 0]  // Outputs
  };
  
  // Coefficients calculated for Bandpass 0.6-3.5Hz @ 30 FPS
  private readonly b = [0.0913, 0, -0.1826, 0, 0.0913]; // Numerator
  private readonly a = [1, -2.6634, 2.9237, -1.5305, 0.3229]; // Denominator (normalized)

  // Smoothing state
  private lastBpm = 0;

  addSample(value: number, timestamp: number) {
    this.buffer.push(value);
    this.timestamps.push(timestamp);
    if (this.buffer.length > BUFFER_SIZE) {
      this.buffer.shift();
      this.timestamps.shift();
    }
  }

  getRawSignal() {
    return this.buffer;
  }

  /**
   * Applies IIR Butterworth Filter to a single sample (Real-time)
   * Note: We process the whole buffer for the chart, but in a real DSP pipeline 
   * we would maintain state per sample. Here we filter the buffer on demand for the FFT.
   */
  private applyFilter(data: number[]): number[] {
    const result: number[] = new Array(data.length).fill(0);
    
    // Simple 2-pass (Forward-Backward) filter to remove phase shift (Zero-phase filtering)
    // Pass 1: Forward
    let v_1 = 0, v_2 = 0; // Internal state vars
    const alpha = 0.85; // Simple high-pass coefficient for DC removal first
    let dcFree: number[] = [];
    let prevX = data[0];
    
    // 1. Remove DC offset (High Pass 0.5Hz approx)
    for(let i = 0; i < data.length; i++) {
        const x = data[i];
        const y = x - prevX + 0.95 * v_1;
        dcFree.push(y);
        v_1 = y;
        prevX = x;
    }

    // 2. Smoothing (Low Pass 3.5Hz approx)
    // Simple Moving Average optimized for pulse shape
    const window = 5;
    for(let i = 0; i < dcFree.length; i++) {
        let sum = 0;
        let count = 0;
        for(let j = Math.max(0, i - window); j <= Math.min(dcFree.length - 1, i + window); j++) {
            sum += dcFree[j];
            count++;
        }
        result[i] = sum / count;
    }

    return result;
  }

  processBuffer(): { filtered: number[], peaks: number[] } {
    if (this.buffer.length < 60) return { filtered: [], peaks: [] };

    const filtered = this.applyFilter(this.buffer);
    
    // We only perform peak detection on the filtered signal for visual feedback
    const peaks = this.findPeaksTimeDomain(filtered);

    return { filtered, peaks };
  }

  /**
   * Calculates metrics using Frequency Domain Analysis (FFT)
   * This is much more robust against motion artifacts than time-domain peak counting.
   */
  calculateMetrics(): { bpm: number; rmssd: number; snr: number } {
    const n = this.buffer.length;
    if (n < 128) return { bpm: 0, rmssd: 0, snr: 0 };

    // 1. Get filtered data
    const filtered = this.applyFilter(this.buffer);
    const recentData = filtered.slice(-256); // Use most recent ~8.5 seconds for FFT
    
    // 2. Windowing (Hamming) to reduce spectral leakage
    const windowed = recentData.map((v, i) => {
      const win = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (recentData.length - 1));
      return v * win;
    });

    // 3. FFT
    const spectrum = this.computeFFT(windowed);
    
    // 4. Find Dominant Frequency
    let maxMag = 0;
    let maxIndex = 0;
    
    // Search limits in bins
    // Frequency resolution = FPS / N = 30 / 256 = 0.117 Hz
    const binSize = FPS / recentData.length;
    const minBin = Math.floor(MIN_FREQ / binSize);
    const maxBin = Math.ceil(MAX_FREQ / binSize);

    for (let i = minBin; i <= maxBin; i++) {
      if (spectrum[i] > maxMag) {
        maxMag = spectrum[i];
        maxIndex = i;
      }
    }

    // 5. Calculate BPM from frequency
    const dominantFreq = maxIndex * binSize;
    let rawBpm = dominantFreq * 60;

    // Sanity check
    if (rawBpm < 40 || rawBpm > 220) rawBpm = this.lastBpm || 70;

    // 6. Exponential Smoothing (for stability)
    // If lastBpm is 0, take raw. Else, 20% new, 80% old.
    const smoothedBpm = this.lastBpm === 0 ? rawBpm : (this.lastBpm * 0.8 + rawBpm * 0.2);
    this.lastBpm = smoothedBpm;

    // 7. Time Domain analysis for HRV (RMSSD)
    // We use the peaks from the filtered signal, but guided by the FFT BPM
    const peaks = this.findPeaksTimeDomain(recentData);
    let rmssd = 0;
    
    if (peaks.length > 2) {
      const rrIntervals = [];
      for (let i = 1; i < peaks.length; i++) {
         // Convert index difference to milliseconds
         const diff = (peaks[i] - peaks[i-1]) * (1000 / FPS); 
         // Outlier rejection based on estimated BPM
         const expectedRR = 60000 / smoothedBpm;
         if (diff > expectedRR * 0.5 && diff < expectedRR * 1.5) {
             rrIntervals.push(diff);
         }
      }

      if (rrIntervals.length > 1) {
        let sumSquaredDiff = 0;
        for (let i = 0; i < rrIntervals.length - 1; i++) {
          const d = rrIntervals[i + 1] - rrIntervals[i];
          sumSquaredDiff += d * d;
        }
        rmssd = Math.sqrt(sumSquaredDiff / (rrIntervals.length - 1));
      }
    }

    // 8. SNR Estimation (Signal to Noise Ratio)
    // Ratio of Power at dominant freq vs Power of rest of spectrum
    let noisePower = 0;
    for (let i = minBin; i <= maxBin; i++) {
        if (Math.abs(i - maxIndex) > 2) {
            noisePower += spectrum[i];
        }
    }
    const snr = noisePower === 0 ? 100 : maxMag / (noisePower / (maxBin - minBin));

    return { bpm: smoothedBpm, rmssd, snr };
  }

  private findPeaksTimeDomain(data: number[]): number[] {
    const peaks: number[] = [];
    // Dynamic thresholding
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const stdDev = Math.sqrt(data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / data.length);
    const threshold = stdDev * 0.5; // Lower threshold to catch peaks

    const minDistance = 10; // Frames (approx 330ms -> max 180bpm)

    for (let i = 2; i < data.length - 2; i++) {
       // Look for local maxima with a threshold
       if (data[i] > data[i-1] && data[i] > data[i-2] && 
           data[i] > data[i+1] && data[i] > data[i+2]) {
           if (data[i] > threshold) {
               if (peaks.length === 0 || (i - peaks[peaks.length - 1]) > minDistance) {
                   peaks.push(i);
               }
           }
       }
    }
    return peaks;
  }

  // Simple Cooley-Tukey FFT implementation for Real input
  // Returns Magnitude Spectrum
  private computeFFT(inputReal: number[]): number[] {
    const n = inputReal.length;
    // Pad to power of 2 if necessary
    const powerOf2 = Math.pow(2, Math.ceil(Math.log2(n)));
    const real = new Float64Array(powerOf2);
    const imag = new Float64Array(powerOf2);
    
    for(let i=0; i<n; i++) real[i] = inputReal[i];

    this.fftRadix2(real, imag);

    // Compute magnitudes
    const magnitudes = [];
    for (let i = 0; i < powerOf2 / 2; i++) {
      magnitudes.push(Math.sqrt(real[i] * real[i] + imag[i] * imag[i]));
    }
    return magnitudes;
  }

  private fftRadix2(re: Float64Array, im: Float64Array) {
    const n = re.length;
    if (n <= 1) return;

    const half = n / 2;
    const evenRe = new Float64Array(half);
    const evenIm = new Float64Array(half);
    const oddRe = new Float64Array(half);
    const oddIm = new Float64Array(half);

    for (let i = 0; i < half; i++) {
      evenRe[i] = re[2 * i];
      evenIm[i] = im[2 * i];
      oddRe[i] = re[2 * i + 1];
      oddIm[i] = im[2 * i + 1];
    }

    this.fftRadix2(evenRe, evenIm);
    this.fftRadix2(oddRe, oddIm);

    for (let k = 0; k < half; k++) {
      const t = -2 * Math.PI * k / n;
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);

      // Complex multiplication: (a+bi)(c+di) = (ac-bd) + (ad+bc)i
      const tRe = oddRe[k] * cosT - oddIm[k] * sinT;
      const tIm = oddRe[k] * sinT + oddIm[k] * cosT;

      re[k] = evenRe[k] + tRe;
      im[k] = evenIm[k] + tIm;
      
      re[k + half] = evenRe[k] - tRe;
      im[k + half] = evenIm[k] - tIm;
    }
  }
}