// src/bot/PositionManager.js - исправленная версия
const EventEmitter = require('events');
const logger = require('../utils/logger');

var uuid;
try {
  uuid = require('uuid');
} catch (e) {
  // Полифилл для uuid если пакет недоступен в старых версиях Node.js
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
    this.openPositions = [];
    this.positionHistory = [];
    this.currentPrices = {};
  }

  setClient(client) {
    this.client = client;
  }

  setBalance(balance) {
    this.balance = balance;
  }

  updateConfig(newConfig) {
    this.config = Object.assign({}, this.config, newConfig);
  }

  // Основные методы для управления позициями с исправленными API вызовами
  async updateOpenPositions() {
    try {
      // Обновляем цены для всех торгуемых пар
      for (const symbol of this.config.tradingPairs) {
        try {
          const ticker = await this.client.getTicker(symbol);
          if (ticker && ticker.data && ticker.data.last) {
            this.currentPrices[symbol] = parseFloat(ticker.data.last);
          }
        } catch (error) {
          logger.warn('Не удалось получить текущую цену для ' + symbol + ': ' + error.message);
        }
      }
      
      // Получаем открытые позиции с API биржи
      const allPositionsResponse = await this.client.getPositions();
      
      if (!allPositionsResponse || !allPositionsResponse.data) {
        logger.warn('Не удалось получить открытые позиции от API биржи');
        return this.openPositions;
      }
      
      // Обновляем список открытых позиций
      const apiPositions = allPositionsResponse.data;
      this.openPositions = [];
      
      for (const position of apiPositions) {
        if (parseFloat(position.total) > 0) {
          const newPosition = {
            id: position.positionId,
            symbol: position.symbol,
            type: position.holdSide.toUpperCase(),
            entryPrice: parseFloat(position.openPrice),
            size: parseFloat(position.total),
            entryTime: parseInt(position.ctime),
            leverage: parseFloat(position.leverage),
            currentPrice: this.currentPrices[position.symbol] || 0,
            pnl: parseFloat(position.unrealizedPL || 0),
            pnlPercentage: parseFloat(position.unrealizedPL) / parseFloat(position.margin) * 100
          };
          
          this.openPositions.push(newPosition);
        }
      }
      
      return this.openPositions;
    } catch (error) {
      logger.error('Ошибка при обновлении открытых позиций: ' + error.message);
      return this.openPositions;
    }
  }

  // Обновленный метод для открытия позиции с учетом TP/SL
  async openPosition(type, symbol, price, reason, confidenceLevel, customSize = null, takeProfitPrice = null, stopLossPrice = null) {
    try {
      if (!this.client || !price) {
        logger.error('Не удалось открыть позицию: отсутствует клиент API или цена.');
        return null;
      }
      
      // Получаем актуальный баланс
      const accountInfoResponse = await this.client.getAccountAssets();
      if (!accountInfoResponse || !accountInfoResponse.data || accountInfoResponse.data.length === 0) {
        logger.error('Не удалось получить информацию о балансе аккаунта');
        return null;
      }
      
      const availableBalance = parseFloat(accountInfoResponse.data[0].available);
      logger.info(`Доступный баланс: ${availableBalance} USDT`);
      
      let contractSize;
      let positionSizeUSDT;
      
      // Если передан пользовательский размер, используем его
      if (customSize) {
        positionSizeUSDT = parseFloat(customSize);
        logger.info(`Используется указанный пользователем размер позиции: ${positionSizeUSDT} USDT`);
      } else {
        // Иначе определяем размер позиции на основе баланса и процента риска
        positionSizeUSDT = (availableBalance * this.config.positionSize) / 100;
        logger.info(`Рассчитан размер позиции: ${positionSizeUSDT} USDT (${this.config.positionSize}% от баланса)`);
      }
      
      // Убедимся, что не превышаем доступный баланс (с запасом)
      const safetyMargin = 0.95; // 95% от доступного баланса
      if (positionSizeUSDT > availableBalance * safetyMargin) {
        positionSizeUSDT = availableBalance * safetyMargin;
        logger.warn(`Размер позиции превышает доступный баланс, скорректирован до ${positionSizeUSDT} USDT`);
      }
      
      // Проверяем минимальный размер ордера (обычно 5 USDT для Bitget)
      if (positionSizeUSDT < 5) {
        logger.warn(`Слишком маленький размер позиции: ${positionSizeUSDT}. Минимум 5 USDT.`);
        return null;
      }
      
      // Устанавливаем плечо для символа
      await this.client.setLeverage(symbol, 'isolated', this.config.leverage.toString());
      
      // Рассчитываем количество контрактов с учетом текущей цены
      // Для Bitget размер в USDT нужно конвертировать в количество базовой валюты
      contractSize = positionSizeUSDT / price;
      
      // Округляем размер контракта до 5 десятичных знаков
      const formattedSize = contractSize.toFixed(5);
      logger.info(`Рассчитан размер контрактов: ${formattedSize} по цене ${price} USDT`);
      
      // Определяем сторону ордера на основе типа позиции
      const side = type === 'LONG' ? 'buy' : 'sell';
      
      logger.info(`Размещение ордера: ${side} ${symbol}, размер=${formattedSize}, плечо=${this.config.leverage}x`);
      
      let orderResponse;
      
      // Если заданы TP или SL, используем метод с одновременной установкой TP/SL
      if (takeProfitPrice || stopLossPrice) {
        logger.info(`Открытие позиции с TP=${takeProfitPrice} и SL=${stopLossPrice}`);
        
        // Форматируем цены TP/SL если они заданы
        const formattedTpPrice = takeProfitPrice ? parseFloat(takeProfitPrice).toString() : undefined;
        const formattedSlPrice = stopLossPrice ? parseFloat(stopLossPrice).toString() : undefined;
        
        // Используем специальный метод для размещения ордера с TP/SL
        orderResponse = await this.client.placeOrderWithTpSl(
          symbol,
          side,
          'market',
          formattedSize,
          null,
          formattedTpPrice,
          formattedSlPrice
        );
      } else {
        // Иначе используем обычный метод размещения ордера
        orderResponse = await this.client.placeOrder(
          symbol,
          side,
          'market',
          formattedSize,
          null,
          false,
          'open'
        );
      }
      
      if (!orderResponse || !orderResponse.data || orderResponse.code !== '00000') {
        logger.error(`Ошибка при открытии позиции: ${orderResponse ? orderResponse.msg : 'Нет ответа от API'}`);
        return null;
      }
      
      logger.info(`Позиция успешно открыта: ${type} ${symbol} по цене ${price}`);
      
      // Получаем ID позиции
      const positionId = orderResponse.data.orderId;
      
      // Создаем новую запись о позиции
      const newPosition = {
        id: positionId,
        symbol: symbol,
        type: type,
        entryPrice: price,
        size: contractSize,
        entryTime: new Date().getTime(),
        confidenceLevel: confidenceLevel || 0
      };
      
      // Ждем небольшую паузу для корректного обновления позиции в системе биржи
      await new Promise(resolve => setTimeout(resolve, 3000));
        
      // Обновляем список открытых позиций
      await this.updateOpenPositions();
      
      // Добавляем позицию в историю
      this.positionHistory.push({
        ...newPosition,
        status: 'open',
        reason: reason || 'Сигнал стратегии'
      });
      
      this.emit('position_opened', newPosition);
      return newPosition;
    } catch (error) {
      logger.error('Ошибка при открытии позиции: ' + error.message);
      return null;
    }
  }

  // Исправленный метод закрытия позиции
  async closePosition(positionId, percentage = 100) {
    try {
      percentage = percentage || 100;
      
      // Найдем позицию в списке открытых
      const positions = await this.updateOpenPositions();
      const position = positions.find(p => p.id === positionId);
      
      if (!position) {
        logger.warn(`Позиция с ID ${positionId} не найдена в списке открытых позиций`);
        return false;
      }
      
      logger.info(`Закрытие позиции ${position.symbol} ${position.type}, ID: ${positionId}`);
      
      try {
        // Используем обновленный метод closePosition из BitgetClient
        const response = await this.client.closePosition(position.symbol);
        
        if (response && response.code === '00000') {
          logger.info(`Позиция ${position.symbol} ${position.type} успешно закрыта`);
          
          // Получаем текущую цену для расчета P&L
          const ticker = await this.client.getTicker(position.symbol);
          const currentPrice = ticker && ticker.data && ticker.data.last ? 
            parseFloat(ticker.data.last) : position.currentPrice;
          
          // Обновляем историю
          this.updatePositionHistory(position, 'closed', currentPrice);
          
          // Удаляем позицию из списка открытых
          this.openPositions = this.openPositions.filter(p => p.id !== positionId);
          
          this.emit('position_closed', { 
            positionId: positionId, 
            percentage: 100
          });
          
          return true;
        } else {
          logger.warn(`Не удалось закрыть позицию ${position.symbol} ${position.type}: ${response ? response.msg : 'Нет ответа от API'}`);
          return false;
        }
      } catch (closeError) {
        logger.error(`Ошибка при закрытии позиции ${position.symbol} ${position.type}: ${closeError.message}`);
        return false;
      }
    } catch (error) {
      logger.error('Ошибка при закрытии позиции: ' + error.message);
      return false;
    }
  }

  // Новый метод для закрытия позиции по символу (без необходимости знать ID)
  async closePositionBySymbol(symbol) {
    try {
      if (!symbol) {
        logger.error('Для закрытия позиции необходим символ');
        return false;
      }
      
      logger.info(`Закрытие позиции по символу ${symbol}`);
      
      // Обновляем открытые позиции, чтобы иметь актуальные данные
      await this.updateOpenPositions();
      
      // Ищем позицию с указанным символом
      const position = this.openPositions.find(p => p.symbol === symbol);
      
      if (!position) {
        logger.warn(`Позиция для символа ${symbol} не найдена в списке открытых позиций`);
        return false;
      }
      
      try {
        // Используем обновленный метод closePosition из BitgetClient
        const response = await this.client.closePosition(symbol);
        
        if (response && response.code === '00000') {
          logger.info(`Позиция ${symbol} успешно закрыта`);
          
          // Получаем текущую цену для расчета P&L
          const ticker = await this.client.getTicker(symbol);
          const currentPrice = ticker && ticker.data && ticker.data.last ? 
            parseFloat(ticker.data.last) : position.currentPrice;
          
          // Обновляем историю
          this.updatePositionHistory(position, 'closed', currentPrice);
          
          // Удаляем позицию из списка открытых
          this.openPositions = this.openPositions.filter(p => p.symbol !== symbol);
          
          this.emit('position_closed', { 
            positionId: position.id, 
            symbol: symbol,
            percentage: 100
          });
          
          return true;
        } else {
          logger.warn(`Не удалось закрыть позицию ${symbol}: ${response ? response.msg : 'Нет ответа от API'}`);
          return false;
        }
      } catch (closeError) {
        logger.error(`Ошибка при закрытии позиции ${symbol}: ${closeError.message}`);
        return false;
      }
    } catch (error) {
      logger.error(`Ошибка при закрытии позиции по символу ${symbol}: ${error.message}`);
      return false;
    }
  }

  getOpenPositions() {
    return this.openPositions;
  }

  getPositionHistory() {
    return this.positionHistory;
  }

  updatePositionHistory(position, status, closePrice) {
    try {
      // Находим позицию в истории
      const historyIndex = this.positionHistory.findIndex(function(p) { return p.id === position.id; });
      
      if (historyIndex !== -1) {
        const updatedPosition = Object.assign({}, this.positionHistory[historyIndex]);
        
        if (status === 'closed') {
          // Устанавливаем цену закрытия
          updatedPosition.closePrice = closePrice || (this.currentPrices[position.symbol] || updatedPosition.entryPrice);
          updatedPosition.closeTime = new Date().getTime();
          updatedPosition.status = 'closed';
          
          // Рассчитываем P&L
          const pnlPercentage = updatedPosition.type === 'LONG'
            ? ((updatedPosition.closePrice - updatedPosition.entryPrice) / updatedPosition.entryPrice) * 100 * this.config.leverage
            : ((updatedPosition.entryPrice - updatedPosition.closePrice) / updatedPosition.entryPrice) * 100 * this.config.leverage;
          
          updatedPosition.pnl = pnlPercentage;
          updatedPosition.result = pnlPercentage >= 0 ? 'win' : 'loss';
          
          // Рассчитываем P&L в абсолютном выражении
          const initialValue = updatedPosition.size * updatedPosition.entryPrice / this.config.leverage;
          const pnlAbsolute = initialValue * pnlPercentage / 100;
          updatedPosition.pnlUSDT = pnlAbsolute;
          
          logger.info('Позиция ' + position.id + ' закрыта с P&L: ' + pnlPercentage.toFixed(2) + '% (' + updatedPosition.result.toUpperCase() + ')');
        }
        
        // Обновляем позицию в истории
        this.positionHistory[historyIndex] = updatedPosition;
        
        // Отправляем событие обновления
        this.emit('position_history_updated', updatedPosition);
      }
    } catch (error) {
      logger.error('Ошибка при обновлении истории позиций: ' + error.message);
    }
  }
  
  // Обновленный метод для установки TP/SL
  async setTpsl(symbol, type, takeProfitPrice, stopLossPrice) {
    try {
      // Проверяем параметры
      if (!symbol) {
        logger.error('Для установки TP/SL необходим символ');
        return false;
      }
      
      // Определяем holdSide на основе типа позиции
      const holdSide = type.toUpperCase() === 'LONG' ? 'long' : 'short';
      
      let tpSuccess = true;
      let slSuccess = true;
      
      // Если указан Take Profit, устанавливаем его
      if (takeProfitPrice) {
        try {
          const tpResponse = await this.client.setTpsl(
            symbol,
            holdSide,
            'profit_plan',
            takeProfitPrice,
            '100'  // 100% позиции
          );
          
          if (!tpResponse || tpResponse.code !== '00000') {
            logger.warn(`Не удалось установить Take Profit: ${tpResponse ? tpResponse.msg : 'Нет ответа от API'}`);
            tpSuccess = false;
          } else {
            logger.info(`Take Profit установлен для ${symbol} на уровне ${takeProfitPrice}`);
          }
        } catch (tpError) {
          logger.error(`Ошибка при установке Take Profit: ${tpError.message}`);
          tpSuccess = false;
        }
      }
      
      // Если указан Stop Loss, устанавливаем его
      if (stopLossPrice) {
        try {
          const slResponse = await this.client.setTpsl(
            symbol,
            holdSide,
            'loss_plan',
            stopLossPrice,
            '100'  // 100% позиции
          );
          
          if (!slResponse || slResponse.code !== '00000') {
            logger.warn(`Не удалось установить Stop Loss: ${slResponse ? slResponse.msg : 'Нет ответа от API'}`);
            slSuccess = false;
          } else {
            logger.info(`Stop Loss установлен для ${symbol} на уровне ${stopLossPrice}`);
          }
        } catch (slError) {
          logger.error(`Ошибка при установке Stop Loss: ${slError.message}`);
          slSuccess = false;
        }
      }
      
      return tpSuccess || slSuccess;
    } catch (error) {
      logger.error(`Ошибка при установке TP/SL: ${error.message}`);
      return false;
    }
  }
  
  // Обновленный метод для установки трейлинг-стопа
  async setTrailingStop(symbol, type, callbackRatio) {
    try {
      if (!symbol || !callbackRatio) {
        logger.error('Для установки трейлинг-стопа необходимы символ и callbackRatio');
        return false;
      }
      
      // Находим позицию для получения размера
      const position = this.openPositions.find(p => p.symbol === symbol);
      if (!position) {
        logger.warn(`Не найдена позиция для ${symbol}`);
        return false;
      }
      
      // Определяем holdSide на основе типа позиции
      const holdSide = type.toUpperCase() === 'LONG' ? 'long' : 'short';
      
      // Размер позиции в контрактах
      const size = position.size.toFixed(5);
      
      try {
        const response = await this.client.setTrailingStop(
          symbol,
          holdSide,
          callbackRatio.toString(),  // Значение должно быть строкой
          size
        );
        
        if (!response || response.code !== '00000') {
          logger.warn(`Не удалось установить трейлинг-стоп: ${response ? response.msg : 'Нет ответа от API'}`);
          return false;
        }
        
        logger.info(`Трейлинг-стоп установлен для ${symbol} с отступом ${callbackRatio}%`);
        return true;
      } catch (error) {
        logger.error(`Ошибка при установке трейлинг-стопа: ${error.message}`);
        return false;
      }
    } catch (error) {
      logger.error(`Ошибка при установке трейлинг-стопа: ${error.message}`);
      return false;
    }
  }
  
  async updateTrailingStops() {
    try {
      if (!this.config.trailingStop || !this.config.trailingStop.enabled) {
        return;
      }
      
      for (const position of this.openPositions) {
        const currentPrice = this.currentPrices[position.symbol];
        if (!currentPrice) continue;
        
        const entryPrice = position.entryPrice;
        const takeProfitPrice = position.type === 'LONG' 
          ? entryPrice * (1 + this.config.takeProfitPercentage / 100) 
          : entryPrice * (1 - this.config.takeProfitPercentage / 100);
        
        const activationThreshold = position.type === 'LONG'
          ? entryPrice + (takeProfitPrice - entryPrice) * (this.config.trailingStop.activationPercentage / 100)
          : entryPrice - (entryPrice - takeProfitPrice) * (this.config.trailingStop.activationPercentage / 100);
        
        const isActivated = position.type === 'LONG'
          ? currentPrice >= activationThreshold
          : currentPrice <= activationThreshold;
        
        if (isActivated && !position.trailingStopActivated) {
          try {
            const result = await this.setTrailingStop(
              position.symbol, 
              position.type, 
              this.config.trailingStop.stopDistance
            );
            
            if (result) {
              // Обновляем информацию о позиции
              position.trailingStopActivated = true;
              
              logger.info(`Активирован трейлинг-стоп для ${position.symbol} с отступом ${this.config.trailingStop.stopDistance}%`);
              
              this.emit('position_updated', position);
            }
          } catch (trailingError) {
            logger.warn(`Ошибка при установке трейлинг-стопа: ${trailingError.message}`);
          }
        }
      }
    } catch (error) {
      logger.error('Ошибка при обновлении трейлинг-стопов: ' + error.message);
    }
  }
  
  // Проверка максимальной продолжительности позиции
  async checkPositionDuration() {
    try {
      const maxDurationMs = this.config.maxTradeDurationMinutes * 60 * 1000;
      const now = new Date().getTime();
      
      for (const position of [...this.openPositions]) {
        const durationMs = now - position.entryTime;
        
        if (durationMs >= maxDurationMs) {
          logger.info(`Позиция ${position.symbol} достигла максимальной продолжительности (${this.config.maxTradeDurationMinutes} минут). Закрываем.`);
          
          // Используем closePositionBySymbol вместо closePosition для большей надежности
          await this.closePositionBySymbol(position.symbol);
        }
      }
    } catch (error) {
      logger.error('Ошибка при проверке продолжительности позиций: ' + error.message);
    }
  }
}

module.exports = PositionManager;