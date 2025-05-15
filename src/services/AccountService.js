// src/services/AccountService.js
// Новый сервис, который будет отвечать за работу с аккаунтом и балансом независимо от бота

const logger = require('../utils/logger');
const dataStore = require('../utils/dataStore');
const BitGetClient = require('../exchange/BitgetClient');
const config = require('../config/default');

class AccountService {
  constructor() {
    this.apiClient = null;
    this.isInitialized = false;
    this.updateInterval = null;
    this.updateIntervalTime = 5 * 60 * 1000; // 5 минут
    this.lastUpdateTime = null;
  }

  // Инициализация сервиса с API-ключами
  async initialize() {
    try {
      // Загружаем конфигурацию бота для доступа к API ключам
      const botConfig = dataStore.get('botConfig');
      
      if (!botConfig || !botConfig.apiKey || !botConfig.apiSecret || !botConfig.passphrase) {
        logger.warn('AccountService: Не найдены API-ключи для инициализации');
        return false;
      }
      
      // Создаем API клиент
      this.apiClient = new BitGetClient({
        apiKey: botConfig.apiKey,
        apiSecret: botConfig.apiSecret,
        passphrase: botConfig.passphrase,
        debug: false
      });
      
      // Тестируем подключение
      const serverTimeResponse = await this.apiClient.getServerTime();
      if (!serverTimeResponse || !serverTimeResponse.data) {
        logger.warn('AccountService: Не удалось получить время сервера');
        return false;
      }
      
      logger.info('AccountService: Сервис аккаунта успешно инициализирован');
      this.isInitialized = true;
      
      // Запускаем периодическое обновление
      this.startPeriodicUpdates();
      
      // Запускаем первое обновление данных
      await this.updateAccountData();
      
      return true;
    } catch (error) {
      logger.error(`AccountService: Ошибка при инициализации: ${error.message}`);
      return false;
    }
  }
  
  // Запуск периодического обновления данных
  startPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    this.updateInterval = setInterval(async () => {
      await this.updateAccountData();
    }, this.updateIntervalTime);
    
