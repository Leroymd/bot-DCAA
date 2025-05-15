// src/services/ServiceManager.js
// Центральный модуль для управления всеми сервисами

const logger = require('../utils/logger');
const accountService = require('./AccountService');
const statisticsService = require('./StatisticsService');

class ServiceManager {
  constructor() {
    this.services = {
      account: accountService,
      statistics: statisticsService
    };
    this.isInitialized = false;
  }
  
  // Инициализация всех сервисов
  async initialize() {
    try {
      logger.info('ServiceManager: Начинаем инициализацию сервисов...');
      
      // Поочередно инициализируем каждый сервис
      const accountInit = await accountService.initialize();
      
      if (!accountInit) {
        logger.warn('ServiceManager: Ошибка инициализации AccountService');
      }
      
      const statsInit = await statisticsService.initialize();
      
      if (!statsInit) {
        logger.warn('ServiceManager: Ошибка инициализации StatisticsService');
      }
      
      this.isInitialized = accountInit || statsInit;
      
      if (this.isInitialized) {
        logger.info('ServiceManager: Сервисы успешно инициализированы');
      } else {
        logger.error('ServiceManager: Не удалось инициализировать ни один сервис');
      }
      
      return this.isInitialized;
    } catch (error) {
      logger.error(`ServiceManager: Ошибка при инициализации сервисов: ${error.message}`);
      return false;
    }
  }
  
  // Остановка всех сервисов
  shutdown() {
    try {
      logger.info('ServiceManager: Останавливаем все сервисы...');
      
      accountService.stopPeriodicUpdates();
      statisticsService.stopPeriodicUpdates();
      
      this.isInitialized = false;
      
      logger.info('ServiceManager: Все сервисы остановлены');
      return true;
    } catch (error) {
      logger.error(`ServiceManager: Ошибка при остановке сервисов: ${error.message}`);
      return false;
    }
  }
  
  // Получение текущего состояния бота для API
  getBotStatus() {
    // Если сервисы не инициализированы, возвращаем состояние "остановлен"
    if (!this.isInitialized) {
      return {
        status: 'stopped',
        isActive: false,
        balance: 0,
        totalProfit: 0,
        profitPercentage: 0,
        todayProfit: 0,
        todayProfitPercentage: 0,
        winRate: 0,
        totalTrades: 0,
        avgProfit: 0,
        withdrawn: 0,
        lastScan: null,
        uptime: 0,
        startTime: 0
      };
    }
    
    // Получаем данные из сервисов
    const balance = accountService.getBalance();
    const performanceMetrics = accountService.getPerformanceMetrics();
    const overallPerformance = statisticsService.getOverallPerformance();
    const dailyPerformance = statisticsService.getDailyPerformance();
    
    // Формируем статус бота
    const botStatus = {
      status: 'running',
      isActive: true,
      balance: balance.totalBalance || 0,
      totalProfit: performanceMetrics.totalProfit || 0,
      profitPercentage: performanceMetrics.totalProfitPercentage || 0,
      todayProfit: performanceMetrics.todayProfit || 0,
      todayProfitPercentage: performanceMetrics.todayProfitPercentage || 0,
      winRate: overallPerformance.winRate || 0,
      totalTrades: overallPerformance.totalTrades || 0,
      avgProfit: overallPerformance.avgProfit || 0,
      withdrawn: 0, // Заполнить, если доступно
      lastScan: new Date().toISOString(),
      uptime: Date.now() - new Date(overallPerformance.startDate).getTime(),
      startTime: new Date(overallPerformance.startDate).getTime()
    };
    
    return botStatus;
  }
  
  // Получение статистики для API
  getStats() {
    const tradeStats = statisticsService.getTradeStats();
    const symbolStats = statisticsService.getSymbolStats();
    const overallPerformance = statisticsService.getOverallPerformance();
    
    return {
      overall: overallPerformance,
      trades: tradeStats,
      symbols: symbolStats
    };
  }
  
  // Получение данных PnL для графиков
  getPnlData(days = 7) {
    return accountService.getPnlData(days);
  }
  
  // Получение истории сделок
  getTradeHistory(limit = 20, symbol = null) {
    return statisticsService.getTradeHistory(limit, symbol);
  }
  
  // Получение активных позиций
  getActivePositions() {
    return accountService.getActivePositions();
  }
  
  // Обновление всех данных (можно вызывать по требованию из API)
  async refreshData() {
    try {
      logger.info('ServiceManager: Обновление всех данных...');
      
      // Обновляем данные аккаунта
      await accountService.updateAccountData();
      
      // Обновляем статистику
      await statisticsService.updateStatistics();
      
      logger.info('ServiceManager: Обновление данных завершено');
      return true;
    } catch (error) {
      logger.error(`ServiceManager: Ошибка при обновлении данных: ${error.message}`);
      return false;
    }
  }
}

// Экспортируем синглтон
const serviceManager = new ServiceManager();
module.exports = serviceManager;