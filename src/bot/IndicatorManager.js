// src/bot/IndicatorManager.js
const logger = require('../utils/logger');

class IndicatorManager {
  constructor(config) {
    this.config = config;
    this.indicators = {};
    this.historicalData = {};
    this.signalCount = {};
    this.client = null;
  }

  updateConfig(newConfig) {
    this.config = Object.assign({}, this.config, newConfig);
  }

  setClient(client) {
    this.client = client;
  }

  async initialize(client, symbols) {
    try {
      this.client = client; // Сохраняем клиента для использования в других методах

      for (const symbol of symbols) {
        // Получаем исторические данные для расчета индикаторов
        await this.loadHistoricalData(client, symbol);
        
        // Рассчитываем все индикаторы
        await this.calculateAllIndicators(symbol);
      }
      
      logger.info('Инициализация индикаторов завершена');
      return true;
    } catch (error) {
      logger.error('Ошибка при инициализации индикаторов: ' + error.message);
      throw error;
    }
  }

  async loadHistoricalData(client, symbol) {
    try {
      // Получаем исторические свечи с временным интервалом 3 минут
      const candles = await client.getCandles(symbol, '3m', 200);
      
      if (!candles || !candles.data || candles.data.length === 0) {
        logger.warn('Не удалось загрузить исторические данные для ' + symbol);
        return false;
      }
      
      // Преобразуем данные свечей в нужный формат
      this.historicalData[symbol] = candles.data.map(function(candle) {
        return {
          time: parseInt(candle[0]),
          open: parseFloat(candle[1]),
          high: parseFloat(candle[2]),
          low: parseFloat(candle[3]),
          close: parseFloat(candle[4]),
          volume: parseFloat(candle[5])
        };
      });
      
      logger.info('Загружено ' + this.historicalData[symbol].length + ' исторических свечей для ' + symbol);
      return true;
    } catch (error) {
      logger.error('Ошибка при загрузке исторических данных для ' + symbol + ': ' + error.message);
      return false;
    }
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

  // Метод для расчета всех индикаторов
  async calculateAllIndicators(symbol) {
    try {
      if (!this.historicalData[symbol] || this.historicalData[symbol].length === 0) {
        logger.warn(`Нет исторических данных для ${symbol}`);
        return false;
      }
      
      const candles = this.historicalData[symbol];
      
      // Рассчитываем Heikin Ashi свечи, если включено
      const processedCandles = this.config.useHAcandles ? 
        this.calculateHeikinAshi(candles) : candles;
      
      // Рассчитываем EMA
      const fastEMA = this.calculateEMA(processedCandles, this.config.fastEMAlength || 89);
      const mediumEMA = this.calculateEMA(processedCandles, this.config.mediumEMAlength || 200);
      const slowEMA = this.calculateEMA(processedCandles, this.config.slowEMAlength || 600);
      
      // Рассчитываем фракталы
      const fractals = this.calculateFractals(processedCandles);
      
      // Рассчитываем PAC канал
      const pacChannel = this.calculatePAC(processedCandles, this.config.pacLength || 34);
      
      // Сохраняем все индикаторы
      this.indicators[symbol] = {
        candles: processedCandles,
        ema: {
          fast: fastEMA,
          medium: mediumEMA,
          slow: slowEMA
        },
        fractals: fractals,
        pacChannel: pacChannel,
        lastUpdate: new Date().getTime()
      };
      
      // Обновляем счетчик сигналов
      if (!this.signalCount[symbol]) {
        this.signalCount[symbol] = fractals.buyFractals.length + fractals.sellFractals.length;
      }
      
      logger.info(`Индикаторы для ${symbol} успешно рассчитаны`);
      return true;
    } catch (error) {
      logger.error(`Ошибка при расчете индикаторов для ${symbol}: ${error.message}`);
      return false;
    }
  }

  // Метод для обновления индикаторов
  async updateIndicators() {
    try {
      if (!this.client) {
        logger.warn('Не удалось обновить индикаторы: отсутствует клиент API');
        return false;
      }
      
      for (const symbol of Object.keys(this.indicators)) {
        await this.loadHistoricalData(this.client, symbol);
        await this.calculateAllIndicators(symbol);
      }
      
      return true;
    } catch (error) {
      logger.error(`Ошибка при обновлении индикаторов: ${error.message}`);
      return false;
    }
  }

  // Метод для обновления исторических данных
  async updateHistoricalData(client, symbols) {
    try {
      for (const symbol of symbols) {
        await this.loadHistoricalData(client, symbol);
      }
      return true;
    } catch (error) {
      logger.error(`Ошибка при обновлении исторических данных: ${error.message}`);
      return false;
    }
  }

  // Основные методы для расчета индикаторов
  calculateHeikinAshi(candles) {
    const haCandles = [];
    
    for (let i = 0; i < candles.length; i++) {
      const current = candles[i];
      const prevHA = i > 0 ? haCandles[i - 1] : null;
      
      // Расчет Heikin Ashi свечи
      const haOpen = prevHA ? (prevHA.open + prevHA.close) / 2 : current.open;
      const haClose = (current.open + current.high + current.low + current.close) / 4;
      const haHigh = Math.max(current.high, haOpen, haClose);
      const haLow = Math.min(current.low, haOpen, haClose);
      
      haCandles.push({
        time: current.time,
        open: haOpen,
        high: haHigh,
        low: haLow,
        close: haClose,
        volume: current.volume
      });
    }
    
    return haCandles;
  }

  calculateEMA(candles, period) {
    const prices = candles.map(function(candle) { return candle.close; });
    const ema = [];
    const multiplier = 2 / (period + 1);
    
    // Инициализация EMA с SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += prices[i];
    }
    ema.push(sum / period);
    
    // Расчет EMA для оставшихся точек
    for (let i = 1; i < prices.length; i++) {
      ema.push((prices[i] - ema[i - 1]) * multiplier + ema[i - 1]);
    }
    
    return ema;
  }

