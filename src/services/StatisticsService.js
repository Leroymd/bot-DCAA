// src/services/StatisticsService.js
// Сервис для управления статистикой и историей торговли

const logger = require('../utils/logger');
const dataStore = require('../utils/dataStore');
const accountService = require('./AccountService');

class StatisticsService {
  constructor() {
    this.isInitialized = false;
    this.updateInterval = null;
    this.updateIntervalTime = 30 * 60 * 1000; // 30 минут
  }

  // Инициализация сервиса
  async initialize() {
    try {
      // Загружаем историю сделок и другие данные из хранилища
      await this.loadHistoricalData();
      
      this.isInitialized = true;
      logger.info('StatisticsService: Сервис статистики успешно инициализирован');
      
      // Запускаем периодическое обновление статистики
      this.startPeriodicUpdates();
      
      return true;
    } catch (error) {
      logger.error(`StatisticsService: Ошибка при инициализации: ${error.message}`);
      return false;
    }
  }
  
  // Загрузка исторических данных
  async loadHistoricalData() {
    try {
      // Здесь можно загрузить дополнительные данные, которые не загружаются в AccountService
      
      // Проверяем индекс производительности
      const performanceIndex = dataStore.getPerformanceData();
      if (!performanceIndex || !Array.isArray(performanceIndex)) {
        logger.warn('StatisticsService: Индекс производительности не найден, создаем новый');
        dataStore.updatePerformanceIndex();
      }
      
      return true;
    } catch (error) {
      logger.error(`StatisticsService: Ошибка при загрузке исторических данных: ${error.message}`);
      return false;
    }
  }
  
  // Запуск периодического обновления статистики
  startPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    this.updateInterval = setInterval(async () => {
      await this.updateStatistics();
    }, this.updateIntervalTime);
    
