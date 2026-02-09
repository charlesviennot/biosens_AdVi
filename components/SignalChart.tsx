import React from 'react';
import {
  LineChart,
  Line,
  YAxis,
  ResponsiveContainer,
} from 'recharts';
import { SignalDataPoint } from '../types';

interface SignalChartProps {
  data: SignalDataPoint[];
}

export const SignalChart: React.FC<SignalChartProps> = ({ data }) => {
  const displayData = data.slice(-128);

  return (
    <div className="w-full h-32 relative">
      <div className="absolute top-0 left-0 text-[10px] font-bold text-cyan-500/50 uppercase tracking-widest z-10">
        Live Pulse Waveform
      </div>
      
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={displayData}>
          <YAxis domain={['auto', 'auto']} hide />
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.1}/>
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={1}/>
            </linearGradient>
          </defs>
          <Line
            type="monotone"
            dataKey="value"
            stroke="url(#chartGradient)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false} 
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};