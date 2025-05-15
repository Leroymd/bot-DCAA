// client/src/contexts/AppContext.tsx - обновленная версия
import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/apiClient';
import { BotStatus } from '../types';

// Интерфейс контекста приложения
interface AppContextType {
  botStatus: BotStatus;
  loading: boolean;
  error: string | null;
  updateBotStatus: () => Promise<void>;
}

// Значение контекста по умолчанию
const defaultBotStatus: BotStatus = {
  status: 'stopped',
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
  lastScan: null, // Меняем undefined на null
  uptime: 0,
  startTime: 0
};

// Создание контекста
const AppContext = createContext<AppContextType>({
  botStatus: defaultBotStatus,
  loading: false,
  error: null,
  updateBotStatus: async () => {}
});

// Хук для использования контекста
export const useAppContext = () => useContext(AppContext);

// Провайдер контекста
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [botStatus, setBotStatus] = useState<BotStatus>(defaultBotStatus);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Функция для обновления статуса бота
  const updateBotStatus = async () => {
    try {
      setLoading(true);
      const status = await api.bot.getStatus();
      setBotStatus(status);
      setError(null);
    } catch (err) {
      console.error('Ошибка при получении статуса бота:', err);
      setError('Не удалось получить статус бота');
    } finally {
      setLoading(false);
    }
  };
  
  // Получение статуса бота при монтировании компонента
  useEffect(() => {
    let isActive = true;
    
    const fetchBotStatus = async () => {
      try {
        setLoading(true);
        const status = await api.bot.getStatus();
        
        if (isActive) {
          setBotStatus(status);
          setError(null);
        }
      } catch (err) {
        console.error('Ошибка при получении статуса бота:', err);
        if (isActive) {
          setError('Не удалось получить статус бота');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };
    
    fetchBotStatus();
    
    // Настройка периодического обновления статуса
    const interval = setInterval(fetchBotStatus, 30000);
    
    // Очистка при размонтировании
    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, []);
  
  return (
    <AppContext.Provider value={{ botStatus, loading, error, updateBotStatus }}>
      {children}
    </AppContext.Provider>
  );
};