// pages/Settings.tsx
import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { BotSettings } from '../types';
import { api } from '../api/apiClient';
import { useAppContext } from '../contexts/AppContext';

const Settings: React.FC = () => {
  const { botStatus, loading: botLoading, error: botError } = useAppContext();
  
  const [settings, setSettings] = useState<BotSettings>({
    pacLength: 0,
    fastEMAlength: 0,
    mediumEMAlength: 0,
    pullbackLookback: 0,
    useHAcandles: false,
    positionSize: 0,
    leverage: 0,
    takeProfitPercentage: 0,
    stopLossPercentage: 0,
    maxTradeDurationMinutes: 0
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settingsData = await api.settings.get();
        setSettings(settingsData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching settings:', err);
        setError('Ошибка при загрузке настроек');
        setLoading(false);
      }
    };
    
    fetchSettings();
  }, []);
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const isCheckbox = type === 'checkbox';
    const isNumber = type === 'number';
    
    // Handle nested properties (not used in this component now, but could be useful)
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setSettings(prev => ({
        ...prev,
        [parent]: {
          ...(prev as any)[parent],
          [child]: isCheckbox 
            ? (e.target as HTMLInputElement).checked 
            : isNumber 
              ? parseFloat(value) 
              : value
        }
      }));
    } else {
      setSettings(prev => ({
        ...prev,
        [name]: isCheckbox 
          ? (e.target as HTMLInputElement).checked 
          : isNumber 
            ? parseFloat(value) 
            : value
      }));
    }
  };
  
  const saveSettings = async () => {
    try {
      const response = await api.settings.update(settings);
      
      if (response.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setError(response.message || 'Не удалось сохранить настройки');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Ошибка при сохранении настроек');
    }
  };
  
  const currentError = botError || error;
  
  if (loading || botLoading) {
    return <LoadingSpinner message="Загрузка настроек..." />;
  }
  
  return (
    <Layout botStatus={botStatus}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Настройки бота</h1>
        
        {currentError && (
          <div className="bg-red-800 text-white p-4 rounded-lg mb-6">
            {currentError}
          </div>
        )}
        
        {saveSuccess && (
          <div className="bg-green-800 text-white p-4 rounded-lg mb-6">
            Настройки успешно сохранены
          </div>
        )}
        
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Настройки стратегии</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm text-gray-400 mb-1">High Low PAC Channel</label>
              <input 
                type="number" 
                name="pacLength" 
                value={settings.pacLength || ''} 
                onChange={handleInputChange}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Fast EMA Length</label>
              <input 
                type="number" 
                name="fastEMAlength" 
                value={settings.fastEMAlength || ''} 
                onChange={handleInputChange}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Medium EMA Length</label>
              <input 
                type="number" 
                name="mediumEMAlength" 
                value={settings.mediumEMAlength || ''} 
                onChange={handleInputChange}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Pullback Lookback</label>
              <input 
                type="number" 
                name="pullbackLookback" 
                value={settings.pullbackLookback || ''} 
                onChange={handleInputChange}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
              />
            </div>
            <div className="flex items-center">
              <input 
                type="checkbox" 
                id="useHAcandles" 
                name="useHAcandles"
                checked={settings.useHAcandles || false}
                onChange={handleInputChange}
                className="mr-2" 
              />
              <label htmlFor="useHAcandles" className="text-sm">Использовать Heikin Ashi свечи</label>
            </div>
          </div>

          <h2 className="text-xl font-bold mb-4">Настройки торговли</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Размер позиции (%)</label>
              <input 
                type="number" 
                name="positionSize" 
                value={settings.positionSize || ''} 
                onChange={handleInputChange}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Плечо</label>
              <select 
                name="leverage" 
                value={settings.leverage || ''} 
                onChange={handleInputChange}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
              >
                <option value="5">5x</option>
                <option value="10">10x</option>
                <option value="20">20x</option>
                <option value="50">50x</option>
                <option value="100">100x</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Тейк-профит (%)</label>
              <input 
                type="number" 
                name="takeProfitPercentage" 
                value={settings.takeProfitPercentage || ''} 
                onChange={handleInputChange}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Стоп-лосс (%)</label>
              <input 
                type="number" 
                name="stopLossPercentage" 
                value={settings.stopLossPercentage || ''} 
                onChange={handleInputChange}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Макс. время в сделке (мин)</label>
              <input 
                type="number" 
                name="maxTradeDurationMinutes" 
                value={settings.maxTradeDurationMinutes || ''} 
                onChange={handleInputChange}
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
              />
            </div>
          </div>
          
          <div className="mt-6 flex justify-end">
            <button
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md"
              onClick={saveSettings}
            >
              Сохранить настройки
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
