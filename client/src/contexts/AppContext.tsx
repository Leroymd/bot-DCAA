// client/src/contexts/AppContext.tsx - обновленная версия
import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/apiClient';
import { BotStatus, BalanceInfo } from '../types';

// Интерфейс контекста приложения
interface AppContextType {
  botStatus: BotStatus;
  balanceInfo: BalanceInfo; // Добавлено
  loading: boolean;
  error: string | null;
  updateBotStatus: () => Promise<void>;
  updateBalanceInfo: () => Promise<void>; // Добавлено
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
  lastScan: null,
  uptime: 0,
  startTime: 0
};

// Значение баланса по умолчанию
const defaultBalanceInfo: BalanceInfo = {
  usdtBalance: 0,
  walletBalance: 0,
  available: 0,
  unrealizedPnl: 0,
  roi: 0
};

// Создание контекста
const AppContext = createContext<AppContextType>({
  botStatus: defaultBotStatus,
  balanceInfo: defaultBalanceInfo, // Добавлено
  loading: false,
  error: null,
  updateBotStatus: async () => {},
  updateBalanceInfo: async () => {} // Добавлено
});

// Хук для использования контекста
export const useAppContext = () => useContext(AppContext);

// Провайдер контекста
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [botStatus, setBotStatus] = useState<BotStatus>(defaultBotStatus);
  const [balanceInfo, setBalanceInfo] = useState<BalanceInfo>(defaultBalanceInfo); // Добавлено
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
  
  // Функция для обновления информации о балансе
  const updateBalanceInfo = async () => {
    try {
      const info = await api.account.getBalanceInfo();
      setBalanceInfo(info);
    } catch (err) {
      console.error('Ошибка при получении информации о балансе:', err);
      // Не устанавливаем ошибку, чтобы не блокировать работу с ботом
    }
  };
  
  // Получение статуса бота и информации о балансе при монтировании компонента
  useEffect(() => {
    let isActive = true;
    
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Загружаем статус бота
        const status = await api.bot.getStatus();
        
        if (isActive) {
          setBotStatus(status);
          setError(null);
        }
        
        // Загружаем информацию о балансе (независимо от статуса бота)
        try {
          const balanceData = await api.account.getBalanceInfo();
          if (isActive) {
            setBalanceInfo(balanceData);
          }
        } catch (balanceErr) {
          console.error('Ошибка при получении информации о балансе:', balanceErr);
          // Не блокируем работу приложения из-за ошибки баланса
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
    
    fetchData();
    
    // Настройка периодического обновления данных
    const botStatusInterval = setInterval(() => {
      updateBotStatus().catch(console.error);
    }, 30000);
    
    // Отдельный интервал для баланса, чтобы ошибки одного не блокировали другое
    const balanceInterval = setInterval(() => {
      updateBalanceInfo().catch(console.error);
    }, 30000);
    
    // Очистка при размонтировании
    return () => {
      isActive = false;
      clearInterval(botStatusInterval);
      clearInterval(balanceInterval);
    };
  }, []);
  
  return (
    <AppContext.Provider value={{ 
      botStatus, 
      balanceInfo, // Передаем информацию о балансе
      loading, 
      error, 
      updateBotStatus,
      updateBalanceInfo // Передаем функцию обновления баланса
    }}>
      {children}
    </AppContext.Provider>
  );
};