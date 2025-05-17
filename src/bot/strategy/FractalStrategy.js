// src/bot/strategy/PureFractalStrategy.js
const logger = require('../../utils/logger');

class PureFractalStrategy {
  // Статичные/дефолтные настройки для стратегии
  static DEFAULT_SETTINGS = {
    fractalLookbackPeriod: 2,
    allowShorting: true,
    microTrendEmaPeriod: 9, // Этот параметр теперь берется из IndicatorManager.indicatorSettings
    requireMicroTrendConfirmation: true,
  };

  constructor(config, indicatorManager, positionManager) {
    this.config = config; // Общая конфигурация бота
    this.indicatorManager = indicatorManager;
    this.positionManager = positionManager;
    this.client = null;
    this.signalsLog = [];
    this.maxSignalsLog = this.config.maxSignalHistory || 50;

    // Используем статичные настройки стратегии
    this.strategySettings = {
      fractalLookbackPeriod: PureFractalStrategy.DEFAULT_SETTINGS.fractalLookbackPeriod,
      allowShorting: PureFractalStrategy.DEFAULT_SETTINGS.allowShorting,
      // microTrendEmaPeriod берем из indicatorSettings, так как он там рассчитывается
      microTrendEmaPeriod: this.indicatorManager.indicatorSettings.microTrendEmaPeriod,
      requireMicroTrendConfirmation: PureFractalStrategy.DEFAULT_SETTINGS.requireMicroTrendConfirmation,
    };
    logger.info(`[PureFractalStrategy] Инициализирована со статичными настройками: FractalLookback=${this.strategySettings.fractalLookbackPeriod}, AllowShorting=${this.strategySettings.allowShorting}, MicroTrendEMA=${this.strategySettings.microTrendEmaPeriod}, RequireMicroTrendConfirm=${this.strategySettings.requireMicroTrendConfirmation}`);

    this.lastActionedFractalTimestamp = {};
    this.lastDetectedFractalTimeCheckSignals = {}; // Для checkSignals, если используется отдельно
  }

  setClient(client) {
    this.client = client;
  }

  updateConfig(newConfig) {
    // Обновляем общую конфигурацию, но специфичные настройки стратегии остаются статичными
    this.config = { ...this.config, ...newConfig };
    // Важно: если какие-то из статичных настроек все же должны быть обновляемыми через newConfig,
    // то нужно добавить логику их слияния здесь.
    // Сейчас предполагается, что они жестко заданы.
    // Однако, если microTrendEmaPeriod изменился в IndicatorManager через его updateConfig,
    // то стратегия должна это подхватить, если IndicatorManager ее уведомит или стратегия сама проверит.
    // Проще всего, если IndicatorManager.indicatorSettings являются публичным свойством.
    this.strategySettings.microTrendEmaPeriod = this.indicatorManager.indicatorSettings.microTrendEmaPeriod;
    logger.info('[PureFractalStrategy] Общая конфигурация обновлена. Настройки стратегии остаются преимущественно статичными.');
  }

  _findRecentConfirmedFractal(symbol, fractalType, fractalsData, candles) {
    // ... (реализация без изменений, как в предыдущем ответе)
    const lastCandleIndex = candles.length - 1;
    const targetFractalOriginalIndex = lastCandleIndex - this.strategySettings.fractalLookbackPeriod;
    if (targetFractalOriginalIndex < 0) return null;
    const sourceFractals = fractalType === 'buy' ? fractalsData.buyFractals : fractalsData.sellFractals;
    const foundFractal = sourceFractals.find(f => f.index === targetFractalOriginalIndex);
    if (foundFractal) {
      const lastActionTime = this.lastActionedFractalTimestamp[symbol] || 0;
      if (foundFractal.time > lastActionTime) return foundFractal;
    }
    return null;
  }

