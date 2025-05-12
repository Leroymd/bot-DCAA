// components/PnLChart.tsx
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PnlData } from '../types';

interface PnLChartProps {
  data: PnlData[];
  timeRange: '7D' | '30D' | 'ALL';
  onTimeRangeChange: (range: '7D' | '30D' | 'ALL') => void;
}

export const PnLChart: React.FC<PnLChartProps> = ({ data, timeRange, onTimeRangeChange }) => {
  return (
    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-bold">График P&L</h3>
        <div className="flex items-center space-x-2 text-sm">
          <button 
            className={`${timeRange === '7D' ? 'bg-blue-600 hover:bg-blue-700' : 'text-gray-400 hover:text-white'} px-3 py-1 rounded`}
            onClick={() => onTimeRangeChange('7D')}
          >
            7D
          </button>
          <button 
            className={`${timeRange === '30D' ? 'bg-blue-600 hover:bg-blue-700' : 'text-gray-400 hover:text-white'} px-3 py-1 rounded`}
            onClick={() => onTimeRangeChange('30D')}
          >
            30D
          </button>
          <button 
            className={`${timeRange === 'ALL' ? 'bg-blue-600 hover:bg-blue-700' : 'text-gray-400 hover:text-white'} px-3 py-1 rounded`}
            onClick={() => onTimeRangeChange('ALL')}
          >
            ALL
          </button>
        </div>
      </div>
      <div className="h-64">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563' }}
                labelStyle={{ color: '#E5E7EB' }}
              />
              <Line 
                type="monotone" 
                dataKey="pnl" 
                name="P&L (%)" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400">Нет данных для отображения</p>
          </div>
        )}
      </div>
    </div>
  );
};