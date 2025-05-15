// pages/Logs.tsx
import React, { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { Clock, RefreshCw, Filter, Download, AlertCircle } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { api } from '../api/apiClient';

// Тип для записи лога
interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  data?: any;
}

const Logs: React.FC = () => {
  const { botStatus, loading: botLoading, error: botError } = useAppContext();
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [limit, setLimit] = useState<number>(100);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Загрузка логов при монтировании компонента и при изменении фильтров
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        
        // Получение логов через API
        const logsData = await api.bot.getLogs(limit);
        
        if (Array.isArray(logsData)) {
          setLogs(logsData);
          applyFilters(logsData, filter, searchQuery);
        } else {
          setLogs([]);
          setFilteredLogs([]);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Ошибка при загрузке логов:', err);
        setError('Не удалось загрузить логи. Проверьте соединение с сервером.');
        setLoading(false);
      }
    };
    
    fetchLogs();
  }, [limit]);
  
  // Применение фильтров к логам
  const applyFilters = (logsData: LogEntry[], logFilter: string, query: string) => {
    let filtered = [...logsData];
    
    // Фильтрация по уровню логов
    if (logFilter !== 'all') {
      filtered = filtered.filter(log => log.level.toLowerCase() === logFilter.toLowerCase());
    }
    
    // Фильтрация по поисковому запросу
    if (query) {
      const lowercaseQuery = query.toLowerCase();
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(lowercaseQuery) || 
        (log.data && JSON.stringify(log.data).toLowerCase().includes(lowercaseQuery))
      );
    }
    
    setFilteredLogs(filtered);
  };
  
  // Обработчик изменения фильтра
  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    applyFilters(logs, newFilter, searchQuery);
  };
  
  // Обработчик изменения поискового запроса
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    applyFilters(logs, filter, query);
  };
  
  // Обработчик обновления логов
  const refreshLogs = async () => {
    try {
      setLoading(true);
      
      const logsData = await api.bot.getLogs(limit);
      
      if (Array.isArray(logsData)) {
        setLogs(logsData);
        applyFilters(logsData, filter, searchQuery);
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Ошибка при обновлении логов:', err);
      setError('Не удалось обновить логи');
      setLoading(false);
    }
  };
  
  // Функция для загрузки логов в виде файла
  const downloadLogs = () => {
    const logText = filteredLogs.map(log => 
      `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}${log.data ? ' ' + JSON.stringify(log.data) : ''}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `bot-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // Функция для определения класса цвета в зависимости от уровня лога
  const getLogLevelClass = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      case 'debug':
        return 'text-green-400';
      default:
        return 'text-gray-400';
    }
  };
  
  const currentError = botError || error;
  
  if (loading && botLoading) {
    return <LoadingSpinner message="Загрузка логов..." />;
  }
  
  return (
    <Layout botStatus={botStatus}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 space-y-4 md:space-y-0">
          <h1 className="text-2xl font-bold">Логи системы</h1>
          
          <div className="flex flex-col md:flex-row items-start md:items-center space-y-4 md:space-y-0 md:space-x-4 w-full md:w-auto">
            {/* Поисковая строка */}
            <div className="relative w-full md:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Поиск в логах..."
                className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm"
              />
            </div>
            
            {/* Фильтр уровня логов */}
            <div className="flex items-center bg-gray-800 rounded-md">
              <button 
                className={`px-3 py-1 text-sm rounded-l-md ${filter === 'all' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                onClick={() => handleFilterChange('all')}
              >
                Все
              </button>
              <button 
                className={`px-3 py-1 text-sm ${filter === 'info' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                onClick={() => handleFilterChange('info')}
              >
                Info
              </button>
              <button 
                className={`px-3 py-1 text-sm ${filter === 'warn' ? 'bg-yellow-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                onClick={() => handleFilterChange('warn')}
              >
                Warn
              </button>
              <button 
                className={`px-3 py-1 text-sm rounded-r-md ${filter === 'error' ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                onClick={() => handleFilterChange('error')}
              >
                Error
              </button>
            </div>
            
            {/* Количество логов */}
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm"
            >
              <option value={50}>50 строк</option>
              <option value={100}>100 строк</option>
              <option value={200}>200 строк</option>
              <option value={500}>500 строк</option>
            </select>
            
            {/* Кнопки действий */}
            <div className="flex space-x-2">
              <button 
                className="flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-sm"
                onClick={refreshLogs}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Обновить
              </button>
              <button 
                className="flex items-center px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-md text-sm"
                onClick={downloadLogs}
              >
                <Download className="w-4 h-4 mr-1" />
                Скачать
              </button>
            </div>
          </div>
        </div>
        
        {currentError && (
          <div className="bg-red-800 text-white p-4 rounded-lg mb-6">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {currentError}
            </div>
          </div>
        )}
        
        {/* Контейнер логов */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-700 text-left text-xs">
                  <th className="px-4 py-2 w-1/6">Время</th>
                  <th className="px-4 py-2 w-1/12">Уровень</th>
                  <th className="px-4 py-2">Сообщение</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log, index) => (
                    <tr key={index} className="hover:bg-gray-700">
                      <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">
                        <div className="flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {log.timestamp}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-medium px-2 py-1 rounded ${getLogLevelClass(log.level)}`}>
                          {log.level.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        <div className="line-clamp-2">
                          {log.message}
                          {log.data && (
                            <span className="text-gray-400 text-xs block mt-1">
                              {typeof log.data === 'object' ? JSON.stringify(log.data) : log.data}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-center text-gray-400">
                      {logs.length === 0 ? 'Нет доступных логов' : 'Нет логов, соответствующих фильтрам'}
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

export default Logs;