  _checkMicroTrend(symbol, candles, emaShortValues, forBuySignal) {
    // ... (реализация без изменений, как в предыдущем ответе)
    if (!this.strategySettings.requireMicroTrendConfirmation) {
      logger.debug(`[PureFractalStrategy._checkMicroTrend for ${symbol}] Подтверждение микротренда отключено конфигом.`);
      return true;
    }
    if (!emaShortValues || emaShortValues.length < 2 || !candles || candles.length < 2) {
      logger.warn(`[PureFractalStrategy._checkMicroTrend for ${symbol}] Недостаточно данных (EMA: ${emaShortValues?.length}, Свечи: ${candles?.length}).`);
      return false;
    }
    const lastCandle = candles[candles.length - 1];
    const lastEma = emaShortValues[emaShortValues.length - 1];
    const prevEma = emaShortValues[emaShortValues.length - 2];
    if (isNaN(lastCandle.close) || isNaN(lastCandle.open) || isNaN(lastEma) || isNaN(prevEma)) {
        logger.warn(`[PureFractalStrategy._checkMicroTrend for ${symbol}] NaN значения в данных.`);
        return false;
    }
    let confirmed = false;
    if (forBuySignal) {
      confirmed = lastCandle.close > lastEma && lastEma > prevEma;
      logger.debug(`[MicroTrend BUY for ${symbol} @ ${new Date(lastCandle.time).toISOString()}] LastCl: ${lastCandle.close.toFixed(4)}, EMA(${this.strategySettings.microTrendEmaPeriod}): ${lastEma.toFixed(4)}, PrevEMA: ${prevEma.toFixed(4)}. Confirmed: ${confirmed}`);
    } else {
      confirmed = lastCandle.close < lastEma && lastEma < prevEma;
      logger.debug(`[MicroTrend SELL for ${symbol} @ ${new Date(lastCandle.time).toISOString()}] LastCl: ${lastCandle.close.toFixed(4)}, EMA(${this.strategySettings.microTrendEmaPeriod}): ${lastEma.toFixed(4)}, PrevEMA: ${prevEma.toFixed(4)}. Confirmed: ${confirmed}`);
    }
    return confirmed;
  }

