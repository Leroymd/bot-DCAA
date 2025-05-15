// pages/Performance.tsx
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { DollarSign, Calendar, TrendingUp, Percent, RefreshCw } from 'lucide-react';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { PnlData } from '../types';
import { api } from '../api/apiClient';
import { useAppContext } from '../contexts/AppContext';
import { StatusCard } from '../components/StatusCard';

const Performance: React.FC = () => {
  const { botStatus, loading: botLoading, error: botError } = useAppContext();
  
  const [performance, setPerformance] = useState<any>({});
  const [pnlData, setPnlData] = useState<PnlData[]>([]);
  const [balanceHistory, setBalanceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<string>('7d');
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Получение общих данных о производительности
        const performanceData = await api.performance.getPerformance();
        setPerformance(performanceData);
        
        // Получение данных PnL для графика
        let days = 7;
        if (timeRange === '30d') days = 30;
        if (timeRange === 'all') days = 365;
        
        const pnlDataResponse = await api.performance.getPnlData(days);
        setPnlData(pnlDataResponse);
        
        // Получение истории баланса
        try {
          const balanceHistoryData = await api.performance.getBalanceHistory();
          setBalanceHistory(balanceHistoryData);
        } catch (balanceErr) {
          console.error('Ошибка при загрузке истории баланса:', balanceErr);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Ошибка при загрузке данных производительности:', err);
        setError('Ошибка при загрузке данных производительности');
        setLoading(false);
      }
    };
    
    fetchData();
  }, [timeRange]);
  
  // Расчет показателей эффективности
  const calculatePerformanceMetrics = () => {
    if (!performance || Object.keys(performance).length === 0) {
      return {
        totalProfit: 0,
        dailyAvgProfit: 0,
        maxDrawdown: 0,
        monthlyReturn: 0
      };
    }
    
    const totalProfit = botStatus.profitPercentage || 0;
    const dailyAvgProfit = pnlData.length > 0 
      ? pnlData.reduce((sum, item) => sum + (item.pnl || 0), 0) / pnlData.length 
      : 0;
    
    // Расчет максимальной просадки (упрощенно)
    let maxDrawdown = 0;
    if (pnlData.length > 0) {
      let peak = -Infinity;
      let currentDrawdown = 0;
      
      for (const item of pnlData) {
        if (item.pnl > peak) {
          peak = item.pnl;
          currentDrawdown = 0;
        } else {
          currentDrawdown = Math.max(currentDrawdown, peak - item.pnl);
          maxDrawdown = Math.max(maxDrawdown, currentDrawdown);
        }
      }
    }
    
    // Расчет месячной доходности (приблизительно)
    const monthlyReturn = totalProfit / 3; // Предполагается, что данные за 3 месяца
    
    return {
      totalProfit,
      dailyAvgProfit,
      maxDrawdown,
      monthlyReturn
    };
  };
  
  const metrics = calculatePerformanceMetrics();
  const currentError = botError || error;
  
  if (loading || botLoading) {
    return <LoadingSpinner message="Загрузка данных производительности..." />;
  }
  
  return (
    <Layout botStatus={botStatus}>
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Производительность</h1>
          <div className="flex items-center bg-gray-800 rounded-md">
            <button 
              className={`px-3 py-1 rounded-l-md ${timeRange === '7d' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              onClick={() => setTimeRange('7d')}
            >
              7 дней
            </button>
            <button 
              className={`px-3 py-1 ${timeRange === '30d' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              onClick={() => setTimeRange('30d')}
            >
              30 дней
            </button>
            <button 
              className={`px-3 py-1 rounded-r-md ${timeRange === 'all' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              onClick={() => setTimeRange('all')}
            >
              Все время
            </button>
          </div>
        </div>
        
        {currentError && (
          <div className="bg-red-800 text-white p-4 rounded-lg mb-6">
            <div className="flex items-center">
              <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
              {currentError}
            </div>
          </div>
        )}
        
        {/* Ключевые метрики */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatusCard
            title="Общая прибыль"
            value={`${metrics.totalProfit.toFixed(2)}%`}
            icon={<DollarSign className="w-5 h-5 text-green-400" />}
          />
          <StatusCard
            title="Среднедневная прибыль"
            value={`${metrics.dailyAvgProfit.toFixed(2)}%`}
            icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
          />
          <StatusCard
            title="Макс. просадка"
            value={`${metrics.maxDrawdown.toFixed(2)}%`}
            icon={<Percent className="w-5 h-5 text-red-400" />}
          />
          <StatusCard
            title="Месячная доходность"
            value={`${metrics.monthlyReturn.toFixed(2)}%`}
            icon={<Calendar className="w-5 h-5 text-yellow-400" />}
          />
        </div>
        
        {/* График PnL */}
        <div className="bg-gray-800 p-4 rounded-lg mb-6">
          <h3 className="font-bold mb-4">График P&L</h3>
          <div className="h-64">
            {pnlData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={pnlData}
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
        
        {/* График баланса */}
        <div className="bg-gray-800 p-4 rounded-lg mb-6">
          <h3 className="font-bold mb-4">История баланса</h3>
          <div className="h-64">
            {balanceHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={balanceHistory}
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
                    dataKey="balance" 
                    name="Баланс (USDT)" 
                    stroke="#10B981" 
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
        
        {/* Статистика по месяцам */}
        <div className="bg-gray-800 p-4 rounded-lg">
          <h3 className="font-bold mb-4">Месячные показатели</h3>
          <div className="h-64">
            {balanceHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={balanceHistory.filter((item, index) => index % 7 === 0)} // Упрощенный фильтр для месячных данных
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1F2937', borderColor: '#4B5563' }}
                    labelStyle={{ color: '#E5E7EB' }}
                  />
                  <Bar 
                    dataKey="profitPercentage" 
                    name="Прибыль (%)" 
                    fill="#3B82F6"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400">Нет данных для отображения</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Performance;