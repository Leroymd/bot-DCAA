// src/bot/IndicatorManager.js
const logger = require('../utils/logger');

class IndicatorManager {
  // Статичные/дефолтные настройки для индикаторов
  static DEFAULT_SETTINGS = {
    candleTimeframe: "3m", // <--- СТАТИЧНЫЙ ТАЙМФРЕЙМ
    candleLimit: 200,      // <--- СТАТИЧНЫЙ ЛИМИТ СВЕЧЕЙ
    microTrendEmaPeriod: 9, // <--- СТАТИЧНЫЙ ПЕРИОД EMA ДЛЯ МИКРОТРЕНДА
    useHAcandles: false    // Пример другой настройки
  };

  constructor(config) { // config все еще может передаваться для других целей или для стратегии
    this.config = config; // Сохраняем общую конфигурацию бота
    this.indicators = {};
    this.client = null;

    // Используем статичные настройки или настройки из config, если они там ЕСТЬ и ПРЕДПОЧТИТЕЛЬНЫ
    // В данном случае, мы хотим сделать их статичными в файле, поэтому this.config для этих параметров игнорируется.
    this.indicatorSettings = {
        candleTimeframe: IndicatorManager.DEFAULT_SETTINGS.candleTimeframe,
        candleLimit: IndicatorManager.DEFAULT_SETTINGS.candleLimit,
        microTrendEmaPeriod: IndicatorManager.DEFAULT_SETTINGS.microTrendEmaPeriod,
        useHAcandles: IndicatorManager.DEFAULT_SETTINGS.useHAcandles
    };
    logger.info(`[IndicatorManager] Инициализирован со статичными настройками: Таймфрейм=${this.indicatorSettings.candleTimeframe}, Лимит свечей=${this.indicatorSettings.candleLimit}, EMA микротренда=${this.indicatorSettings.microTrendEmaPeriod}`);
  }

  setClient(client) {
    this.client = client;
  }

  updateConfig(newConfig) {
    // Обновляем общую конфигурацию, но наши внутренние настройки индикаторов остаются статичными
    this.config = { ...this.config, ...newConfig };
    logger.info('[IndicatorManager] Общая конфигурация обновлена. Настройки индикаторов остаются статичными.');
    // Если нужно принудительно пересчитать индикаторы из-за каких-то других изменений в newConfig:
    // if (this.client && (this.config.tradingPairs || []).length > 0) {
    //     logger.info('[IndicatorManager] Переинициализация индикаторов из-за обновления общей конфигурации...');
    //     this.initialize(this.client, this.config.tradingPairs || []);
    // }
  }

  async initialize(client, symbols) {
    if (!Array.isArray(symbols)) {
      const errorMsg = `[IndicatorManager.initialize] 'symbols' не является массивом. Получено: ${JSON.stringify(symbols)}`;
      logger.error(errorMsg);
      throw new TypeError(errorMsg);
    }
    this.client = client;
    logger.info(`[IndicatorManager] Инициализация индикаторов для пар: ${symbols.join(', ')}`);
    for (const symbol of symbols) {
      if (!this.indicators[symbol]) {
        this.indicators[symbol] = { candles: [], emaShort: [], fractals: { buyFractals: [], sellFractals: [] }, lastUpdate: 0 };
      }
      await this.loadHistoricalDataAndCalcIndicators(symbol);
    }
    logger.info('[IndicatorManager] Инициализация всех запрошенных индикаторов завершена.');
  }

