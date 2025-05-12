// src/bot/strategy/FractalStrategy.js
const logger = require('../../utils/logger');

class FractalStrategy {
  constructor(config, indicatorManager, positionManager) {
    this.config = config;
    this.indicatorManager = indicatorManager;
    this.positionManager = positionManager;
    this.client = null;
    this.signals = [];
    this.maxSignals = 50; // Максимальное количество сигналов в истории
  }

  setClient(client) {
    this.client = client;
  }

  updateConfig(newConfig) {
    this.config = Object.assign({}, this.config, newConfig);
  }

  // Основные методы стратегии с реальной логикой
  async execute() {
    try {
      // Если у бота нет клиента API, прерываем выполнение
      if (!this.client) {
        logger.warn('Не удалось выполнить стратегию: отсутствует клиент API');
        return false;
      }

      // Проверяем количество открытых позиций
      const openPositions = this.positionManager.getOpenPositions();
      if (openPositions.length >= this.config.riskManagement.maxOpenPositions) {
        logger.info('Достигнуто максимальное количество открытых позиций (' + this.config.riskManagement.maxOpenPositions + ')');
        return false;
      }

      // Получаем все сигналы для торговых пар
      const allSignals = [];
      
      for (const symbol of this.config.tradingPairs) {
        // Проверяем, есть ли уже открытая позиция для этой пары
        const hasOpenPosition = openPositions.some(p => p.symbol === symbol);
        if (hasOpenPosition) continue;
        
        // Получаем индикаторы для анализа
        const indicators = this.indicatorManager.getIndicators(symbol);
        if (!indicators) continue;
        
        // Анализируем индикаторы и получаем сигналы
        const signal = this.analyzeForSignals(symbol, indicators);
        if (signal) {
          allSignals.push(signal);
          
          // Добавляем сигнал в историю
          this.addSignalToHistory(signal);
          
          // Если сигнал сильный, открываем позицию
          if (signal.strength >= 70) {
            logger.info(`Сильный сигнал (${signal.strength}) для ${symbol}: ${signal.type}`);
            
            const ticker = await this.client.getTicker(symbol);
            if (!ticker || !ticker.data || !ticker.data.last) {
              logger.warn(`Не удалось получить текущую цену для ${symbol}`);
              continue;
            }
            
            const currentPrice = parseFloat(ticker.data.last);
            
            // Открываем позицию
            await this.positionManager.openPosition(
              signal.type,
              symbol,
              currentPrice,
              signal.reason,
              signal.strength
            );
          }
        }
      }
      
      return allSignals.length > 0;
    } catch (error) {
      logger.error('Ошибка при выполнении стратегии: ' + error.message);
      return false;
    }
  }

  analyzeForSignals(symbol, indicators) {
    try {
      // Получаем необходимые данные из индикаторов
      const { candles, ema, fractals, pacChannel } = indicators;
      
      if (!candles || candles.length < 20 || !ema || !fractals || !pacChannel) {
        return null;
      }
      
      const lastCandle = candles[candles.length - 1];
      const prevCandle = candles[candles.length - 2];
      
      // Индексы для быстрого доступа к индикаторам
      const last = candles.length - 1;
      const fastEMA = ema.fast;
      const mediumEMA = ema.medium;
      
      // Получаем данные PAC канала
      const upperPAC = pacChannel.upper[last];
      const lowerPAC = pacChannel.lower[last];
      
      // Проверяем различные условия для сигналов
      
      // СИГНАЛ 1: Фрактальный прорыв + EMA подтверждение
      let buySignal = false;
      let sellSignal = false;
      let strength = 0;
      let reason = '';
      
      // Проверка на покупку
      if (fastEMA[last] > mediumEMA[last] && // Быстрая EMA выше средней (восходящий тренд)
          lastCandle.close > upperPAC && // Цена закрытия выше верхней границы PAC канала
          prevCandle.close <= upperPAC && // Предыдущая свеча была ниже границы (прорыв)
          fractals.buyFractals.length > 0) { // Есть фракталы покупки
        
        buySignal = true;
        strength = this.calculateSignalStrength(
          fastEMA[last] - mediumEMA[last], // Разница между EMA
          (lastCandle.close - upperPAC) / upperPAC * 100, // % прорыва PAC канала
          fractals.buyFractals.length, // Количество фракталов
          true // Направление
        );
        
        reason = 'Прорыв верхней границы PAC канала + фрактальный сигнал покупки';
      }
      
      // Проверка на продажу
      else if (fastEMA[last] < mediumEMA[last] && // Быстрая EMA ниже средней (нисходящий тренд)
               lastCandle.close < lowerPAC && // Цена закрытия ниже нижней границы PAC канала
               prevCandle.close >= lowerPAC && // Предыдущая свеча была выше границы (прорыв)
               fractals.sellFractals.length > 0) { // Есть фракталы продажи
        
        sellSignal = true;
        strength = this.calculateSignalStrength(
          mediumEMA[last] - fastEMA[last], // Разница между EMA
          (lowerPAC - lastCandle.close) / lowerPAC * 100, // % прорыва PAC канала
          fractals.sellFractals.length, // Количество фракталов
          false // Направление
        );
        
        reason = 'Прорыв нижней границы PAC канала + фрактальный сигнал продажи';
      }
      
      // СИГНАЛ 2: Пуллбэк к EMA после тренда
      else if (fastEMA[last] > mediumEMA[last] && // Восходящий тренд
               Math.abs(lastCandle.close - fastEMA[last]) / fastEMA[last] * 100 < 0.5 && // Цена близка к быстрой EMA (пуллбэк)
               lastCandle.low > fastEMA[last] && // Нижняя тень свечи выше быстрой EMA (отбой)
               this.checkPullbackPattern(candles, fastEMA, true)) { // Проверка паттерна пуллбэка
        
        buySignal = true;
        strength = 65 + (Math.random() * 10); // Базовая сила + случайная вариация
        reason = 'Пуллбэк к быстрой EMA в восходящем тренде';
      }
      
      else if (fastEMA[last] < mediumEMA[last] && // Нисходящий тренд
               Math.abs(lastCandle.close - fastEMA[last]) / fastEMA[last] * 100 < 0.5 && // Цена близка к быстрой EMA (пуллбэк)
               lastCandle.high < fastEMA[last] && // Верхняя тень свечи ниже быстрой EMA (отбой)
               this.checkPullbackPattern(candles, fastEMA, false)) { // Проверка паттерна пуллбэка
        
        sellSignal = true;
        strength = 65 + (Math.random() * 10); // Базовая сила + случайная вариация
        reason = 'Пуллбэк к быстрой EMA в нисходящем тренде';
      }
      
      // Если есть сигнал, создаем и возвращаем его
      if (buySignal || sellSignal) {
        const signal = {
          pair: symbol,
          type: buySignal ? 'BUY' : 'SELL',
          strength: Math.round(strength),
          time: new Date().getTime(),
          price: lastCandle.close,
          reason: reason,
          status: 'pending'
        };
        
        return signal;
      }
      
      return null;
    } catch (error) {
      logger.error('Ошибка при анализе сигналов для ' + symbol + ': ' + error.message);
      return null;
    }
  }
  
