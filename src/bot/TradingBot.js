// src/bot/TradingBot.js
const EventEmitter = require('events');
const BitGetClient = require('../exchange/BitgetClient');
const PositionManager = require('./PositionManager');
const IndicatorManager = require('./IndicatorManager');
const FractalStrategy = require('./strategy/FractalStrategy'); // Используем эту стратегию
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
    this.isInitialized = false; // Добавляем флаг инициализации

    this.status = {
      status: 'stopped',
      isActive: false,
      balance: 0,
      initialBalance: 0, // Будет установлено в start/initialize
      totalProfit: 0,
      profitPercentage: 0,
      todayProfit: 0,
      todayProfitPercentage: 0,
      winRate: 0,
      totalTrades: 0,
      avgProfit: 0,
      withdrawn: dataStore.get('totalWithdrawnAmount') || 0,
      lastScan: null,
      startTime: null,
      uptime: 0,
      tradingPairs: this.config.tradingPairs || [], // Убедимся, что это массив
      activePositions: 0,
    };

    this.indicatorManager = new IndicatorManager(this.config);
    this.positionManager = new PositionManager(this.config);
    this.strategy = new FractalStrategy(this.config, this.indicatorManager, this.positionManager);

    this.intervals = [];

    this.dailyPerformance = {
      startBalance: 0,
      currentBalance: 0,
      tradesToday: 0, // Изменено с trades
      winsToday: 0,   // Изменено с winCount
      lossesToday: 0, // Изменено с lossCount
      startTime: null,
      activeDay: false,
      lastDayProcessed: null,
    };

    this.reinvestmentInfo = {
      enabled: this.config.reinvestment !== undefined ? this.config.reinvestment > 0 : true, // Дефолт из вашего кода
      percentage: this.config.reinvestment !== undefined ? this.config.reinvestment : 80,  // Дефолт из вашего кода
      lastProfitWithdrawal: null, // Был lastProfitCheck
      totalWithdrawn: dataStore.get('totalWithdrawnAmount') || 0, // Загружаем при старте
      withdrawalThreshold: this.config.withdrawalThreshold || 50,
      withdrawalPercentage: this.config.withdrawalPercentage || 20,
      lastProfitCheck: 0, // Добавим для согласованности с более новыми версиями
    };
    this.performanceHistory = dataStore.get('performanceHistory') || [];

    // Связываем PositionManager с TradingBot для обработки закрытых сделок
    this.positionManager.on('tradeClosed', (tradeData) => {
        if (typeof this.handleClosedTrade === 'function') {
            this.handleClosedTrade(tradeData);
        } else {
            logger.error("[TradingBot constructor] Метод handleClosedTrade не определен, но PositionManager пытается его вызвать.");
        }
    });
  }

  // Метод initialize, которого не хватало
  async initialize() {
    if (this.isInitialized) {
        logger.info('TradingBot уже инициализирован.');
        return;
    }
    logger.info('Инициализация TradingBot...');
    try {
      // API ключи теперь читаются напрямую из this.config
      if (!this.config.apiKey || !this.config.apiSecret || !this.config.passphrase) {
        throw new Error('Отсутствуют учетные данные API (apiKey, apiSecret, passphrase) в конфигурации.');
      }

      this.client = new BitGetClient({
        apiKey: this.config.apiKey,
        apiSecret: this.config.apiSecret,
        passphrase: this.config.passphrase,
        baseUrl: this.config.baseUrl || 'https://api.bitget.com', // Если baseUrl тоже в корне
        debug: this.config.debug || false,
      });

      this.positionManager.setClient(this.client);
      if (typeof this.strategy.setClient === 'function') {
        this.strategy.setClient(this.client);
      }

      await this._fetchAndSetInitialBalance(); // Внутренний метод для установки баланса

      const pairsToInit = this.config.tradingPairs || [];
      if (!Array.isArray(pairsToInit)) {
        logger.error(`[TradingBot.initialize] this.config.tradingPairs не является массивом! Получено: ${JSON.stringify(pairsToInit)}. Устанавливаем пустой массив.`);
        this.config.tradingPairs = []; // Исправляем на месте
      }
      // Передаем client в IndicatorManager.initialize
      // Убедитесь, что IndicatorManager.initialize принимает (client, symbols)
      if (this.indicatorManager && typeof this.indicatorManager.initialize === 'function') {
         await this.indicatorManager.initialize(this.client, this.config.tradingPairs);
      } else {
         logger.error("[TradingBot.initialize] this.indicatorManager.initialize не является функцией!");
         throw new Error("IndicatorManager.initialize is not a function");
      }


      if (this.positionManager && typeof this.positionManager.loadPositions === 'function') {
        await this.positionManager.loadPositions();
      }

      this.status.initialBalance = this.initialBalance;
      this.status.balance = this.balance;
      this.isInitialized = true;
      logger.info('TradingBot успешно инициализирован.');
      this.emit('initialized', this.status);
    } catch (error) {
      logger.error(`Ошибка инициализации TradingBot: ${error.message}`, error.stack);
      this.isInitialized = false;
      this.status.status = 'error_initializing';
      this.emit('error', `Ошибка инициализации: ${error.message}`);
      throw error;
    }
  }

  async _fetchAndSetInitialBalance() {
    // Логика из вашего метода start для получения баланса
    try {
        const storedInitialBalance = dataStore.get('initialBalance');
        const initialBalanceSet = dataStore.get('initialBalanceSet');
        let currentBalanceFromExchange = null;

        if (this.client && typeof this.client.getAccountAssets === 'function') { // Используем getAccountAssets
            const accountAssets = await this.client.getAccountAssets('USDT'); // Предполагаем USDT
            if (accountAssets && accountAssets.data && accountAssets.data.length > 0 && accountAssets.data[0].available !== undefined) {
                currentBalanceFromExchange = parseFloat(accountAssets.data[0].available);
            } else {
                logger.warn('Не удалось получить данные о балансе из getAccountAssets или поле available отсутствует.');
            }
        } else {
            logger.warn('Клиент API не инициализирован или не имеет метода getAccountAssets.');
        }

        if (!initialBalanceSet || storedInitialBalance === undefined) {
            if (currentBalanceFromExchange !== null) {
                this.initialBalance = currentBalanceFromExchange;
                this.balance = currentBalanceFromExchange;
                dataStore.set('initialBalance', this.initialBalance);
                dataStore.set('initialBalanceSet', true);
                logger.info(`Начальный баланс установлен по текущему балансу с биржи: ${this.initialBalance.toFixed(2)} USDT`);
            } else {
                this.initialBalance = this.config.manualInitialBalance || 1000;
                this.balance = this.initialBalance;
                dataStore.set('initialBalance', this.initialBalance);
                dataStore.set('initialBalanceSet', true);
                logger.warn(`Не удалось получить баланс с биржи. Начальный баланс установлен вручную/по-умолчанию: ${this.initialBalance.toFixed(2)} USDT`);
            }
        } else {
            this.initialBalance = storedInitialBalance;
            this.balance = currentBalanceFromExchange !== null ? currentBalanceFromExchange : storedInitialBalance;
            logger.info(`Начальный баланс загружен из хранилища: ${this.initialBalance.toFixed(2)} USDT. Текущий баланс: ${this.balance.toFixed(2)} USDT.`);
        }
        if (this.positionManager && typeof this.positionManager.setBalance === 'function') {
            this.positionManager.setBalance(this.balance);
        }
    } catch (error) {
        logger.error(`Критическая ошибка при получении/установке начального баланса: ${error.message}`, error.stack);
        this.initialBalance = this.config.manualInitialBalance || 1000;
        this.balance = this.initialBalance;
        if (this.positionManager && typeof this.positionManager.setBalance === 'function') {
            this.positionManager.setBalance(this.balance);
        }
        logger.warn(`Установлен аварийный начальный баланс: ${this.initialBalance.toFixed(2)} USDT`);
    }
  }


  async start() {
    if (this.isRunning()) {
      logger.warn('TradingBot уже запущен.');
      return false;
    }

    if (!this.isInitialized) {
      logger.warn('TradingBot не инициализирован. Попытка автоматической инициализации...');
      try {
        await this.initialize(); // Вызываем initialize, если не был инициализирован
      } catch (initError) {
        logger.error('Автоматическая инициализация не удалась. Запуск TradingBot отменен.');
        return false;
      }
    }
     if (!this.isInitialized) { // Повторная проверка после попытки инициализации
        logger.error('TradingBot все еще не инициализирован после попытки. Запуск отменен.');
        return false;
    }


    // Логика из вашего старого start() после инициализации клиента и баланса
    try {
        // Установка плеча
        if (this.client && Array.isArray(this.config.tradingPairs)) {
            for (const pair of this.config.tradingPairs) {
                try {
                    await this.client.setLeverage(pair, this.config.marginMode || 'isolated', (this.config.leverage || 5).toString());
                } catch (leverageError) {
                    logger.warn(`Не удалось установить плечо для ${pair}: ${leverageError.message}`);
                }
            }
            logger.info(`Установлено плечо: ${this.config.leverage || 5}x для ${this.config.tradingPairs.join(', ')}`);
        }

        logger.info(`Реинвестирование: ${this.reinvestmentInfo.enabled ? 'Включено' : 'Выключено'} (${this.reinvestmentInfo.percentage}%)`);

        if (typeof this.resetDailyPerformance === 'function') this.resetDailyPerformance(true); // forceReset true
        if (typeof this.scanMarketPairs === 'function') await this.scanMarketPairs(); // Если этот метод есть
        if (this.positionManager && typeof this.positionManager.updateOpenPositions === 'function') await this.positionManager.updateOpenPositions();
        // Инициализация индикаторов уже была в this.initialize()

        // Очистка демо-данных (если это нужно при каждом старте)
        if (this.config.clearDemoDataOnStart && typeof this.clearDemoData === 'function') { // Добавим проверку в конфиг
            await this.clearDemoData();
        }

        this.status.status = 'running';
        this.status.isActive = true;
        this.status.startTime = new Date().getTime();
        if (typeof this.updateStatus === 'function') this.updateStatus(); // Переименовано из updateStatusAndPerformance
        this.startIntervals();
        logger.info('TradingBot запущен.');
        this.emit('started', this.status);
        return true;

    } catch (error) {
        logger.error(`Ошибка при запуске TradingBot (после инициализации): ${error.message}`, error.stack);
        this.status.status = 'error_starting';
        this.status.isActive = false;
        if (typeof this.updateStatus === 'function') this.updateStatus();
        return false;
    }
  }

  async stop() {
    // ... (код из вашего предыдущего полного файла, убедитесь, что this.updateStatus вызывается)
    if (!this.isRunning() && this.status.status !== 'stopping') {
      logger.warn('TradingBot не запущен или уже останавливается.');
      return false;
    }
    logger.info('Остановка TradingBot...');
    this.status.status = 'stopping';
    this.status.isActive = false;

    this.intervals.forEach(clearInterval);
    this.intervals = [];
    logger.info('Все периодические задачи остановлены.');

    if (typeof this.saveDailyPerformance === 'function') this.saveDailyPerformance();
    if (typeof this.saveTradeHistory === 'function') this.saveTradeHistory();

    this.status.status = 'stopped';
    if (this.status.startTime) {
        this.status.uptime = new Date().getTime() - this.status.startTime;
    }
    if (typeof this.updateStatus === 'function') this.updateStatus(); // Переименовано
    if (typeof this.logBalanceHistory === 'function') this.logBalanceHistory();

    this.emit('stopped', this.status);
    logger.info('TradingBot успешно остановлен.');
    return true;
  }

  isRunning() {
    return this.status.isActive;
  }

  startIntervals() {
    // ... (код из вашего предыдущего полного файла)
    // Убедитесь, что этот метод определен и корректно вызывает this.updateMarketData,
    // цикл с this.strategy.checkSignals -> this.handleSignal,
    // this.positionManager.updateOpenPositions, this.updateStatus (переименовано), this.handleDailyResetAndPerformance
    // --- Вставляю сюда код startIntervals из прошлого полного ответа ---
    logger.info('Запуск периодических задач...');
    this.intervals.forEach(clearInterval);
    this.intervals = [];

    const intervalsConfig = this.config.intervals || {};
    const marketUpdateMs = intervalsConfig.marketUpdateMs || 10000;
    const strategyCheckMs = intervalsConfig.strategyCheckMs || 15000;
    const positionUpdateMs = intervalsConfig.positionUpdateMs || 30000;
    const statusUpdateMs = intervalsConfig.statusUpdateMs || 60000;
    const dailyChecksMs = intervalsConfig.dailyChecksMs || 3600000;

    this.intervals.push(setInterval(async () => {
      if (this.isRunning()) {
        try {
          if (typeof this.updateMarketData === 'function') await this.updateMarketData();
        } catch (error) {
          logger.error(`Ошибка в интервале обновления рыночных данных: ${error.message}`, error.stack);
        }
      }
    }, marketUpdateMs));
    logger.info(`Запущен интервал обновления рыночных данных: каждые ${marketUpdateMs / 1000} сек.`);

    this.intervals.push(setInterval(async () => {
      if (this.isRunning()) {
        try {
          const tradingPairs = this.config.tradingPairs || [];
          for (const pair of tradingPairs) {
            if (this.strategy && typeof this.strategy.checkSignals === 'function') {
              const signal = await this.strategy.checkSignals(pair, this.currentPrice[pair]);
              if (signal && typeof this.handleSignal === 'function') {
                logger.info(`[TradingBot] Получен СИГНАЛ от strategy.checkSignals для ${pair}: Тип=${signal.type}, Цена=${signal.price}, Сила=${signal.strength || 'N/A'}, Причина: ${signal.reason}`);
                await this.handleSignal(signal);
              }
            } else {
              logger.warn(`Метод strategy.checkSignals отсутствует или стратегия не определена. Пропускаем проверку сигналов.`);
              break;
            }
          }
        } catch (error) {
          logger.error(`[TradingBot] Ошибка в интервале проверки торговой стратегии (checkSignals): ${error.message}`, error.stack);
        }
      }
    }, strategyCheckMs));
    logger.info(`Запущен интервал проверки стратегии (checkSignals): каждые ${strategyCheckMs / 1000} сек.`);

    this.intervals.push(setInterval(async () => {
      if (this.isRunning()) {
        try {
          if (this.positionManager && typeof this.positionManager.updateOpenPositions === 'function') await this.positionManager.updateOpenPositions();
        } catch (error) {
          logger.error(`Ошибка в интервале обновления позиций: ${error.message}`, error.stack);
        }
      }
    }, positionUpdateMs));
    logger.info(`Запущен интервал обновления позиций: каждые ${positionUpdateMs / 1000} сек.`);

    this.intervals.push(setInterval(() => {
      if (this.isRunning()) {
        try {
          if (typeof this.updateStatus === 'function') this.updateStatus(); // Переименовано
          if (typeof this.logBalanceHistory === 'function') this.logBalanceHistory();
        } catch (error) {
          logger.error(`Ошибка в интервале обновления статуса: ${error.message}`, error.stack);
        }
      }
    }, statusUpdateMs));
    logger.info(`Запущен интервал обновления статуса: каждые ${statusUpdateMs / 1000} сек.`);

    this.intervals.push(setInterval(() => {
        if (this.isRunning()) {
            try {
                if (typeof this.handleDailyResetAndPerformance === 'function') this.handleDailyResetAndPerformance();
            } catch (error) {
                logger.error(`Ошибка в интервале проверки смены дня: ${error.message}`, error.stack);
            }
        }
    }, dailyChecksMs));
    logger.info(`Запущен интервал проверки смены дня: каждые ${dailyChecksMs / 1000} сек.`);
  }


  async updateMarketData() {
    // ... (код из вашего старого файла или из полного ответа, убедитесь в актуальности this.client.getTicker или getMarkPrice)
    if(!this.client) return;
    const pairs = this.config.tradingPairs || [];
    for (const pair of pairs) {
      try {
        const ticker = await this.client.getTicker(pair); // Используем getTicker как в BitgetClient.js
        if (ticker && ticker.data && ticker.data.last) {
          this.currentPrice[pair] = parseFloat(ticker.data.last);
        } else {
          logger.warn(`Не удалось получить текущую цену для ${pair} через getTicker`);
        }
      } catch (error) {
        logger.warn(`Ошибка при получении цены для ${pair}: ${error.message}`);
      }
    }

    // Обновление индикаторов
    if (this.indicatorManager && typeof this.indicatorManager.updateAllIndicators === 'function') {
        await this.indicatorManager.updateAllIndicators(this.currentPrice);
    } else if (this.indicatorManager && typeof this.indicatorManager.updateHistoricalData === 'function' && typeof this.indicatorManager.calculateAllIndicators === 'function' && Array.isArray(this.config.tradingPairs)) {
        // Логика из вашего старого updateMarketData для IndicatorManager, если updateAllIndicators нет
        await this.indicatorManager.updateHistoricalData(this.client, this.config.tradingPairs);
        for (const pair of this.config.tradingPairs) {
            await this.indicatorManager.calculateAllIndicators(pair); // Предполагаем, что этот метод существует
        }
    }


    this.status.lastScan = new Date().toISOString();
    this.emit('marketDataUpdated', this.currentPrice);
  }

  // Добавьте этот метод в класс TradingBot в файле src/bot/TradingBot.js

