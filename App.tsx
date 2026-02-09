import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Activity, Heart, Wind, Zap, BrainCircuit, Play, Info, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { VideoFeed } from './components/VideoFeed';
import { SignalChart } from './components/SignalChart';
import { MetricCard } from './components/MetricCard';
import { SignalProcessor } from './services/signalProcessing';
import { AppState, Biomarkers, SignalDataPoint } from './types';
import { FPS } from './constants';

const processor = new SignalProcessor();
const SCAN_DURATION = 30; // 30 seconds scan

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [signalData, setSignalData] = useState<SignalDataPoint[]>([]);
  const [timeLeft, setTimeLeft] = useState(SCAN_DURATION);
  const [lightingCondition, setLightingCondition] = useState<'good' | 'bad'>('good');
  const [biomarkers, setBiomarkers] = useState<Biomarkers>({
    bpm: 0, hrv: 0, stress: 0, spo2: 98, respirationRate: 0, confidence: 0
  });

  const frameCountRef = useRef(0);
  
  // Timer Logic
  useEffect(() => {
    let interval: number;
    if (appState === AppState.MEASURING) {
      interval = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
             finishScan();
             return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [appState]);

  const finishScan = () => {
    setAppState(AppState.REPORT);
    const finalReport = processor.getFinalReport();
    setBiomarkers(prev => ({
        ...prev,
        bpm: finalReport.bpm,
        hrv: finalReport.hrv,
        stress: finalReport.stress,
        respirationRate: finalReport.respiration,
        confidence: finalReport.confidence
    }));
  };

  const handleFrameProcessed = useCallback((greenAvg: number) => {
    if (appState === AppState.IDLE || appState === AppState.REPORT) return;

    // Brightness Check (Simple heuristic: 0-255 scale)
    if (greenAvg < 30 || greenAvg > 240) {
        setLightingCondition('bad');
    } else {
        setLightingCondition('good');
    }

    const now = Date.now();
    processor.addSample(greenAvg, now);
    frameCountRef.current++;

    // Update Chart visualization (smooth 30fps)
    if (frameCountRef.current % 2 === 0) {
      const { filtered } = processor.processBuffer();
      if (filtered.length > 0) {
        const latestVal = filtered[filtered.length - 1];
        setSignalData(prev => {
          const newData = [...prev, { timestamp: now, value: latestVal }];
          return newData.slice(-60); // Keep chart tight
        });
      }
    }

    // Process State Machine
    if (appState === AppState.CALIBRATING) {
        // Collect 3 seconds of data before starting
        // We use raw buffer length, assuming ~30fps, need ~90 frames
        if (processor.getRawSignal().length > 90) {
           setAppState(AppState.MEASURING);
           setTimeLeft(SCAN_DURATION);
        }
    } else if (appState === AppState.MEASURING) {
        // Update metrics every ~0.5s (15 frames)
        if (frameCountRef.current % 15 === 0) {
            const { bpm, rmssd, snr } = processor.calculateMetrics(true);
            const validSNR = snr > 1.2; 
            
            if (validSNR) {
                setBiomarkers(prev => ({
                    ...prev,
                    bpm: Math.round(bpm),
                    hrv: Math.round(rmssd),
                    confidence: 1
                }));
            }
        }
    }
  }, [appState]);

  const startMonitoring = () => {
    processor.reset();
    setAppState(AppState.CALIBRATING);
    setSignalData([]);
    setTimeLeft(SCAN_DURATION);
    setBiomarkers({ bpm: 0, hrv: 0, stress: 0, spo2: 0, respirationRate: 0, confidence: 0 });
  };

  const resetApp = () => {
    setAppState(AppState.IDLE);
    setSignalData([]);
    setLightingCondition('good');
  };

  // --- REPORT VIEW ---
  if (appState === AppState.REPORT) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col font-sans p-6 text-slate-200 animate-fade-in">
             <div className="flex-1 flex flex-col max-w-lg mx-auto w-full space-y-8 pt-12">
                <div className="text-center space-y-2">
                    <div className="w-20 h-20 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                        <CheckCircle2 className="w-10 h-10" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Scan Complete</h1>
                    <p className="text-slate-400">Analysis generated from {SCAN_DURATION}s sample.</p>
                </div>

                <div className="glass-panel rounded-3xl p-6 border border-white/10 relative overflow-hidden shadow-2xl">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-cyan-500"></div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-8">
                        <div className="flex flex-col items-center">
                            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Heart Rate</span>
                            <span className="text-5xl font-light text-white">{biomarkers.bpm}</span>
                            <span className="text-emerald-400 text-xs font-bold mt-1">BPM</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">HR Variability</span>
                            <span className="text-5xl font-light text-white">{biomarkers.hrv}</span>
                            <span className="text-purple-400 text-xs font-bold mt-1">MS (RMSSD)</span>
                        </div>
                         <div className="flex flex-col items-center">
                            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Stress Level</span>
                            <span className="text-5xl font-light text-white">{biomarkers.stress}</span>
                            <span className={`text-xs font-bold mt-1 ${biomarkers.stress > 50 ? 'text-orange-400' : 'text-blue-400'}`}>INDEX</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Respiration</span>
                            <span className="text-5xl font-light text-white">{biomarkers.respirationRate}</span>
                            <span className="text-cyan-400 text-xs font-bold mt-1">RPM</span>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-900/50 border border-white/5 p-5 rounded-2xl text-sm text-slate-300 leading-relaxed">
                   <p>
                     <strong className="text-white block mb-1">Summary</strong>
                     Your physiological markers indicate a {biomarkers.stress > 60 ? 'high arousal state' : 'balanced resting state'}. 
                     HRV of {biomarkers.hrv}ms suggests {biomarkers.hrv < 30 ? 'higher sympathetic activation (stress)' : 'good autonomic recovery'}.
                   </p>
                </div>

                <button onClick={resetApp} className="w-full py-4 bg-white text-slate-900 rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-transform hover:scale-[1.02] active:scale-95 shadow-xl">
                    <RotateCcw className="w-5 h-5" />
                    <span>Start New Scan</span>
                </button>
             </div>
        </div>
      )
  }

  // --- MAIN SELFIE VIEW ---
  return (
    <div className="fixed inset-0 bg-black text-slate-200 font-sans overflow-hidden">
      
      {/* Video Background (Full Screen) */}
      <div className="absolute inset-0 z-0">
          <VideoFeed onFrameProcessed={handleFrameProcessed} appState={appState} />
      </div>

      {/* Dark Gradient Overlay for text readability */}
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none"></div>

      {/* Top Bar */}
      <nav className="absolute top-0 w-full z-20 pt-safe-top px-6 py-4 flex justify-between items-start">
         <div className="flex items-center space-x-2 bg-black/30 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
             <Activity className="text-cyan-400 w-4 h-4" />
             <span className="text-xs font-bold text-white tracking-wide">BioSense</span>
         </div>
         
         {appState === AppState.MEASURING && (
            <div className="flex flex-col items-end">
                <span className="text-4xl font-light text-white tabular-nums">{timeLeft}</span>
                <span className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase">Seconds Left</span>
            </div>
         )}
      </nav>

      {/* Center Feedback Area */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
          {appState === AppState.CALIBRATING && (
              <div className="bg-black/60 backdrop-blur px-6 py-3 rounded-2xl border border-cyan-500/30 flex flex-col items-center animate-pulse">
                  <span className="text-cyan-400 font-bold tracking-widest uppercase text-sm mb-1">Calibrating</span>
                  <span className="text-white text-xs">Keep face still...</span>
              </div>
          )}
          
          {lightingCondition === 'bad' && appState !== AppState.IDLE && (
               <div className="mt-32 bg-red-500/80 backdrop-blur px-4 py-2 rounded-full flex items-center space-x-2 animate-bounce">
                  <AlertTriangle className="w-4 h-4 text-white" />
                  <span className="text-white text-xs font-bold">Bad Lighting - Move to light</span>
               </div>
          )}
      </div>

      {/* Bottom Controls Area */}
      <div className="absolute bottom-0 w-full z-20 pb-safe-bottom px-6 py-8 flex flex-col items-center space-y-6">
        
        {/* Live Chart (Only visible during scan) */}
        {(appState === AppState.MEASURING || appState === AppState.CALIBRATING) && (
            <div className="w-full max-w-xs h-20 opacity-80">
                 <SignalChart data={signalData} />
            </div>
        )}

        {/* Start Button */}
        {appState === AppState.IDLE && (
           <div className="flex flex-col items-center space-y-4 w-full">
               <div className="text-center space-y-1">
                   <h2 className="text-xl font-bold text-white">Health Selfie</h2>
                   <p className="text-sm text-slate-300">30-second AI vital scan</p>
               </div>
               
               <button 
                   onClick={startMonitoring}
                   className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.3)] transition-transform active:scale-90"
               >
                   <div className="w-18 h-18 rounded-full border-2 border-black/10 flex items-center justify-center">
                       <div className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center">
                            <Play className="w-6 h-6 text-white ml-1 fill-white" />
                       </div>
                   </div>
               </button>
           </div>
        )}

        {/* Measuring Indicator */}
        {appState === AppState.MEASURING && (
            <div className="w-full max-w-xs grid grid-cols-2 gap-4">
                <div className="bg-black/40 backdrop-blur p-3 rounded-2xl border border-white/10 flex flex-col items-center">
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Heart Rate</span>
                    <span className="text-2xl font-light text-white">{biomarkers.bpm || '--'}</span>
                </div>
                <div className="bg-black/40 backdrop-blur p-3 rounded-2xl border border-white/10 flex flex-col items-center">
                    <span className="text-slate-400 text-[10px] uppercase font-bold">Variability</span>
                    <span className="text-2xl font-light text-white">{biomarkers.hrv || '--'}</span>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default App;