// contexts/AppContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../api/apiClient';
import { BotStatus } from '../types';

interface AppContextType {
  botStatus: BotStatus;
  updateBotStatus: () => Promise<void>;
  toggleBotStatus: () => Promise<void>;
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
}

const defaultBotStatus: BotStatus = {
  isActive: false,
  balance: 0,
  totalProfit: 0,
  profitPercentage: 0,
  todayProfit: 0,
  todayProfitPercentage: 0,
  winRate: 0,
  totalTrades: 0,
  avgProfit: 0,
  withdrawn: 0,
  lastScan: null
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [botStatus, setBotStatus] = useState<BotStatus>(defaultBotStatus);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const updateBotStatus = async () => {
    try {
      setLoading(true);
      const data = await api.bot.getStatus();
      setBotStatus(data);
      setLoading(false);
    } catch (err) {
      console.error('Ошибка при получении статуса бота:', err);
      setError('Не удалось получить статус бота. Проверьте соединение с сервером.');
      setLoading(false);
    }
  };

  const toggleBotStatus = async () => {
    try {
      const endpoint = botStatus.isActive ? api.bot.stop : api.bot.start;
      const response = await endpoint();
      
      if (response.success) {
        setBotStatus(prev => ({
          ...prev,
          isActive: !prev.isActive
        }));
      } else {
        setError(response.message || 'Не удалось изменить статус бота');
      }
    } catch (err) {
      console.error('Ошибка при изменении статуса бота:', err);
      setError('Произошла ошибка при изменении статуса бота');
    }
  };

  useEffect(() => {
    updateBotStatus();
    
    // Периодическое обновление статуса
    const interval = setInterval(updateBotStatus, 15000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <AppContext.Provider value={{ 
      botStatus, 
      updateBotStatus,
      toggleBotStatus,
      loading,
      error,
      setError
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};