  calculateFractals(candles) {
    const buyFractals = [];
    const sellFractals = [];
    
    // Используем Билла Вильямса фракталы, если не указано иное
    const useBWFractals = !this.config.useRegularFractals;
    
    // Проверяем наличие достаточного количества свечей
    if (candles.length < 5) {
      return { buyFractals, sellFractals };
    }
    
    for (let i = 2; i < candles.length - 2; i++) {
      // Фрактал вверх (Buy Fractal)
      if (useBWFractals) {
        if (candles[i - 2].low > candles[i].low && 
            candles[i - 1].low >= candles[i].low && 
            candles[i].low <= candles[i + 1].low && 
            candles[i].low < candles[i + 2].low) {
          buyFractals.push({
            index: i,
            price: candles[i].low,
            time: candles[i].time,
            type: 'buy'
          });
        }
      } else {
        if (candles[i - 2].low > candles[i - 1].low && 
            candles[i - 1].low > candles[i].low && 
            candles[i].low < candles[i + 1].low && 
            candles[i + 1].low < candles[i + 2].low) {
          buyFractals.push({
            index: i,
            price: candles[i].low,
            time: candles[i].time,
            type: 'buy'
          });
        }
      }
      
      // Фрактал вниз (Sell Fractal)
      if (useBWFractals) {
        if (candles[i - 2].high < candles[i].high && 
            candles[i - 1].high <= candles[i].high && 
            candles[i].high >= candles[i + 1].high && 
            candles[i].high > candles[i + 2].high) {
          sellFractals.push({
            index: i,
            price: candles[i].high,
            time: candles[i].time,
            type: 'sell'
          });
        }
      } else {
        if (candles[i - 2].high < candles[i - 1].high && 
            candles[i - 1].high < candles[i].high && 
            candles[i].high > candles[i + 1].high && 
            candles[i + 1].high > candles[i + 2].high) {
          sellFractals.push({
            index: i,
            price: candles[i].high,
            time: candles[i].time,
            type: 'sell'
          });
        }
      }
    }
    
    return { buyFractals, sellFractals };
  }

  getSignalCount(symbol) {
    return this.signalCount[symbol] || 0;
  }

  getIndicators(symbol) {
    return this.indicators[symbol] || null;
  }
}

module.exports = IndicatorManager;