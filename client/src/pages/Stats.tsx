// pages/Stats.tsx
import React, { useState, useEffect } from 'react';
import { Calendar, DollarSign, TrendingUp, Percent } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { PnlData, Trade } from '../types';
import { api } from '../api/apiClient';
import { useAppContext } from '../contexts/AppContext';
import { StatusCard } from '../components/StatusCard';

const Stats: React.FC = () => {
  const { botStatus, loading: botLoading, error: botError } = useAppContext();
  
  const [performance, setPerformance] = useState<any>({});
  const [pnlData, setPnlData] = useState<PnlData[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<string>('7d');
  
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Получение общей статистики производительности
        const performanceData = await api.performance.getPerformance();
        setPerformance(performanceData);
        
        // Получение данных PnL для графика
        let days = 7;
        if (timeRange === '30d') days = 30;
        if (timeRange === 'all') days = 365;
        
        const pnlDataResponse = await api.performance.getPnlData(days);
        setPnlData(pnlDataResponse);
        
        // Получение истории сделок
        const tradesData = await api.performance.getTradeHistory(20);
        setTradeHistory(tradesData);
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching stats:', err);
        setError('Ошибка при загрузке статистики');
        setLoading(false);
      }
    };
    
    fetchStats();
  }, [timeRange]);
  
  // Расчет статистических показателей
  const calculateStats = () => {
    if (!performance || Object.keys(performance).length === 0 || !tradeHistory || tradeHistory.length === 0) {
      return {
        winRate: 0,
        totalTrades: 0,
        avgProfit: 0,
        bestTrade: 0,
        worstTrade: 0
      };
    }
    
    const winTrades = tradeHistory.filter(trade => trade.pnl > 0);
    const winRate = tradeHistory.length > 0 ? (winTrades.length / tradeHistory.length) * 100 : 0;
    
    const profits = tradeHistory.map(trade => trade.pnl || 0);
    const avgProfit = profits.length > 0 ? profits.reduce((sum, pnl) => sum + pnl, 0) / profits.length : 0;
    
    const bestTrade = Math.max(...profits, 0);
    const worstTrade = Math.min(...profits, 0);
    
    return {
      winRate,
      totalTrades: tradeHistory.length,
      avgProfit,
      bestTrade,
      worstTrade
    };
  };
  
  const stats = calculateStats();
  const currentError = botError || error;
  
  if (loading || botLoading) {
    return <LoadingSpinner message="Загрузка статистики..." />;
  }
  
  return (
    <Layout botStatus={botStatus}>
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Статистика</h1>
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
        
        {/* Ключевые метрики */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatusCard
            title="Win Rate"
            value={`${stats.winRate.toFixed(1)}%`}
            icon={<Percent className="w-5 h-5 text-green-400" />}
          />
          <StatusCard
            title="Всего сделок"
            value={stats.totalTrades}
            icon={<Calendar className="w-5 h-5 text-blue-400" />}
          />
          <StatusCard
            title="Средняя прибыль"
            value={`${stats.avgProfit.toFixed(2)}%`}
            icon={<TrendingUp className="w-5 h-5 text-green-400" />}
          />
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-400">Лучшая/худшая сделка</p>
                <h3 className="text-2xl font-bold mt-1 flex items-center">
                  <span className="text-green-400">+{stats.bestTrade.toFixed(2)}%</span>
                  <span className="mx-1">/</span>
                  <span className="text-red-400">{stats.worstTrade.toFixed(2)}%</span>
                </h3>
              </div>
              <div className="bg-gray-700 p-2 rounded-full">
                <DollarSign className="w-5 h-5 text-blue-400" />
              </div>
            </div>
          </div>
        </div>
        
        {/* График P&L */}
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
                  <Legend />
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
        
        {/* История сделок */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700">
            <h3 className="font-bold">История сделок</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-700 text-left text-xs">
                  <th className="px-4 py-2">Дата/Время</th>
                  <th className="px-4 py-2">Пара</th>
                  <th className="px-4 py-2">Тип</th>
                  <th className="px-4 py-2">Вход</th>
                  <th className="px-4 py-2">Выход</th>
                  <th className="px-4 py-2">P&L (%)</th>
                  <th className="px-4 py-2">P&L (USDT)</th>
                  <th className="px-4 py-2">Результат</th>
                </tr>
              </thead>
              <tbody>
                {tradeHistory.length > 0 ? (
                  tradeHistory.map((trade, index) => (
                    <tr key={index} className="border-t border-gray-700 text-sm">
                      <td className="px-4 py-2">
                        {new Date(trade.entryTime).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 font-medium">{trade.symbol}</td>
                      <td className="px-4 py-2">
                        <span className={trade.type === 'LONG' ? 'text-green-400' : 'text-red-400'}>
                          {trade.type}
                        </span>
                      </td>
                      <td className="px-4 py-2">{trade.entryPrice}</td>
                      <td className="px-4 py-2">{trade.closePrice}</td>
                      <td className={`px-4 py-2 ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.pnl >= 0 ? '+' : ''}{trade.pnl?.toFixed(2) || '0.00'}%
                      </td>
                      <td className={`px-4 py-2 ${trade.pnlUSDT >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {trade.pnlUSDT >= 0 ? '+' : ''}{trade.pnlUSDT?.toFixed(2) || '0.00'}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-1 rounded text-xs ${trade.result === 'win' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                          {trade.result === 'win' ? 'WIN' : 'LOSS'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-3 text-center text-gray-400">
                      Нет данных о сделках
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Stats;