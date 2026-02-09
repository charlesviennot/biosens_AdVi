import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Activity, Play, RotateCcw, CheckCircle2, AlertTriangle, Fingerprint } from 'lucide-react';
import { VideoFeed } from './components/VideoFeed';
import { SignalChart } from './components/SignalChart';
import { SignalProcessor } from './services/signalProcessing';
import { AppState, Biomarkers, SignalDataPoint, RGB } from './types';

const processor = new SignalProcessor();
const SCAN_DURATION = 30; 

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [signalData, setSignalData] = useState<SignalDataPoint[]>([]);
  const [timeLeft, setTimeLeft] = useState(SCAN_DURATION);
  const [lightingCondition, setLightingCondition] = useState<'good' | 'bad'>('good');
  const [biomarkers, setBiomarkers] = useState<Biomarkers>({
    bpm: 0, hrv: 0, stress: 0, spo2: 98, respirationRate: 0, confidence: 0
  });

  const frameCountRef = useRef(0);
  
  // Timer
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

  // RGB Callback - Memoized to be stable
  const handleFrameProcessed = useCallback((rgb: RGB) => {
    if (appState === AppState.IDLE || appState === AppState.REPORT) return;

    // Lighting check (Green channel brightness)
    // Adjusted thresholds for broader acceptance
    if (rgb.g < 20 || rgb.g > 250) {
        setLightingCondition('bad');
    } else {
        setLightingCondition('good');
    }

    const now = Date.now();
    processor.addSample(rgb, now);
    frameCountRef.current++;

    // PERFORMANCE OPTIMIZATION: Update chart only every 3rd frame (10 FPS visual)
    // Updating React state every frame (30-60 FPS) causes UI jank on mobile
    if (frameCountRef.current % 3 === 0) {
      const { filtered } = processor.processBuffer();
      if (filtered.length > 0) {
        const latestVal = filtered[filtered.length - 1];
        setSignalData(prev => {
          const newData = [...prev, { timestamp: now, value: latestVal }];
          return newData.slice(-60); 
        });
      }
    }

    // State Logic
    if (appState === AppState.CALIBRATING) {
        // Collect samples for ~3 seconds (assuming ~30fps -> 90 frames)
        if (processor.getRawSignal().length > 90) {
           setAppState(AppState.MEASURING);
           setTimeLeft(SCAN_DURATION);
        }
    } else if (appState === AppState.MEASURING) {
        // Update live metrics every ~1s (30 frames)
        if (frameCountRef.current % 30 === 0) {
            const { bpm, rmssd, snr } = processor.calculateMetrics(true);
            const validSNR = snr > 1.1; // Slightly lower threshold for faster feedback
            
            if (validSNR && bpm > 40) {
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
        <div className="min-h-screen bg-black flex flex-col font-sans p-6 text-slate-200">
             <div className="flex-1 flex flex-col max-w-md mx-auto w-full space-y-6 pt-10">
                <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-cyan-500/10 text-cyan-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-cyan-500/30">
                        <Fingerprint className="w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-semibold text-white">Analysis Complete</h1>
                    <p className="text-slate-400 text-sm">Vital signs extracted via rPPG</p>
                </div>

                <div className="bg-slate-900/50 rounded-3xl p-6 border border-white/10 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-cyan-500 to-purple-500"></div>
                    
                    <div className="grid grid-cols-2 gap-x-4 gap-y-8">
                        <div className="flex flex-col">
                            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Heart Rate</span>
                            <div className="flex items-baseline space-x-1">
                                <span className="text-4xl font-light text-white">{biomarkers.bpm}</span>
                                <span className="text-cyan-500 text-xs font-bold">BPM</span>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Variability</span>
                            <div className="flex items-baseline space-x-1">
                                <span className="text-4xl font-light text-white">{biomarkers.hrv}</span>
                                <span className="text-purple-500 text-xs font-bold">ms</span>
                            </div>
                        </div>
                         <div className="flex flex-col">
                            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Mental Stress</span>
                            <div className="flex items-baseline space-x-1">
                                <span className="text-4xl font-light text-white">{biomarkers.stress}</span>
                                <span className={`text-xs font-bold ${biomarkers.stress > 50 ? 'text-orange-500' : 'text-emerald-500'}`}>INDEX</span>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-1">Breathing</span>
                            <div className="flex items-baseline space-x-1">
                                <span className="text-4xl font-light text-white">{biomarkers.respirationRate}</span>
                                <span className="text-blue-500 text-xs font-bold">RPM</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-5 rounded-2xl bg-white/5 border border-white/5 text-sm text-slate-300">
                   <p className="leading-relaxed">
                     <strong className="text-white">Observation:</strong> 
                     {biomarkers.bpm === 0 ? 
                        " Measurement failed. Please ensure good lighting and hold still." : 
                        ` Your resting heart rate is ${biomarkers.bpm} BPM with a stress index of ${biomarkers.stress}. ${biomarkers.stress < 40 ? 'You appear to be in a relaxed state.' : 'Slight elevated arousal detected.'}`
                     }
                   </p>
                </div>

                <button onClick={resetApp} className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black rounded-xl font-bold text-lg flex items-center justify-center space-x-2 transition-colors mt-auto mb-8">
                    <RotateCcw className="w-5 h-5" />
                    <span>Scan Again</span>
                </button>
             </div>
        </div>
      )
  }

  // --- MAIN SELFIE VIEW ---
  return (
    <div className="fixed inset-0 bg-black text-slate-200 font-sans overflow-hidden">
      
      {/* Video Background - Memoized VideoFeed to prevent re-renders */}
      <div className="absolute inset-0 z-0">
          <VideoFeed onFrameProcessed={handleFrameProcessed} appState={appState} />
      </div>

      <div className="absolute inset-0 z-10 bg-gradient-to-b from-black/70 via-transparent to-black/80 pointer-events-none"></div>

      {/* Header */}
      <nav className="absolute top-0 w-full z-20 pt-safe-top px-6 py-4 flex justify-between items-start">
         <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
             <Activity className="text-cyan-400 w-4 h-4" />
             <span className="text-xs font-bold text-white tracking-wide">BioSense</span>
         </div>
         
         {appState === AppState.MEASURING && (
            <div className="flex flex-col items-end">
                <span className="text-5xl font-thin text-white tabular-nums tracking-tighter">{timeLeft}</span>
            </div>
         )}
      </nav>

      {/* Center Feedback */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none">
          {appState === AppState.CALIBRATING && (
              <div className="bg-black/40 backdrop-blur-md px-6 py-3 rounded-full border border-cyan-500/30 flex flex-col items-center animate-pulse">
                  <span className="text-cyan-400 font-bold tracking-widest uppercase text-xs">Analyzing Light...</span>
              </div>
          )}
          
          {lightingCondition === 'bad' && appState !== AppState.IDLE && (
               <div className="mt-40 bg-red-500/90 backdrop-blur px-4 py-2 rounded-full flex items-center space-x-2 animate-bounce shadow-lg">
                  <AlertTriangle className="w-4 h-4 text-white" />
                  <span className="text-white text-xs font-bold">Too Dark - Face Light Source</span>
               </div>
          )}
      </div>

      {/* Bottom Area */}
      <div className="absolute bottom-0 w-full z-20 pb-safe-bottom px-6 py-10 flex flex-col items-center space-y-8">
        
        {/* Live Chart */}
        {(appState === AppState.MEASURING || appState === AppState.CALIBRATING) && (
            <div className="w-full max-w-[280px] h-16 opacity-70">
                 <SignalChart data={signalData} />
            </div>
        )}

        {/* Start Button */}
        {appState === AppState.IDLE && (
           <div className="flex flex-col items-center space-y-6 w-full animate-fade-in-up">
               <div className="text-center space-y-1">
                   <h2 className="text-2xl font-bold text-white tracking-tight">Health Selfie</h2>
                   <p className="text-sm text-slate-400">30-second AI vital scan</p>
               </div>
               
               <button 
                   onClick={startMonitoring}
                   className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.2)] transition-transform active:scale-95"
               >
                   <div className="w-[72px] h-[72px] rounded-full border-[3px] border-black/5 flex items-center justify-center">
                       <div className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center shadow-inner">
                            <Play className="w-6 h-6 text-white ml-1 fill-white" />
                       </div>
                   </div>
               </button>
           </div>
        )}

        {/* Live Metrics */}
        {appState === AppState.MEASURING && (
            <div className="grid grid-cols-2 gap-8 w-full max-w-xs">
                <div className="flex flex-col items-center">
                    <span className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1">Heart Rate</span>
                    <span className="text-3xl font-light text-white">{biomarkers.bpm || '--'}</span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-slate-400 text-[10px] uppercase font-bold tracking-widest mb-1">Variability</span>
                    <span className="text-3xl font-light text-white">{biomarkers.hrv || '--'}</span>
                </div>
            </div>
        )}

      </div>
    </div>
  );
};

export default App;