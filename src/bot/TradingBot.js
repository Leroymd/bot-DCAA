// src/bot/TradingBot.js
const EventEmitter = require('events');
const BitGetClient = require('../exchange/BitgetClient');
const PositionManager = require('./PositionManager');
const IndicatorManager = require('./IndicatorManager');
const FractalStrategy = require('./strategy/FractalStrategy');
const logger = require('../utils/logger');
const dataStore = require('../utils/dataStore');

class TradingBot extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.client = null;
    this.balance = 0;
    this.initialBalance = 0;
    this.currentPrice = {};
    this.status = {
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
      lastScan: null
    };
    
    this.indicatorManager = new IndicatorManager(this.config);
    this.positionManager = new PositionManager(this.config);
    this.strategy = new FractalStrategy(this.config, this.indicatorManager, this.positionManager);
    
    this.intervals = [];
    
    this.dailyPerformance = {
      startBalance: 0,
      currentBalance: 0,
      trades: [],
      winCount: 0,
      lossCount: 0,
      startTime: null,
      activeDay: false
    };
    
    this.reinvestmentInfo = {
      enabled: config.reinvestment !== undefined ? config.reinvestment > 0 : true,
      percentage: config.reinvestment !== undefined ? config.reinvestment : 80,
      lastProfitWithdrawal: null,
      totalWithdrawn: 0,
      withdrawalThreshold: config.withdrawalThreshold || 50,
      withdrawalPercentage: config.withdrawalPercentage || 20
    };
  }

isRunning() {
  return this.status.status === 'running' && this.status.isActive === true;
}
  async clearDemoData() {
  try {
    logger.info('Очистка демо-данных...');
    
    // Сбрасываем историю позиций
    this.positionManager.positionHistory = [];
    
    // Сбрасываем историю сигналов
    this.strategy.signals = [];
    
    // Сбрасываем кэшированные данные
    dataStore.set('recentSignals', []);
    dataStore.set('tradeHistory', []);
    
    // Инициализируем историю баланса с текущим балансом
    const balanceHistory = [{
      date: new Date().toISOString().split('T')[0],
      balance: this.balance,
      profit: 0,
      profitPercentage: 0
    }];
    dataStore.set('balanceHistory', balanceHistory);
    
    // Сбрасываем показатели производительности
    this.status.totalProfit = 0;
    this.status.profitPercentage = 0;
    this.status.todayProfit = 0;
    this.status.todayProfitPercentage = 0;
    this.status.winRate = 0;
    this.status.totalTrades = 0;
    this.status.avgProfit = 0;
    
    logger.info('Демо-данные очищены');
  } catch (error) {
    logger.error('Ошибка при очистке демо-данных: ' + error.message);
  }
}
  async start() {
    try {
      logger.info('Инициализация торгового бота BitGet...');
      
      if (!this.config.apiKey || !this.config.apiSecret || !this.config.passphrase) {
        throw new Error('Отсутствуют учетные данные API BitGet');
      }
      
      this.client = new BitGetClient({
        apiKey: this.config.apiKey,
        apiSecret: this.config.apiSecret,
        passphrase: this.config.passphrase,
        debug: this.config.debug || false
      });
      
      this.positionManager.setClient(this.client);
      this.strategy.setClient(this.client);
      
      try {
        const serverTimeResponse = await this.client.getServerTime();
        if (!serverTimeResponse || !serverTimeResponse.data) {
          throw new Error('Не удалось получить время сервера');
        }
        logger.info('Соединение с BitGet API установлено');
      } catch (timeError) {
        logger.warn(`Предупреждение: не удалось получить время сервера: ${timeError.message}`);
      }
      
      const accountBalance = await this.client.getAccountAssets('USDT');
      
      if (accountBalance && accountBalance.data && accountBalance.data.length > 0) {
        this.balance = parseFloat(accountBalance.data[0].available);
        this.initialBalance = this.balance;
        logger.info(`Текущий баланс: ${this.balance} USDT`);
        
        this.positionManager.setBalance(this.balance);
      } else {
        logger.warn('Не удалось получить информацию о балансе');
        this.balance = 0;
        this.initialBalance = 0;
      }
      
      await this.updateMarketData();
      
      try {
        for (const pair of this.config.tradingPairs) {
          await this.client.setLeverage(pair, 'isolated', this.config.leverage.toString());
        }
        logger.info(`Установлено плечо: ${this.config.leverage}x`);
      } catch (leverageError) {
        logger.warn(`Не удалось установить плечо: ${leverageError.message}`);
      }
      
      logger.info(`Реинвестирование: ${this.reinvestmentInfo.enabled ? 'Включено' : 'Выключено'} (${this.reinvestmentInfo.percentage}%)`);
      
      this.resetDailyPerformance();
      
      await this.scanMarketPairs();
      
      await this.positionManager.updateOpenPositions();
      
      await this.indicatorManager.initialize(this.client, this.config.tradingPairs);
      
      this.startIntervals();
         await this.clearDemoData();
		 
      logger.info('Инициализация завершена. Бот готов к торговле.');
      
      this.status.status = 'running';
      this.status.isActive = true;
      this.status.startTime = new Date().getTime();
      
      this.updateStatus();
     
      return true;
    } catch (error) {
      logger.error(`Ошибка инициализации: ${error.message}`);
      throw error;
    }
  }

  async stop() {
    try {
      logger.info('Остановка торгового бота...');
      
      this.saveDailyPerformance();
      this.saveTradeHistory();
      
      for (const interval of this.intervals) {
        clearInterval(interval);
      }
      this.intervals = [];
      
      this.status.status = 'stopped';
      this.status.isActive = false;
      this.updateStatus();
      
      logger.info('Бот успешно остановлен');
      return true;
    } catch (error) {
      logger.error(`Ошибка при остановке бота: ${error.message}`);
      throw error;
    }
  }
  
  // 7. Обновим функцию сканирования пар в TradingBot.js

