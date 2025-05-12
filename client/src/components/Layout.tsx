// components/Layout.tsx
import React, { ReactNode, useState } from 'react';
import { Bell, Settings, DollarSign } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { BotStatus } from '../types';

interface LayoutProps {
  children: ReactNode;
  botStatus: BotStatus;
}

export const Layout: React.FC<LayoutProps> = ({ children, botStatus }) => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.pathname === '/' ? 'dashboard' : location.pathname.slice(1));
  
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
          <Link to="/settings" className="text-gray-300 hover:text-white">
            <Settings className="w-5 h-5" />
          </Link>
        </div>
      </header>
      
      {/* Навигация */}
      <nav className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4">
          <div className="flex space-x-6">
            <Link 
              to="/"
              className={`py-3 px-1 ${activeTab === 'dashboard' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-100'}`}
              onClick={() => setActiveTab('dashboard')}
            >
              Дашборд
            </Link>
            <Link 
              to="/trading"
              className={`py-3 px-1 ${activeTab === 'trading' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-100'}`}
              onClick={() => setActiveTab('trading')}
            >
              Торговля
            </Link>
            <Link 
              to="/signals"
              className={`py-3 px-1 ${activeTab === 'signals' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-100'}`}
              onClick={() => setActiveTab('signals')}
            >
              Сигналы
            </Link>
            <Link 
              to="/stats"
              className={`py-3 px-1 ${activeTab === 'stats' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-100'}`}
              onClick={() => setActiveTab('stats')}
            >
              Статистика
            </Link>
            <Link 
              to="/settings"
              className={`py-3 px-1 ${activeTab === 'settings' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-400 hover:text-gray-100'}`}
              onClick={() => setActiveTab('settings')}
            >
              Настройки
            </Link>
          </div>
        </div>
      </nav>
      
      {/* Основной контент */}
      <main className="flex-1 container mx-auto px-4 py-6">
        {children}
      </main>
      
      {/* Футер */}
      <footer className="bg-gray-800 border-t border-gray-700 p-4 text-center text-gray-400 text-sm">
        FractalScalp Bot v1.0.0 — Система торговли на основе фракталов
      </footer>
    </div>
  );
};