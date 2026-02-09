import React from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  unit: string;
  icon: React.ReactNode;
  description?: string;
  color?: string; // e.g. "text-cyan-400"
}

export const MetricCard: React.FC<MetricCardProps> = ({ label, value, unit, icon, description, color = "text-white" }) => {
  return (
    <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between h-full transition-all duration-300 hover:bg-slate-800/40 group">
      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col">
            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1 group-hover:text-cyan-200 transition-colors">{label}</span>
            <div className="flex items-baseline space-x-1">
                <span className={`text-3xl font-light tracking-tight ${color}`}>{value}</span>
                <span className="text-slate-500 text-xs font-medium">{unit}</span>
            </div>
        </div>
        <div className={`p-2 rounded-lg bg-white/5 border border-white/5 ${color}`}>
            {React.cloneElement(icon as React.ReactElement, { size: 18 })}
        </div>
      </div>
      {description && (
          <div className="mt-2 pt-3 border-t border-white/5">
            <p className="text-[10px] text-slate-500 leading-tight">{description}</p>
          </div>
      )}
    </div>
  );
};