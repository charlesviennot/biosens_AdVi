import React, { useRef, useEffect, useState } from 'react';
import { Camera, RefreshCw, AlertCircle } from 'lucide-react';
import { AppState, FaceROI } from '../types';

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
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
            frameRate: { ideal: 30 }
          }
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        setError("Camera access denied or unavailable.");
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

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    /**
     * ROI LOGIC:
     * Ideally, we use MediaPipe FaceMesh here.
     * For this MVP without external heavy assets, we implement a robust
     * "Center ROI" heuristic which assumes the user centers their face.
     * We target the center-upper region (forehead/cheeks approximation).
     */
    const roiWidth = canvas.width * 0.3;
    const roiHeight = canvas.height * 0.3;
    const roiX = (canvas.width - roiWidth) / 2;
    const roiY = (canvas.height - roiHeight) / 2.5;

    // Draw ROI Box
    ctx.strokeStyle = appState === AppState.MEASURING ? '#10B981' : '#F59E0B'; // Green or Amber
    ctx.lineWidth = 2;
    ctx.strokeRect(roiX, roiY, roiWidth, roiHeight);

    // Extract Pixel Data
    const frameData = ctx.getImageData(roiX, roiY, roiWidth, roiHeight);
    const data = frameData.data;
    
    let greenSum = 0;
    let pixelCount = 0;

    // Iterate pixels (RGBA) - Strided for performance if needed, but modern JS handles this size fine
    for (let i = 0; i < data.length; i += 4) {
      // data[i] = R, data[i+1] = G, data[i+2] = B
      greenSum += data[i + 1];
      pixelCount++;
    }

    const greenAvg = greenSum / pixelCount;
    onFrameProcessed(greenAvg);

    requestRef.current = requestAnimationFrame(processFrame);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(processFrame);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-700 bg-black shadow-2xl aspect-video w-full max-w-lg mx-auto">
      {error && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/90 text-red-400 p-6 text-center">
          <AlertCircle className="w-12 h-12 mb-4" />
          <p>{error}</p>
        </div>
      )}
      
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover opacity-60"
      />
      
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="absolute inset-0 w-full h-full object-cover z-10"
      />

      <div className="absolute bottom-4 left-4 z-20 flex items-center space-x-2 bg-black/60 backdrop-blur px-3 py-1 rounded-full border border-slate-700">
        <Camera className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-mono text-emerald-100">30 FPS | LIVE</span>
      </div>

      {appState === AppState.CALIBRATING && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-sm">
           <div className="flex flex-col items-center animate-pulse">
             <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin mb-2" />
             <span className="text-emerald-400 font-bold tracking-wider">CALIBRATING SIGNAL...</span>
             <span className="text-emerald-400/70 text-sm">Keep still</span>
           </div>
        </div>
      )}
    </div>
  );
};