    logger.info(`AccountService: Запущено периодическое обновление данных (интервал: ${this.updateIntervalTime / 60000} мин)`);
  }
  
  // Остановка периодического обновления
  stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info('AccountService: Периодическое обновление данных остановлено');
    }
  }
  
  // Обновление данных аккаунта (баланс, позиции и т.д.)
  async updateAccountData() {
    try {
      if (!this.isInitialized || !this.apiClient) {
        logger.warn('AccountService: Сервис не инициализирован');
        return false;
      }
      
      // Обновляем время последнего обновления
      this.lastUpdateTime = new Date();
      
      // 1. Получаем текущий баланс
      const balanceData = await this.updateBalance();
      
      // 2. Получаем открытые позиции
      const positionsData = await this.updatePositions();
      
      // 3. Обновляем историю баланса
      await this.updateBalanceHistory(balanceData);
      
      // 4. Рассчитываем статистику производительности
      this.calculatePerformanceMetrics(balanceData, positionsData);
      
      return true;
    } catch (error) {
      logger.error(`AccountService: Ошибка при обновлении данных аккаунта: ${error.message}`);
      return false;
    }
  }
  
  // Обновление информации о балансе
  async updateBalance() {
    try {
      // Получаем актуальный баланс с биржи
      const accountInfo = await this.apiClient.getAccountAssets('USDT');
      
      if (!accountInfo || !accountInfo.data || !accountInfo.data.length) {
        logger.warn('AccountService: Не удалось получить информацию о балансе');
        return null;
      }
      
      const balanceData = {
        totalBalance: parseFloat(accountInfo.data[0].available) + parseFloat(accountInfo.data[0].frozen || 0),
        availableBalance: parseFloat(accountInfo.data[0].available),
        frozenBalance: parseFloat(accountInfo.data[0].frozen || 0),
        updateTime: new Date().toISOString()
      };
      
      // Сохраняем данные в хранилище
      dataStore.set('accountBalance', balanceData);
      
      // Получаем или инициализируем начальный баланс
      let initialBalance = dataStore.get('initialBalance');
      if (!initialBalance) {
        initialBalance = balanceData.totalBalance;
        dataStore.set('initialBalance', initialBalance);
        logger.info(`AccountService: Установлен начальный баланс: ${initialBalance} USDT`);
      }
      
      return balanceData;
    } catch (error) {
      logger.error(`AccountService: Ошибка при обновлении баланса: ${error.message}`);
      return null;
    }
  }
  
  // Обновление информации об открытых позициях
  async updatePositions() {
    try {
      // Получаем настройки бота для доступа к торгуемым парам
      const botConfig = dataStore.get('botConfig');
      if (!botConfig || !botConfig.tradingPairs) {
        logger.warn('AccountService: Не найдены торгуемые пары');
        return [];
      }
      
      // Получаем все открытые позиции
      const positionsResponse = await this.apiClient.getPositions();
      
      if (!positionsResponse || !positionsResponse.data) {
        logger.warn('AccountService: Не удалось получить открытые позиции');
        return [];
      }
      
      // Преобразуем данные позиций в удобный формат
      const positions = [];
      const currentPrices = {};
      
      // Сначала получаем текущие цены для всех торгуемых пар
      for (const symbol of botConfig.tradingPairs) {
        try {
          const ticker = await this.apiClient.getTicker(symbol);
          if (ticker && ticker.data && ticker.data.last) {
            currentPrices[symbol] = parseFloat(ticker.data.last);
          }
        } catch (err) {
          logger.warn(`AccountService: Ошибка при получении цены для ${symbol}: ${err.message}`);
        }
      }
      
      // Формируем данные позиций
      for (const position of positionsResponse.data) {
        if (parseFloat(position.total) > 0) {
          const entryTime = parseInt(position.ctime);
          const now = new Date().getTime();
          const duration = now - entryTime;
          
          // Форматируем время в минутах и секундах
          const minutes = Math.floor(duration / 60000);
          const seconds = Math.floor((duration % 60000) / 1000);
          const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          
          positions.push({
            id: position.positionId,
            symbol: position.symbol,
            type: position.holdSide.toUpperCase(),
            entryPrice: parseFloat(position.openPrice),
            currentPrice: currentPrices[position.symbol] || parseFloat(position.marketPrice),
            size: parseFloat(position.total),
            leverage: parseFloat(position.leverage),
            entryTime: entryTime,
            pnl: parseFloat(position.unrealizedPL || 0),
            pnlPercentage: parseFloat(position.unrealizedPL) / parseFloat(position.margin) * 100,
            time: timeString
          });
        }
      }
      
      // Сохраняем данные позиций
      dataStore.set('activePositions', positions);
      
      return positions;
    } catch (error) {
      logger.error(`AccountService: Ошибка при обновлении позиций: ${error.message}`);
      return [];
    }
  }
  
  // Обновление истории баланса
  async updateBalanceHistory(balanceData) {
    if (!balanceData) return false;
    
    try {
      const today = new Date().toISOString().split('T')[0];
      let balanceHistory = dataStore.get('balanceHistory') || [];
      
      // Получаем начальный баланс
      const initialBalance = dataStore.get('initialBalance') || balanceData.totalBalance;
      
      // Проверяем, есть ли запись за сегодня
      const todayEntryIndex = balanceHistory.findIndex(entry => entry.date === today);
      
      if (todayEntryIndex !== -1) {
        // Обновляем существующую запись
        balanceHistory[todayEntryIndex] = {
          date: today,
          balance: balanceData.totalBalance,
          profit: balanceData.totalBalance - initialBalance,
          profitPercentage: ((balanceData.totalBalance - initialBalance) / initialBalance) * 100
        };
      } else {
        // Добавляем новую запись
        balanceHistory.push({
          date: today,
          balance: balanceData.totalBalance,
          profit: balanceData.totalBalance - initialBalance,
          profitPercentage: ((balanceData.totalBalance - initialBalance) / initialBalance) * 100
        });
      }
      
      // Сортируем историю по дате (от старых к новым)
      balanceHistory.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Ограничиваем историю (например, последние 365 дней)
      if (balanceHistory.length > 365) {
        balanceHistory = balanceHistory.slice(balanceHistory.length - 365);
      }
      
      // Сохраняем обновленную историю
      dataStore.set('balanceHistory', balanceHistory);
      
      return true;
    } catch (error) {
      logger.error(`AccountService: Ошибка при обновлении истории баланса: ${error.message}`);
      return false;
    }
  }
  
  // Расчет метрик производительности
  calculatePerformanceMetrics(balanceData, positions) {
    if (!balanceData) return;
    
    try {
      const initialBalance = dataStore.get('initialBalance') || balanceData.totalBalance;
      
      // Получаем историю сделок
      const tradeHistory = dataStore.get('tradeHistory') || [];
      
      // Расчет общей прибыли
      const totalProfit = balanceData.totalBalance - initialBalance;
      const totalProfitPercentage = initialBalance > 0 ? (totalProfit / initialBalance) * 100 : 0;
      
      // Расчет дневной прибыли (используем вчерашний баланс или начальный, если нет данных)
      const balanceHistory = dataStore.get('balanceHistory') || [];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      const yesterdayEntry = balanceHistory.find(entry => entry.date === yesterdayStr);
      const yesterdayBalance = yesterdayEntry ? yesterdayEntry.balance : initialBalance;
      
      const todayProfit = balanceData.totalBalance - yesterdayBalance;
      const todayProfitPercentage = yesterdayBalance > 0 ? (todayProfit / yesterdayBalance) * 100 : 0;
      
      // Расчет винрейта
      const totalTrades = tradeHistory.length;
      const winTrades = tradeHistory.filter(trade => trade.result === 'win').length;
      const winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
      
      // Средняя прибыль на сделку
      const avgProfit = totalTrades > 0
        ? tradeHistory.reduce((sum, trade) => sum + (trade.pnl || 0), 0) / totalTrades
        : 0;
      
      // Формируем объект статистики
      const performanceMetrics = {
        totalBalance: balanceData.totalBalance,
        initialBalance: initialBalance,
        totalProfit: totalProfit,
        totalProfitPercentage: totalProfitPercentage,
        todayProfit: todayProfit,
        todayProfitPercentage: todayProfitPercentage,
        winRate: winRate,
        totalTrades: totalTrades,
        avgProfit: avgProfit,
        activePositionsCount: positions.length,
        updateTime: new Date().toISOString()
      };
      
      // Сохраняем статистику
      dataStore.set('performanceMetrics', performanceMetrics);
      
      return performanceMetrics;
    } catch (error) {
      logger.error(`AccountService: Ошибка при расчете метрик производительности: ${error.message}`);
      return null;
    }
  }
  
  // Получение текущего баланса из хранилища (для использования из других модулей)
  getBalance() {
    return dataStore.get('accountBalance') || { totalBalance: 0, availableBalance: 0 };
  }
  
  // Получение истории баланса
  getBalanceHistory(days = 7) {
    const balanceHistory = dataStore.get('balanceHistory') || [];
    
    // Если запрашиваются данные за все время, возвращаем все
    if (days === 0 || days === -1) {
      return balanceHistory;
    }
    
    // Иначе возвращаем последние N дней
    return balanceHistory.slice(-days);
  }
  
  // Получение данных для графика P&L
  getPnlData(days = 7) {
    const balanceHistory = this.getBalanceHistory(days);
    
    return balanceHistory.map(entry => ({
      date: entry.date,
      pnl: entry.profitPercentage
    }));
  }
  
  // Получение текущих метрик производительности
  getPerformanceMetrics() {
    return dataStore.get('performanceMetrics') || {
      totalBalance: 0,
      totalProfit: 0,
      totalProfitPercentage: 0,
      todayProfit: 0,
      todayProfitPercentage: 0,
      winRate: 0,
      totalTrades: 0,
      avgProfit: 0,
      activePositionsCount: 0
    };
  }
  
  // Получение активных позиций
  getActivePositions() {
    return dataStore.get('activePositions') || [];
  }
}

// Экспортируем синглтон
const accountService = new AccountService();
module.exports = accountService;