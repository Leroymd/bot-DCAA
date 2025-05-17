// src/bot/PositionManager.js
const EventEmitter = require('events');
const logger = require('../utils/logger');

var uuid;
try {
  uuid = require('uuid');
} catch (e) {
  uuid = {
    v4: function() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  };
}

class PositionManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.client = null;
    this.balance = 0;
    this.openPositions = []; // Массив текущих открытых позиций, управляемых ботом
    this.positionHistory = [];
    this.currentPrices = {}; // Для хранения текущих цен
  }

  setClient(client) {
    this.client = client;
  }

  setBalance(balance) {
    this.balance = balance;
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    logger.info(`[PositionManager] Конфигурация обновлена: maxTradeDurationMinutes=${this.config.maxTradeDurationMinutes}, TrailingStopEnabled=${this.config.trailingStop?.enabled}`);
  }

  getOpenPositions() {
    return this.openPositions.filter(p => p.status === 'open');
  }

  getOpenPositionsForPair(symbol) {
    if (!symbol) return [];
    return this.openPositions.filter(p => p.symbol === symbol && p.status === 'open');
  }

  getPositionHistory() {
    return this.positionHistory;
  }

  async openPosition(side, symbol, entryPrice, reason = 'Signal', strength = 0, customSize = null) {
    // Используем метод с одновременной установкой TP/SL, если он предпочтителен
    // или метод с последующей установкой TP/SL через setTpsl.
    // Сейчас будем использовать placeOrderWithTpSl, как обсуждали ранее.

    try {
      if (!this.client) throw new Error('Клиент API не инициализирован в PositionManager.');
      if (!entryPrice || typeof entryPrice !== 'number' || entryPrice <= 0) {
        throw new Error(`Некорректная цена входа: ${entryPrice}`);
      }
      if (side !== 'buy' && side !== 'sell') {
        throw new Error(`Некорректная сторона для открытия позиции: ${side}`);
      }

      const positionType = side === 'buy' ? 'LONG' : 'SHORT';
      logger.info(`[PositionManager.openPosition] Попытка открытия ${positionType} для ${symbol} по ~${entryPrice} с TP/SL. Причина: ${reason}`);

      let positionSizeUSDT;
      if (customSize && typeof customSize === 'number' && customSize > 0) {
        positionSizeUSDT = customSize;
      } else if (this.config.positionSize && typeof this.config.positionSize === 'number' && this.config.positionSize > 0) {
        if (this.config.orderSizeType === 'percentage' && this.balance > 0) {
            positionSizeUSDT = (this.balance * this.config.positionSize) / 100;
        } else {
            positionSizeUSDT = this.config.positionSize;
        }
      } else {
        throw new Error('Размер позиции (positionSize) не определен или некорректен в конфигурации.');
      }
      
      const minOrderValueUSDT = this.config.minOrderValueUSDT || 5;
      if (positionSizeUSDT < minOrderValueUSDT) {
        logger.warn(`[PositionManager.openPosition] Расчетный размер ${positionSizeUSDT.toFixed(2)} USDT меньше минимального (${minOrderValueUSDT} USDT). Устанавливаем минимальный.`);
        positionSizeUSDT = minOrderValueUSDT;
      }

      const contractSize = positionSizeUSDT / entryPrice;
      const quantityPrecision = this.config.quantityPrecision?.[symbol] || this.config.defaultQuantityPrecision || 4;
      const formattedSize = contractSize.toFixed(quantityPrecision);

      if (parseFloat(formattedSize) <= 0) {
          throw new Error(`Рассчитанный размер контракта (${formattedSize}) для ${symbol} равен нулю или меньше.`);
      }

      let takeProfitLevel = null;
      let stopLossLevel = null;
      const pricePrecision = this.config.pricePrecision?.[symbol] || this.config.defaultPricePrecision || this.countDecimals(entryPrice) || 2;

      const tpPerc = this.config.takeProfitPercentage;
      if (typeof tpPerc === 'number' && tpPerc > 0) {
        takeProfitLevel = positionType === 'LONG' ? entryPrice * (1 + tpPerc / 100) : entryPrice * (1 - tpPerc / 100);
        takeProfitLevel = parseFloat(takeProfitLevel.toFixed(pricePrecision));
      }

      const slPerc = this.config.stopLossPercentage;
      if (typeof slPerc === 'number' && slPerc > 0) {
        stopLossLevel = positionType === 'LONG' ? entryPrice * (1 - slPerc / 100) : entryPrice * (1 + slPerc / 100);
        stopLossLevel = parseFloat(stopLossLevel.toFixed(pricePrecision));
      }
      
      logger.info(`[PositionManager.openPosition] Размещение ордера через placeOrderWithTpSl: ${side} ${symbol}, Размер=${formattedSize}, TP=${takeProfitLevel}, SL=${stopLossLevel}`);

      const orderResponse = await this.client.placeOrderWithTpSl(
        symbol, side, 'market', formattedSize, null, takeProfitLevel, stopLossLevel
      );

      if (!orderResponse || orderResponse.code !== '00000' || !orderResponse.data || !orderResponse.data.orderId) {
        const errorMsg = `Ошибка при открытии позиции с TP/SL для ${symbol}: ${orderResponse ? orderResponse.msg || `Код ошибки: ${orderResponse.code}` : 'Нет ответа от API'}`;
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      const orderId = orderResponse.data.orderId;
      const actualEntryTime = new Date().getTime();
      const finalEntryPrice = parseFloat(orderResponse.data.avgFillPrice || orderResponse.data.price || entryPrice);

      logger.info(`[PositionManager.openPosition] Позиция ${positionType} для ${symbol} успешно открыта с TP/SL. Order ID: ${orderId}. Размер: ${formattedSize}. Цена входа: ~${finalEntryPrice}`);

      const newPosition = {
        id: orderId, symbol: symbol, type: positionType, side: side, entryPrice: finalEntryPrice,
        size: parseFloat(formattedSize), entryTime: actualEntryTime, status: 'open', reason: reason, strength: strength,
        takeProfitAt: takeProfitLevel, stopLossAt: stopLossLevel,
        pnl: 0, pnlPercentage: 0, pnlUSDT: 0, leverage: this.config.leverage || 5,
        trailingStopActivated: false // Добавляем флаг для трейлинг-стопа
      };

      this.openPositions.push(newPosition);
      this.positionHistory.push({ ...newPosition });
      this.emit('positionOpened', newPosition);
      return newPosition;

    } catch (error) {
      logger.error(`[PositionManager.openPosition] Критическая ошибка для ${symbol} (${side}): ${error.message}`, error.stack);
      this.emit('positionError', { symbol, side, error: error.message });
      return null;
    }
  }

  async closePosition(symbol, positionId, reason = 'Signal') {
    // ... (Ваш существующий код closePosition)
    // Убедитесь, что он корректно обновляет this.openPositions и this.positionHistory
    // и генерирует событие 'tradeClosed'
    try {
      if (!this.client) throw new Error('Клиент API не инициализирован в PositionManager.');
      const positionIndex = this.openPositions.findIndex(p => p.id === positionId && p.symbol === symbol && p.status === 'open');
      if (positionIndex === -1) {
        logger.warn(`[PM.closePosition] Активная позиция ID ${positionId} для ${symbol} не найдена.`);
        return false;
      }
      const positionToClose = this.openPositions[positionIndex];
      logger.info(`[PM.closePosition] Закрытие ID ${positionId} для ${symbol} (${positionToClose.type}). Причина: ${reason}`);
      const closeResponse = await this.client.closePosition(symbol); // Предполагает рыночное закрытие
      if (!closeResponse || closeResponse.code !== '00000') {
        logger.error(`Ошибка закрытия ${symbol} API: ${closeResponse ? closeResponse.msg : 'Нет ответа'}`);
        return false;
      }
      logger.info(`[PM.closePosition] Запрос на закрытие ${symbol} (ID: ${positionId}) успешно отправлен.`);
      let closePrice = this.currentPrices[symbol] || positionToClose.entryPrice;
      try {
          const ticker = await this.client.getTicker(symbol);
          if (ticker && ticker.data && ticker.data.last) closePrice = parseFloat(ticker.data.last);
      } catch (e) { logger.warn(`Не удалось получить цену тикера для ${symbol} при закрытии.`); }

      const closedPositionData = this.openPositions.splice(positionIndex, 1)[0];
      closedPositionData.status = 'closed';
      closedPositionData.closeTime = new Date().getTime();
      closedPositionData.closePrice = closePrice;
      closedPositionData.closeReason = reason;
      const pnlFactor = closedPositionData.type === 'LONG' ? 1 : -1;
      closedPositionData.pnlUSDT = (closedPositionData.closePrice - closedPositionData.entryPrice) * closedPositionData.size * pnlFactor;
      const initialMargin = (closedPositionData.entryPrice * closedPositionData.size) / (closedPositionData.leverage || 1);
      closedPositionData.pnlPercentage = initialMargin !== 0 ? (closedPositionData.pnlUSDT / initialMargin) * 100 : 0;
      closedPositionData.result = closedPositionData.pnlUSDT >= 0 ? 'win' : 'loss';
      const historyIndex = this.positionHistory.findIndex(p => p.id === closedPositionData.id);
      if (historyIndex !== -1) this.positionHistory[historyIndex] = { ...this.positionHistory[historyIndex], ...closedPositionData };
      else this.positionHistory.push({ ...closedPositionData });
      logger.info(`[PM.closePosition] ${symbol} (ID: ${positionId}) закрыта. PNL: ${closedPositionData.pnlUSDT.toFixed(2)} USDT (${closedPositionData.pnlPercentage.toFixed(2)}%)`);
      this.emit('tradeClosed', this.positionHistory[historyIndex !== -1 ? historyIndex : this.positionHistory.length -1 ]);
      return true;
    } catch (error) {
      logger.error(`[PM.closePosition] Ошибка ID ${positionId} для ${symbol}: ${error.message}`, error.stack);
      return false;
    }
  }
  
  async updateOpenPositions() {
    // ... (Ваш существующий код updateOpenPositions)
    // Важно, чтобы он корректно обновлял this.currentPrices[symbol]
    // и вызывал updatePositionHistoryOnExternalClose для позиций, закрытых по TP/SL на бирже.
    if (!this.client || typeof this.client.getPositions !== 'function') {
        logger.warn('[PM.updateOpenPositions] Клиент не инициализирован или отсутствует getPositions.');
        return this.openPositions;
    }
    try {
        // Сначала обновим текущие цены для всех отслеживаемых пар
        const pairsInOpenPositions = new Set(this.openPositions.map(p => p.symbol));
        const pairsFromConfig = new Set(this.config.tradingPairs || []);
        const allRelevantPairs = [...new Set([...pairsInOpenPositions, ...pairsFromConfig])];

        for (const symbol of allRelevantPairs) {
            try {
                const ticker = await this.client.getTicker(symbol);
                if (ticker && ticker.data && ticker.data.last) {
                    this.currentPrices[symbol] = parseFloat(ticker.data.last);
                }
            } catch (error) {
                logger.warn(`[PM.updateOpenPositions] Не удалось получить цену для ${symbol}: ${error.message}`);
            }
        }

        const response = await this.client.getPositions();
        if (response && response.code === '00000' && Array.isArray(response.data)) {
            const exchangePositions = response.data;
            const newBotOpenPositions = [];
            const botPositionIdsOnExchange = new Set();

            for (const ep of exchangePositions) {
                if (ep.total && parseFloat(ep.total) > 0) {
                    let botPos = this.openPositions.find(p => p.symbol === ep.symbol && p.type === ep.holdSide?.toUpperCase());
                    if (botPos) { 
                        botPos.currentPrice = this.currentPrices[botPos.symbol] || parseFloat(ep.markPrice || botPos.entryPrice);
                        botPos.pnl = parseFloat(ep.unrealizedPL || 0);
                        const margin = parseFloat(ep.margin || 0);
                        botPos.pnlPercentage = margin !== 0 ? (botPos.pnl / margin) * 100 : 0;
                        botPos.size = parseFloat(ep.total);
                        botPos.leverage = parseFloat(ep.leverage || botPos.leverage);
                        const exchangePosId = ep.positionId || ep.orderId;
                        if (exchangePosId && botPos.id !== exchangePosId) {
                            const historyIdx = this.positionHistory.findIndex(hp => hp.id === botPos.id);
                            if (historyIdx !== -1) this.positionHistory[historyIdx].id = exchangePosId;
                            botPos.id = exchangePosId;
                        }
                        newBotOpenPositions.push(botPos);
                        botPositionIdsOnExchange.add(botPos.id);
                    } else {
                        // logger.warn(`[PM.updateOpenPositions] Обнаружена активная позиция на бирже для ${ep.symbol}, не отслеживаемая ботом.`);
                    }
                }
            }
            this.openPositions.forEach(botPos => {
                if (!newBotOpenPositions.some(p => p.id === botPos.id)) {
                    this.updatePositionHistoryOnExternalClose(botPos);
                }
            });
            this.openPositions = newBotOpenPositions;
        } else {
            logger.warn(`[PM.updateOpenPositions] Не удалось получить данные о позициях. Ответ: ${JSON.stringify(response)}`);
        }
    } catch (error) {
        logger.error(`[PM.updateOpenPositions] Ошибка: ${error.message}`, error.stack);
    }
    return this.openPositions;
  }

  updatePositionHistoryOnExternalClose(closedBotPosition) {
    // ... (Ваш существующий код)
    const historyIndex = this.positionHistory.findIndex(p => p.id === closedBotPosition.id && p.status === 'open');
      if (historyIndex !== -1) {
          const historicalPosition = this.positionHistory[historyIndex];
          historicalPosition.status = 'closed';
          historicalPosition.closeTime = new Date().getTime();
          historicalPosition.closePrice = closedBotPosition.currentPrice || closedBotPosition.entryPrice; 
          if (historicalPosition.entryPrice !== 0 && historicalPosition.size !== 0 && closedBotPosition.currentPrice) {
              const pnlFactor = historicalPosition.type === 'LONG' ? 1 : -1;
              const priceDiff = closedBotPosition.currentPrice - historicalPosition.entryPrice;
              historicalPosition.pnlUSDT = (priceDiff * pnlFactor) * historicalPosition.size;
              const initialMargin = (historicalPosition.entryPrice * historicalPosition.size) / (historicalPosition.leverage || 1);
              if (initialMargin !== 0) historicalPosition.pnlPercentage = (historicalPosition.pnlUSDT / initialMargin) * 100;
              else historicalPosition.pnlPercentage = 0;
          } else {
            historicalPosition.pnlUSDT = closedBotPosition.pnl || 0; 
            historicalPosition.pnlPercentage = closedBotPosition.pnlPercentage || 0;
          }
          historicalPosition.closeReason = closedBotPosition.closeReason || 'Closed by exchange (TP/SL/Liq/Other)';
          historicalPosition.result = historicalPosition.pnlUSDT >= 0 ? 'win' : 'loss';
          logger.info(`[PM] Позиция ${closedBotPosition.symbol} (ID: ${closedBotPosition.id}) закрыта внешне. PNL USDT: ${historicalPosition.pnlUSDT.toFixed(2)}`);
          this.emit('tradeClosed', historicalPosition);
      }
  }

  // --- Trailing Stop ---
  /**
   * Устанавливает трейлинг-стоп для существующей позиции.
   * @param {string} symbol - Символ пары
   * @param {string} positionType - 'LONG' или 'SHORT' (тип основной позиции)
   * @param {number} callbackRatioPercentage - Процент отката (например, 0.5 для 0.5%)
   * @param {string} positionSize - Размер позиции в контрактах (строка)
   */
  async setTrailingStop(symbol, positionType, callbackRatioPercentage, positionSize) {
    try {
      if (!this.client) throw new Error('Клиент API не инициализирован.');
      if (!symbol || !positionType || callbackRatioPercentage === undefined || !positionSize) {
        logger.error('[PM.setTrailingStop] Необходимы все параметры: symbol, positionType, callbackRatioPercentage, positionSize.');
        return false;
      }

      const holdSide = positionType.toLowerCase(); // 'long' или 'short'
      // API Bitget ожидает callbackRatio как десятичную дробь в виде строки, например "0.005" для 0.5%
      const actualCallbackRatio = (callbackRatioPercentage / 100).toString();

      logger.info(`[PM.setTrailingStop] Установка трейлинг-стопа для ${symbol} (${holdSide}): callbackRatio=${actualCallbackRatio} (из ${callbackRatioPercentage}%), size=${positionSize}`);

      const response = await this.client.setTrailingStop(
        symbol,
        holdSide,
        actualCallbackRatio,
        positionSize 
      );

      if (response && response.code === '00000') {
        logger.info(`[PM.setTrailingStop] Трейлинг-стоп успешно установлен для ${symbol} с отступом ${callbackRatioPercentage}%`);
        // Найдем позицию и обновим ее флаг
        const posToUpdate = this.openPositions.find(p => p.symbol === symbol && p.type === positionType && p.status === 'open');
        if (posToUpdate) {
            posToUpdate.trailingStopActivated = true;
            posToUpdate.trailingStopRatio = callbackRatioPercentage;
            this.emit('positionUpdated', posToUpdate); // Уведомить об обновлении
        }
        return true;
      } else {
        logger.warn(`[PM.setTrailingStop] Не удалось установить трейлинг-стоп для ${symbol}: ${response ? response.msg || `Код ${response.code}` : 'Нет ответа от API'}`);
        return false;
      }
    } catch (error) {
      logger.error(`[PM.setTrailingStop] Ошибка при установке трейлинг-стопа для ${symbol}: ${error.message}`, error.stack);
      return false;
    }
  }

  async updateTrailingStops() {
    if (!this.config.trailingStop || !this.config.trailingStop.enabled) {
      return;
    }
    // logger.debug('[PM.updateTrailingStops] Проверка активации трейлинг-стопов...');

    for (const position of this.openPositions) {
      if (position.status !== 'open' || position.trailingStopActivated) {
        continue; // Пропускаем закрытые или уже с активным трейлингом
      }

      const currentPrice = this.currentPrices[position.symbol];
      if (!currentPrice || !position.entryPrice) {
        // logger.debug(`[PM.updateTrailingStops] Нет текущей или входной цены для ${position.symbol}, пропускаем.`);
        continue;
      }

      const entryPrice = position.entryPrice;
      let profitPercentage = 0;
      if (entryPrice !== 0) {
          profitPercentage = position.type === 'LONG'
            ? ((currentPrice - entryPrice) / entryPrice) * 100
            : ((entryPrice - currentPrice) / entryPrice) * 100;
      }
      
      // Активация трейлинг-стопа, если прибыль достигла activationPercentage от потенциального TP
      // Или, если TP не установлен, можно использовать activationProfitPercentage из конфига
      const activationConfig = this.config.trailingStop.activationPercentage; // Это процент от чего? От TP или просто % прибыли?
                                                                              // В вашем конфиге это "activationPercentage": 90,
                                                                              // что похоже на % от движения к TP.
      
      // Упрощенная логика: активировать, если прибыль достигла X%
      // Например, если this.config.trailingStop.activationProfitPercentage = 1%
      const activationProfitPerc = this.config.trailingStop.activationProfitPercentage || 
                                   (this.config.takeProfitPercentage ? this.config.takeProfitPercentage * (activationConfig / 100) : null);

      if (activationProfitPerc === null) {
          // logger.debug(`[PM.updateTrailingStops] Не задан порог активации трейлинга для ${position.symbol}`);
          continue;
      }

      if (profitPercentage >= activationProfitPerc) {
        logger.info(`[PM.updateTrailingStops] Позиция ${position.symbol} (${position.type}) достигла порога активации трейлинг-стопа. Прибыль: ${profitPercentage.toFixed(2)}% >= ${activationProfitPerc}%.`);
        await this.setTrailingStop(
          position.symbol,
          position.type, // 'LONG' или 'SHORT'
          this.config.trailingStop.stopDistance, // Например, 0.5 для 0.5%
          position.size.toString() // Размер позиции
        );
      }
    }
  }
  
  countDecimals(value) {
    if (value === undefined || value === null || Number.isInteger(parseFloat(value))) return 0;
    const strValue = value.toString();
    if (strValue.includes('.')) { return strValue.split('.')[1].length; }
    return 0;
  }

  async loadPositions() {
    logger.info('[PositionManager.loadPositions] Загрузка/синхронизация позиций при старте...');
    await this.updateOpenPositions();
  }
}

module.exports = PositionManager;
