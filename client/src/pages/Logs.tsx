// client/src/pages/Logs.tsx
import React, { useState, useEffect } from 'react';
import { RefreshCw, Search, Filter, AlertCircle } from 'lucide-react';
import { Layout } from '../components/Layout';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { api } from '../api/apiClient';
import { LogEntry } from '../types';
import { useAppContext } from '../contexts/AppContext';

const Logs: React.FC = () => {
  const { botStatus, loading: botLoading, error: botError } = useAppContext();
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  useEffect(() => {
    fetchLogs();
  }, []);
  
  const fetchLogs = async (limit: number = 200) => {
    try {
      setLoading(true);
      
      const response = await api.bot.getLogs(limit);
      const logsData = response || [];
      
      if (Array.isArray(logsData)) {
        // Преобразуем строки логов в объекты LogEntry
        const parsedLogs: LogEntry[] = logsData.map((logStr, index) => {
          // Пытаемся извлечь уровень и временную метку из строки лога
          const logParts = logStr.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (\w+): (.+)$/);
          
          if (logParts) {
            return {
              id: `log-${index}`,
              timestamp: logParts[1],
              level: logParts[2].toLowerCase(),
              message: logParts[3],
              raw: logStr
            };
          }
          
          // Если не удалось распарсить, возвращаем базовый объект
          return {
            id: `log-${index}`,
            timestamp: '',
            level: 'info',
            message: logStr,
            raw: logStr
          };
        });
        
        setLogs(parsedLogs);
        applyFilters(parsedLogs, filter, searchQuery);
      } else {
        setLogs([]);
        setFilteredLogs([]);
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError('Ошибка при загрузке логов');
      setLoading(false);
    }
  };
  
  const applyFilters = (logEntries: LogEntry[], filterValue: string, query: string) => {
    let filtered = [...logEntries];
    
    // Применяем фильтр по уровню
    if (filterValue !== 'all') {
      filtered = filtered.filter(log => log.level === filterValue);
    }
    
    // Применяем поиск
    if (query.trim()) {
      const lowercaseQuery = query.toLowerCase();
      filtered = filtered.filter(log => log.message.toLowerCase().includes(lowercaseQuery));
    }
    
    setFilteredLogs(filtered);
  };
  
  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    applyFilters(logs, newFilter, searchQuery);
  };
  
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    applyFilters(logs, filter, query);
  };
  
  const refreshLogs = async () => {
    await fetchLogs();
  };
  
  const currentError = botError || error;
  
  if (loading && botLoading) {
    return <LoadingSpinner message="Загрузка логов..." />;
  }
  
  return (
    <Layout botStatus={botStatus}>
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Логи системы</h1>
          <button 
            onClick={refreshLogs}
            className="flex items-center px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded-md"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Обновить
          </button>
        </div>
        
        {currentError && (
          <div className="bg-red-800 text-white p-4 rounded-lg mb-6">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {currentError}
            </div>
          </div>
        )}
        
        <div className="mb-4 flex justify-between">
          <div className="flex items-center">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="Поиск..."
                className="pl-9 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-md w-64"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">Фильтр:</span>
            <div className="flex bg-gray-700 rounded-md">
              <button 
                className={`px-3 py-1 text-sm rounded-l-md ${filter === 'all' ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
                onClick={() => handleFilterChange('all')}
              >
                Все
              </button>
              <button 
                className={`px-3 py-1 text-sm ${filter === 'info' ? 'bg-blue-600' : 'hover:bg-gray-600'}`}
                onClick={() => handleFilterChange('info')}
              >
                Info
              </button>
              <button 
                className={`px-3 py-1 text-sm ${filter === 'warn' ? 'bg-yellow-600' : 'hover:bg-gray-600'}`}
                onClick={() => handleFilterChange('warn')}
              >
                Warn
              </button>
              <button 
                className={`px-3 py-1 text-sm rounded-r-md ${filter === 'error' ? 'bg-red-600' : 'hover:bg-gray-600'}`}
                onClick={() => handleFilterChange('error')}
              >
                Error
              </button>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-lg p-2 max-h-[70vh] overflow-y-auto">
          {filteredLogs.length > 0 ? (
            <div className="font-mono text-sm">
              {filteredLogs.map((log) => (
                <div 
                  key={log.id} 
                  className={`p-2 border-b border-gray-700 whitespace-pre-wrap ${
                    log.level === 'error' ? 'text-red-400' : 
                    log.level === 'warn' ? 'text-yellow-400' : 'text-gray-300'
                  }`}
                >
                  {log.raw}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400">
              {logs.length === 0 ? "Нет доступных логов" : "Нет логов, соответствующих критериям фильтрации"}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Logs;