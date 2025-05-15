// client/src/pages/Dashboard.tsx - полная версия с исправлениями
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Bell, Settings, TrendingUp, Activity, DollarSign, Clock, 
         RefreshCw, CheckCircle, AlertCircle, ArrowUp, ArrowDown, 
         Loader, Trash2, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/apiClient';
import { useAppContext } from '../contexts/AppContext';
import { Layout } from '../components/Layout';

const Dashboard: React.FC = () => {
  const { botStatus, loading: botLoading, error: botError, updateBotStatus } = useAppContext();
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tradingPairs, setTradingPairs] = useState<any[]>([]);
  const [topPairs, setTopPairs] = useState<any[]>([]);
  const [recentSignals, setRecentSignals] = useState<any[]>([]);
  const [pnlData, setPnlData] = useState<any[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [closingPositions, setClosingPositions] = useState<{ [key: string]: boolean }>({});
  
  // Загрузка данных при монтировании компонента
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Получение активных торговых пар
        const pairsResponse = await api.pairs.getActive();
        setTradingPairs(pairsResponse);
        
        // Получение топ пар из сканирования
        const topPairsResponse = await api.pairs.getTop();
        setTopPairs(topPairsResponse);
        
        // Получение недавних сигналов
        const signalsResponse = await api.signals.getRecent();
        setRecentSignals(signalsResponse);
        
        // Получение истории PnL
        const pnlResponse = await api.performance.getPnlData(7);
        setPnlData(pnlResponse);
        
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
      if (botStatus.isActive) {
        await api.bot.stop();
      } else {
        await api.bot.start();
      }
      
      // Обновляем статус бота
      await updateBotStatus();
    } catch (err) {
      console.error('Ошибка при изменении статуса бота:', err);
      setError('Произошла ошибка при изменении статуса бота');
    }
  };
  
  // Обработчик обновления сканирования пар
  const refreshScan = async () => {
    try {
      setLoading(true);
      const response = await api.pairs.scan();
      
      if (response.success) {
        setTopPairs(response.pairs || []);
        await updateBotStatus(); // Обновляем статус, включая lastScan
      } else {
        setError(response.message || 'Не удалось обновить результаты сканирования');
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
      const response = await api.pairs.select(pair);
      
      if (response.success) {
        // Обновляем список активных пар
        const pairsResponse = await api.pairs.getActive();
        setTradingPairs(pairsResponse);
      } else {
        setError(response.message || 'Не удалось добавить пару для торговли');
      }
    } catch (err) {
      console.error('Ошибка при выборе пары:', err);
      setError('Произошла ошибка при выборе пары для торговли');
    }
  };
  
  // Обработчик для удаления пары
  const removePairFromTrading = async (pair: string) => {
    try {
      const response = await api.pairs.remove(pair);
      
      if (response.success) {
        // Обновляем список активных пар
        const pairsResponse = await api.pairs.getActive();
        setTradingPairs(pairsResponse);
        // Сбрасываем подтверждение
        setConfirmRemove(null);
      } else {
        setError(response.message || 'Не удалось удалить пару из списка');
      }
    } catch (err) {
      console.error('Ошибка при удалении пары:', err);
      setError('Произошла ошибка при удалении пары');
    }
  };
  
  // Закрытие позиции
  const closePosition = async (positionId: string, symbol: string) => {
    try {
      // Отмечаем позицию как закрывающуюся для отображения индикатора загрузки
      setClosingPositions(prev => ({ ...prev, [positionId]: true }));
      
      console.log(`Закрытие позиции: ID=${positionId}, символ=${symbol}`);
      
      const response = await api.position.close(positionId, symbol);
      
      if (response.success) {
        // Обновляем статус бота
        await updateBotStatus();
        
        // Обновляем список активных пар
        const pairsResponse = await api.pairs.getActive();
        setTradingPairs(pairsResponse);
      } else {
        setError(response.message || 'Не удалось закрыть позицию');
      }
    } catch (err) {
      console.error('Ошибка при закрытии позиции:', err);
      setError('Произошла ошибка при закрытии позиции');
    } finally {
      // Убираем индикатор загрузки
      setClosingPositions(prev => {
        const updated = { ...prev };
        delete updated[positionId];
        return updated;
      });
    }
  };
  
  const currentError = botError || error;
  
  if (loading && botLoading) {
    return <Layout botStatus={botStatus}>
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center text-gray-100">
          <Loader className="w-12 h-12 animate-spin text-blue-400 mb-4" />
          <p className="text-lg">Загрузка данных...</p>
        </div>
      </div>
    </Layout>;
  }
  
  return (
    <Layout botStatus={botStatus}>
      <div className="container mx-auto px-4 py-6">
        {currentError && (
          <div className="bg-red-800 text-white p-4 rounded-lg mb-6 flex justify-between items-center">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {currentError}
            </div>
            <button onClick={() => setError(null)}>
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        )}
        
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
            
            {/* График P&L */}
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
                      <th className="pb-2 font-medium">Действия</th>
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
                          <td>{pair.time && pair.time !== 'NaN:NaN' ? pair.time : '00:00'}</td>
                          <td>{pair.signals || 0}</td>
                          <td className="flex space-x-2">
                            {/* Закрытие позиции, если активна */}
                            {pair.status === 'active' && (
                              <button 
                                className={`text-xs px-2 py-1 ${closingPositions[pair.id] ? 'bg-gray-600' : 'bg-red-600 hover:bg-red-700'} rounded flex items-center`}
                                onClick={() => closePosition(pair.id, pair.pair)}
                                disabled={closingPositions[pair.id]}
                              >
                                {closingPositions[pair.id] ? (
                                  <>
                                    <span className="animate-spin h-3 w-3 mr-1 border-t-2 border-b-2 border-white rounded-full"></span>
                                    Закрытие...
                                  </>
                                ) : 'Закрыть'}
                              </button>
                            )}
                            
                            {/* Кнопка удаления пары (с подтверждением) */}
                            {confirmRemove === pair.pair ? (
                              <div className="flex space-x-1">
                                <button 
                                  className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded"
                                  onClick={() => removePairFromTrading(pair.pair)}
                                >
                                  Да
                                </button>
                                <button 
                                  className="text-xs px-2 py-1 bg-gray-600 hover:bg-gray-700 rounded"
                                  onClick={() => setConfirmRemove(null)}
                                >
                                  Нет
                                </button>
                              </div>
                            ) : (
                              <button 
                                className="text-xs p-1 bg-gray-700 hover:bg-gray-600 rounded"
                                onClick={() => setConfirmRemove(pair.pair)}
                                disabled={pair.status === 'active'} // Блокируем удаление активных пар
                                title={pair.status === 'active' ? 'Сначала закройте позицию' : 'Удалить пару'}
                              >
                                <Trash2 className={`w-4 h-4 ${pair.status === 'active' ? 'text-gray-500' : 'text-gray-300'}`} />
                              </button>
                            )}
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
                          {signal.strength}
                        </div>
                        {signal.status === 'executed' ? (
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        ) : (
                          <Clock className="w-5 h-5 text-gray-400" />
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
      </div>
    </Layout>
  );
};

export default Dashboard;