    logger.info(`StatisticsService: Запущено периодическое обновление статистики (интервал: ${this.updateIntervalTime / 60000} мин)`);
  }
  
  // Остановка периодического обновления
  stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info('StatisticsService: Периодическое обновление статистики остановлено');
    }
  }
  
  // Обновление статистики (вызывается периодически)
  async updateStatistics() {
    try {
      if (!this.isInitialized) {
        logger.warn('StatisticsService: Сервис не инициализирован');
        return false;
      }
      
      // 1. Обновление индекса производительности
      dataStore.updatePerformanceIndex();
      
      // 2. Обновляем дневную статистику
      this.updateDailyPerformance();
      
      // 3. Обновляем общую статистику
      this.updateOverallPerformance();
      
      logger.info('StatisticsService: Статистика успешно обновлена');
      return true;
    } catch (error) {
      logger.error(`StatisticsService: Ошибка при обновлении статистики: ${error.message}`);
      return false;
    }
  }
  
  // Обновление дневной статистики
  updateDailyPerformance() {
    try {
      // Получаем текущие метрики производительности
      const performanceMetrics = accountService.getPerformanceMetrics();
      if (!performanceMetrics) return false;
      
      // Получаем данные за сегодня
      const today = new Date().toISOString().split('T')[0];
      
      // Формируем данные дневной статистики
      const dailyPerformance = {
        date: today,
        startBalance: performanceMetrics.initialBalance,
        endBalance: performanceMetrics.totalBalance,
        profit: performanceMetrics.todayProfit,
        profitPercentage: performanceMetrics.todayProfitPercentage,
        trades: performanceMetrics.totalTrades,
        winRate: performanceMetrics.winRate,
        updateTime: new Date().toISOString()
      };
      
      // Сохраняем данные дневной статистики
      dataStore.set('dailyPerformance', dailyPerformance);
      
      return true;
    } catch (error) {
      logger.error(`StatisticsService: Ошибка при обновлении дневной статистики: ${error.message}`);
      return false;
    }
  }
  
  // Обновление общей статистики
  updateOverallPerformance() {
    try {
      // Получаем текущие метрики производительности
      const performanceMetrics = accountService.getPerformanceMetrics();
      if (!performanceMetrics) return false;
      
      // Получаем историю сделок
      const tradeHistory = dataStore.get('tradeHistory') || [];
      
      // Получаем лучшую и худшую сделки
      let bestTrade = { pnl: -Infinity };
      let worstTrade = { pnl: Infinity };
      
      for (const trade of tradeHistory) {
        if (trade.pnl > bestTrade.pnl) {
          bestTrade = trade;
        }
        if (trade.pnl < worstTrade.pnl) {
          worstTrade = trade;
        }
      }
      
      // Формируем данные общей статистики
      const overallPerformance = {
        startDate: tradeHistory.length > 0 ? new Date(tradeHistory[0].entryTime).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        days: tradeHistory.length > 0 ? this.calculateTradingDays(tradeHistory[0].entryTime) : 0,
        initialBalance: performanceMetrics.initialBalance,
        currentBalance: performanceMetrics.totalBalance,
        totalProfit: performanceMetrics.totalProfit,
        totalProfitPercentage: performanceMetrics.totalProfitPercentage,
        totalTrades: performanceMetrics.totalTrades,
        winRate: performanceMetrics.winRate,
        avgProfit: performanceMetrics.avgProfit,
        bestTrade: bestTrade.pnl !== -Infinity ? bestTrade.pnl : 0,
        worstTrade: worstTrade.pnl !== Infinity ? worstTrade.pnl : 0,
        updateTime: new Date().toISOString()
      };
      
      // Сохраняем данные общей статистики
      dataStore.set('overallPerformance', overallPerformance);
      
      return true;
    } catch (error) {
      logger.error(`StatisticsService: Ошибка при обновлении общей статистики: ${error.message}`);
      return false;
    }
  }
  
  // Расчет количества торговых дней с начала работы
  calculateTradingDays(startTimeMs) {
    const startDate = new Date(startTimeMs);
    const today = new Date();
    
    // Разница в миллисекундах
    const diffMs = today.getTime() - startDate.getTime();
    
    // Переводим в дни
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }
  
  // Получение статистики по сделкам
  getTradeStats() {
    // Получаем историю сделок
    const tradeHistory = dataStore.get('tradeHistory') || [];
    
    // Статистика по типам сделок
    const longTrades = tradeHistory.filter(trade => trade.type === 'LONG');
    const shortTrades = tradeHistory.filter(trade => trade.type === 'SHORT');
    
    const longWins = longTrades.filter(trade => trade.result === 'win');
    const longLosses = longTrades.filter(trade => trade.result === 'loss');
    const shortWins = shortTrades.filter(trade => trade.result === 'win');
    const shortLosses = shortTrades.filter(trade => trade.result === 'loss');
    
    return {
      total: tradeHistory.length,
      wins: tradeHistory.filter(trade => trade.result === 'win').length,
      losses: tradeHistory.filter(trade => trade.result === 'loss').length,
      winRate: tradeHistory.length > 0 
        ? (tradeHistory.filter(trade => trade.result === 'win').length / tradeHistory.length) * 100 
        : 0,
      longs: {
        total: longTrades.length,
        wins: longWins.length,
        losses: longLosses.length,
        winRate: longTrades.length > 0 ? (longWins.length / longTrades.length) * 100 : 0
      },
      shorts: {
        total: shortTrades.length,
        wins: shortWins.length,
        losses: shortLosses.length,
        winRate: shortTrades.length > 0 ? (shortWins.length / shortTrades.length) * 100 : 0
      }
    };
  }
  
  // Получение статистики по символам
  getSymbolStats() {
    // Получаем историю сделок
    const tradeHistory = dataStore.get('tradeHistory') || [];
    
    // Группируем сделки по символам
    const symbolStats = {};
    
    for (const trade of tradeHistory) {
      const symbol = trade.symbol;
      
      if (!symbolStats[symbol]) {
        symbolStats[symbol] = {
          total: 0,
          wins: 0,
          losses: 0,
          pnl: 0,
          pnlUSDT: 0
        };
      }
      
      symbolStats[symbol].total++;
      
      if (trade.result === 'win') {
        symbolStats[symbol].wins++;
      } else {
        symbolStats[symbol].losses++;
      }
      
      symbolStats[symbol].pnl += trade.pnl || 0;
      symbolStats[symbol].pnlUSDT += trade.pnlUSDT || 0;
    }
    
    // Вычисляем winRate и avgPnl для каждого символа
    for (const symbol in symbolStats) {
      const stats = symbolStats[symbol];
      stats.winRate = stats.total > 0 ? (stats.wins / stats.total) * 100 : 0;
      stats.avgPnl = stats.total > 0 ? stats.pnl / stats.total : 0;
      stats.avgPnlUSDT = stats.total > 0 ? stats.pnlUSDT / stats.total : 0;
    }
    
    return symbolStats;
  }
  
  // Получение истории сделок
  getTradeHistory(limit = 20, symbol = null) {
    let tradeHistory = dataStore.get('tradeHistory') || [];
    
    // Фильтруем по символу, если указан
    if (symbol) {
      tradeHistory = tradeHistory.filter(trade => trade.symbol === symbol);
    }
    
    // Сортируем от новых к старым
    tradeHistory.sort((a, b) => {
      const timeA = typeof a.entryTime === 'string' ? new Date(a.entryTime).getTime() : a.entryTime;
      const timeB = typeof b.entryTime === 'string' ? new Date(b.entryTime).getTime() : b.entryTime;
      return timeB - timeA;
    });
    
    // Ограничиваем количество записей
    return limit > 0 ? tradeHistory.slice(0, limit) : tradeHistory;
  }
  
  // Получение дневной статистики
  getDailyPerformance() {
    return dataStore.get('dailyPerformance') || {
      date: new Date().toISOString().split('T')[0],
      startBalance: 0,
      endBalance: 0,
      profit: 0,
      profitPercentage: 0,
      trades: 0,
      winRate: 0
    };
  }
  
  // Получение общей статистики
  getOverallPerformance() {
    return dataStore.get('overallPerformance') || {
      startDate: new Date().toISOString().split('T')[0],
      days: 0,
      initialBalance: 0,
      currentBalance: 0,
      totalProfit: 0,
      totalProfitPercentage: 0,
      totalTrades: 0,
      winRate: 0,
      avgProfit: 0,
      bestTrade: 0,
      worstTrade: 0
    };
  }
}

// Экспортируем синглтон
const statisticsService = new StatisticsService();
module.exports = statisticsService;