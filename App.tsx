import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Activity, Heart, Wind, Zap, BrainCircuit, Play, Info, RotateCcw, Share2, CheckCircle2 } from 'lucide-react';
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
  const [biomarkers, setBiomarkers] = useState<Biomarkers>({
    bpm: 0, hrv: 0, stress: 0, spo2: 98, respirationRate: 0, confidence: 0
  });

  const frameCountRef = useRef(0);
  const warmupRef = useRef(0); 

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

    const now = Date.now();
    processor.addSample(greenAvg, now);
    frameCountRef.current++;

    // Update Chart @ 30fps visualization
    if (frameCountRef.current % 2 === 0) {
      const { filtered } = processor.processBuffer();
      if (filtered.length > 0) {
        const latestVal = filtered[filtered.length - 1];
        setSignalData(prev => {
          const newData = [...prev, { timestamp: now, value: latestVal }];
          return newData.slice(-100);
        });
      }
    }

    // Update Metrics every ~0.5s
    if (frameCountRef.current % 15 === 0) { 
      
      if (appState === AppState.CALIBRATING) {
        warmupRef.current++;
        // 4 seconds warmup
        if (warmupRef.current > FPS * 4) {
           setAppState(AppState.MEASURING);
           setTimeLeft(SCAN_DURATION);
        }
        return;
      }

      if (appState === AppState.MEASURING) {
        // We pass 'true' to accumulate data for the report
        const { bpm, rmssd, snr } = processor.calculateMetrics(true);
        const validSNR = snr > 1.2; 
        
        // Instant feedback display (smoothed)
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
    warmupRef.current = 0;
    setTimeLeft(SCAN_DURATION);
  };

  const resetApp = () => {
    setAppState(AppState.IDLE);
    setSignalData([]);
  };

  // --- REPORT VIEW ---
  if (appState === AppState.REPORT) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col font-sans p-6 text-slate-200">
             <div className="flex-1 flex flex-col max-w-lg mx-auto w-full space-y-6 pt-10">
                <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/50">
                        <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">Scan Complete</h1>
                    <p className="text-slate-400">Analysis successfully generated.</p>
                </div>

                <div className="glass-panel rounded-2xl p-6 border border-white/10 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-cyan-500"></div>
                    <div className="grid grid-cols-2 gap-6">
                        <div className="flex flex-col items-center p-4 bg-slate-800/50 rounded-xl">
                            <span className="text-slate-400 text-xs font-bold uppercase">Heart Rate</span>
                            <span className="text-4xl font-light text-white my-1">{biomarkers.bpm}</span>
                            <span className="text-emerald-400 text-xs">BPM</span>
                        </div>
                        <div className="flex flex-col items-center p-4 bg-slate-800/50 rounded-xl">
                            <span className="text-slate-400 text-xs font-bold uppercase">Variability</span>
                            <span className="text-4xl font-light text-white my-1">{biomarkers.hrv}</span>
                            <span className="text-purple-400 text-xs">ms (RMSSD)</span>
                        </div>
                         <div className="flex flex-col items-center p-4 bg-slate-800/50 rounded-xl">
                            <span className="text-slate-400 text-xs font-bold uppercase">Stress</span>
                            <span className="text-4xl font-light text-white my-1">{biomarkers.stress}</span>
                            <span className={`text-xs ${biomarkers.stress > 50 ? 'text-orange-400' : 'text-blue-400'}`}>Index</span>
                        </div>
                        <div className="flex flex-col items-center p-4 bg-slate-800/50 rounded-xl">
                            <span className="text-slate-400 text-xs font-bold uppercase">Breathing</span>
                            <span className="text-4xl font-light text-white my-1">{biomarkers.respirationRate}</span>
                            <span className="text-cyan-400 text-xs">RPM</span>
                        </div>
                    </div>
                </div>

                <div className="bg-blue-900/20 border border-blue-800/50 p-4 rounded-xl text-sm text-blue-200">
                    <p><strong>Health Insight:</strong> Your cardiac coherence suggests a {biomarkers.stress > 50 ? 'elevated state of arousal. Consider deep breathing.' : 'balanced autonomic nervous system state.'}</p>
                </div>

                <button onClick={resetApp} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium flex items-center justify-center space-x-2 transition-colors">
                    <RotateCcw className="w-5 h-5" />
                    <span>New Scan</span>
                </button>
             </div>
        </div>
      )
  }

  // --- MAIN VIEW ---
  return (
    <div className="min-h-screen bg-[#0B1121] text-slate-200 font-sans pb-8 overflow-x-hidden">
      
      {/* Navbar - Compact for mobile */}
      <nav className="fixed top-0 w-full z-50 bg-[#0B1121]/80 backdrop-blur-md border-b border-white/5 pt-safe-top">
        <div className="max-w-md mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center space-x-2">
             <Activity className="text-cyan-400 w-5 h-5" />
             <span className="text-base font-semibold text-white tracking-wide">BioSense</span>
          </div>
          {appState === AppState.MEASURING && (
              <div className="flex items-center space-x-2">
                  <div className="relative w-8 h-8 flex items-center justify-center">
                       <svg className="w-full h-full transform -rotate-90">
                           <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-slate-800" />
                           <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="3" fill="transparent" 
                                   className="text-cyan-400 transition-all duration-1000 ease-linear" 
                                   strokeDasharray={88} 
                                   strokeDashoffset={88 - (88 * timeLeft) / SCAN_DURATION} />
                       </svg>
                       <span className="absolute text-[10px] font-bold text-white">{timeLeft}</span>
                  </div>
              </div>
          )}
        </div>
      </nav>

      <main className="pt-20 px-4 max-w-md mx-auto flex flex-col space-y-6">
        
        {/* Video Area */}
        <div className="relative w-full aspect-[3/4] rounded-3xl overflow-hidden shadow-2xl shadow-cyan-900/10 border border-slate-700/50 bg-black">
           <VideoFeed onFrameProcessed={handleFrameProcessed} appState={appState} />
           
           {/* Overlay Controls */}
           {appState === AppState.IDLE && (
               <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                   <button 
                       onClick={startMonitoring}
                       className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-white/10 border border-white/20 backdrop-blur-md shadow-[0_0_40px_rgba(6,182,212,0.3)] transition-transform active:scale-95"
                   >
                       <div className="absolute inset-0 rounded-full border-2 border-cyan-400 opacity-30 animate-ping"></div>
                       <Play className="w-8 h-8 text-white fill-white ml-1" />
                   </button>
               </div>
           )}
        </div>

        {/* Live Metrics Grid (Only show during scan) */}
        <div className="grid grid-cols-2 gap-3">
             <MetricCard 
                label="Heart Rate" 
                value={appState === AppState.MEASURING ? biomarkers.bpm : '--'} 
                unit="BPM" 
                icon={<Heart />}
                color="text-rose-400"
              />
              <MetricCard 
                label="Var (HRV)" 
                value={appState === AppState.MEASURING ? biomarkers.hrv : '--'} 
                unit="MS" 
                icon={<BrainCircuit />}
                color="text-purple-400"
              />
        </div>

        {/* Live Chart (Mini) */}
        {(appState === AppState.MEASURING || appState === AppState.CALIBRATING) && (
            <div className="glass-panel rounded-xl p-4 h-24">
                <SignalChart data={signalData} />
            </div>
        )}

        {/* Instructions */}
        {appState === AppState.IDLE && (
            <div className="bg-slate-900/50 rounded-xl p-4 text-center border border-white/5">
                <p className="text-sm text-slate-400">
                    Center your face in the oval. Ensure good lighting. Hold still for 30 seconds.
                </p>
            </div>
        )}

      </main>
    </div>
  );
};

export default App;