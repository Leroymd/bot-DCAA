// components/StatusCard.tsx
import React, { ReactNode } from 'react';

interface StatusCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  subValue?: string | number;
  isSubValuePositive?: boolean;
}

export const StatusCard: React.FC<StatusCardProps> = ({ 
  title, 
  value, 
  icon, 
  subValue, 
  isSubValuePositive 
}) => {
  return (
    <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-gray-400 text-sm">{title}</p>
          <h3 className="text-2xl font-bold mt-1">{value}</h3>
          {subValue !== undefined && (
            <p className={`text-xs ${isSubValuePositive ? 'text-green-400' : 'text-red-400'}`}>
              {isSubValuePositive ? '+' : ''}{subValue}
            </p>
          )}
        </div>
        <div className="bg-gray-700 p-2 rounded-full">
          {icon}
        </div>
      </div>
    </div>
  );
};