  async execute() {
    // ... (реализация метода execute без изменений, как в предыдущем ответе,
    //    она уже использует this.strategySettings для своих нужд)
    if (!this.positionManager) {
      logger.error('[PureFractalStrategy.execute] PositionManager не инициализирован.');
      return false;
    }
    const openPositions = this.positionManager.getOpenPositions();
    const globalMaxOpenPositions = this.config.riskManagement?.maxOpenPositions || 1;
    let actionsTakenThisCycle = false;

    for (const symbol of this.config.tradingPairs || []) {
      const indicators = this.indicatorManager.getIndicators(symbol);
      if (!indicators || !indicators.candles || !indicators.fractals || !indicators.emaShort || indicators.candles.length < (this.strategySettings.fractalLookbackPeriod + 3) || indicators.emaShort.length < 2 ) {
        logger.debug(`[PureFractalStrategy.execute] Отсутствуют/неполные индикаторы для ${symbol}. Пропускаем.`);
        continue;
      }
      const currentOpenPositionForSymbol = openPositions.find(p => p.symbol === symbol && p.status !== 'closed');
      const { candles, fractals, emaShort } = indicators;

      if (currentOpenPositionForSymbol) {
        let oppositeFractal = null; let microTrendConfirmedForExit = false; let actionType = '';
        if (currentOpenPositionForSymbol.side.toLowerCase() === 'buy') {
          oppositeFractal = this._findRecentConfirmedFractal(symbol, 'sell', fractals, candles);
          if (oppositeFractal) { actionType = 'CLOSE_LONG_OPEN_SHORT'; microTrendConfirmedForExit = this._checkMicroTrend(symbol, candles, emaShort, false); }
        } else if (currentOpenPositionForSymbol.side.toLowerCase() === 'sell') {
          oppositeFractal = this._findRecentConfirmedFractal(symbol, 'buy', fractals, candles);
          if (oppositeFractal) { actionType = 'CLOSE_SHORT_OPEN_LONG'; microTrendConfirmedForExit = this._checkMicroTrend(symbol, candles, emaShort, true); }
        }

        if (oppositeFractal && (!this.strategySettings.requireMicroTrendConfirmation || microTrendConfirmedForExit)) {
          logger.info(`[PureFractalStrategy.execute] Для ${currentOpenPositionForSymbol.side} ${symbol} обнаружен противоположный фрактал @${oppositeFractal.price}. Микротренд подтвержден: ${microTrendConfirmedForExit}`);
          try {
            await this.positionManager.closePosition(symbol, currentOpenPositionForSymbol.id, `Close ${currentOpenPositionForSymbol.side} on opposite Fractal (Execute)`);
            this.lastActionedFractalTimestamp[symbol] = oppositeFractal.time; actionsTakenThisCycle = true;
            const updatedOpenPositions = this.positionManager.getOpenPositions().filter(p=>p.status !== 'closed');
            if (updatedOpenPositions.length < globalMaxOpenPositions) {
              if (actionType === 'CLOSE_LONG_OPEN_SHORT' && this.strategySettings.allowShorting) {
                await this.positionManager.openPosition('sell', symbol, oppositeFractal.price, 'Sell Fractal (Execute, after closing long)', 100);
              } else if (actionType === 'CLOSE_SHORT_OPEN_LONG') {
                await this.positionManager.openPosition('buy', symbol, oppositeFractal.price, 'Buy Fractal (Execute, after closing short)', 100);
              }
            }
          } catch (error) { logger.error(`[PureFractalStrategy.execute] Ошибка при реверсе ${symbol}: ${error.message}`, error.stack); }
          continue;
        } else if (oppositeFractal) { logger.debug(`[PureFractalStrategy.execute] Противоположный фрактал для ${symbol} есть, но микротренд НЕ подтвержден.`); }
      } else {
        const currentTotalOpen = openPositions.filter(p=>p.status !== 'closed').length;
        if (currentTotalOpen >= globalMaxOpenPositions) { continue; }
        const buyFractal = this._findRecentConfirmedFractal(symbol, 'buy', fractals, candles);
        if (buyFractal) {
          const microTrendBuyConfirmed = this._checkMicroTrend(symbol, candles, emaShort, true);
          if (!this.strategySettings.requireMicroTrendConfirmation || microTrendBuyConfirmed) {
            try {
              await this.positionManager.openPosition('buy', symbol, buyFractal.price, 'Buy Fractal (Execute)', 100);
              this.lastActionedFractalTimestamp[symbol] = buyFractal.time; actionsTakenThisCycle = true;
              this.addSignalToLog({ pair: symbol, type: 'EXECUTE_OPEN_BUY', price: buyFractal.price, time: buyFractal.time, reason: 'Buy Fractal Confirmed' });
              continue;
            } catch (error) { logger.error(`[PureFractalStrategy.execute] Ошибка при открытии LONG ${symbol}: ${error.message}`, error.stack); }
          } else { this.addSignalToLog({ pair: symbol, type: 'EXECUTE_BUY_FRACTAL_NO_TREND', price: buyFractal.price, time: buyFractal.time, reason: 'Buy Fractal, Microtrend Fail' }); }
        } else if (this.strategySettings.allowShorting) {
            const sellFractal = this._findRecentConfirmedFractal(symbol, 'sell', fractals, candles);
            if (sellFractal) {
                const microTrendSellConfirmed = this._checkMicroTrend(symbol, candles, emaShort, false);
                if (!this.strategySettings.requireMicroTrendConfirmation || microTrendSellConfirmed) {
                    try {
                        await this.positionManager.openPosition('sell', symbol, sellFractal.price, 'Sell Fractal (Execute)', 100);
                        this.lastActionedFractalTimestamp[symbol] = sellFractal.time; actionsTakenThisCycle = true;
                        this.addSignalToLog({ pair: symbol, type: 'EXECUTE_OPEN_SELL', price: sellFractal.price, time: sellFractal.time, reason: 'Sell Fractal Confirmed' });
                        continue;
                    } catch (error) { logger.error(`[PureFractalStrategy.execute] Ошибка при открытии SHORT ${symbol}: ${error.message}`, error.stack); }
                } else { this.addSignalToLog({ pair: symbol, type: 'EXECUTE_SELL_FRACTAL_NO_TREND', price: sellFractal.price, time: sellFractal.time, reason: 'Sell Fractal, Microtrend Fail' });}
            }
        }
      }
    }
    return actionsTakenThisCycle;
  }

