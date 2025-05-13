// Полный файл client/src/pages/Trading.js с исправленной функцией closePosition

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertCircle, ArrowUp, ArrowDown, X } from 'lucide-react';

const Trading = () => {
  const [activePositions, setActivePositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openOrderForm, setOpenOrderForm] = useState(false);
  const [orderFormData, setOrderFormData] = useState({
    symbol: '',
    type: 'LONG',
    size: '',
    leverage: 20
  });
  
  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const response = await axios.get('/api/pairs/active');
        
        if (response.data) {
          // Фильтрация только активных позиций
          const positions = response.data.filter(pair => pair.status === 'active');
          setActivePositions(positions);
        }
        
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
  
  const closePosition = async (positionId) => {
    try {
      // Find the position to get its symbol
      const position = activePositions.find(position => position.id === positionId);
      if (!position) {
        setError('Не удалось найти позицию для закрытия');
        return;
      }

      // Логируем данные позиции для отладки
      console.log(`Закрытие позиции: ID=${positionId}, символ=${position.pair}`);
      
      // Отправляем запрос на закрытие позиции с ID и символом
      const response = await axios.post('/api/position/close', {
        positionId: positionId,
        symbol: position.pair
      });
      
      if (response.data.success) {
        // Обновляем список позиций
        const updatedPositions = activePositions.filter(position => position.id !== positionId);
        setActivePositions(updatedPositions);
      } else {
        setError(response.data.message || 'Не удалось закрыть позицию');
      }
    } catch (err) {
      console.error('Error closing position:', err);
      setError('Ошибка при закрытии позиции');
    }
  };
  
  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setOrderFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const submitOrder = async (e) => {
    e.preventDefault();
    
    try {
      const response = await axios.post('/api/position/open', orderFormData);
      
      if (response.data.success) {
        // Сбрасываем форму и обновляем список позиций
        setOpenOrderForm(false);
        setOrderFormData({
          symbol: '',
          type: 'LONG',
          size: '',
          leverage: 20
        });
        
        // Обновляем список позиций
        const positionsResponse = await axios.get('/api/pairs/active');
        if (positionsResponse.data) {
          const positions = positionsResponse.data.filter(pair => pair.status === 'active');
          setActivePositions(positions);
        }
      } else {
        setError(response.data.message || 'Не удалось открыть позицию');
      }
    } catch (err) {
      console.error('Error opening position:', err);
      setError('Ошибка при открытии позиции');
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="spinner"></div>
          <p className="mt-4 text-lg text-gray-300">Загрузка данных...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
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
        
        {error && (
          <div className="bg-red-800 text-white p-4 rounded-lg mb-6 flex justify-between items-center">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {error}
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
                  >
                    Открыть позицию
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
                  <tr key={index} className="border-t border-gray-700">
                    <td className="p-4 font-medium">{position.pair}</td>
                    <td className="p-4">
                      <span className={`flex items-center ${position.position === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                        {position.position === 'LONG' ? <ArrowUp className="w-4 h-4 mr-1" /> : <ArrowDown className="w-4 h-4 mr-1" />}
                        {position.position}
                      </span>
                    </td>
                    <td className="p-4">{position.entryPrice || 'N/A'}</td>
                    <td className="p-4">{position.currentPrice || 'N/A'}</td>
                    <td className={`p-4 ${position.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {position.profit >= 0 ? '+' : ''}{position.profit?.toFixed(2) || '0.00'}%
                    </td>
                    <td className="p-4">{position.time || '00:00'}</td>
                    <td className="p-4">
                      <button 
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded-md text-sm"
                        onClick={() => closePosition(position.id)}
                      >
                        Закрыть
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="p-4 text-center text-gray-400">
                    Нет активных позиций
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Trading;