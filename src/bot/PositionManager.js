// src/bot/PositionManager.js
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

  // Основные методы для управления позициями с реальными API вызовами
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

  async openPosition(type, symbol, price, reason, confidenceLevel, customSize = null) {
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
      
      // Открываем позицию через API
      const orderResponse = await this.client.placeOrder(
        symbol,
        side,
        'market',
        formattedSize,
        null,
        false,
        'open'
      );
      
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
      
      // Получаем обновленную информацию о позиции для TP/SL
      try {
        // Добавляем задержку перед установкой TP/SL
        // для того, чтобы биржа успела обработать открытие позиции
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Получаем актуальные позиции с биржи
        const positionsResponse = await this.client.getPositions(symbol);
        let foundPosition = null;
        
        if (positionsResponse && positionsResponse.data && Array.isArray(positionsResponse.data)) {
          // Ищем нашу позицию по символу и стороне
          foundPosition = positionsResponse.data.find(pos => 
            pos.symbol === symbol && 
            pos.holdSide.toUpperCase() === type
          );
        }
        
        if (!foundPosition) {
          logger.warn(`Не удалось найти открытую позицию ${type} ${symbol} для установки TP/SL`);
          return newPosition;
        }
        
        // Правильно определяем positionSide для API
        const positionSide = type.toLowerCase(); // Должно быть "long" или "short"
        
        // Устанавливаем стоп-лосс
        if (this.config.stopLossPercentage > 0) {
          const stopPrice = type === 'LONG' 
            ? price * (1 - this.config.stopLossPercentage / 100) 
            : price * (1 + this.config.stopLossPercentage / 100);
          
          const stopLossResponse = await this.client.setTpsl(
            symbol,
            positionSide,
            'loss_plan',
            stopPrice,
            formattedSize
          );
          
          if (stopLossResponse && stopLossResponse.code === '00000') {
            logger.info(`Установлен стоп-лосс для ${symbol} на уровне ${stopPrice.toFixed(5)}`);
          } else {
            logger.warn(`Не удалось установить стоп-лосс: ${stopLossResponse ? stopLossResponse.msg : 'Нет ответа от API'}`);
          }
        }
        
        // Устанавливаем тейк-профит
        if (this.config.takeProfitPercentage > 0) {
          const takeProfitPrice = type === 'LONG' 
            ? price * (1 + this.config.takeProfitPercentage / 100) 
            : price * (1 - this.config.takeProfitPercentage / 100);
          
          const takeProfitResponse = await this.client.setTpsl(
            symbol,
            positionSide,
            'profit_plan',
            takeProfitPrice,
            formattedSize
          );
          
          if (takeProfitResponse && takeProfitResponse.code === '00000') {
            logger.info(`Установлен тейк-профит для ${symbol} на уровне ${takeProfitPrice.toFixed(5)}`);
          } else {
            logger.warn(`Не удалось установить тейк-профит: ${takeProfitResponse ? takeProfitResponse.msg : 'Нет ответа от API'}`);
          }
        }
      } catch (tpslError) {
        logger.warn(`Ошибка при установке TP/SL: ${tpslError.message}`);
      }
      
      // Добавляем позицию в список открытых
      this.openPositions.push(newPosition);
      
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

  async closePosition(positionId, percentage = 100) {
    try {
      percentage = percentage || 100;
      
      // Найдем позицию в списке открытых
      const positions = await this.updateOpenPositions();
      const position = positions.find(p => p.id === positionId);
      
      if (!position) {
        logger.warn(`Позиция с ID ${positionId} не найдена в списке открытых позиций`);
        
        // Попробуем найти все позиции для символа, чтобы закрыть все активные
        const allPositions = await this.client.getPositions();
        
        if (!allPositions || !allPositions.data || !allPositions.data.length) {
          logger.warn('Не удалось получить список позиций от API');
          return false;
        }
        
        // Логируем все найденные позиции для отладки
        logger.info(`Найдено ${allPositions.data.length} позиций на бирже`);
        for (const pos of allPositions.data) {
          if (parseFloat(pos.total) > 0) {
            logger.info(`Активная позиция: ${pos.symbol} ${pos.holdSide}, ID: ${pos.positionId}, размер: ${pos.total}`);
            
            // Определяем сторону ордера (противоположную типу позиции)
            const closeSide = pos.holdSide.toLowerCase() === 'long' ? 'sell' : 'buy';
            
            // Закрываем позицию через API
            try {
              logger.info(`Закрытие позиции ${pos.symbol} ${pos.holdSide} через API`);
              // Получаем текущую цену для символа
              const ticker = await this.client.getTicker(pos.symbol);
              const currentPrice = ticker && ticker.data && ticker.data.last ? 
                parseFloat(ticker.data.last) : parseFloat(pos.marketPrice);
              
              // Получаем информацию о символе для правильного форматирования цены
              const symbolInfo = await this.client.getSymbolInfo(pos.symbol);
              
              logger.info(`Закрытие позиции ${pos.symbol} ${pos.holdSide} через лимитный ордер, сторона: ${closeSide}, размер: ${pos.total}, цена: ${currentPrice}`);
              
              // Параметры для закрытия позиции через лимитный ордер
              const params = {
                symbol: pos.symbol,
                marginCoin: "USDT",
                marginMode: "isolated",
                size: pos.total,
                side: closeSide,
                orderType: "market", // Используем market для гарантированного закрытия
                price: null, // Для market ордера цена не нужна
                tradeSide: "close",
                productType: "USDT-FUTURES",
                reduceOnly: "YES"
              };
              
              logger.info(`Параметры для закрытия позиции: ${JSON.stringify(params)}`);
              
              const orderResponse = await this.client.submitOrder(params);
              
              if (orderResponse && orderResponse.code === '00000') {
                logger.info(`Позиция ${pos.symbol} ${pos.holdSide} успешно закрыта`);
                
                // Обновляем историю
                this.updatePositionHistory({
                  id: pos.positionId,
                  symbol: pos.symbol,
                  type: pos.holdSide.toUpperCase(),
                  entryPrice: parseFloat(pos.openPrice),
                  size: parseFloat(pos.total),
                  currentPrice: currentPrice
                }, 'closed', currentPrice);
              } else {
                logger.warn(`Не удалось закрыть позицию ${pos.symbol} ${pos.holdSide}: ${orderResponse ? orderResponse.msg : 'Нет ответа от API'}`);
              }
            } catch (closeError) {
              logger.error(`Ошибка при закрытии позиции ${pos.symbol} ${pos.holdSide}: ${closeError.message}`);
            }
          }
        }
        
        return true;
      }
      
      // Определяем сторону ордера на основе типа позиции (противоположную)
      const closeSide = position.type === 'LONG' ? 'sell' : 'buy';
      
      // Определяем размер закрытия
      let closeSize = (position.size * percentage) / 100;
      closeSize = parseFloat(closeSize.toFixed(5));
      
      logger.info(`Закрытие позиции ${positionId}: ${position.symbol} ${position.type}, размер=${closeSize}`);
      
      // Получаем текущую цену для символа
      const ticker = await this.client.getTicker(position.symbol);
      const currentPrice = ticker && ticker.data && ticker.data.last ? 
        parseFloat(ticker.data.last) : position.currentPrice;
      
      // Получаем информацию о символе
      const symbolInfo = await this.client.getSymbolInfo(position.symbol);
      
      // Для закрытия позиций используем market ордер (более надежно)
      try {
        logger.info(`Закрытие позиции через market ордер: ${closeSide} ${position.symbol}, размер=${closeSize}`);
        
        const orderResponse = await this.client.placeOrder(
          position.symbol,
          closeSide,
          'market',  // Используем market для гарантированного закрытия
          closeSize.toString(),
          null,  // Для market ордера цена не нужна
          true,  // reduceOnly = true
          'close' // tradeSide = close
        );
        
        if (!orderResponse || !orderResponse.data || orderResponse.code !== '00000') {
          logger.error(`Ошибка при закрытии позиции через market ордер: ${orderResponse ? orderResponse.msg : 'Нет ответа от API'}`);
          
          // Пробуем альтернативный метод с явным указанием всех параметров
          logger.info(`Пробуем альтернативный метод закрытия позиции...`);
          
          // Параметры для закрытия позиции
          const closeParams = {
            symbol: position.symbol,
            marginCoin: "USDT",
            marginMode: "isolated",
            size: closeSize.toString(),
            side: closeSide,
            orderType: "market",
            tradeSide: "close",
            productType: "USDT-FUTURES",
            reduceOnly: "YES"
          };
          
          logger.info(`Параметры для закрытия позиции: ${JSON.stringify(closeParams)}`);
          
          const alternativeResponse = await this.client.submitOrder(closeParams);
          
          if (!alternativeResponse || alternativeResponse.code !== '00000') {
            logger.error(`Не удалось закрыть позицию альтернативным методом: ${alternativeResponse ? alternativeResponse.msg : 'Нет ответа от API'}`);
            return false;
          }
          
          logger.info(`Позиция ${positionId} успешно закрыта альтернативным методом`);
        } else {
          logger.info(`Позиция ${positionId} успешно закрыта (${percentage}%)`);
        }
        
        // Обновляем историю позиции
        this.updatePositionHistory(position, 'closed', currentPrice);
        
        // При частичном закрытии обновляем размер позиции
        if (percentage < 100) {
          const updatedPosition = this.openPositions.find(p => p.id === positionId);
          if (updatedPosition) {
            updatedPosition.size = position.size - closeSize;
          }
        } else {
          // При полном закрытии удаляем позицию из списка открытых
          this.openPositions = this.openPositions.filter(p => p.id !== positionId);
        }
        
        this.emit('position_closed', { 
          positionId: positionId, 
          percentage: percentage
        });
        
        return true;
      } catch (error) {
        logger.error(`Ошибка при закрытии позиции через market ордер: ${error.message}`);
        
        // Пробуем закрыть позицию через API для закрытия всей позиции
        try {
          logger.info(`Пробуем закрыть всю позицию через API endpoint для закрытия...`);
          
          const closePositionResponse = await this.client.request('POST', '/api/v2/mix/position/close-position', {}, {
            symbol: position.symbol,
            marginCoin: 'USDT',
            productType: "USDT-FUTURES"
          });
          
          if (closePositionResponse && closePositionResponse.code === '00000') {
            logger.info(`Позиция ${positionId} успешно закрыта через endpoint close-position`);
            
            // Обновляем историю позиции
            this.updatePositionHistory(position, 'closed', currentPrice);
            
            // Удаляем позицию из списка открытых
            this.openPositions = this.openPositions.filter(p => p.id !== positionId);
            
            this.emit('position_closed', { 
              positionId: positionId, 
              percentage: 100
            });
            
            return true;
          }
          
          logger.error(`Не удалось закрыть позицию через endpoint close-position: ${closePositionResponse ? closePositionResponse.msg : 'Нет ответа от API'}`);
          return false;
        } catch (closePositionError) {
          logger.error(`Ошибка при закрытии позиции через endpoint close-position: ${closePositionError.message}`);
          return false;
        }
      }
    } catch (error) {
      logger.error('Ошибка при закрытии позиции: ' + error.message);
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
  
  // Добавляем метод для обновления трейлинг-стопов для открытых позиций
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
            // Добавляем необходимые параметры для API Bitget
            const trailingStopParams = {
              symbol: position.symbol,
              marginCoin: 'USDT',
              planType: "trailing_stop_plan",
              callbackRatio: this.config.trailingStop.stopDistance.toString(),
              size: position.size.toFixed(5),
              side: position.type === 'LONG' ? 'sell' : 'buy',
              triggerType: "market_price",
              tradeSide: "close",
              productType: "USDT-FUTURES",
              holdSide: position.type.toLowerCase(),
              direction: position.type === 'LONG' ? 'close_long' : 'close_short'
            };
            
            await this.client.submitPlanOrder(trailingStopParams);
            
            // Обновляем информацию о позиции
            position.trailingStopActivated = true;
            
            logger.info(`Активирован трейлинг-стоп для ${position.symbol} с отступом ${this.config.trailingStop.stopDistance}%`);
            
            this.emit('position_updated', position);
          } catch (trailingError) {
            logger.warn(`Ошибка при установке трейлинг-стопа: ${trailingError.message}`);
          }
        }
      }
    } catch (error) {
      logger.error('Ошибка при обновлении трейлинг-стопов: ' + error.message);
    }
  }
  
  // Добавляем метод для проверки максимальной продолжительности позиции
  async checkPositionDuration() {
    try {
      const maxDurationMs = this.config.maxTradeDurationMinutes * 60 * 1000;
      const now = new Date().getTime();
      
      for (const position of [...this.openPositions]) {
        const durationMs = now - position.entryTime;
        
        if (durationMs >= maxDurationMs) {
          logger.info(`Позиция ${position.symbol} достигла максимальной продолжительности (${this.config.maxTradeDurationMinutes} минут). Закрываем.`);
          await this.closePosition(position.id, 100);
        }
      }
    } catch (error) {
      logger.error('Ошибка при проверке продолжительности позиций: ' + error.message);
    }
  }
}

module.exports = PositionManager;