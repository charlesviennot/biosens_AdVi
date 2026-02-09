import React, { useRef, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { AppState, RGB } from '../types';

interface VideoFeedProps {
  onFrameProcessed: (rgb: RGB) => void;
  appState: AppState;
}

const VideoFeedComponent: React.FC<VideoFeedProps> = ({ onFrameProcessed, appState }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<number>();
  const [isVideoReady, setIsVideoReady] = useState(false);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const constraints = {
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 720 },
            height: { ideal: 1280 },
            frameRate: { ideal: 30 }
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // IMPORTANT: iPhone requires the video element to be technically "visible" in the DOM logic
          // and playsInline set. We handle visibility via CSS opacity/z-index.
          videoRef.current.onloadedmetadata = () => {
             videoRef.current?.play().then(() => {
                 setIsVideoReady(true);
             }).catch(e => console.error("Play error:", e));
          };
        }
      } catch (err) {
        setError("Camera access denied. Please allow camera access.");
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
    requestRef.current = requestAnimationFrame(processFrame);
    
    if (!videoRef.current || !canvasRef.current || !isVideoReady) return;
    
    const video = videoRef.current;
    // Ensure video is actually playing and has data
    if (video.readyState < 2 || video.paused) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // --- CANVAS RESIZING LOGIC ---
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
         if (Math.abs(canvas.width - rect.width) > 50 || Math.abs(canvas.height - rect.height) > 50) {
             canvas.width = rect.width;
             canvas.height = rect.height;
         }
    }

    // --- DRAWING LOGIC (ASPECT FILL) ---
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;
    
    let renderW, renderH, offsetX, offsetY;

    if (canvasAspect > videoAspect) {
        renderW = canvas.width;
        renderH = canvas.width / videoAspect;
        offsetX = 0;
        offsetY = (canvas.height - renderH) / 2;
    } else {
        renderH = canvas.height;
        renderW = canvas.height * videoAspect;
        offsetX = (canvas.width - renderW) / 2;
        offsetY = 0;
    }

    ctx.save();
    // Mirror
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, canvas.width - (offsetX + renderW), offsetY, renderW, renderH);
    ctx.restore();

    // --- ROI Extraction (Forehead/Cheeks area) ---
    const roiW = canvas.width * 0.20;
    const roiH = canvas.height * 0.15;
    const roiX = (canvas.width - roiW) / 2;
    const roiY = (canvas.height * 0.30); 

    // Extract data for processing
    // NOTE: Optimized for performance
    try {
        const frameData = ctx.getImageData(roiX, roiY, roiW, roiH);
        const data = frameData.data;
        
        let rSum = 0, gSum = 0, bSum = 0;
        let count = 0;
        
        // Sampling stride 32 for better performance on mobile high-res screens
        for (let i = 0; i < data.length; i += 32) { 
          rSum += data[i];
          gSum += data[i + 1];
          bSum += data[i + 2];
          count++;
        }

        if (count > 0) {
            onFrameProcessed({
                r: rSum / count,
                g: gSum / count,
                b: bSum / count
            });
        }
    } catch (e) {
        // Prevent crash if canvas state is invalid
        console.warn("Frame read error", e);
    }
    
    // --- VISUAL FEEDBACK ---
    if (appState === AppState.MEASURING || appState === AppState.CALIBRATING) {
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(roiX, roiY, roiW, roiH);
        
        const time = Date.now() / 1000;
        const scanY = roiY + (Math.sin(time * 2) * 0.5 + 0.5) * roiH;
        ctx.fillStyle = 'rgba(6, 182, 212, 0.4)';
        ctx.fillRect(roiX, scanY, roiW, 2);
    }
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(processFrame);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [appState, isVideoReady]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 text-white p-8 text-center">
          <AlertCircle className="w-12 h-12 mb-4 text-red-500" />
          <p className="text-slate-300">{error}</p>
        </div>
      )}
      
      {/* 
         FIX: Do NOT use display:none or hidden class. 
         iOS pauses video decoding if the element is hidden. 
         Use opacity 0 and absolute positioning instead.
      */}
      <video 
        ref={videoRef} 
        playsInline 
        muted 
        autoPlay
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', zIndex: -1, width: 1, height: 1 }}
      />
      
      <canvas ref={canvasRef} className="block w-full h-full object-cover" />

      {/* OVERLAY GRAPHICS */}
      <div className="absolute inset-0 pointer-events-none">
         <svg width="100%" height="100%">
             <defs>
                 <mask id="overlay-mask">
                     <rect width="100%" height="100%" fill="white" />
                     <ellipse cx="50%" cy="42%" rx="38%" ry="28%" fill="black" />
                 </mask>
             </defs>
             <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#overlay-mask)" />
             <ellipse 
                 cx="50%" cy="42%" rx="38%" ry="28%" 
                 fill="none" 
                 stroke={appState === AppState.MEASURING ? "rgba(6, 182, 212, 0.8)" : "rgba(255, 255, 255, 0.2)"} 
                 strokeWidth={appState === AppState.MEASURING ? "3" : "1"}
                 strokeDasharray={appState === AppState.CALIBRATING ? "10 5" : "0"}
                 className="transition-all duration-300"
             />
         </svg>
      </div>
    </div>
  );
};

export const VideoFeed = React.memo(VideoFeedComponent);