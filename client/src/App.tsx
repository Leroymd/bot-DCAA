// App.tsx - обновленная версия с новыми маршрутами
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Trading from './pages/Trading';
import Signals from './pages/Signals';
import Stats from './pages/Stats';
import Settings from './pages/Settings';
import Performance from './pages/Performance';
import Logs from './pages/Logs';
import { AppProvider } from './contexts/AppContext';

const App: React.FC = () => {
  return (
    <AppProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trading" element={<Trading />} />
          <Route path="/signals" element={<Signals />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/performance" element={<Performance />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Router>
    </AppProvider>
  );
};

export default App;