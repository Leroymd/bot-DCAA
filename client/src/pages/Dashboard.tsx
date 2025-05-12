import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Bell, Settings, TrendingUp, Activity, DollarSign, Clock, Target, ChevronDown, RefreshCw, CheckCircle, AlertCircle, ArrowUp, ArrowDown, Loader } from 'lucide-react';
import axios from 'axios';
// Импортируем типы из index.ts
import { BotStatus, TradingPair, TopPair, Signal, PnlData } from '../types';

const Dashboard = () => {
  // Состояния для основных данных
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Состояния данных бота с правильной типизацией
  const [botStatus, setBotStatus] = useState<BotStatus>({
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
  });
  const [tradingPairs, setTradingPairs] = useState<TradingPair[]>([]);
  const [topPairs, setTopPairs] = useState<TopPair[]>([]);
  const [recentSignals, setRecentSignals] = useState<Signal[]>([]);
  const [pnlData, setPnlData] = useState<PnlData[]>([]);
  const [balanceHistory, setBalanceHistory] = useState<any[]>([]);
  
  // Загрузка данных при монтировании компонента
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Получение статуса бота
        const statusResponse = await axios.get('/api/bot/status');
        if (statusResponse.data.success) {
          setBotStatus(statusResponse.data.data);
        }
        
        // Получение активных торговых пар
        const pairsResponse = await axios.get('/api/pairs/active');
        setTradingPairs(pairsResponse.data);
        
        // Получение топ пар из сканирования
        const topPairsResponse = await axios.get('/api/pairs/top');
        setTopPairs(topPairsResponse.data);
        
        // Получение недавних сигналов
        const signalsResponse = await axios.get('/api/signals/recent');
        setRecentSignals(signalsResponse.data);
        
        // Получение истории PnL
        const pnlResponse = await axios.get('/api/performance/pnl');
        setPnlData(pnlResponse.data);
        
        // Получение истории баланса
        const balanceResponse = await axios.get('/api/performance/balance');
        setBalanceHistory(balanceResponse.data);
        
        setLoading(false);
      } catch (err) {
        console.error('Ошибка при загрузке данных:', err);
        setError('Не удалось загрузить данные. Проверьте соединение с сервером.');
        setLoading(false);
      }
    };
    
    fetchData();
    
    // Настройка периодического обновления данных
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, []);
  
  // Обработчик запуска и остановки бота
  const toggleBotStatus = async () => {
    try {
      const endpoint = botStatus.isActive ? '/api/bot/stop' : '/api/bot/start';
      const response = await axios.post(endpoint);
      
      if (response.data.success) {
        setBotStatus(prev => ({
          ...prev,
          isActive: !prev.isActive
        }));
      } else {
        setError(response.data.message || 'Не удалось изменить статус бота');
      }
    } catch (err) {
      console.error('Ошибка при изменении статуса бота:', err);
      setError('Произошла ошибка при изменении статуса бота');
    }
  };
  
  // Обработчик обновления сканирования пар
  const refreshScan = async () => {
    try {
      setLoading(true);
      const response = await axios.post('/api/pairs/scan');
      
      if (response.data.success) {
        setTopPairs(response.data.pairs);
        
        // Обновляем время последнего сканирования в botStatus
        setBotStatus(prev => ({
          ...prev,
          lastScan: new Date().toLocaleTimeString()
        }));
      } else {
        setError(response.data.message || 'Не удалось обновить результаты сканирования');
      }
      setLoading(false);
    } catch (err) {
      console.error('Ошибка при сканировании пар:', err);
      setError('Произошла ошибка при сканировании пар');
      setLoading(false);
    }
  };
  
  // Обработчик выбора пары для торговли
  const selectPairForTrading = async (pair: string) => {
    try {
      const response = await axios.post('/api/pairs/select', { pair });
      
      if (response.data.success) {
        // Обновляем список активных пар
        const pairsResponse = await axios.get('/api/pairs/active');
        setTradingPairs(pairsResponse.data);
      } else {
        setError(response.data.message || 'Не удалось добавить пару для торговли');
      }
    } catch (err) {
      console.error('Ошибка при выборе пары:', err);
      setError('Произошла ошибка при выборе пары для торговли');
    }
  };
  
  if (loading && !botStatus.isActive) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="flex flex-col items-center text-gray-100">
          <Loader className="w-12 h-12 animate-spin text-blue-400 mb-4" />
          <p className="text-lg">Загрузка данных...</p>
        </div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="flex flex-col items-center text-gray-100 p-8 bg-gray-800 rounded-lg border border-red-500">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2">Ошибка</h2>
          <p className="text-center mb-4">{error}</p>
          <button 
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md"
            onClick={() => window.location.reload()}
          >
            Перезагрузить страницу
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col min-h-screen bg-gray-900 text-gray-100">
      {/* Шапка */}
      <header className="bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-blue-400">FractalScalp Bot</h1>
          <div className={`${botStatus.isActive ? 'bg-green-600' : 'bg-red-600'} text-white text-xs px-2 py-1 rounded`}>
            {botStatus.isActive ? 'АКТИВЕН' : 'ОСТАНОВЛЕН'}
          </div>
        </div>
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2 bg-gray-700 px-3 py-1 rounded-md">
            <DollarSign className="w-4 h-4 text-green-400" />
            <span>{botStatus.balance?.toFixed(2) || '0.00'} USDT</span>
          </div>
          <button className="text-gray-300 hover:text-white">
            <Bell className="w-5 h-5" />
          </button>
          <button className="text-gray-300 hover:text-white">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>
      
      {/* Навигация */}
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4">
          <div className="flex space-x-6">
            <button 
              className={`py-3 px-1 ${activeTab === 'dashboard' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-100'}`}
              onClick={() => setActiveTab('dashboard')}
            >
              Дашборд
            </button>
            <button 
              className={`py-3 px-1 ${activeTab === 'trading' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-100'}`}
              onClick={() => setActiveTab('trading')}
            >
              Торговля
            </button>
            <button 
              className={`py-3 px-1 ${activeTab === 'signals' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-100'}`}
              onClick={() => setActiveTab('signals')}
            >
              Сигналы
            </button>
            <button 
              className={`py-3 px-1 ${activeTab === 'stats' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-100'}`}
              onClick={() => setActiveTab('stats')}
            >
              Статистика
            </button>
            <button 
              className={`py-3 px-1 ${activeTab === 'settings' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-100'}`}
              onClick={() => setActiveTab('settings')}
            >
              Настройки
            </button>
          </div>
        </div>
      </nav>
      
      {/* Основной контент */}
      <main className="flex-1 container mx-auto px-4 py-6">
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Левая колонка - Информация о производительности */}
            <div className="xl:col-span-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-gray-400 text-sm">Общий баланс</p>
                      <h3 className="text-2xl font-bold mt-1">{botStatus.balance?.toFixed(2) || '0.00'} USDT</h3>
                    </div>
                    <div className="bg-gray-700 p-2 rounded-full">
                      <DollarSign className="w-5 h-5 text-green-400" />
                    </div>
                  </div>
                </div>
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-gray-400 text-sm">Прибыль (всего)</p>
                      <h3 className="text-2xl font-bold mt-1">{botStatus.totalProfit?.toFixed(2) || '0.00'} USDT</h3>
                      <p className={`text-xs ${botStatus.profitPercentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {botStatus.profitPercentage >= 0 ? '+' : ''}{botStatus.profitPercentage?.toFixed(2) || '0.00'}%
                      </p>
                    </div>
                    <div className="bg-gray-700 p-2 rounded-full">
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    </div>
                  </div>
                </div>
                <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-gray-400 text-sm">Прибыль (сегодня)</p>
                      <h3 className="text-2xl font-bold mt-1">{botStatus.todayProfit?.toFixed(2) || '0.00'} USDT</h3>
                      <p className={`text-xs ${botStatus.todayProfitPercentage >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {botStatus.todayProfitPercentage >= 0 ? '+' : ''}{botStatus.todayProfitPercentage?.toFixed(2) || '0.00'}%
                      </p>
                    </div>
                    <div className="bg-gray-700 p-2 rounded-full">
                      <Activity className="w-5 h-5 text-blue-400" />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* График PnL */}
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold">График P&L</h3>
                  <div className="flex items-center space-x-2 text-sm">
                    <button className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded">7D</button>
                    <button className="text-gray-400 hover:text-white px-2 py-1">30D</button>
                    <button className="text-gray-400 hover:text-white px-2 py-1">ALL</button>
                  </div>
                </div>
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
              
              {/* Активные пары */}
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold">Активные торговые пары</h3>
                  <span className="text-sm text-gray-400">{tradingPairs.filter(p => p.status === 'active').length} активно</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-gray-400 text-xs border-b border-gray-700">
                        <th className="pb-2 font-medium">Пара</th>
                        <th className="pb-2 font-medium">Статус</th>
                        <th className="pb-2 font-medium">Позиция</th>
                        <th className="pb-2 font-medium">Прибыль</th>
                        <th className="pb-2 font-medium">Время</th>
                        <th className="pb-2 font-medium">Сигналы</th>
                        <th className="pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradingPairs.length > 0 ? (
                        tradingPairs.map((pair, index) => (
                          <tr key={index} className="border-b border-gray-700 text-sm">
                            <td className="py-3 font-medium">{pair.pair}</td>
                            <td>
                              <span className={`px-2 py-1 rounded text-xs ${pair.status === 'active' ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'}`}>
                                {pair.status === 'active' ? 'Активна' : 'Ожидание'}
                              </span>
                            </td>
                            <td>
                              {pair.position && (
                                <span className={`flex items-center ${pair.position === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                                  {pair.position === 'LONG' ? <ArrowUp className="w-4 h-4 mr-1" /> : <ArrowDown className="w-4 h-4 mr-1" />}
                                  {pair.position}
                                </span>
                              )}
                            </td>
                            <td className={pair.profit && pair.profit > 0 ? 'text-green-400' : pair.profit && pair.profit < 0 ? 'text-red-400' : 'text-gray-400'}>
                              {pair.profit && pair.profit > 0 ? '+' : ''}{pair.profit?.toFixed(2) || '0.00'}%
                            </td>
                            <td>{pair.time || '-'}</td>
                            <td>{pair.signals || 0}</td>
                            <td>
                              <button className="text-gray-400 hover:text-white">
                                <ChevronDown className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="py-4 text-center text-gray-400">
                            Нет активных торговых пар
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
            {/* Правая колонка - Сканер и статистика */}
            <div className="space-y-6">
              {/* Управление ботом */}
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="font-bold mb-4">Управление</h3>
                <div className="flex flex-col space-y-3">
                  <button 
                    className={`w-full py-2 px-4 rounded-md text-white font-medium ${botStatus.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
                    onClick={toggleBotStatus}
                  >
                    {botStatus.isActive ? 'Остановить бота' : 'Запустить бота'}
                  </button>
                  <button 
                    className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-md text-white font-medium flex items-center justify-center"
                    onClick={refreshScan}
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center">
                        <Loader className="w-4 h-4 animate-spin mr-2" />
                        Обновление...
                      </span>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Обновить сканирование
                      </>
                    )}
                  </button>
                </div>
              </div>
              
              {/* Счетчики и статистика */}
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="font-bold mb-4">Статистика</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col items-center bg-gray-700 p-3 rounded-lg">
                    <p className="text-gray-400 text-xs mb-1">Win Rate</p>
                    <p className="text-lg font-bold">{botStatus.winRate?.toFixed(1) || '0.0'}%</p>
                  </div>
                  <div className="flex flex-col items-center bg-gray-700 p-3 rounded-lg">
                    <p className="text-gray-400 text-xs mb-1">Сделки</p>
                    <p className="text-lg font-bold">{botStatus.totalTrades || 0}</p>
                  </div>
                  <div className="flex flex-col items-center bg-gray-700 p-3 rounded-lg">
                    <p className="text-gray-400 text-xs mb-1">Выведено</p>
                    <p className="text-lg font-bold">{botStatus.withdrawn?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="flex flex-col items-center bg-gray-700 p-3 rounded-lg">
                    <p className="text-gray-400 text-xs mb-1">Avg Profit</p>
                    <p className="text-lg font-bold">{botStatus.avgProfit?.toFixed(2) || '0.00'}%</p>
                  </div>
                </div>
              </div>
              
              {/* Сканер пар */}
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold">Топ пар для торговли</h3>
                  <div className="flex items-center text-xs text-gray-400">
                    <Clock className="w-3 h-3 mr-1" />
                    <span>Обновлено: {botStatus.lastScan || 'неизвестно'}</span>
                  </div>
                </div>
                <div className="overflow-y-auto max-h-80">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-gray-400 text-xs border-b border-gray-700">
                        <th className="pb-2 font-medium">Пара</th>
                        <th className="pb-2 font-medium">Сила</th>
                        <th className="pb-2 font-medium">Сигналы</th>
                        <th className="pb-2 font-medium">Объем</th>
                        <th className="pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {topPairs.length > 0 ? (
                        topPairs.map((pair, index) => (
                          <tr key={index} className="border-b border-gray-700 text-sm">
                            <td className="py-2 font-medium">{pair.pair}</td>
                            <td>
                              <div className="flex items-center">
                                <div className="w-16 bg-gray-700 rounded-full h-2 mr-2">
                                  <div 
                                    className="bg-blue-500 h-2 rounded-full" 
                                    style={{ width: `${pair.strength}%` }}
                                  ></div>
                                </div>
                                <span>{pair.strength}</span>
                              </div>
                            </td>
                            <td>{pair.signals}</td>
                            <td>{pair.volume}</td>
                            <td>
                              <button 
                                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded"
                                onClick={() => selectPairForTrading(pair.pair)}
                              >
                                Выбрать
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-gray-400">
                            Нет данных сканирования
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* Недавние сигналы */}
              <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
                <h3 className="font-bold mb-4">Недавние сигналы</h3>
                <div className="space-y-3">
                  {recentSignals.length > 0 ? (
                    recentSignals.map((signal, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                        <div className="flex items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${signal.type === 'BUY' ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
                            {signal.type === 'BUY' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="font-medium">{signal.pair}</p>
                            <p className="text-xs text-gray-400">{signal.time}</p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <div className="bg-gray-600 px-2 py-1 rounded mr-2 text-xs flex items-center">
                            <Target className="w-3 h-3 mr-1" />
                            {signal.strength}
                          </div>
                          {signal.status === 'executed' ? (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-gray-400">
                      Нет недавних сигналов
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      
      {/* Футер */}
      <footer className="bg-gray-800 border-t border-gray-700 p-4 text-center text-gray-400 text-sm">
        FractalScalp Bot v1.0.0 — Система торговли на основе фракталов
      </footer>
    </div>
  );
};

export default Dashboard;