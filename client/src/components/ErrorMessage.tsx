// components/ErrorMessage.tsx
import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onRetry }) => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="flex flex-col items-center text-gray-100 p-8 bg-gray-800 rounded-lg border border-red-500">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold mb-2">Ошибка</h2>
        <p className="text-center mb-4">{message}</p>
        {onRetry && (
          <button 
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md"
            onClick={onRetry}
          >
            Перезагрузить страницу
          </button>
        )}
      </div>
    </div>
  );
};