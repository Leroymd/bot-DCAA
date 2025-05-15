// client/src/components/Layout.tsx - обновленная версия с информацией о балансе
import React from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, Settings, Activity, BarChart3, Home, Box, AlertOctagon, XOctagon, CheckCircle } from 'lucide-react';
import { BotStatus } from '../types';
import { useAppContext } from '../contexts/AppContext';
import { BalanceInfo } from './BalanceInfo';

interface LayoutProps {
  children: React.ReactNode;
  botStatus?: BotStatus;
}

export const Layout: React.FC<LayoutProps> = ({ children, botStatus }) => {
  const [showMenu, setShowMenu] = React.useState(false);
  // Получаем информацию о балансе из контекста приложения
  const { balanceInfo } = useAppContext();
  
  const toggleMenu = () => {
    setShowMenu(!showMenu);
  };
  
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Верхняя навигационная панель */}
      <header className="bg-gray-800 border-b border-gray-700 py-3 px-4 lg:py-4">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <div className="text-lg lg:text-2xl font-bold bg-gradient-to-r from-blue-400 to-green-400 bg-clip-text text-transparent">
              FractalScalp Bot
            </div>
            
            {/* Статус бота и баланс */}
            <div className="ml-6 hidden md:flex items-center space-x-8">
              <div className={`flex items-center ${botStatus?.isActive ? 'text-green-400' : 'text-red-400'}`}>
                <div className={`w-3 h-3 rounded-full mr-2 ${botStatus?.isActive ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                <span className="text-sm">{botStatus?.isActive ? 'Работает' : 'Остановлен'}</span>
              </div>
              
              {/* Компактная информация о балансе */}
              <BalanceInfo balanceInfo={balanceInfo} compact={true} />
            </div>
          </div>
          
          {/* Мобильная навигация */}
          <div className="block md:hidden">
            <button
              className="flex items-center px-3 py-2 border rounded text-gray-400 border-gray-600 hover:text-white hover:border-white"
              onClick={toggleMenu}
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>
      
      {/* Контент и боковая навигация */}
      <div className="flex flex-1">
        {/* Боковая навигация (десктоп) */}
        <nav className="hidden md:block w-64 bg-gray-800 border-r border-gray-700 p-4">
          <ul className="space-y-2">
            <li>
              <NavLink
                to="/"
                className={({ isActive }) => 
                  `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`
                }
              >
                <Home className="w-5 h-5 mr-3" />
                <span>Дашборд</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/trading"
                className={({ isActive }) => 
                  `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`
                }
              >
                <Activity className="w-5 h-5 mr-3" />
                <span>Торговля</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/signals"
                className={({ isActive }) => 
                  `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`
                }
              >
                <BarChart3 className="w-5 h-5 mr-3" />
                <span>Сигналы</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/stats"
                className={({ isActive }) => 
                  `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`
                }
              >
                <BarChart3 className="w-5 h-5 mr-3" />
                <span>Статистика</span>
              </NavLink>
            </li>
            <li>
              <NavLink
                to="/settings"
                className={({ isActive }) => 
                  `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`
                }
              >
                <Settings className="w-5 h-5 mr-3" />
                <span>Настройки</span>
              </NavLink>
            </li>
          </ul>
          
          {/* Детальная информация о балансе и статус бота в сайдбаре */}
          <div className="absolute bottom-8 left-4 right-4 space-y-4">
            {/* Полная информация о балансе */}
            <BalanceInfo balanceInfo={balanceInfo} />
            
            {/* Информация о статусе бота */}
            <div className="bg-gray-700 p-4 rounded-lg">
              <h3 className="text-xs uppercase text-gray-300 mb-2">Статус бота</h3>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm">Состояние:</span>
                <div className={`flex items-center ${botStatus?.isActive ? 'text-green-400' : 'text-red-400'}`}>
                  {botStatus?.isActive ? (
                    <CheckCircle className="w-4 h-4 mr-1" />
                  ) : (
                    <XOctagon className="w-4 h-4 mr-1" />
                  )}
                  <span className="text-sm">{botStatus?.isActive ? 'Активен' : 'Остановлен'}</span>
                </div>
              </div>
            </div>
          </div>
        </nav>
        
        {/* Мобильная навигация */}
        {showMenu && (
          <div className="md:hidden fixed inset-0 z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={toggleMenu}></div>
            <div className="fixed top-0 left-0 bottom-0 w-64 bg-gray-800 p-4">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">Меню</h3>
                <button onClick={toggleMenu}>
                  <XOctagon className="w-5 h-5" />
                </button>
              </div>
              <ul className="space-y-2">
                <li>
                  <NavLink
                    to="/"
                    className={({ isActive }) => 
                      `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`
                    }
                    onClick={toggleMenu}
                  >
                    <Home className="w-5 h-5 mr-3" />
                    <span>Дашборд</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/trading"
                    className={({ isActive }) => 
                      `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`
                    }
                    onClick={toggleMenu}
                  >
                    <Activity className="w-5 h-5 mr-3" />
                    <span>Торговля</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/signals"
                    className={({ isActive }) => 
                      `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`
                    }
                    onClick={toggleMenu}
                  >
                    <BarChart3 className="w-5 h-5 mr-3" />
                    <span>Сигналы</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/stats"
                    className={({ isActive }) => 
                      `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`
                    }
                    onClick={toggleMenu}
                  >
                    <BarChart3 className="w-5 h-5 mr-3" />
                    <span>Статистика</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to="/settings"
                    className={({ isActive }) => 
                      `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`
                    }
                    onClick={toggleMenu}
                  >
                    <Settings className="w-5 h-5 mr-3" />
                    <span>Настройки</span>
                  </NavLink>
                </li>
              </ul>
              
              {/* Мобильный статус бота и баланс */}
              <div className="mt-8 space-y-4">
                {/* Компактная информация о балансе */}
                <div className="bg-gray-700 p-4 rounded-lg">
                  <h3 className="text-xs uppercase text-gray-300 mb-2">Баланс</h3>
                  <div className="flex flex-col space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm">USDT:</span>
                      <span className="font-medium">{balanceInfo.usdtBalance.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">PnL:</span>
                      <span className={`${balanceInfo.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {balanceInfo.unrealizedPnl >= 0 ? '+' : ''}{balanceInfo.unrealizedPnl.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">ROI:</span>
                      <span className={`${balanceInfo.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {balanceInfo.roi >= 0 ? '+' : ''}{balanceInfo.roi.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Статус бота */}
                <div className="bg-gray-700 p-4 rounded-lg">
                  <h3 className="text-xs uppercase text-gray-300 mb-2">Статус бота</h3>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm">Состояние:</span>
                    <div className={`flex items-center ${botStatus?.isActive ? 'text-green-400' : 'text-red-400'}`}>
                      {botStatus?.isActive ? (
                        <CheckCircle className="w-4 h-4 mr-1" />
                      ) : (
                        <XOctagon className="w-4 h-4 mr-1" />
                      )}
                      <span className="text-sm">{botStatus?.isActive ? 'Активен' : 'Остановлен'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Основной контент */}
        <main className="flex-1 overflow-x-auto py-4 px-4 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
};