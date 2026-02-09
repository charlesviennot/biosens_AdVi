import React, { useRef, useEffect, useState } from 'react';
import { Camera, AlertCircle, ScanFace } from 'lucide-react';
import { AppState } from '../types';

interface VideoFeedProps {
  onFrameProcessed: (greenAverage: number) => void;
  appState: AppState;
}

export const VideoFeed: React.FC<VideoFeedProps> = ({ onFrameProcessed, appState }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<number>();

  useEffect(() => {
    const startCamera = async () => {
      try {
        // Mobile-first constraint (Portrait preference)
        const constraints = {
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 720 }, // Lower resolution is often better for performance
            height: { ideal: 1280 },
            frameRate: { ideal: 30 }
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setError("Camera access denied.");
        console.error(err);
      }
    };

    startCamera();

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach(track => track.stop());
      }
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const processFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (!ctx || video.readyState !== 4) {
      requestRef.current = requestAnimationFrame(processFrame);
      return;
    }

    if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    // Mirror Effect
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    // ROI Logic (Portrait Optimized)
    // We want the upper center 
    const roiWidth = canvas.width * 0.3;
    const roiHeight = canvas.height * 0.25; 
    const roiX = (canvas.width - roiWidth) / 2;
    const roiY = (canvas.height * 0.2); // approx forehead/eyes area

    // Extract Data
    const frameData = ctx.getImageData(roiX, roiY, roiWidth, roiHeight);
    const data = frameData.data;
    
    let greenSum = 0;
    let count = 0;
    // Stride loop for performance on mobile
    for (let i = 0; i < data.length; i += 16) { 
      greenSum += data[i + 1];
      count++;
    }

    if (count > 0) {
        onFrameProcessed(greenSum / count);
    }
    
    // VISUALIZATION EFFECTS
    if (appState === AppState.MEASURING || appState === AppState.CALIBRATING) {
        // Draw Scan Grid
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#06b6d4';
        
        const time = Date.now() / 1000;
        const pts = 5;
        for(let i=0; i<pts; i++) {
            for(let j=0; j<pts; j++) {
                const x = roiX + (roiWidth/pts)*i + Math.sin(time*2 + j)*8;
                const y = roiY + (roiHeight/pts)*j + Math.cos(time*2 + i)*8;
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI*2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1.0;
    }

    requestRef.current = requestAnimationFrame(processFrame);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(processFrame);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [appState]);

  return (
    <div className="relative w-full h-full">
      {error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 text-red-400 p-6 text-center">
          <AlertCircle className="w-10 h-10 mb-2" />
          <p className="text-sm">{error}</p>
        </div>
      )}
      
      <video
        ref={videoRef}
        autoPlay
        playsInline // CRITICAL FOR IPHONE
        muted
        className="hidden" 
      />
      
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* FACE GUIDE OVERLAY */}
      <div className="absolute inset-0 pointer-events-none">
        <svg width="100%" height="100%" preserveAspectRatio="none">
           <defs>
             <mask id="face-mask">
               <rect width="100%" height="100%" fill="white" />
               {/* Vertical Ellipse for Portrait Mode */}
               <ellipse cx="50%" cy="40%" rx="35%" ry="28%" fill="black" />
             </mask>
           </defs>
           <rect width="100%" height="100%" fill="rgba(11, 17, 33, 0.7)" mask="url(#face-mask)" />
           
           <ellipse 
             cx="50%" 
             cy="40%" 
             rx="35%" 
             ry="28%" 
             fill="none" 
             stroke={appState === AppState.MEASURING ? "rgba(6, 182, 212, 0.6)" : "rgba(255, 255, 255, 0.2)"} 
             strokeWidth="2"
             strokeDasharray={appState === AppState.CALIBRATING ? "8 4" : "0"}
             className="transition-all duration-500"
           />
        </svg>

        {/* Scan Line */}
        {(appState === AppState.MEASURING || appState === AppState.CALIBRATING) && (
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
                <div className="scan-line"></div>
            </div>
        )}

        <div className="absolute bottom-8 w-full text-center">
            {appState === AppState.CALIBRATING && (
                <span className="text-cyan-400 text-sm font-medium animate-pulse tracking-widest uppercase">Calibrating Lens...</span>
            )}
             {appState === AppState.IDLE && (
                <span className="text-slate-300 text-sm font-medium tracking-wide">Ready</span>
            )}
        </div>
      </div>
    </div>
  );
};