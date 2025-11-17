// src/components/ui/gauge.jsx
import React from 'react';

export const Gauge = ({ value, max = 360, label, description, color = 'blue' }) => {
  const percentage = Math.min((value / max) * 100, 100);
  
  const colorClasses = {
    amber: 'from-amber-500 to-orange-500',
    blue: 'from-blue-500 to-cyan-500', 
    emerald: 'from-emerald-500 to-green-500',
    purple: 'from-purple-500 to-pink-500'
  };

  return (
    <div className="text-center p-4 bg-slate-800/50 rounded-lg border border-slate-700">
      <div className="mb-2">
        <div className="text-sm text-slate-400 mb-1">{label}</div>
        <div className="text-2xl font-bold text-white">{value}°</div>
      </div>
      <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
        <div 
          className={`h-2 rounded-full bg-gradient-to-r ${colorClasses[color]}`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      <div className="text-xs text-slate-400">{description}</div>
    </div>
  );
};