  async checkSignals(symbol, currentPriceContext) {
    // ... (реализация без изменений, как в предыдущем ответе)
    const indicators = this.indicatorManager.getIndicators(symbol);
    if (!indicators || !indicators.candles || !indicators.fractals || !indicators.emaShort || indicators.candles.length < (this.strategySettings.fractalLookbackPeriod + 3) || indicators.emaShort.length < 2) {
      return null;
    }
    const { candles, fractals, emaShort } = indicators;
    const buyDetectKey = `${symbol}_BUY_DETECT_CS`;
    const lastDetectedBuyTime = this.lastDetectedFractalTimeCheckSignals ? (this.lastDetectedFractalTimeCheckSignals[buyDetectKey] || 0) : 0;
    const buyFractal = fractals.buyFractals.find(f => f.index === (candles.length - 1 - this.strategySettings.fractalLookbackPeriod) && f.time > lastDetectedBuyTime);
    if (buyFractal) {
        const microTrendOk = this._checkMicroTrend(symbol, candles, emaShort, true);
        const signal = { symbol: symbol, type: 'BUY_FRACTAL', price: buyFractal.price, time: buyFractal.time, reason: `Pure Buy Fractal (MicroTrend: ${microTrendOk ? 'OK' : 'Fail'})`, strength: microTrendOk ? 100 : 50 };
        this.addSignalToLog(signal);
        if(this.lastDetectedFractalTimeCheckSignals) this.lastDetectedFractalTimeCheckSignals[buyDetectKey] = buyFractal.time;
        return signal;
    }
    const sellDetectKey = `${symbol}_SELL_DETECT_CS`;
    const lastDetectedSellTime = this.lastDetectedFractalTimeCheckSignals ? (this.lastDetectedFractalTimeCheckSignals[sellDetectKey] || 0) : 0;
    const sellFractal = fractals.sellFractals.find(f => f.index === (candles.length - 1 - this.strategySettings.fractalLookbackPeriod) && f.time > lastDetectedSellTime);
    if (sellFractal) {
        const microTrendOk = this._checkMicroTrend(symbol, candles, emaShort, false);
        const signal = { symbol: symbol, type: 'SELL_FRACTAL', price: sellFractal.price, time: sellFractal.time, reason: `Pure Sell Fractal (MicroTrend: ${microTrendOk ? 'OK' : 'Fail'})`, strength: microTrendOk ? 100 : 50 };
        this.addSignalToLog(signal);
        if(this.lastDetectedFractalTimeCheckSignals) this.lastDetectedFractalTimeCheckSignals[sellDetectKey] = sellFractal.time;
        return signal;
    }
    return null;
  }

  addSignalToLog(signalEntry) {
    // ... (реализация без изменений)
    this.signalsLog.unshift(signalEntry);
    if (this.signalsLog.length > this.maxSignalsLog) {
      this.signalsLog.pop();
    }
  }

  getRecentSignals(limit = 5) {
    // ... (реализация без изменений)
    const recentLogs = this.signalsLog.slice(0, limit);
    return recentLogs.map(logEntry => {
      const now = new Date().getTime(); const signalTime = logEntry.time; const diffInMs = now - signalTime;
      let timeString;
      if (diffInMs < 60000) { timeString = `${Math.floor(diffInMs / 1000)} сек назад`; }
      else if (diffInMs < 3600000) { timeString = `${Math.floor(diffInMs / 60000)} мин назад`; }
      else if (diffInMs < 86400000) { timeString = `${Math.floor(diffInMs / 3600000)}ч ${Math.floor((diffInMs % 3600000) / 60000)}м назад`; }
      else { timeString = new Date(signalTime).toLocaleString(); }
      return { ...logEntry, timeAgo: timeString, originalTime: new Date(signalTime).toISOString() };
    });
  }
}

module.exports = PureFractalStrategy;