  async loadHistoricalDataAndCalcIndicators(symbol) {
    try {
      if (!this.client) {
        logger.error(`[IndicatorManager] Клиент API не установлен для ${symbol}.`);
        this.indicators[symbol] = { candles: [], emaShort: [], fractals: { buyFractals: [], sellFractals: [] }, lastUpdate: 0 };
        return false;
      }

      const timeframe = this.indicatorSettings.candleTimeframe; // Используем статичную настройку
      const limit = this.indicatorSettings.candleLimit;         // Используем статичную настройку

      logger.debug(`[IndicatorManager] Загрузка ${limit} свечей ${timeframe} для ${symbol}...`);
      const candlesResponse = await this.client.getCandles(symbol, timeframe, limit);

      const minCandlesRequired = (this.config.strategySettings?.pureFractal?.fractalLookbackPeriod || 2) + 3;
      if (!candlesResponse || !candlesResponse.data || candlesResponse.data.length < minCandlesRequired) {
        logger.warn(`[IndicatorManager] Не удалось загрузить достаточно исторических данных для ${symbol} (таймфрейм: ${timeframe}, загружено: ${candlesResponse?.data?.length || 0}, нужно: ${minCandlesRequired}).`);
        if(this.indicators[symbol]) this.indicators[symbol].lastUpdate = new Date().getTime();
        else this.indicators[symbol] = { candles: [], emaShort: [], fractals: { buyFractals: [], sellFractals: [] }, lastUpdate: new Date().getTime() };
        return false;
      }

      const formattedCandles = candlesResponse.data.map(c => ({
        time: parseInt(c[0]), open: parseFloat(c[1]), high: parseFloat(c[2]),
        low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5])
      })).sort((a, b) => a.time - b.time);

      this.indicators[symbol] = {
        ...this.indicators[symbol],
        candles: formattedCandles,
        lastUpdate: new Date().getTime()
      };
      
