// client/src/pages/Trading.tsx - полная исправленная версия
import React, { useState, useEffect } from 'react';
import { AlertCircle, ArrowUp, ArrowDown, X, Settings } from 'lucide-react';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { api } from '../api/apiClient';
import { TradingPair, OrderFormData } from '../types';
import { useAppContext } from '../contexts/AppContext';

const Trading: React.FC = () => {
  const { botStatus, loading: botLoading, error: botError, updateBotStatus } = useAppContext();
  
  const [activePositions, setActivePositions] = useState<TradingPair[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [openOrderForm, setOpenOrderForm] = useState<boolean>(false);
  const [orderFormData, setOrderFormData] = useState<OrderFormData>({
    symbol: '',
    type: 'LONG',
    size: '',
    leverage: 20,
    takeProfitPrice: '',
    stopLossPrice: ''
  });
  const [showTpSlFields, setShowTpSlFields] = useState<boolean>(false);
  const [positionSettingsOpen, setPositionSettingsOpen] = useState<string | null>(null);
  const [closingPositions, setClosingPositions] = useState<{ [key: string]: boolean }>({});
  
  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const data = await api.pairs.getActive();
        
        // Фильтрация только активных позиций
        const positions = data.filter(pair => pair.status === 'active');
        setActivePositions(positions);
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching positions:', err);
        setError('Ошибка при загрузке позиций');
        setLoading(false);
      }
    };
    
    fetchPositions();
    
    // Периодическое обновление данных
    const interval = setInterval(fetchPositions, 15000);
    return () => clearInterval(interval);
  }, []);
  
  // Исправленный метод форматирования времени, корректно обрабатывающий невалидные данные
  const formatTime = (timeValue: any): string => {
    try {
      // Если значение отсутствует или равно 'NaN:NaN', вернем безопасное дефолтное значение
      if (!timeValue || timeValue === 'NaN:NaN') {
        return '00:00';
      }

      // Если это уже отформатированная строка в формате мм:сс, просто вернем её
      if (typeof timeValue === 'string' && timeValue.match(/^\d{2}:\d{2}$/)) {
        return timeValue;
      }

      // Преобразуем строковое или числовое представление в число
      let timestampMs: number;
      
      if (typeof timeValue === 'string') {
        // Если это строка, преобразуем в число
        timestampMs = parseInt(timeValue, 10);
      } else if (typeof timeValue === 'number') {
        // Если это уже число, используем как есть
        timestampMs = timeValue;
      } else {
        // Для других типов вернем дефолтное значение
        return '00:00';
      }

      // Проверяем валидность преобразования
      if (isNaN(timestampMs) || timestampMs <= 0) {
        return '00:00';
      }

      // Создаем объект Date
      const date = new Date(timestampMs);
      
      // Проверяем валидность созданного объекта Date
      if (isNaN(date.getTime())) {
        return '00:00';
      }

      // Форматируем с ведущими нулями для обеспечения стабильного отображения
      const minutes = Math.floor(timestampMs / 60000);
      const seconds = Math.floor((timestampMs % 60000) / 1000);
      
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } catch (error) {
      console.error('Error formatting time:', error);
      return '00:00'; // В случае любой ошибки возвращаем безопасное значение
    }
  };
  
  const closePosition = async (positionId: string) => {
    try {
      // Найдем позицию для получения её символа
      const position = activePositions.find(position => position.id === positionId);
      if (!position) {
        setError('Не удалось найти позицию для закрытия');
        return;
      }

      // Отмечаем позицию как закрывающуюся для отображения индикатора загрузки
      setClosingPositions(prev => ({ ...prev, [positionId]: true }));
      
      // Логируем данные позиции для отладки
      console.log(`Закрытие позиции: ID=${positionId}, символ=${position.pair}`);
      
      // Отправляем запрос на закрытие позиции с ID и символом пары
      const response = await api.position.close(positionId, position.pair);
      
      if (response.success) {
        // Обновляем список позиций и статус бота
        await updateBotStatus();
        
        // Получаем обновленный список торговых пар
        const data = await api.pairs.getActive();
        const positions = data.filter(pair => pair.status === 'active');
        setActivePositions(positions);
      } else {
        setError(response.message || 'Не удалось закрыть позицию');
      }
    } catch (err) {
      console.error('Error closing position:', err);
      setError('Ошибка при закрытии позиции');
    } finally {
      // Убираем индикатор загрузки
      setClosingPositions(prev => {
        const updated = { ...prev };
        delete updated[positionId];
        return updated;
      });
    }
  };
  
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setOrderFormData(prev => ({
      ...prev,
      [name]: name === 'leverage' ? parseInt(value, 10) : value
    }));
  };
  
  const submitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      // Проверяем, нужно ли отправлять TP/SL
      let orderData = { ...orderFormData };
      
      // Если TP/SL не указаны или не показаны, удаляем их из запроса
      if (!showTpSlFields || !orderData.takeProfitPrice) {
        delete orderData.takeProfitPrice;
      }
      
      if (!showTpSlFields || !orderData.stopLossPrice) {
        delete orderData.stopLossPrice;
      }
      
      const response = await api.position.open(orderData);
      
      if (response.success) {
        // Сбрасываем форму и обновляем список позиций
        setOpenOrderForm(false);
        setOrderFormData({
          symbol: '',
          type: 'LONG',
          size: '',
          leverage: 20,
          takeProfitPrice: '',
          stopLossPrice: ''
        });
        setShowTpSlFields(false);
        
        // Обновляем статус бота и список позиций
        await updateBotStatus();
        
        // Получаем обновленный список торговых пар
        const data = await api.pairs.getActive();
        const positions = data.filter(pair => pair.status === 'active');
        setActivePositions(positions);
      } else {
        setError(response.message || 'Не удалось открыть позицию');
      }
    } catch (err) {
      console.error('Error opening position:', err);
      setError('Ошибка при открытии позиции');
    } finally {
      setLoading(false);
    }
  };
  
  // Функция для настройки TP/SL для существующей позиции
  const setTpSl = async (positionId: string, takeProfitPrice: string, stopLossPrice: string) => {
    try {
      const position = activePositions.find(position => position.id === positionId);
      if (!position) {
        setError('Не удалось найти позицию');
        return;
      }
      
      // Тип позиции определяет holdSide для API
      const holdSide = position.position === 'LONG' ? 'long' : 'short';
      
      const response = await api.position.setTpsl(
        position.pair,
        holdSide,
        takeProfitPrice ? parseFloat(takeProfitPrice) : undefined,
        stopLossPrice ? parseFloat(stopLossPrice) : undefined
      );
      
      if (response.success) {
        setPositionSettingsOpen(null);
        // Обновляем список позиций
        const data = await api.pairs.getActive();
        const positions = data.filter(pair => pair.status === 'active');
        setActivePositions(positions);
      } else {
        setError(response.message || 'Не удалось установить TP/SL');
      }
    } catch (err) {
      console.error('Error setting TP/SL:', err);
      setError('Ошибка при установке TP/SL');
    }
  };
  
  // Функция для установки трейлинг-стопа
  const setTrailingStop = async (positionId: string, callbackRatio: string) => {
    try {
      const position = activePositions.find(position => position.id === positionId);
      if (!position) {
        setError('Не удалось найти позицию');
        return;
      }
      
      // Тип позиции определяет holdSide для API
      const holdSide = position.position === 'LONG' ? 'long' : 'short';
      
      const response = await api.position.setTrailingStop(
        position.pair,
        holdSide,
        parseFloat(callbackRatio)
      );
      
      if (response.success) {
        setPositionSettingsOpen(null);
        // Обновляем список позиций
        const data = await api.pairs.getActive();
        const positions = data.filter(pair => pair.status === 'active');
        setActivePositions(positions);
      } else {
        setError(response.message || 'Не удалось установить трейлинг-стоп');
      }
    } catch (err) {
      console.error('Error setting trailing stop:', err);
      setError('Ошибка при установке трейлинг-стопа');
    }
  };
  
  const currentError = botError || error;
  
  if (loading && botLoading) {
    return <LoadingSpinner message="Загрузка данных..." />;
  }
  
  return (
    <Layout botStatus={botStatus}>
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Торговля</h1>
          <button 
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-md"
            onClick={() => setOpenOrderForm(true)}
          >
            Новая позиция
          </button>
        </div>
        
        {currentError && (
          <div className="bg-red-800 text-white p-4 rounded-lg mb-6 flex justify-between items-center">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {currentError}
            </div>
            <button onClick={() => setError(null)}>
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        
        {/* Модальное окно для открытия новой позиции */}
        {openOrderForm && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
            <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Новая позиция</h3>
                <button onClick={() => setOpenOrderForm(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={submitOrder}>
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-1">Торговая пара</label>
                  <input 
                    type="text" 
                    name="symbol" 
                    value={orderFormData.symbol} 
                    onChange={handleFormChange}
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
                    placeholder="Например, BTCUSDT"
                    required
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-1">Тип позиции</label>
                  <select 
                    name="type" 
                    value={orderFormData.type} 
                    onChange={handleFormChange}
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
                  >
                    <option value="LONG">LONG</option>
                    <option value="SHORT">SHORT</option>
                  </select>
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-1">Размер (USDT)</label>
                  <input 
                    type="number" 
                    name="size" 
                    value={orderFormData.size} 
                    onChange={handleFormChange}
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
                    placeholder="Например, 100"
                    required
                  />
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-1">Плечо</label>
                  <select 
                    name="leverage" 
                    value={orderFormData.leverage} 
                    onChange={handleFormChange}
                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
                  >
                    <option value="5">5x</option>
                    <option value="10">10x</option>
                    <option value="20">20x</option>
                    <option value="50">50x</option>
                    <option value="100">100x</option>
                  </select>
                </div>
                
                <div className="mb-4">
                  <div className="flex items-center mb-2">
                    <input 
                      type="checkbox" 
                      id="showTpSl" 
                      checked={showTpSlFields}
                      onChange={(e) => setShowTpSlFields(e.target.checked)}
                      className="mr-2"
                    />
                    <label htmlFor="showTpSl" className="text-sm text-gray-400">
                      Установить Take Profit и Stop Loss
                    </label>
                  </div>
                  
                  {showTpSlFields && (
                    <div className="space-y-3 mt-2">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Take Profit (Цена)</label>
                        <input 
                          type="number" 
                          name="takeProfitPrice" 
                          value={orderFormData.takeProfitPrice} 
                          onChange={handleFormChange}
                          className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
                          placeholder="Цена для Take Profit"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Stop Loss (Цена)</label>
                        <input 
                          type="number" 
                          name="stopLossPrice" 
                          value={orderFormData.stopLossPrice} 
                          onChange={handleFormChange}
                          className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2"
                          placeholder="Цена для Stop Loss"
                        />
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="flex justify-end space-x-3">
                  <button 
                    type="button" 
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-md"
                    onClick={() => setOpenOrderForm(false)}
                  >
                    Отмена
                  </button>
                  <button 
                    type="submit" 
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md"
                    disabled={loading}
                  >
                    {loading ? 'Открытие...' : 'Открыть позицию'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* Таблица активных позиций */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-700 text-left">
                <th className="p-4">Пара</th>
                <th className="p-4">Тип</th>
                <th className="p-4">Вход</th>
                <th className="p-4">Текущая цена</th>
                <th className="p-4">P&L</th>
                <th className="p-4">Время</th>
                <th className="p-4">Действия</th>
              </tr>
            </thead>
            <tbody>
              {activePositions.length > 0 ? (
                activePositions.map((position, index) => (
                  <React.Fragment key={index}>
                    <tr className="border-t border-gray-700">
                      <td className="p-4 font-medium">{position.pair}</td>
                      <td className="p-4">
                        <span className={`flex items-center ${position.position === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                          {position.position === 'LONG' ? <ArrowUp className="w-4 h-4 mr-1" /> : <ArrowDown className="w-4 h-4 mr-1" />}
                          {position.position}
                        </span>
                      </td>
                      <td className="p-4">{position.entryPrice || 'N/A'}</td>
                      <td className="p-4">{position.currentPrice || 'N/A'}</td>
                      <td className={`p-4 ${position.profit && position.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {position.profit && position.profit >= 0 ? '+' : ''}{position.profit?.toFixed(2) || '0.00'}%
                      </td>
                      <td className="p-4">
                        {/* Используем улучшенное форматирование времени */}
                        {formatTime(position.time)}
                      </td>
                      <td className="p-4 flex items-center space-x-2">
                        <button 
                          className={`px-3 py-1 ${closingPositions[position.id] ? 'bg-gray-600' : 'bg-red-600 hover:bg-red-700'} rounded-md text-sm flex items-center`}
                          onClick={() => closePosition(position.id)}
                          disabled={closingPositions[position.id]}
                        >
                          {closingPositions[position.id] ? (
                            <>
                              <span className="animate-spin h-4 w-4 mr-1 border-t-2 border-b-2 border-white rounded-full"></span>
                              Закрытие...
                            </>
                          ) : 'Закрыть'}
                        </button>
                        <button 
                          className="p-1 bg-gray-700 hover:bg-gray-600 rounded-md"
                          onClick={() => setPositionSettingsOpen(position.id === positionSettingsOpen ? null : position.id)}
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                    {positionSettingsOpen === position.id && (
                      <tr className="bg-gray-700">
                        <td colSpan={7} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* TP/SL settings */}
                            <div className="bg-gray-800 p-3 rounded">
                              <h4 className="font-medium mb-2">Установить TP/SL</h4>
                              <div className="space-y-2">
                                <div>
                                  <label className="block text-xs text-gray-400 mb-1">Take Profit (Цена)</label>
                                  <input 
                                    type="number"
                                    id={`tp-${position.id}`}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-sm"
                                    placeholder="Цена для Take Profit"
                                    defaultValue=""
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-400 mb-1">Stop Loss (Цена)</label>
                                  <input 
                                    type="number"
                                    id={`sl-${position.id}`}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-sm"
                                    placeholder="Цена для Stop Loss"
                                    defaultValue=""
                                  />
                                </div>
                                <button 
                                  className="w-full px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded-md text-sm mt-2"
                                  onClick={() => {
                                    const tpInput = document.getElementById(`tp-${position.id}`) as HTMLInputElement;
                                    const slInput = document.getElementById(`sl-${position.id}`) as HTMLInputElement;
                                    setTpSl(position.id, tpInput.value, slInput.value);
                                  }}
                                >
                                  Установить
                                </button>
                              </div>
                            </div>
                            
                            {/* Trailing Stop settings */}
                            <div className="bg-gray-800 p-3 rounded">
                              <h4 className="font-medium mb-2">Трейлинг-стоп</h4>
                              <div className="space-y-2">
                                <div>
                                  <label className="block text-xs text-gray-400 mb-1">Callback Ratio (%)</label>
                                  <input 
                                    type="number"
                                    id={`ts-${position.id}`}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-sm"
                                    placeholder="Например, 2"
                                    defaultValue="2"
                                    min="0.1"
                                    max="5"
                                    step="0.1"
                                  />
                                </div>
                                <button 
                                  className="w-full px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded-md text-sm mt-2"
                                  onClick={() => {
                                    const tsInput = document.getElementById(`ts-${position.id}`) as HTMLInputElement;
                                    setTrailingStop(position.id, tsInput.value);
                                  }}
                                >
                                  Установить трейлинг-стоп
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-gray-400">
                    Нет активных позиций
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export default Trading;