async handleSignal(signal) {
  // 1. Валидация входного сигнала
  if (!signal || typeof signal.type !== 'string' || typeof signal.symbol !== 'string' || typeof signal.price !== 'number') {
    logger.warn(`[TradingBot.handleSignal] Получен некорректный или неполный сигнал: ${JSON.stringify(signal)}`);
    return;
  }

  const { type, symbol, price, strength, reason } = signal; // strength и reason могут быть undefined
  const pair = symbol; // Используем 'symbol' как основной идентификатор пары

  logger.info(`[TradingBot.handleSignal] Обработка сигнала для ${pair}: Тип=${type}, Цена=${price}, Сила=${strength || 'N/A'}, Причина: ${reason || 'N/A'}`);

  // 2. Проверка силы сигнала (если применимо)
  const minStrength = this.config.strategySettings?.minSignalStrengthToOpen || this.config.minSignalStrengthToOpen || 0;
  if (strength !== undefined && strength < minStrength) {
    logger.info(`[TradingBot.handleSignal] Сигнал для ${pair} (${type}) слишком слабый (${strength} < ${minStrength}). Игнорируется.`);
    return;
  }

  // 3. Получение информации о текущих позициях
  if (!this.positionManager || typeof this.positionManager.getOpenPositionsForPair !== 'function' || typeof this.positionManager.getOpenPositions !== 'function') {
      logger.error("[TradingBot.handleSignal] PositionManager не настроен или отсутствует необходимый метод (getOpenPositionsForPair/getOpenPositions).");
      return;
  }
  const openPositionsForPair = this.positionManager.getOpenPositionsForPair(pair);
  const currentOpenPosition = openPositionsForPair.length > 0 ? openPositionsForPair[0] : null; // Предполагаем одну активную позицию на пару

  const allOpenPositions = this.positionManager.getOpenPositions();
  const openPositionsCount = allOpenPositions.filter(p => p && (p.status ? p.status !== 'closed' : true)).length; // Фильтруем только действительно открытые
  const globalMaxOpenPositions = this.config.riskManagement?.maxOpenPositions || 1;

  // 4. Определение разрешения на шортинг
  let allowShorting = false; // По умолчанию шортинг запрещен
  if (this.config.strategySettings) {
      if (this.config.strategySettings.pureFractal && this.config.strategySettings.pureFractal.allowShorting !== undefined) {
          allowShorting = this.config.strategySettings.pureFractal.allowShorting;
      } else if (this.config.strategySettings.allowShorting !== undefined) {
          allowShorting = this.config.strategySettings.allowShorting;
      }
  }
  // Также можно проверить настройки из самого экземпляра стратегии, если они там есть
  if (this.strategy && this.strategy.strategySettings && this.strategy.strategySettings.allowShorting !== undefined) {
      allowShorting = this.strategy.strategySettings.allowShorting;
  }
  logger.debug(`[TradingBot.handleSignal] Для ${pair}: allowShorting=${allowShorting}`);


  // 5. Основная логика обработки сигналов
  const signalTypeUpper = type.toUpperCase();

  try {
    if (signalTypeUpper.includes('BUY')) { // Обрабатываем 'BUY', 'BUY_FRACTAL' и т.п.
      if (currentOpenPosition) {
        // Проверяем, что currentOpenPosition.side существует и является строкой
        if (currentOpenPosition.side && typeof currentOpenPosition.side === 'string' && currentOpenPosition.side.toLowerCase() === 'sell') {
          logger.info(`[TradingBot.handleSignal] Сигнал ${type} для ${pair}. Закрываем существующий SHORT.`);
          await this.positionManager.closePosition(pair, currentOpenPosition.id, `Reversing Short to Long on ${type} signal. Reason: ${reason}`);
          // После успешного закрытия, проверяем лимит и открываем лонг
          // Обновляем количество открытых позиций после закрытия
          const updatedOpenPositionsCount = this.positionManager.getOpenPositions().filter(p => p && (p.status ? p.status !== 'closed' : true)).length;
          if (updatedOpenPositionsCount < globalMaxOpenPositions) {
            logger.info(`[TradingBot.handleSignal] Открываем LONG для ${pair} после закрытия SHORT.`);
            await this.positionManager.openPosition('buy', pair, price, reason, strength);
          } else {
            logger.info(`[TradingBot.handleSignal] SHORT для ${pair} закрыт, но достигнут лимит (${globalMaxOpenPositions}). Новый LONG не открывается.`);
          }
        } else if (currentOpenPosition.side && typeof currentOpenPosition.side === 'string' && currentOpenPosition.side.toLowerCase() === 'buy') {
          logger.info(`[TradingBot.handleSignal] Сигнал ${type} для ${pair}, но LONG позиция уже открыта. Нет действий.`);
        } else {
            logger.warn(`[TradingBot.handleSignal] Сигнал ${type} для ${pair}, но текущая позиция имеет неизвестный side: '${currentOpenPosition.side}'. Нет действий.`);
        }
      } else { // Нет открытой позиции
        if (openPositionsCount < globalMaxOpenPositions) {
          logger.info(`[TradingBot.handleSignal] Сигнал ${type} для ${pair}. Открываем новую LONG позицию.`);
          await this.positionManager.openPosition('buy', pair, price, reason, strength);
        } else {
          logger.info(`[TradingBot.handleSignal] Сигнал ${type} для ${pair}, но достигнут лимит открытых позиций (${globalMaxOpenPositions}). Позиция не открывается.`);
        }
      }
    } else if (signalTypeUpper.includes('SELL')) { // Обрабатываем 'SELL', 'SELL_FRACTAL' и т.п.
      if (currentOpenPosition) {
        // Проверяем, что currentOpenPosition.side существует и является строкой
        if (currentOpenPosition.side && typeof currentOpenPosition.side === 'string' && currentOpenPosition.side.toLowerCase() === 'buy') {
          logger.info(`[TradingBot.handleSignal] Сигнал ${type} для ${pair}. Закрываем существующий LONG.`);
          await this.positionManager.closePosition(pair, currentOpenPosition.id, `Reversing Long to Short on ${type} signal. Reason: ${reason}`);
          // После успешного закрытия, если разрешен шорт и лимит позволяет
          const updatedOpenPositionsCount = this.positionManager.getOpenPositions().filter(p => p && (p.status ? p.status !== 'closed' : true)).length;
          if (allowShorting && updatedOpenPositionsCount < globalMaxOpenPositions) {
            logger.info(`[TradingBot.handleSignal] Открываем SHORT для ${pair} после закрытия LONG (шортинг разрешен).`);
            await this.positionManager.openPosition('sell', pair, price, reason, strength);
          } else {
            logger.info(`[TradingBot.handleSignal] LONG для ${pair} закрыт. Шортинг не разрешен или достигнут лимит (${globalMaxOpenPositions}). Новый SHORT не открывается.`);
          }
        } else if (currentOpenPosition.side && typeof currentOpenPosition.side === 'string' && currentOpenPosition.side.toLowerCase() === 'sell') {
          logger.info(`[TradingBot.handleSignal] Сигнал ${type} для ${pair}, но SHORT позиция уже открыта. Нет действий.`);
        } else {
            logger.warn(`[TradingBot.handleSignal] Сигнал ${type} для ${pair}, но текущая позиция имеет неизвестный side: '${currentOpenPosition.side}'. Нет действий.`);
        }
      } else { // Нет открытой позиции
        if (allowShorting && openPositionsCount < globalMaxOpenPositions) {
          logger.info(`[TradingBot.handleSignal] Сигнал ${type} для ${pair}. Открываем новую SHORT позицию (шортинг разрешен).`);
          await this.positionManager.openPosition('sell', pair, price, reason, strength);
        } else {
          logger.info(`[TradingBot.handleSignal] Сигнал ${type} для ${pair}. Шортинг не разрешен или достигнут лимит (${globalMaxOpenPositions}). Позиция не открывается.`);
        }
      }
    } else if (signalTypeUpper === 'CLOSE_LONG') {
        if (currentOpenPosition && currentOpenPosition.side && typeof currentOpenPosition.side === 'string' && currentOpenPosition.side.toLowerCase() === 'buy') {
            logger.info(`[TradingBot.handleSignal] Сигнал CLOSE_LONG для ${pair}. Закрываем LONG позицию.`);
            await this.positionManager.closePosition(pair, currentOpenPosition.id, reason || `Signal CLOSE_LONG for ${pair}`);
        } else if (currentOpenPosition) {
            logger.info(`[TradingBot.handleSignal] Сигнал CLOSE_LONG для ${pair}, но открыта позиция ${currentOpenPosition.side} или side не определен. Нет действий.`);
        } else {
            logger.info(`[TradingBot.handleSignal] Сигнал CLOSE_LONG для ${pair}, но нет открытой позиции. Нет действий.`);
        }
    } else if (signalTypeUpper === 'CLOSE_SHORT') {
        if (currentOpenPosition && currentOpenPosition.side && typeof currentOpenPosition.side === 'string' && currentOpenPosition.side.toLowerCase() === 'sell') {
            logger.info(`[TradingBot.handleSignal] Сигнал CLOSE_SHORT для ${pair}. Закрываем SHORT позицию.`);
            await this.positionManager.closePosition(pair, currentOpenPosition.id, reason || `Signal CLOSE_SHORT for ${pair}`);
        } else if (currentOpenPosition) {
            logger.info(`[TradingBot.handleSignal] Сигнал CLOSE_SHORT для ${pair}, но открыта позиция ${currentOpenPosition.side} или side не определен. Нет действий.`);
        } else {
            logger.info(`[TradingBot.handleSignal] Сигнал CLOSE_SHORT для ${pair}, но нет открытой позиции. Нет действий.`);
        }
    } else {
        logger.warn(`[TradingBot.handleSignal] Получен неизвестный или необрабатываемый тип сигнала: '${type}' для ${pair}`);
    }
  } catch (error) {
    logger.error(`[TradingBot.handleSignal] Критическая ошибка при обработке сигнала для ${pair}: ${error.message}`, error.stack);
    // Можно добавить дополнительную логику обработки ошибок, если это необходимо
  }
}

  // Переименовываем updateStatusAndPerformance в updateStatus для соответствия старому коду
  updateStatus() {
    // ... (код из вашего старого updateStatus, адаптированный)
    const now = new Date().getTime();
    if (this.status.startTime && this.status.isActive) { // isActive, а не status === 'running'
        this.status.uptime = now - this.status.startTime;
    }

    const closedTrades = (this.positionManager && typeof this.positionManager.getPositionHistory === 'function')
                       ? this.positionManager.getPositionHistory().filter(trade => trade.status === 'closed')
                       : [];

    const totalTrades = closedTrades.length;
    const winCount = closedTrades.filter(trade => (trade.pnlUSDT || trade.pnl || 0) > 0).length; // Учитываем и pnlUSDT, и pnl

    this.status.totalTrades = totalTrades;
    this.status.winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
    this.status.avgProfit = totalTrades > 0 ? closedTrades.reduce((sum, trade) => sum + (trade.pnlUSDT || trade.pnl || 0), 0) / totalTrades : 0;

    this.status.balance = this.balance;
    this.status.totalProfit = this.balance - this.initialBalance;
    this.status.profitPercentage = this.initialBalance > 0 ? (this.status.totalProfit / this.initialBalance) * 100 : 0;

    if (this.dailyPerformance.activeDay) {
        this.dailyPerformance.currentBalance = this.balance;
        const dailyProfit = this.dailyPerformance.currentBalance - this.dailyPerformance.startBalance;
        this.status.todayProfit = dailyProfit;
        this.status.todayProfitPercentage = this.dailyPerformance.startBalance > 0
          ? (dailyProfit / this.dailyPerformance.startBalance) * 100
          : 0;
    } else {
        this.status.todayProfit = 0;
        this.status.todayProfitPercentage = 0;
    }
    if (this.positionManager && typeof this.positionManager.getOpenPositions === 'function') {
        this.status.activePositions = this.positionManager.getOpenPositions().filter(p => p.status !== 'closed').length;
    } else {
        this.status.activePositions = 0;
    }
    this.status.withdrawn = dataStore.get('totalWithdrawnAmount') || 0;

    // Логика обновления tradingPairs из старого updateStatus
    if (this.positionManager && typeof this.positionManager.getOpenPositions === 'function' && Array.isArray(this.config.tradingPairs)) {
        const openPositionsFromPM = this.positionManager.getOpenPositions();
        const tradingPairsInfo = [];
        const activePairSymbols = new Set();

        for (const position of openPositionsFromPM) {
            if (position.status !== 'closed') {
                let timeString = '00:00';
                if (position.entryTime) {
                    const durationMs = now - position.entryTime;
                    if (!isNaN(durationMs) && durationMs >=0) timeString = this.formatDuration(durationMs);
                }
                tradingPairsInfo.push({
                    pair: position.symbol, status: 'active', position: position.type,
                    entryPrice: position.entryPrice, currentPrice: this.currentPrice[position.symbol] || position.currentPrice || 0,
                    profit: position.pnlPercentage || 0, time: timeString, id: position.id
                });
                activePairSymbols.add(position.symbol);
            }
        }
        for (const symbol of this.config.tradingPairs) {
            if (!activePairSymbols.has(symbol)) {
                tradingPairsInfo.push({
                    pair: symbol, status: 'waiting', position: null, profit: 0, time: '00:00',
                    signals: (this.indicatorManager && typeof this.indicatorManager.getSignalCount === 'function') ? this.indicatorManager.getSignalCount(symbol) || 0 : 0
                });
            }
        }
        dataStore.set('tradingPairs', tradingPairsInfo);
    }

    if (this.strategy && typeof this.strategy.getRecentSignals === 'function') {
        const recentSignals = this.strategy.getRecentSignals();
        dataStore.set('recentSignals', recentSignals);
    }

    dataStore.set('botStatus', this.status);
    this.emit('statusUpdate', this.status); // Используем 'statusUpdate' как в более новых версиях
    return this.status;
  }


  handleClosedTrade(tradeData) { // tradeData должен содержать pnlUSDT или pnl в валюте баланса
    // ... (код из вашего полного предыдущего ответа)
    logger.info(`Обработка закрытой сделки: Symbol=${tradeData.symbol}, PNL=${(tradeData.pnlUSDT || tradeData.pnl || 0).toFixed(2)}`);
    if (this.dailyPerformance.activeDay) {
        this.dailyPerformance.tradesToday++;
        if ((tradeData.pnlUSDT || tradeData.pnl || 0) > 0) this.dailyPerformance.winsToday++;
        else this.dailyPerformance.lossesToday++;
    }
    this.balance += (tradeData.pnlUSDT || tradeData.pnl || 0);

    if (typeof this.updateStatus === 'function') this.updateStatus(); // Переименовано
    if (typeof this.handleReinvestmentAndWithdrawal === 'function') this.handleReinvestmentAndWithdrawal();
    if (typeof this.logBalanceHistory === 'function') this.logBalanceHistory();
    this.emit('tradeClosed', tradeData);
  }

  handleReinvestmentAndWithdrawal() {
    // ... (код из вашего полного предыдущего ответа)
    if (!this.reinvestmentInfo.enabled) return;
    const currentAbsoluteProfit = this.balance - this.initialBalance;

    if (this.reinvestmentInfo.percentage > 0 && currentAbsoluteProfit > this.reinvestmentInfo.lastProfitCheck) {
        const profitSinceLastCheck = currentAbsoluteProfit - this.reinvestmentInfo.lastProfitCheck;
        if (profitSinceLastCheck > 0) {
            logger.info(`Проверка реинвестирования: текущая прибыль ${currentAbsoluteProfit.toFixed(2)}, предыдущая ${this.reinvestmentInfo.lastProfitCheck.toFixed(2)}.`);
            this.reinvestmentInfo.lastProfitCheck = currentAbsoluteProfit;
        }
    }
    if (this.reinvestmentInfo.withdrawalPercentage > 0 && currentAbsoluteProfit >= this.reinvestmentInfo.withdrawalThreshold) {
        const profitOverThreshold = currentAbsoluteProfit - this.reinvestmentInfo.withdrawalThreshold;
        const amountToWithdraw = profitOverThreshold * (this.reinvestmentInfo.withdrawalPercentage / 100);
        if (amountToWithdraw > 0.01) {
            const oldInitialBalance = this.initialBalance;
            this.balance -= amountToWithdraw;
            this.initialBalance -= amountToWithdraw;
            const totalWithdrawnSoFar = (dataStore.get('totalWithdrawnAmount') || 0) + amountToWithdraw;
            dataStore.set('totalWithdrawnAmount', totalWithdrawnSoFar);
            dataStore.set('initialBalance', this.initialBalance);
            logger.info(`СИМУЛЯЦИЯ ВЫВОДА СРЕДСТВ: ${amountToWithdraw.toFixed(2)} USDT.`);
            this.reinvestmentInfo.lastProfitCheck = this.balance - this.initialBalance;
            this.emit('fundsWithdrawn', { amount: amountToWithdraw, newBalance: this.balance, newInitialBalance: this.initialBalance });
        }
    }
  }

  handleDailyResetAndPerformance(forceReset = false) {
    // ... (код из вашего старого файла или из полного ответа)
    // В вашем старом коде этот метод назывался checkAndUpdateDailyStats
    const today = new Date().toISOString().slice(0, 10);

    if (this.dailyPerformance.lastDayProcessed !== today || forceReset) {
      if (this.dailyPerformance.activeDay && !forceReset && this.dailyPerformance.lastDayProcessed) {
        if (typeof this.saveDailyPerformance === 'function') this.saveDailyPerformance(); // Сохраняем перед сбросом
      }
      if (typeof this.resetDailyPerformance === 'function') this.resetDailyPerformance(); // Сбрасываем/начинаем новый день
      this.dailyPerformance.lastDayProcessed = today; // Устанавливаем после сброса
      logger.info(`Дневная статистика обработана/сброшена для дня: ${today}`);
      this.emit('dailyReset', this.dailyPerformance);
    }
  }

  logBalanceHistory() {
    // ... (код из вашего старого файла или из полного ответа)
    let history = dataStore.get('balanceHistory') || [];
    const nowISO = new Date().toISOString();
    const entry = {
      date: nowISO,
      balance: this.balance,
      profit: this.balance - this.initialBalance,
      profitPercentage: this.initialBalance > 0 ? ((this.balance - this.initialBalance) / this.initialBalance) * 100 : 0,
    };
    const balanceLogIntervalMs = (this.config.intervals?.balanceLogIntervalMs || 1800000); // 30 мин по умолчанию
    const lastEntryTime = history.length > 0 ? new Date(history[history.length - 1].date).getTime() : 0;
    const currentTime = new Date(nowISO).getTime();

    if (history.length === 0 || (currentTime - lastEntryTime > balanceLogIntervalMs) ) {
      history.push(entry);
      const maxEntries = this.config.maxBalanceHistoryEntries || 48 * 7;
      if (history.length > maxEntries) {
        history.shift();
      }
    } else {
      history[history.length - 1] = entry;
    }
    dataStore.set('balanceHistory', history);
  }


  // Методы из вашего старого файла, которые могут быть полезны или нужны
  async clearDemoData() { /* ... (ваша реализация) ... */
    try {
      logger.info('Очистка демо-данных (если применимо)...');
      this.positionManager.positionHistory = [];
      if (this.strategy && this.strategy.signalsLog) this.strategy.signalsLog = []; else if (this.strategy && this.strategy.signals) this.strategy.signals = [];
      dataStore.set('recentSignals', []);
      dataStore.set('tradeHistory', []); // Это должно быть positionHistory
      dataStore.set('positionHistory', []); // Явный сброс
      dataStore.set('balanceHistory', [{
        date: new Date().toISOString(), balance: this.initialBalance,
        profit: 0, profitPercentage: 0
      }]);
      dataStore.set('performanceHistory', []);
      dataStore.set('totalWithdrawnAmount', 0);

      this.status.totalProfit = 0; this.status.profitPercentage = 0;
      this.status.todayProfit = 0; this.status.todayProfitPercentage = 0;
      this.status.winRate = 0; this.status.totalTrades = 0;
      this.status.avgProfit = 0; this.status.withdrawn = 0;
      this.reinvestmentInfo.totalWithdrawn = 0;
      this.reinvestmentInfo.lastProfitCheck = 0;

      if (typeof this.resetDailyPerformance === 'function') this.resetDailyPerformance(true); // Сбрасываем с текущим балансом
      logger.info('Демо-данные (история) очищены.');
    } catch (error) {
      logger.error('Ошибка при очистке демо-данных: ' + error.message);
    }
  }

  resetDailyPerformance(forceCurrentBalanceAsStart = false) { // Добавлен аргумент из вашего старого кода
    // ... (код из вашего старого файла)
    this.dailyPerformance = {
      startBalance: forceCurrentBalanceAsStart ? this.balance : this.dailyPerformance.startBalance, // Используем текущий баланс при форсированном сбросе
      currentBalance: this.balance,
      tradesToday: 0, // trades -> tradesToday
      winsToday: 0,   // winCount -> winsToday
      lossesToday: 0, // lossCount -> lossesToday
      startTime: new Date().getTime(),
      activeDay: true,
      lastDayProcessed: this.dailyPerformance.lastDayProcessed // Сохраняем, если это не форсированный сброс нового дня
    };
    if (forceCurrentBalanceAsStart) { // Если это начало нового дня или полный сброс
        this.dailyPerformance.lastDayProcessed = new Date().toISOString().slice(0,10);
    }
  }

  saveDailyPerformance() { /* ... (ваша реализация из старого файла, адаптированная) ... */
    try {
      if (!this.dailyPerformance.activeDay || !this.dailyPerformance.lastDayProcessed) {
        // logger.debug('Нет активного дня для сохранения дневной статистики.');
        return;
      }
      const dailyPnl = this.balance - this.dailyPerformance.startBalance;
      const tradesForTheDay = this.dailyPerformance.tradesToday;
      const winRateForTheDay = tradesForTheDay > 0 ? (this.dailyPerformance.winsToday / tradesForTheDay) * 100 : 0;

      const performanceData = {
        date: this.dailyPerformance.lastDayProcessed,
        startBalance: this.dailyPerformance.startBalance,
        endBalance: this.balance, // Используем текущий баланс как конечный для дня
        profit: dailyPnl,
        profitPercentage: this.dailyPerformance.startBalance > 0 ? (dailyPnl / this.dailyPerformance.startBalance) * 100 : 0,
        trades: tradesForTheDay,
        winRate: winRateForTheDay,
        wins: this.dailyPerformance.winsToday,
        losses: this.dailyPerformance.lossesToday,
        // endTime: new Date().getTime(), // Можно добавить, если нужно точное время сохранения
      };
      
      // Добавляем в историю, избегая дубликатов по дате
      let history = dataStore.get('performanceHistory') || [];
      const existingEntryIndex = history.findIndex(h => h.date === performanceData.date);
      if (existingEntryIndex !== -1) {
          history[existingEntryIndex] = performanceData; // Обновляем
      } else {
          history.push(performanceData);
      }
      if (history.length > 90) history.shift();
      dataStore.set('performanceHistory', history);
      
      logger.info(`Сохранена дневная статистика для ${performanceData.date}`);
    } catch (error) {
      logger.error(`Ошибка при сохранении дневной статистики: ${error.message}`);
    }
  }

  saveTradeHistory() { /* ... (ваша реализация) ... */
    try {
      if (this.positionManager && typeof this.positionManager.getPositionHistory === 'function') {
        dataStore.set('positionHistory', this.positionManager.getPositionHistory()); // Имя ключа dataStore
      }
      if (typeof this.logBalanceHistory === 'function') this.logBalanceHistory(); // Обновляем историю баланса тоже
      logger.info('История сделок (позиций) сохранена.');
    } catch (error) {
      logger.error(`Ошибка при сохранении истории сделок: ${error.message}`);
    }
  }

  formatDuration(ms) { /* ... (ваша реализация) ... */
    try {
        if (isNaN(ms) || ms < 0) return "00:00";
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor(ms / (1000 * 60 * 60));
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } catch (error) {
        logger.error(`Ошибка форматирования длительности: ${error.message}`); return "00:00";
    }
  }
 // Функция расчета рейтинга пары для сканирования
  calculatePairScore(volume24h, totalFractals, priceChangePercent, trendStrength, isBullishTrend) {
    // Базовый score
    let score = 50;
    
    // Увеличиваем score при высоком объеме (0-20 баллов)
    if (volume24h > 1000000000) { // Больше 1 млрд
      score += 20;
    } else if (volume24h > 500000000) { // Больше 500 млн
      score += 15;
    } else if (volume24h > 100000000) { // Больше 100 млн
      score += 10;
    } else if (volume24h > 50000000) { // Больше 50 млн
      score += 5;
    }
    
    // Увеличиваем score при большом количестве фракталов (0-15 баллов)
    score += Math.min(totalFractals * 3, 15);
    
    // Увеличиваем score при сильном тренде (0-15 баллов)
    score += Math.min(trendStrength * 3, 15);
    
    // Увеличиваем score при значительном изменении цены (0-10 баллов)
    const absPriceChange = Math.abs(priceChangePercent);
    if (absPriceChange > 5) {
      score += 10;
    } else if (absPriceChange > 3) {
      score += 7;
    } else if (absPriceChange > 1) {
      score += 5;
    } else if (absPriceChange > 0.5) {
      score += 3;
    }
    
    // Добавляем бонус для восходящего тренда (если выключен, переход на медвежий режим)
    if (isBullishTrend) {
      score += 5;
    }
    
    // Добавляем случайный фактор для разнообразия (0-5 баллов)
    score += Math.random() * 5;
    
    // Ограничиваем max score до 100
    return Math.min(Math.max(score, 1), 100);
  }
  
  // Функция для форматирования объема
  formatVolume(volume) {
    if (volume >= 1000000000) {
      return (volume / 1000000000).toFixed(2) + 'B';
    } else if (volume >= 1000000) {
      return (volume / 1000000).toFixed(2) + 'M';
    } else if (volume >= 1000) {
      return (volume / 1000).toFixed(2) + 'K';
    } else {
      return volume.toFixed(2);
    }
  }
  
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
  // getPnlData, getPerformanceHistory, getStatus, updateConfig - уже были в более новой версии,
  // их можно взять оттуда или адаптировать вашу старую логику.
  // Я оставил реализации из предыдущего полного ответа, т.к. они более полные.
  getPnlData() {
    const balanceHistory = dataStore.get('balanceHistory') || [];
    return balanceHistory.map(entry => ({
      date: entry.date,
      pnl: entry.profitPercentage
    }));
  }

  getPerformanceHistory() {
      return dataStore.get('performanceHistory') || [];
  }

  getStatus() {
    if(typeof this.updateStatus === 'function') this.updateStatus();
    return this.status;
  }

  updateConfig(newConfig) {
    const oldTradingPairs = new Set(this.config.tradingPairs || []);
    
    this.config = { ...this.config, ...newConfig };
    logger.info('Конфигурация TradingBot обновлена.');

    if (this.indicatorManager && typeof this.indicatorManager.updateConfig === 'function') this.indicatorManager.updateConfig(this.config);
    if (this.positionManager && typeof this.positionManager.updateConfig === 'function') this.positionManager.updateConfig(this.config);
    if (this.strategy && typeof this.strategy.updateConfig === 'function') this.strategy.updateConfig(this.config);

    this.reinvestmentInfo.enabled = this.config.reinvestment !== undefined ? this.config.reinvestment > 0 : this.reinvestmentInfo.enabled;
    this.reinvestmentInfo.percentage = this.config.reinvestment !== undefined ? this.config.reinvestment : this.reinvestmentInfo.percentage;
    this.reinvestmentInfo.withdrawalThreshold = this.config.withdrawalThreshold || this.reinvestmentInfo.withdrawalThreshold;
    this.reinvestmentInfo.withdrawalPercentage = this.config.withdrawalPercentage || this.reinvestmentInfo.withdrawalPercentage;

    this.status.tradingPairs = this.config.tradingPairs || [];
    const newTradingPairs = new Set(this.config.tradingPairs || []);

    const addedPairs = [...newTradingPairs].filter(p => !oldTradingPairs.has(p));
    const actualRemovedPairs = [...oldTradingPairs].filter(p => !newTradingPairs.has(p)); // Исправленное определение

    if (addedPairs.length > 0 && this.indicatorManager && typeof this.indicatorManager.initialize === 'function') { // Используем initialize
        logger.info(`Добавлены новые торговые пары: ${addedPairs.join(', ')}. Инициализация индикаторов...`);
        this.indicatorManager.initialize(this.client, addedPairs); // Передаем client
    }
    if (actualRemovedPairs.length > 0) {
        logger.info(`Удалены торговые пары: ${actualRemovedPairs.join(', ')}.`);
        actualRemovedPairs.forEach(pair => delete this.currentPrice[pair]);
        if (this.indicatorManager && typeof this.indicatorManager.removeIndicatorsForPairs === 'function') { // Проверяем наличие метода
            this.indicatorManager.removeIndicatorsForPairs(actualRemovedPairs);
        }
    }

    if (this.isRunning()) {
      logger.info('Перезапуск интервалов из-за изменения конфигурации...');
      this.intervals.forEach(clearInterval);
      this.intervals = [];
      this.startIntervals();
    }
    this.emit('configUpdated', this.config);
  }
}

module.exports = TradingBot;