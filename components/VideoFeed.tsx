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
            // Removing specific dimensions to get the native aspect ratio (usually 4:3)
            // which offers the widest field of view. Specifying 16:9 or 9:16 often 
            // triggers a hardware crop/zoom on mobile front cameras.
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
        // Canvas is wider than video (Desktop/Landscape) -> Fit width
        renderW = canvas.width;
        renderH = canvas.width / videoAspect;
        offsetX = 0;
        offsetY = (canvas.height - renderH) / 2;
    } else {
        // Canvas is taller than video (Mobile Portrait) -> Fit height
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
    // Extract from the rendered coordinates (relative to canvas)
    // We position the ROI relative to the canvas center
    const roiW = canvas.width * 0.20;
    const roiH = canvas.height * 0.15;
    const roiX = (canvas.width - roiW) / 2;
    // Position ROI slightly above center (35% down) to hit forehead/cheeks on a centered face
    const roiY = (canvas.height * 0.35); 

    // Extract data for processing
    try {
        const frameData = ctx.getImageData(roiX, roiY, roiW, roiH);
        const data = frameData.data;
        
        let rSum = 0, gSum = 0, bSum = 0;
        let count = 0;
        
        // Sampling stride 32 for better performance
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
      
      {/* Hidden video element acting as source */}
      <video 
        ref={videoRef} 
        playsInline 
        muted 
        autoPlay
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', zIndex: -1, width: 1, height: 1 }}
      />
      
      {/* Canvas renders the processed frame */}
      <canvas ref={canvasRef} className="block w-full h-full object-cover" />

      {/* OVERLAY GRAPHICS (SVG) */}
      <div className="absolute inset-0 pointer-events-none">
         <svg width="100%" height="100%">
             <defs>
                 <mask id="overlay-mask">
                     <rect width="100%" height="100%" fill="white" />
                     {/* The clear hole for the face - Adjusted size */}
                     <ellipse cx="50%" cy="45%" rx="36%" ry="26%" fill="black" />
                 </mask>
             </defs>
             {/* Vignette */}
             <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#overlay-mask)" />
             
             {/* Oval Guide */}
             <ellipse 
                 cx="50%" cy="45%" rx="36%" ry="26%" 
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