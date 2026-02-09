import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'stable';
  color?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({ label, value, unit, icon, color = "text-white" }) => {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 p-4 rounded-xl flex items-center justify-between">
      <div>
        <div className="flex items-center space-x-2 mb-1">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">{label}</span>
        </div>
        <div className="flex items-baseline space-x-1">
          <span className={`text-2xl font-mono font-bold ${color}`}>{value}</span>
          <span className="text-slate-500 text-xs">{unit}</span>
        </div>
      </div>
      <div className={`p-3 rounded-lg bg-slate-700/30 ${color}`}>
        {icon}
      </div>
    </div>
  );
};