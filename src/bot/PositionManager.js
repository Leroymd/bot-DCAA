// 2. Обновление PositionManager.js
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

  async openPosition(type, symbol, price, reason, confidenceLevel) {
    try {
      if (!this.client || !price) {
        logger.error('Не удалось открыть позицию: отсутствует клиент API или цена.');
        return null;
      }
      
      // Определяем размер позиции на основе баланса и процента риска
      const accountInfoResponse = await this.client.getAccountAssets();
      if (!accountInfoResponse || !accountInfoResponse.data || accountInfoResponse.data.length === 0) {
        logger.error('Не удалось получить информацию о балансе аккаунта');
        return null;
      }
      
      const availableBalance = parseFloat(accountInfoResponse.data[0].available);
      const positionSizeUSDT = (availableBalance * this.config.positionSize) / 100;
      
      if (positionSizeUSDT < 5) {
        logger.warn(`Слишком маленький размер позиции: ${positionSizeUSDT}. Минимум 5 USDT.`);
        return null;
      }
      
      // Определяем количество контрактов на основе цены
      const contractSize = positionSizeUSDT / price;
      
      // Устанавливаем плечо для символа
      await this.client.setLeverage(symbol, 'isolated', this.config.leverage.toString());
      
      // Определяем сторону ордера на основе типа позиции
      const side = type === 'LONG' ? 'buy' : 'sell';
      
      // Открываем позицию через API
      const orderResponse = await this.client.placeOrder(
        symbol,
        side,
        'market',
        contractSize.toFixed(5),
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
      
      // Устанавливаем стоп-лосс и тейк-профит
      if (this.config.stopLossPercentage > 0) {
        const stopPrice = type === 'LONG' 
          ? price * (1 - this.config.stopLossPercentage / 100) 
          : price * (1 + this.config.stopLossPercentage / 100);
        
        await this.client.setTpsl(
          symbol, 
          type.toLowerCase(), 
          'loss_plan', 
          stopPrice.toFixed(5), 
          contractSize.toFixed(5)
        );
        
        logger.info(`Установлен стоп-лосс для ${symbol} на уровне ${stopPrice.toFixed(5)}`);
      }
      
      if (this.config.takeProfitPercentage > 0) {
        const takeProfitPrice = type === 'LONG' 
          ? price * (1 + this.config.takeProfitPercentage / 100) 
          : price * (1 - this.config.takeProfitPercentage / 100);
        
        await this.client.setTpsl(
          symbol, 
          type.toLowerCase(), 
          'profit_plan', 
          takeProfitPrice.toFixed(5), 
          contractSize.toFixed(5)
        );
        
        logger.info(`Установлен тейк-профит для ${symbol} на уровне ${takeProfitPrice.toFixed(5)}`);
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

  async closePosition(positionId, percentage) {
    try {
      percentage = percentage || 100;
      
      const position = this.openPositions.find(function(p) { return p.id === positionId; });
      
      if (!position) {
        logger.warn('Позиция с ID ' + positionId + ' не найдена');
        return false;
      }
      
      // Определяем сторону ордера на основе типа позиции
      const side = position.type === 'LONG' ? 'sell' : 'buy';
      
      // Определяем размер закрытия
      const closeSize = (position.size * percentage) / 100;
      
      // Закрываем позицию через API
      const orderResponse = await this.client.placeOrder(
        position.symbol,
        side,
        'market',
        closeSize.toFixed(5),
        null,
        true,
        'close'
      );
      
      if (!orderResponse || !orderResponse.data || orderResponse.code !== '00000') {
        logger.error(`Ошибка при закрытии позиции: ${orderResponse ? orderResponse.msg : 'Нет ответа от API'}`);
        return false;
      }
      
      logger.info(`Позиция ${positionId} успешно закрыта (${percentage}%)`);
      
      // Получаем текущую цену для расчета PnL
      const ticker = await this.client.getTicker(position.symbol);
      const closePrice = ticker && ticker.data && ticker.data.last ? parseFloat(ticker.data.last) : position.entryPrice;
      
      // Обновляем историю позиции
      this.updatePositionHistory(position, 'closed', closePrice);
      
      // При частичном закрытии обновляем размер позиции
      if (percentage < 100) {
        const updatedPosition = this.openPositions.find(p => p.id === positionId);
        if (updatedPosition) {
          updatedPosition.size = position.size - closeSize;
        }
      } else {
        // При полном закрытии удаляем позицию из списка открытых
        this.openPositions = this.openPositions.filter(function(p) { return p.id !== positionId; });
      }
      
      this.emit('position_closed', { 
        positionId: positionId, 
        percentage: percentage
      });
      
      return true;
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
          // Устанавливаем трейлинг-стоп через API
          await this.client.setTrailingStop(
            position.symbol,
            position.type.toLowerCase(),
            this.config.trailingStop.stopDistance.toString(),
            position.size.toFixed(5)
          );
          
          // Обновляем информацию о позиции
          position.trailingStopActivated = true;
          
          logger.info(`Активирован трейлинг-стоп для ${position.symbol} с отступом ${this.config.trailingStop.stopDistance}%`);
          
          this.emit('position_updated', position);
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