      logger.info(`[IndicatorManager] Загружено ${formattedCandles.length} свечей ${timeframe} для ${symbol}.`);
      this.calculateAllForPair(symbol);
      return true;

    } catch (error) {
      logger.error(`[IndicatorManager] Ошибка при загрузке/обработке данных для ${symbol}: ${error.message}`, error.stack);
      if (!this.indicators[symbol]) {
          this.indicators[symbol] = { candles: [], emaShort: [], fractals: { buyFractals: [], sellFractals: [] }, lastUpdate: 0 };
      } else if (this.indicators[symbol]) {
          this.indicators[symbol].lastUpdate = new Date().getTime();
      }
      return false;
    }
  }

  calculateAllForPair(symbol) {
    if (!this.indicators[symbol] || !this.indicators[symbol].candles || this.indicators[symbol].candles.length === 0) {
      return;
    }
    const candles = this.indicators[symbol].candles;
    const processedCandles = this.indicatorSettings.useHAcandles ? this.calculateHeikinAshi(candles) : candles;

    const microTrendEmaPeriod = this.indicatorSettings.microTrendEmaPeriod; // Используем статичную настройку
    this.indicators[symbol].emaShort = this.calculateEMA(processedCandles, microTrendEmaPeriod);
    this.indicators[symbol].fractals = this.calculateFractals(processedCandles);

    this.indicators[symbol].lastUpdate = new Date().getTime();
    logger.debug(`[IndicatorManager] Индикаторы для ${symbol} рассчитаны (EMA${microTrendEmaPeriod}, Fractals). Свечей: ${processedCandles.length}`);
  }

  async updateAllIndicators(currentPrices, specificPair = null) {
    const pairsToUpdate = specificPair ? [specificPair] : (this.config.tradingPairs || []);
    for (const pair of pairsToUpdate) {
      await this.loadHistoricalDataAndCalcIndicators(pair);
    }
  }

  calculateEMA(candles, period) {
    // ... (реализация без изменений)
    if (!candles || candles.length === 0) return [];
    const prices = candles.map(c => c.close);
    if (prices.length < period) return new Array(prices.length).fill(NaN);
    const emaArray = new Array(prices.length).fill(NaN);
    const multiplier = 2 / (period + 1);
    let sma = 0;
    for (let i = 0; i < period; i++) sma += prices[i];
    let currentEma = sma / period;
    emaArray[period - 1] = currentEma;
    for (let i = period; i < prices.length; i++) {
      currentEma = (prices[i] - currentEma) * multiplier + currentEma;
      emaArray[i] = currentEma;
    }
    return emaArray;
  }

  calculateFractals(candles) {
    // ... (реализация без изменений)
    const buyFractals = []; const sellFractals = [];
    if (candles.length < 5) return { buyFractals, sellFractals };
    for (let i = 2; i < candles.length - 2; i++) {
      const isBuyFractal = candles[i].high > candles[i - 1].high && candles[i].high > candles[i - 2].high && candles[i].high > candles[i + 1].high && candles[i].high > candles[i + 2].high;
      if (isBuyFractal) buyFractals.push({ index: i, price: candles[i].high, time: candles[i].time, type: 'buy' });
      const isSellFractal = candles[i].low < candles[i - 1].low && candles[i].low < candles[i - 2].low && candles[i].low < candles[i + 1].low && candles[i].low < candles[i + 2].low;
      if (isSellFractal) sellFractals.push({ index: i, price: candles[i].low, time: candles[i].time, type: 'sell' });
    }
    return { buyFractals, sellFractals };
  }
  // Метод для расчета PAC канала
  calculatePAC(candles, period) {
    try {
      const highs = candles.map(candle => candle.high);
      const lows = candles.map(candle => candle.low);
      
      const upperPAC = [];
      const lowerPAC = [];
      
      // Рассчитываем верхний и нижний каналы
      for (let i = 0; i < candles.length; i++) {
        if (i < period - 1) {
          // Для первых точек используем все доступные данные
          const highestHigh = Math.max(...highs.slice(0, i + 1));
          const lowestLow = Math.min(...lows.slice(0, i + 1));
          
          upperPAC.push(highestHigh);
          lowerPAC.push(lowestLow);
        } else {
          // Для остальных точек используем период
          const highestHigh = Math.max(...highs.slice(i - period + 1, i + 1));
          const lowestLow = Math.min(...lows.slice(i - period + 1, i + 1));
          
          upperPAC.push(highestHigh);
          lowerPAC.push(lowestLow);
        }
      }
      
      return { upper: upperPAC, lower: lowerPAC };
    } catch (error) {
      logger.error(`Ошибка при расчете PAC: ${error.message}`);
      return { upper: [], lower: [] };
    }
  }
  calculateHeikinAshi(candles) {
    // ... (реализация без изменений)
    const haCandles = []; if (!candles || candles.length === 0) return haCandles;
    for (let i = 0; i < candles.length; i++) {
      const current = candles[i]; const prevHA = i > 0 ? haCandles[i - 1] : null;
      const haClose = (current.open + current.high + current.low + current.close) / 4;
      let haOpen = prevHA ? (prevHA.open + prevHA.close) / 2 : (current.open + current.close) / 2;
      const haHigh = Math.max(current.high, haOpen, haClose);
      const haLow = Math.min(current.low, haOpen, haClose);
      haCandles.push({ time: current.time, open: haOpen, high: haHigh, low: haLow, close: haClose, volume: current.volume });
    }
    return haCandles;
  }

  getIndicators(symbol) {
    return this.indicators[symbol] || { candles: [], emaShort: [], fractals: { buyFractals: [], sellFractals: [] }, lastUpdate: 0 };
  }

  removeIndicatorsForPairs(pairsToRemove = []) {
    pairsToRemove.forEach(pair => {
        delete this.indicators[pair];
        logger.info(`[IndicatorManager] Индикаторы для пары ${pair} удалены.`);
    });
  }

  getSignalCount(symbol) { // Пример
    const indicators = this.getIndicators(symbol);
    if (indicators && indicators.fractals) {
        return (indicators.fractals.buyFractals?.length || 0) + (indicators.fractals.sellFractals?.length || 0);
    }
    return 0;
  }
}

module.exports = IndicatorManager;
