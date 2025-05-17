// client/src/components/Layout.tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, Settings, Activity, BarChart3, Home, /* Box, AlertOctagon, */ XOctagon, CheckCircle, FileText } from 'lucide-react'; // Убедимся, что FileText импортирован
import { BotStatus } from '../types'; // Предполагается, что BotStatus импортируется из types
import { useAppContext } from '../contexts/AppContext';

interface LayoutProps {
  children: React.ReactNode;
  botStatus?: BotStatus; // Оставляем botStatus как prop, если он может передаваться
}

export const Layout: React.FC<LayoutProps> = ({ children, botStatus: propBotStatus }) => {
  const [showMenu, setShowMenu] = React.useState(false);
  // Получаем botStatus и balanceInfo из контекста приложения
  const appContext = useAppContext();
  // Используем botStatus из props если передан, иначе из контекста
  const botStatus = propBotStatus || appContext.botStatus; 
  const { balanceInfo } = appContext;
  
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
            
            <div className="ml-6 hidden md:flex items-center space-x-8">
              <div className={`flex items-center ${botStatus?.isActive ? 'text-green-400' : 'text-red-400'}`}>
                <div className={`w-3 h-3 rounded-full mr-2 ${botStatus?.isActive ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                <span className="text-sm">{botStatus?.status === 'running' || botStatus?.isActive ? 'Работает' : (botStatus?.status === 'error_initializing' || botStatus?.status === 'error_starting' || botStatus?.status === 'error' ? 'Ошибка' : 'Остановлен')}</span>
              </div>
              
              {balanceInfo && (
                <div className="flex items-center space-x-4">
                  <div className="flex items-center">
                    <span className="text-gray-400 text-xs mr-1">USDT:</span>
                    <span className="font-medium text-sm">{balanceInfo.usdtBalance !== undefined ? balanceInfo.usdtBalance.toFixed(4) : 'N/A'}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-400 text-xs mr-1">PnL:</span>
                    <span className={`font-medium text-sm ${balanceInfo.unrealizedPnl !== undefined && balanceInfo.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {balanceInfo.unrealizedPnl !== undefined ? (balanceInfo.unrealizedPnl >= 0 ? '+' : '') + balanceInfo.unrealizedPnl.toFixed(4) : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-gray-400 text-xs mr-1">ROI:</span>
                    <span className={`font-medium text-sm ${balanceInfo.roi !== undefined && balanceInfo.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {balanceInfo.roi !== undefined ? (balanceInfo.roi >= 0 ? '+' : '') + balanceInfo.roi.toFixed(2) + '%' : 'N/A'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
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
      
      <div className="flex flex-1">
        {/* Боковая навигация (десктоп) */}
        <nav className="hidden md:block w-64 bg-gray-800 border-r border-gray-700 p-4">
          <ul className="space-y-2">
            <li>
              <NavLink
                to="/"
                end
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
                <BarChart3 className="w-5 h-5 mr-3" /> {/* Можно выбрать другую иконку для статистики, если нужно */}
                <span>Статистика</span>
              </NavLink>
            </li>
            {/* ДОБАВЛЕННЫЙ ПУНКТ МЕНЮ "ЛОГИ" ДЛЯ ДЕСКТОПА */}
            <li>
              <NavLink
                to="/logs"
                className={({ isActive }) => 
                  `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`
                }
              >
                <FileText className="w-5 h-5 mr-3" />
                <span>Логи</span>
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
        </nav>
        
        {/* Мобильная навигация */}
        {showMenu && (
          <div className="md:hidden fixed inset-0 z-50">
            <div className="fixed inset-0 bg-black opacity-50" onClick={toggleMenu}></div>
            <div className="fixed top-0 left-0 bottom-0 w-64 bg-gray-800 p-4 overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold">Меню</h3>
                <button onClick={toggleMenu}>
                  <XOctagon className="w-5 h-5" />
                </button>
              </div>
              <ul className="space-y-2">
                <li>
                  <NavLink to="/" end onClick={toggleMenu} className={({ isActive }) => `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`}> <Home className="w-5 h-5 mr-3" /> <span>Дашборд</span> </NavLink>
                </li>
                <li>
                  <NavLink to="/trading" onClick={toggleMenu} className={({ isActive }) => `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`}> <Activity className="w-5 h-5 mr-3" /> <span>Торговля</span> </NavLink>
                </li>
                <li>
                  <NavLink to="/signals" onClick={toggleMenu} className={({ isActive }) => `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`}> <BarChart3 className="w-5 h-5 mr-3" /> <span>Сигналы</span> </NavLink>
                </li>
                <li>
                  <NavLink to="/stats" onClick={toggleMenu} className={({ isActive }) => `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`}> <BarChart3 className="w-5 h-5 mr-3" /> <span>Статистика</span> </NavLink>
                </li>
                {/* ДОБАВЛЕННЫЙ ПУНКТ МЕНЮ "ЛОГИ" ДЛЯ МОБИЛЬНОЙ НАВИГАЦИИ */}
                <li> 
                  <NavLink to="/logs" onClick={toggleMenu} className={({ isActive }) => `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`}>
                    <FileText className="w-5 h-5 mr-3" />
                    <span>Логи</span>
                  </NavLink>
                </li>
                <li>
                  <NavLink to="/settings" onClick={toggleMenu} className={({ isActive }) => `flex items-center px-4 py-2 rounded-md ${isActive ? 'bg-blue-900 text-white' : 'hover:bg-gray-700 text-gray-300'}`}> <Settings className="w-5 h-5 mr-3" /> <span>Настройки</span> </NavLink>
                </li>
              </ul>
              
              {/* Мобильный компактный статус бота и баланс */}
              <div className="mt-8 space-y-4">
                 {/* Блок статуса бота */}
                <div className="bg-gray-700 p-4 rounded-lg">
                  <h3 className="text-xs uppercase text-gray-300 mb-2">Статус бота</h3>
                  <div className={`flex items-center justify-between mb-2 ${botStatus?.isActive ? 'text-green-400' : 'text-red-400'}`}>
                    <span className="text-sm">Состояние:</span>
                    <div className={`flex items-center`}>
                      {botStatus?.isActive ? (
                        <CheckCircle className="w-4 h-4 mr-1" />
                      ) : (
                        <XOctagon className="w-4 h-4 mr-1" />
                      )}
                      <span className="text-sm">{botStatus?.status === 'running' || botStatus?.isActive ? 'Активен' : (botStatus?.status === 'error_initializing' || botStatus?.status === 'error_starting' || botStatus?.status === 'error' ? 'Ошибка' : 'Остановлен')}</span>
                    </div>
                  </div>
                </div>

                {/* Блок баланса */}
                {balanceInfo && (
                  <div className="bg-gray-700 p-4 rounded-lg">
                    <h3 className="text-xs uppercase text-gray-300 mb-2">Баланс</h3>
                    <div className="flex flex-col space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">USDT:</span>
                        <span className="font-medium">{balanceInfo.usdtBalance !== undefined ? balanceInfo.usdtBalance.toFixed(4) : 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">PnL:</span>
                        <span className={`${balanceInfo.unrealizedPnl !== undefined && balanceInfo.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {balanceInfo.unrealizedPnl !== undefined ? (balanceInfo.unrealizedPnl >= 0 ? '+' : '') + balanceInfo.unrealizedPnl.toFixed(4) : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">ROI:</span>
                        <span className={`${balanceInfo.roi !== undefined && balanceInfo.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {balanceInfo.roi !== undefined ? (balanceInfo.roi >= 0 ? '+' : '') + balanceInfo.roi.toFixed(2) + '%' : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        <main className="flex-1 overflow-x-auto py-4 px-4 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
};
