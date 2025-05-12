// components/LoadingSpinner.tsx
import React from 'react';
import { Loader } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = 'Загрузка данных...' }) => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="flex flex-col items-center text-gray-100">
        <Loader className="w-12 h-12 animate-spin text-blue-400 mb-4" />
        <p className="text-lg">{message}</p>
      </div>
    </div>
  );
};