  // Вспомогательный метод для расчета силы сигнала
  calculateSignalStrength(emaDiff, breakoutPercent, fractalCount, isBuy) {
    // Базовая сила сигнала
    let strength = 60;
    
    // Добавляем силу в зависимости от разницы EMA (тренд)
    const normalizedEMADiff = Math.min(emaDiff * 100, 5); // Ограничиваем до 5%
    strength += normalizedEMADiff * 2; // Максимум +10 к силе
    
    // Добавляем силу в зависимости от процента прорыва
    const normalizedBreakout = Math.min(breakoutPercent, 3); // Ограничиваем до 3%
    strength += normalizedBreakout * 3; // Максимум +9 к силе
    
    // Добавляем силу в зависимости от количества фракталов
    const normalizedFractals = Math.min(fractalCount, 5); // Ограничиваем до 5
    strength += normalizedFractals * 2; // Максимум +10 к силе
    
    // Добавляем случайность для вариации сигналов
    strength += (Math.random() * 6) - 3; // От -3 до +3
    
    // Ограничиваем итоговую силу
    return Math.min(Math.max(strength, 50), 95);
  }
  
  // Вспомогательный метод для проверки паттерна пуллбэка
  checkPullbackPattern(candles, ema, isBuy) {
    const lookback = this.config.pullbackLookback || 3;
    const last = candles.length - 1;
    
    if (last < lookback) return false;
    
    let distanceIncreasing = true;
    
    for (let i = 2; i <= lookback; i++) {
      const currDistance = Math.abs(candles[last].close - ema[last]);
      const prevDistance = Math.abs(candles[last - i].close - ema[last - i]);
      
      if (currDistance >= prevDistance) {
        distanceIncreasing = false;
        break;
      }
    }
    
    return distanceIncreasing;
  }

  addSignalToHistory(signal) {
    // Добавляем сигнал в историю
    this.signals.unshift(signal);
    
    // Ограничиваем размер истории
    if (this.signals.length > this.maxSignals) {
      this.signals = this.signals.slice(0, this.maxSignals);
    }
  }

  getRecentSignals(limit) {
    limit = limit || 5;
    
    const signals = this.signals.slice();
    
    // Конвертируем метку времени в более читаемый формат
    const formattedSignals = signals.slice(0, limit).map(function(signal) {
      const now = new Date().getTime();
      const signalTime = signal.time;
      const diffInMs = now - signalTime;
      
      let timeString;
      if (diffInMs < 60000) { // меньше минуты
        timeString = Math.floor(diffInMs / 1000) + ' сек назад';
      } else if (diffInMs < 3600000) { // меньше часа
        timeString = Math.floor(diffInMs / 60000) + ' мин назад';
      } else {
        timeString = Math.floor(diffInMs / 3600000) + 'ч ' + Math.floor((diffInMs % 3600000) / 60000) + 'м назад';
      }
      
      return Object.assign({}, signal, {
        time: timeString
      });
    });
    
    return formattedSignals;
  }
}

module.exports = FractalStrategy;