// pages/Signals.tsx
import React, { useState, useEffect } from 'react';
import { AlertCircle, ArrowUp, ArrowDown, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Signal } from '../types';
import { api } from '../api/apiClient';
import { useAppContext } from '../contexts/AppContext';

const Signals: React.FC = () => {
  const { botStatus, loading: botLoading, error: botError } = useAppContext();
  
  const [signals, setSignals] = useState<Signal[]>([]);
  const [indicators, setIndicators] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'BUY' | 'SELL'>('all');
  
  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const signalsData = await api.signals.getRecent();
        setSignals(signalsData);
        
        const indicatorsData = await api.signals.getIndicators();
        setIndicators(indicatorsData);
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching signals:', err);
        setError('Ошибка при загрузке сигналов');
        setLoading(false);
      }
    };
    
    fetchSignals();
    
    // Периодическое обновление данных
    const interval = setInterval(fetchSignals, 30000);
    return () => clearInterval(interval);
  }, []);
  
  const refreshSignals = async () => {
    setLoading(true);
    
    try {
      const signalsData = await api.signals.getRecent();
      setSignals(signalsData);
      
      const indicatorsData = await api.signals.getIndicators();
      setIndicators(indicatorsData);
      
      setLoading(false);
    } catch (err) {
      console.error('Error refreshing signals:', err);
      setError('Ошибка при обновлении сигналов');
      setLoading(false);
    }
  };
  
  const filteredSignals = filter === 'all' 
    ? signals 
    : signals.filter(signal => signal.type === filter);
  
  const currentError = botError || error;
  
  if (loading || botLoading) {
    return <LoadingSpinner message="Загрузка сигналов..." />;
  }
  
  return (
    <Layout botStatus={botStatus}>
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Сигналы</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center bg-gray-800 rounded-md">
              <button 
                className={`px-3 py-1 rounded-l-md ${filter === 'all' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                onClick={() => setFilter('all')}
              >
                Все
              </button>
              <button 
                className={`px-3 py-1 ${filter === 'BUY' ? 'bg-green-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                onClick={() => setFilter('BUY')}
              >
                Покупка
              </button>
              <button 
                className={`px-3 py-1 rounded-r-md ${filter === 'SELL' ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                onClick={() => setFilter('SELL')}
              >
                Продажа
              </button>
            </div>
            <button
              className="flex items-center px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-md"
              onClick={refreshSignals}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Обновить
            </button>
          </div>
        </div>
        
        {currentError && (
          <div className="bg-red-800 text-white p-4 rounded-lg mb-6">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {currentError}
            </div>
          </div>
        )}
        
        {/* Индикаторы */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="text-lg font-medium mb-3">Активные пары</h3>
            <div className="text-2xl font-bold">
              {Object.keys(indicators).length || 0}
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="text-lg font-medium mb-3">Сегодняшние сигналы</h3>
            <div className="text-2xl font-bold">
              {signals.length || 0}
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <h3 className="text-lg font-medium mb-3">Исполнено</h3>
            <div className="text-2xl font-bold">
              {signals.filter(s => s.status === 'executed').length || 0}
            </div>
          </div>
        </div>
        
        {/* Список сигналов */}
        <div className="space-y-4">
          {filteredSignals.length > 0 ? (
            filteredSignals.map((signal, index) => (
              <div key={index} className="bg-gray-800 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 ${signal.type === 'BUY' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
                      {signal.type === 'BUY' ? <ArrowUp className="w-5 h-5" /> : <ArrowDown className="w-5 h-5" />}
                    </div>
                    <div>
                      <h3 className="font-medium">{signal.pair}</h3>
                      <p className="text-sm text-gray-400 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        {signal.time}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="bg-gray-700 px-2 py-1 rounded text-sm flex items-center">
                      <span className="mr-1">Сила:</span>
                      <span className="font-medium">{signal.strength}</span>
                    </div>
                    {signal.status === 'executed' ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : (
                      <Clock className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
                
                {signal.reason && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <p className="text-sm text-gray-400">{signal.reason}</p>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="bg-gray-800 p-6 rounded-lg text-center">
              <p className="text-gray-400">Нет сигналов для отображения</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Signals;