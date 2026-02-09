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
        const constraints = {
          audio: false,
          video: {
            facingMode: 'user',
            // Prefer portrait resolution for mobile selfie feel
            width: { ideal: 720 }, 
            height: { ideal: 1280 },
            frameRate: { ideal: 30 }
          }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setError("Camera access denied. Please allow camera access in settings.");
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

    // Ensure canvas always fills the container coordinates
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
            canvas.width = rect.width;
            canvas.height = rect.height;
        }
    }

    // Draw Video to Canvas (Crop to fit "Object Cover" style)
    // We need to calculate aspect ratios to center crop the video feed onto the canvas
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;
    
    let renderW, renderH, offsetX, offsetY;

    if (canvasAspect > videoAspect) {
        // Canvas is wider than video -> Fit width, crop height
        renderW = canvas.width;
        renderH = canvas.width / videoAspect;
        offsetX = 0;
        offsetY = (canvas.height - renderH) / 2;
    } else {
        // Canvas is taller than video (Mobile Portrait) -> Fit height, crop width
        renderH = canvas.height;
        renderW = canvas.height * videoAspect;
        offsetX = (canvas.width - renderW) / 2;
        offsetY = 0;
    }

    ctx.save();
    // Mirror the image horizontally
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, canvas.width - (offsetX + renderW), offsetY, renderW, renderH);
    ctx.restore();

    // --- ROI EXTRACTION ---
    // Extract from the visual center of the screen where the oval is
    const roiW = canvas.width * 0.25;
    const roiH = canvas.height * 0.15;
    const roiX = (canvas.width - roiW) / 2;
    const roiY = (canvas.height * 0.35); // Slightly above center for face

    const frameData = ctx.getImageData(roiX, roiY, roiW, roiH);
    const data = frameData.data;
    
    let greenSum = 0;
    let count = 0;
    // Fast Sampling (every 8th pixel)
    for (let i = 0; i < data.length; i += 32) { 
      greenSum += data[i + 1];
      count++;
    }

    if (count > 0) {
        onFrameProcessed(greenSum / count);
    }
    
    // --- VISUAL OVERLAYS ---
    if (appState === AppState.MEASURING || appState === AppState.CALIBRATING) {
        // Scan Effect inside the ROI area
        ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
        const scanY = roiY + (Math.sin(Date.now() / 500) * 0.5 + 0.5) * roiH;
        ctx.fillRect(roiX, scanY, roiW, 2);
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
    <div className="relative w-full h-full bg-slate-900 overflow-hidden">
      {error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black text-white p-8 text-center">
          <AlertCircle className="w-12 h-12 mb-4 text-red-500" />
          <h3 className="text-lg font-bold mb-2">Camera Error</h3>
          <p className="text-slate-400">{error}</p>
        </div>
      )}
      
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* FACE OVAL OVERLAY */}
      <div className="absolute inset-0 pointer-events-none">
         <svg width="100%" height="100%">
             <defs>
                 <mask id="overlay-mask">
                     <rect width="100%" height="100%" fill="white" />
                     {/* The clear hole for the face */}
                     <ellipse cx="50%" cy="42%" rx="35%" ry="25%" fill="black" />
                 </mask>
             </defs>
             {/* Darkened background */}
             <rect width="100%" height="100%" fill="rgba(0,0,0,0.4)" mask="url(#overlay-mask)" />
             
             {/* The Ring */}
             <ellipse 
                 cx="50%" cy="42%" rx="35%" ry="25%" 
                 fill="none" 
                 stroke={appState === AppState.MEASURING ? "rgba(6, 182, 212, 0.8)" : "rgba(255, 255, 255, 0.3)"} 
                 strokeWidth={appState === AppState.MEASURING ? "3" : "1"}
                 strokeDasharray={appState === AppState.CALIBRATING ? "10 10" : "0"}
                 className="transition-all duration-300"
             />
         </svg>
      </div>
    </div>
  );
};