async scanMarketPairs() {
  try {
    logger.info('Сканирование торговых пар...');
    
    if (!this.client) {
      logger.error('Не удалось отсканировать пары: отсутствует клиент API');
      return [];
    }
    
    const exchangeInfo = await this.client.getExchangeInfo();
    if (!exchangeInfo || !exchangeInfo.data) {
      throw new Error('Не удалось получить информацию о доступных парах');
    }
    
    const allPairs = exchangeInfo.data.filter(pair => pair.quoteCoin === 'USDT');
    
    const rankedPairs = [];
    
    // Ограничиваем количество пар для сканирования
    const pairsToScan = allPairs.slice(0, 30); // Сканируем только топ-30 пар
    
    for (const pair of pairsToScan) {
      try {
        const ticker = await this.client.getTicker(pair.symbol);
        if (!ticker || !ticker.data) continue;
        
        const candles = await this.client.getCandles(pair.symbol, '15m', 100);
        if (!candles || !candles.data || candles.data.length < 50) continue;
        
        // Преобразуем свечи в нужный формат
        const formattedCandles = candles.data.map(candle => ({
          time: parseInt(candle[0]),
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5])
        }));
        
        // Рассчитываем индикаторы
        const heikinAshiCandles = this.indicatorManager.calculateHeikinAshi(formattedCandles);
        const fractals = this.indicatorManager.calculateFractals(heikinAshiCandles);
        const fastEMA = this.indicatorManager.calculateEMA(heikinAshiCandles, 89);
        const mediumEMA = this.indicatorManager.calculateEMA(heikinAshiCandles, 200);
        const pacChannel = this.indicatorManager.calculatePAC(heikinAshiCandles, 34);
        
        const totalFractals = fractals.buyFractals.length + fractals.sellFractals.length;
        
        // Получаем данные о объеме
        const volume24h = parseFloat(ticker.data.volCcy24h || ticker.data.vol24h || 0);
        
        // Получаем изменение цены
        const priceChangePercent = parseFloat(ticker.data.chgUTC || ticker.data.priceChangePercent || 0);
        
        // Проверяем тренд
        const lastIndex = fastEMA.length - 1;
        const fastEmaOverMedium = fastEMA[lastIndex] > mediumEMA[lastIndex];
        const trendStrength = Math.abs(fastEMA[lastIndex] - mediumEMA[lastIndex]) / mediumEMA[lastIndex] * 100;
        
        // Рассчитываем силу сигнала
        const score = this.calculatePairScore(
          volume24h,
          totalFractals,
          priceChangePercent,
          trendStrength,
          fastEmaOverMedium
        );
        
        rankedPairs.push({
          pair: pair.symbol,
          strength: Math.round(score),
          signals: totalFractals,
          volume: this.formatVolume(volume24h)
        });
      } catch (err) {
        logger.warn(`Ошибка при анализе пары ${pair.symbol}: ${err.message}`);
      }
    }
    
    rankedPairs.sort((a, b) => b.strength - a.strength);
    
    const topPairs = rankedPairs.slice(0, 20);
    dataStore.set('topPairs', topPairs);
    
    this.status.lastScan = new Date().toLocaleTimeString();
    
    logger.info(`Сканирование завершено, найдено ${topPairs.length} перспективных пар`);
    return topPairs;
  } catch (error) {
    logger.error(`Ошибка при сканировании пар: ${error.message}`);
    return [];
  }
}
  
  async selectPairForTrading(pair) {
    try {
      if (this.config.tradingPairs.includes(pair)) {
        logger.info(`Пара ${pair} уже выбрана для торговли`);
        return false;
      }
      
      if (this.config.tradingPairs.length >= this.config.maxTradingPairs) {
        logger.warn(`Достигнуто максимальное количество торговых пар: ${this.config.maxTradingPairs}`);
        return false;
      }
      
      this.config.tradingPairs.push(pair);
      
      await this.client.setLeverage(pair, 'isolated', this.config.leverage.toString());
      
      await this.indicatorManager.initialize(this.client, [pair]);
      
      logger.info(`Пара ${pair} добавлена для торговли`);
      
      dataStore.set('tradingPairs', this.getTradingPairsInfo());
      
      return true;
    } catch (error) {
      logger.error(`Ошибка при выборе пары для торговли: ${error.message}`);
      throw error;
    }
  }
  
  getTradingPairsInfo() {
    const pairs = [];
    
    for (const pairSymbol of this.config.tradingPairs) {
      const positions = this.positionManager.getOpenPositions().filter(p => p.symbol === pairSymbol);
      const position = positions.length > 0 ? positions[0] : null;
      
      pairs.push({
        pair: pairSymbol,
        status: position ? 'active' : 'waiting',
        position: position ? position.type : null,
        profit: position ? position.currentPnl : 0,
        time: position ? this.formatDuration(new Date().getTime() - position.entryTime) : '-',
        signals: this.indicatorManager.getSignalCount(pairSymbol) || 0
      });
    }
    
    return pairs;
  }
  
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  startIntervals() {
    const tradingInterval = setInterval(async () => {
      try {
        if (this.status.status !== 'running') return;
        
        this.checkAndUpdateDailyStats();
        
        await this.updateMarketData();
        
        await this.indicatorManager.updateIndicators();
        
        await this.positionManager.updateOpenPositions();
        
        await this.positionManager.updateTrailingStops();
        
        await this.positionManager.checkPositionDuration();
        
        if (this.checkDailyLossLimit()) {
          logger.warn('Достигнут дневной лимит убытков. Торговля приостановлена.');
          return;
        }
        
        await this.checkProfitWithdrawal();
        
        await this.strategy.execute();
        
        this.updateStatus();
        
      } catch (error) {
        logger.error(`Ошибка в торговом цикле: ${error.message}`);
      }
    }, 60000);
    
    const fastUpdateInterval = setInterval(async () => {
      try {
        if (this.status.status !== 'running') return;
        
        for (const symbol of this.config.tradingPairs) {
          const ticker = await this.client.getTicker(symbol);
          if (ticker && ticker.data && ticker.data.last) {
            this.currentPrice[symbol] = parseFloat(ticker.data.last);
          }
        }
        
        await this.positionManager.updateTrailingStops();
        
      } catch (error) {
        logger.error(`Ошибка в быстром обновлении: ${error.message}`);
      }
    }, 15000);
    
    const historyInterval = setInterval(() => {
      try {
        if (this.status.status !== 'running') return;
        
        this.saveTradeHistory();
        
      } catch (error) {
        logger.error(`Ошибка при сохранении истории: ${error.message}`);
      }
    }, 300000);
    
    this.intervals.push(tradingInterval, fastUpdateInterval, historyInterval);
  }

  async updateMarketData() {
    try {
      for (const symbol of this.config.tradingPairs) {
        const ticker = await this.client.getTicker(symbol);
        if (ticker && ticker.data && ticker.data.last) {
          this.currentPrice[symbol] = parseFloat(ticker.data.last);
        } else {
          logger.warn(`Не удалось получить текущую цену для ${symbol}`);
        }
      }
      
      if (this.status.startTime && this.status.status === 'running') {
        const now = new Date().getTime();
        const timeSinceStart = now - this.status.startTime;
        
        if (timeSinceStart > 0 && timeSinceStart % 3600000 < 60000) {
          await this.updateAccountBalance();
        }
      }
      
      await this.indicatorManager.updateHistoricalData(this.client, this.config.tradingPairs);
      
      return this.currentPrice;
    } catch (error) {
      logger.error(`Ошибка при обновлении рыночных данных: ${error.message}`);
      throw error;
    }
  }

  async updateAccountBalance() {
  try {
    if (!this.client) {
      logger.warn('Не удалось обновить баланс: отсутствует клиент API');
      return false;
    }
    
    const accountInfo = await this.client.getAccountInfo();
    
    if (!accountInfo || !accountInfo.data) {
      logger.warn('Не удалось получить информацию о счете');
      return false;
    }
    
    // Обновляем баланс
    this.balance = parseFloat(accountInfo.data.available);
    this.positionManager.setBalance(this.balance);
    
    // Если это первое обновление, устанавливаем начальный баланс
    if (this.initialBalance === 0) {
      this.initialBalance = this.balance;
    }
    
    logger.info(`Баланс обновлен: ${this.balance.toFixed(2)} USDT`);
    
    // Обновляем историю баланса
    const balanceHistory = this.getBalanceHistory();
    dataStore.set('balanceHistory', balanceHistory);
    
    return true;
  } catch (error) {
    logger.error(`Ошибка при обновлении баланса: ${error.message}`);
    return false;
  }
}

  updateStatus() {
  const now = new Date().getTime();
  
  if (this.status.status === 'running') {
    this.status.uptime = now - this.status.startTime;
  }
  
  if (this.dailyPerformance && this.dailyPerformance.startBalance > 0) {
    this.status.todayProfit = this.balance - this.dailyPerformance.startBalance;
    this.status.todayProfitPercentage = (this.status.todayProfit / this.dailyPerformance.startBalance) * 100;
  }
  
  if (this.initialBalance > 0) {
    this.status.totalProfit = this.balance - this.initialBalance;
    this.status.profitPercentage = (this.status.totalProfit / this.initialBalance) * 100;
  }
  
  this.status.withdrawn = this.reinvestmentInfo.totalWithdrawn;
  
  // Используем только реальные данные из позиций
  const positionHistory = this.positionManager.getPositionHistory();
  const totalTrades = positionHistory.length;
  const winTrades = positionHistory.filter(trade => trade.result === 'win').length;
  
  this.status.totalTrades = totalTrades;
  this.status.winRate = totalTrades > 0 ? (winTrades / totalTrades) * 100 : 0;
  
  if (totalTrades > 0) {
    const profits = positionHistory.map(trade => trade.pnl || 0);
    const avgProfit = profits.reduce((sum, pnl) => sum + pnl, 0) / totalTrades;
    this.status.avgProfit = avgProfit;
  } else {
    this.status.avgProfit = 0;
  }
  
  this.status.balance = this.balance;
  
  // Получаем активные позиции прямо с биржи
  if (this.client) {
    this.positionManager.updateOpenPositions().then(positions => {
      // Обновляем торговые пары на основе реальных позиций
      const tradingPairs = [];
      
      // Добавляем активные позиции
      for (const position of positions) {
        const timeString = this.formatDuration(now - position.entryTime);
        
        tradingPairs.push({
          pair: position.symbol,
          status: 'active',
          position: position.type,
          entryPrice: position.entryPrice,
          currentPrice: position.currentPrice || this.currentPrice[position.symbol] || 0,
          profit: position.pnlPercentage || 0,
          time: timeString,
          id: position.id
        });
      }
      
      // Добавляем остальные торговые пары без позиций
      for (const symbol of this.config.tradingPairs) {
        if (!tradingPairs.find(p => p.pair === symbol)) {
          tradingPairs.push({
            pair: symbol,
            status: 'waiting',
            position: null,
            profit: 0,
            time: '00:00',
            signals: this.indicatorManager.getSignalCount(symbol) || 0
          });
        }
      }
      
      dataStore.set('tradingPairs', tradingPairs);
    }).catch(error => {
      logger.error('Ошибка при обновлении позиций: ' + error.message);
    });
  }
  
  // Получаем реальные сигналы
  const recentSignals = this.strategy.getRecentSignals();
  dataStore.set('recentSignals', recentSignals);
  
  // Обновляем статус бота
  dataStore.set('botStatus', this.status);
  
  this.emit('update', this.status);
  
  return this.status;
}


  async checkProfitWithdrawal() {
    try {
      if (!this.reinvestmentInfo.enabled) return;
      
      const currentProfit = ((this.balance - this.initialBalance) / this.initialBalance) * 100;
      
      if (currentProfit >= this.reinvestmentInfo.withdrawalThreshold && this.initialBalance > 0) {
        const now = new Date().getTime();
        const lastWithdrawalTime = this.reinvestmentInfo.lastProfitWithdrawal || 0;
        const daysSinceLastWithdrawal = (now - lastWithdrawalTime) / (1000 * 60 * 60 * 24);
        
        if (!this.reinvestmentInfo.lastProfitWithdrawal || daysSinceLastWithdrawal >= 1) {
          const totalProfit = this.balance - this.initialBalance;
          const withdrawalAmount = totalProfit * (this.reinvestmentInfo.withdrawalPercentage / 100);
          
          logger.info(`Достигнут порог вывода прибыли (${currentProfit.toFixed(2)}% > ${this.reinvestmentInfo.withdrawalThreshold}%)`);
          logger.info(`Вывод ${this.reinvestmentInfo.withdrawalPercentage}% прибыли: ${withdrawalAmount.toFixed(2)} USDT`);
          
          this.reinvestmentInfo.lastProfitWithdrawal = now;
          this.reinvestmentInfo.totalWithdrawn += withdrawalAmount;
          
          this.balance -= withdrawalAmount;
          this.positionManager.setBalance(this.balance);
          
          logger.info(`Успешно выведено ${withdrawalAmount.toFixed(2)} USDT. Общая сумма выводов: ${this.reinvestmentInfo.totalWithdrawn.toFixed(2)} USDT`);
          
          this.updateStatus();
          
          return true;
        }
      }
      
      return false;
    } catch (error) {
      logger.error(`Ошибка при проверке вывода прибыли: ${error.message}`);
      return false;
    }
  }

  checkDailyLossLimit() {
    try {
      if (!this.dailyPerformance.activeDay) return false;
      
      const currentDrawdown = ((this.dailyPerformance.startBalance - this.balance) / this.dailyPerformance.startBalance) * 100;
      
      if (currentDrawdown >= this.config.riskManagement.dailyLossLimit) {
        logger.warn(`Достигнут дневной лимит убытков (${this.config.riskManagement.dailyLossLimit}%). Текущая просадка: ${currentDrawdown.toFixed(2)}%`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error(`Ошибка при проверке дневного лимита убытков: ${error.message}`);
      return false;
    }
  }

  checkAndUpdateDailyStats() {
    try {
      const now = new Date();
      const currentDay = now.toDateString();
      
      if (!this.dailyPerformance.activeDay) {
        this.resetDailyPerformance();
        logger.info(`Начат новый торговый день: ${currentDay}`);
        return;
      }
      
      const startDay = new Date(this.dailyPerformance.startTime).toDateString();
      if (startDay !== currentDay) {
        this.saveDailyPerformance();
        
        this.resetDailyPerformance();
        logger.info(`Начат новый торговый день: ${currentDay}`);
      }
    } catch (error) {
      logger.error(`Ошибка при обновлении дневной статистики: ${error.message}`);
    }
  }

  resetDailyPerformance() {
    this.dailyPerformance = {
      startBalance: this.balance,
      currentBalance: this.balance,
      trades: [],
      winCount: 0,
      lossCount: 0,
      startTime: new Date().getTime(),
      activeDay: true
    };
  }

  saveDailyPerformance() {
    try {
      const performanceData = {
        ...this.dailyPerformance,
        endBalance: this.balance,
        endTime: new Date().getTime(),
        totalTrades: this.dailyPerformance.winCount + this.dailyPerformance.lossCount,
        winRate: this.dailyPerformance.winCount + this.dailyPerformance.lossCount > 0 
          ? (this.dailyPerformance.winCount / (this.dailyPerformance.winCount + this.dailyPerformance.lossCount)) * 100 
          : 0,
        profit: ((this.balance - this.dailyPerformance.startBalance) / this.dailyPerformance.startBalance) * 100
      };
      
      dataStore.savePerformance(performanceData);
      
      logger.info('Сохранена дневная статистика');
      
      this.saveTradeHistory();
    } catch (error) {
      logger.error(`Ошибка при сохранении дневной статистики: ${error.message}`);
    }
  }

  saveTradeHistory() {
    try {
      dataStore.saveTradeHistory(this.positionManager.getPositionHistory());
      
      const balanceHistory = this.getBalanceHistory();
      dataStore.set('balanceHistory', balanceHistory);
      
      logger.info('История сделок сохранена');
    } catch (error) {
      logger.error(`Ошибка при сохранении истории сделок: ${error.message}`);
    }
  }
  
  getBalanceHistory() {
    const history = dataStore.get('balanceHistory') || [];
    const latestEntry = history.length > 0 ? history[history.length - 1] : null;
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    if (!latestEntry || latestEntry.date !== today) {
      history.push({
        date: today,
        balance: this.balance,
        profit: this.balance - this.initialBalance,
        profitPercentage: ((this.balance - this.initialBalance) / this.initialBalance) * 100
      });
      
      if (history.length > 30) {
        history.shift();
      }
    } else {
      latestEntry.balance = this.balance;
      latestEntry.profit = this.balance - this.initialBalance;
      latestEntry.profitPercentage = ((this.balance - this.initialBalance) / this.initialBalance) * 100;
    }
    
    return history;
  }
  
  getPnlData() {
    const balanceHistory = dataStore.get('balanceHistory') || [];
    return balanceHistory.map(entry => ({
      date: entry.date,
      pnl: entry.profitPercentage
    }));
  }

  getStatus() {
    this.updateStatus();
    return this.status;
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    this.indicatorManager.updateConfig(newConfig);
    this.positionManager.updateConfig(newConfig);
    this.strategy.updateConfig(newConfig);
    
    this.reinvestmentInfo.enabled = newConfig.reinvestment !== undefined ? newConfig.reinvestment > 0 : this.reinvestmentInfo.enabled;
    this.reinvestmentInfo.percentage = newConfig.reinvestment !== undefined ? newConfig.reinvestment : this.reinvestmentInfo.percentage;
    this.reinvestmentInfo.withdrawalThreshold = newConfig.withdrawalThreshold || this.reinvestmentInfo.withdrawalThreshold;
    this.reinvestmentInfo.withdrawalPercentage = newConfig.withdrawalPercentage || this.reinvestmentInfo.withdrawalPercentage;
    
    logger.info('Конфигурация бота обновлена');
    return true;
  }
}

module.exports = TradingBot;