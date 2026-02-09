import React, { useState, useCallback, useRef } from 'react';
import { Activity, Heart, Wind, Zap, BrainCircuit, Play } from 'lucide-react';
import { VideoFeed } from './components/VideoFeed';
import { SignalChart } from './components/SignalChart';
import { MetricCard } from './components/MetricCard';
import { SignalProcessor } from './services/signalProcessing';
import { AppState, Biomarkers, SignalDataPoint } from './types';
import { FPS } from './constants';

const processor = new SignalProcessor();

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [signalData, setSignalData] = useState<SignalDataPoint[]>([]);
  const [biomarkers, setBiomarkers] = useState<Biomarkers>({
    bpm: 0,
    hrv: 0,
    stress: 0,
    spo2: 98,
    respirationRate: 0,
    confidence: 0
  });

  const frameCountRef = useRef(0);
  // Warmup counter to allow filter to settle
  const warmupRef = useRef(0); 

  const handleFrameProcessed = useCallback((greenAvg: number) => {
    if (appState === AppState.IDLE) return;

    const now = Date.now();
    processor.addSample(greenAvg, now);
    frameCountRef.current++;

    // 1. UI Chart Update (Low frequency to save CPU)
    if (frameCountRef.current % 3 === 0) {
      const { filtered } = processor.processBuffer();
      if (filtered.length > 0) {
        // Visual cleanup
        const latestVal = filtered[filtered.length - 1];
        setSignalData(prev => {
          const newData = [...prev, { timestamp: now, value: latestVal }];
          return newData.slice(-128);
        });
      }
    }

    // 2. Metrics Calculation (Once per second approx)
    if (frameCountRef.current % 15 === 0) { // Every ~0.5s for faster feedback
      
      if (appState === AppState.CALIBRATING) {
        warmupRef.current++;
        // Allow 3 seconds of buffer fill before trying to measure
        if (warmupRef.current > FPS * 3 && processor.getRawSignal().length > 128) {
           setAppState(AppState.MEASURING);
        }
        return;
      }

      if (appState === AppState.MEASURING) {
        const { bpm, rmssd, snr } = processor.calculateMetrics();
        
        // Quality check
        const isReliable = snr > 2.0; // Threshold for Signal-to-Noise
        
        // Stress heuristic based on HRV (Low HRV = High Stress)
        // Normal RMSSD is 20-50ms. <20 is high stress.
        let stressIndex = 0;
        if (rmssd > 0) {
            stressIndex = Math.max(0, Math.min(100, 100 - (rmssd * 2)));
        }

        // Respiration derived from RSA (Respiratory Sinus Arrhythmia) implies HRV cycles
        // This is still an estimation without a specific respiration filter
        const respRate = bpm > 0 ? bpm / 4 : 0; 

        setBiomarkers(prev => ({
          ...prev,
          bpm: Math.round(bpm),
          hrv: Math.round(rmssd),
          stress: Math.round(stressIndex),
          respirationRate: Math.round(respRate),
          confidence: isReliable ? 1 : 0.3
        }));
      }
    }
  }, [appState]);

  const startMonitoring = () => {
    setAppState(AppState.CALIBRATING);
    setSignalData([]);
    warmupRef.current = 0;
    setBiomarkers({
      bpm: 0,
      hrv: 0,
      stress: 0,
      spo2: 98,
      respirationRate: 0,
      confidence: 0
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">
      
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-900/20">
              <Activity className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">BioSense <span className="text-emerald-500">AI</span></h1>
              <p className="text-xs text-slate-500 font-mono">rPPG SPECTRAL ANALYSIS</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
             <div className="hidden md:flex items-center space-x-2 text-xs font-mono text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>SYSTEM ONLINE</span>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Visuals */}
          <div className="lg:col-span-7 flex flex-col space-y-6">
            
            {/* Status Bar */}
            <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-lg p-3">
              <div className="flex items-center space-x-3">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  appState === AppState.MEASURING ? 'bg-emerald-500/20 text-emerald-400' : 
                  appState === AppState.CALIBRATING ? 'bg-amber-500/20 text-amber-400' :
                  'bg-slate-700 text-slate-300'
                }`}>
                  {appState === AppState.IDLE ? 'STANDBY' : appState === AppState.CALIBRATING ? 'BUFFERING' : 'MEASURING'}
                </span>
                <span className="text-sm text-slate-400">
                  {appState === AppState.IDLE ? 'Ready to initialize sensor.' : 
                   appState === AppState.CALIBRATING ? 'Filling signal buffer (keep still)...' : 
                   'Acquiring FFT spectral data.'}
                </span>
              </div>
              {appState === AppState.IDLE && (
                <button 
                  onClick={startMonitoring}
                  className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-md text-sm font-semibold transition-all shadow-lg shadow-emerald-900/20"
                >
                  <Play className="w-4 h-4" />
                  <span>Start Scan</span>
                </button>
              )}
            </div>

            {/* Video Feed */}
            <VideoFeed onFrameProcessed={handleFrameProcessed} appState={appState} />

            {/* Chart */}
            <SignalChart data={signalData} />

            {/* Pipeline Info */}
            <div className="bg-slate-900/30 rounded-lg p-4 border border-slate-800 text-xs text-slate-500 font-mono">
              <p className="mb-2 font-bold text-slate-400">DSP PIPELINE (UPDATED):</p>
              <div className="flex items-center space-x-2 overflow-x-auto whitespace-nowrap text-[10px] md:text-xs">
                <span>Green Ch</span>
                <span>→</span>
                <span>DC Removal</span>
                <span>→</span>
                <span className="text-emerald-500">Hamming Window</span>
                <span>→</span>
                <span className="text-emerald-500 font-bold">FFT (Spectral)</span>
                <span>→</span>
                <span>Freq Peak</span>
                <span>→</span>
                <span>Smoothing</span>
              </div>
            </div>
          </div>

          {/* Right Column: Metrics */}
          <div className="lg:col-span-5 flex flex-col space-y-4">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center">
              <Activity className="w-5 h-5 mr-2 text-emerald-500" />
              Real-time Biomarkers
            </h2>
            
            {/* Warning if confidence is low */}
            {appState === AppState.MEASURING && biomarkers.confidence < 0.5 && (
                 <div className="bg-amber-900/30 border border-amber-800 p-3 rounded text-amber-200 text-xs mb-2">
                    Signal noise detected. Ensure consistent lighting and minimize head movement.
                 </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
              <MetricCard 
                label="Heart Rate" 
                value={appState === AppState.MEASURING ? biomarkers.bpm : '--'} 
                unit="BPM" 
                icon={<Heart className="w-6 h-6" />}
                color="text-rose-400"
              />
              
              <MetricCard 
                label="HRV (RMSSD)" 
                value={appState === AppState.MEASURING ? biomarkers.hrv : '--'} 
                unit="ms" 
                icon={<BrainCircuit className="w-6 h-6" />}
                color="text-purple-400"
              />
              
              <MetricCard 
                label="Stress Level" 
                value={appState === AppState.MEASURING ? biomarkers.stress : '--'} 
                unit="/ 100" 
                icon={<Zap className="w-6 h-6" />}
                color={biomarkers.stress > 60 ? "text-orange-400" : "text-blue-400"}
              />

              <MetricCard 
                label="Respiration (Est)" 
                value={appState === AppState.MEASURING ? biomarkers.respirationRate : '--'} 
                unit="rpm" 
                icon={<Wind className="w-6 h-6" />}
                color="text-teal-400"
              />
            </div>

            <div className="mt-8 p-6 bg-slate-800/30 rounded-xl border border-slate-700">
               <h3 className="font-bold text-slate-300 mb-2">Technical Insight</h3>
               <p className="text-sm text-slate-400 leading-relaxed">
                 Data is now extracted using <strong>Fast Fourier Transform (FFT)</strong> on a 512-point sliding window. 
                 This isolates the dominant cardiovascular frequency (0.6-3.3Hz) from background noise. 
                 Time-domain analysis is only used for inter-beat interval (RMSSD) calculation once the signal is clean.
               </p>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};

export default App;