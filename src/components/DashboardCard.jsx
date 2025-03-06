// src/components/DashboardCard.jsx
import React from 'react';
import { ArrowUp, ArrowDown, ArrowRight } from 'lucide-react';

const DashboardCard = ({ 
  title, 
  value, 
  label, 
  icon,
  trend = 'neutral', // 'up', 'down', 'neutral'
  trendValue,
  onClick 
}) => {
  return (
    <div 
      className="bg-white p-5 rounded-xl shadow-sm cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 rounded-lg bg-blue-50">{icon}</div>
        
        {trend !== 'neutral' && (
          <div className={`flex items-center text-xs font-medium rounded-full px-2 py-1 ${
            trend === 'up' 
              ? 'text-green-700 bg-green-100' 
              : 'text-red-700 bg-red-100'
          }`}>
            {trend === 'up' ? (
              <ArrowUp className="w-3 h-3 mr-1" />
            ) : (
              <ArrowDown className="w-3 h-3 mr-1" />
            )}
            {trendValue}
          </div>
        )}
      </div>
      
      <h3 className="text-gray-500 text-sm mb-1">{title}</h3>
      <div className="text-2xl font-bold text-gray-800 mb-1">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
      
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center text-blue-600 text-xs font-medium">
        View details <ArrowRight className="w-3 h-3 ml-1" />
      </div>
    </div>
  );
};

export default DashboardCard;