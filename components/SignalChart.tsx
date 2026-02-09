import React from 'react';
import {
  LineChart,
  Line,
  YAxis,
  ResponsiveContainer,
  XAxis
} from 'recharts';
import { SignalDataPoint } from '../types';

interface SignalChartProps {
  data: SignalDataPoint[];
}

export const SignalChart: React.FC<SignalChartProps> = ({ data }) => {
  // We only want to show the last N points
  const displayData = data.slice(-100);

  return (
    <div className="w-full h-48 bg-slate-900/50 rounded-xl border border-slate-700 p-4 relative overflow-hidden">
      <div className="absolute top-2 left-4 text-xs font-mono text-slate-500 uppercase tracking-widest z-10">
        Raw PPG Signal (Green Channel Filtered)
      </div>
      
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={displayData}>
          <XAxis hide />
          <YAxis domain={['auto', 'auto']} hide />
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="1" y2="0">
              <stop offset="5%" stopColor="#10B981" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.8}/>
            </linearGradient>
          </defs>
          <Line
            type="monotone"
            dataKey="value"
            stroke="url(#colorValue)"
            strokeWidth={3}
            dot={false}
            animationDuration={300}
            isAnimationActive={false} // Important for real-time performance
          />
        </LineChart>
      </ResponsiveContainer>
      
      {/* Grid Overlay for aesthetics */}
      <div className="absolute inset-0 pointer-events-none" 
           style={{
             backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
             backgroundSize: '20px 20px'
           }}
      />
    </div>
  );
};