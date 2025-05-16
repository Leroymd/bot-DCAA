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
    logger.info(`Конфигурация PositionManager обновлена: maxTradeDurationMinutes=${this.config.maxTradeDurationMinutes}`);
  }

 // Улучшенный метод updateOpenPositions для PositionManager.js с исправлением 
// отображения цены входа в сделку и улучшенным логированием
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
    
    // Логируем весь ответ API для отладки
    logger.debug('Ответ API по позициям: ' + JSON.stringify(allPositionsResponse.data));
    
    // Обновляем список открытых позиций
    const apiPositions = allPositionsResponse.data;
    this.openPositions = [];
    
    const currentTimestamp = Date.now(); // Текущее время для вычисления длительности
    
    for (const position of apiPositions) {
      if (parseFloat(position.total) > 0) {
        // Логируем каждую позицию для отладки
        logger.debug('Обработка позиции: ' + JSON.stringify(position));
        
        // Проверяем возможные поля для цены входа
        let entryPrice = 0;
        const possiblePriceFields = ['openPriceAvg', 'openPrice', 'openPr', 'entryPrice', 'avgPrice', 'avgPr', 'markPrice', 'markPr'];
        
        for (const field of possiblePriceFields) {
          if (position[field] !== undefined && !isNaN(parseFloat(position[field]))) {
            entryPrice = parseFloat(position[field]);
            logger.debug(`Используем поле ${field} для цены входа: ${entryPrice}`);
            break;
          }
        }
        
        // Если не нашли цену входа, используем запасной вариант - markPrice или текущую цену
        if (entryPrice === 0) {
          if (position.markPrice && !isNaN(parseFloat(position.markPrice))) {
            entryPrice = parseFloat(position.markPrice);
            logger.warn(`Не найдена цена входа, используем markPrice: ${entryPrice}`);
          } else if (this.currentPrices[position.symbol]) {
            entryPrice = this.currentPrices[position.symbol];
            logger.warn(`Не найдена цена входа, используем текущую цену: ${entryPrice}`);
          } else {
            logger.error(`Не удалось определить цену входа для позиции ${position.symbol}`);
          }
        }
        
        // ИСПРАВЛЕНИЕ: ищем правильное поле времени в разных форматах
        // Bitget может использовать различные имена полей: createdAt, cTime, ctime, timestamp, uTime
        let entryTimeMs;
        
        // Для отладки выводим все поля, связанные со временем
        logger.debug(`Поля времени: createdAt=${position.createdAt}, cTime=${position.cTime}, ctime=${position.ctime}, timestamp=${position.timestamp}, uTime=${position.uTime}, createTime=${position.createTime}`);
        
        // Попробуем найти любое поле, связанное с временем создания
        const possibleTimeFields = ['cTime', 'ctime', 'createdAt', 'createTime', 'timestamp', 'uTime', 'updateTime'];
        let timeField = null;
        
        for (const field of possibleTimeFields) {
          if (position[field] !== undefined) {
            logger.debug(`Найдено поле времени: ${field} = ${position[field]}`);
            timeField = position[field];
            break;
          }
        }
        
        if (timeField) {
          // Обработка разных форматов времени
          if (typeof timeField === 'string') {
            if (timeField.length === 13) {
              // Миллисекунды (13 цифр)
              entryTimeMs = parseInt(timeField, 10);
            } else if (timeField.length === 10) {
              // Секунды (10 цифр)
              entryTimeMs = parseInt(timeField, 10) * 1000;
            } else if (timeField.includes('T') || timeField.includes('-')) {
              // ISO формат
              entryTimeMs = new Date(timeField).getTime();
            } else {
              // Другой формат числа в строке
              const parsed = parseInt(timeField, 10);
              entryTimeMs = !isNaN(parsed) ? 
                (parsed > 1700000000000 ? parsed : parsed * 1000) : // Если число слишком маленькое для таймстампа в мс, умножаем на 1000
                currentTimestamp;
            }
          } else if (typeof timeField === 'number') {
            // Числовой формат - проверяем, в секундах или миллисекундах
            entryTimeMs = timeField > 1700000000000 ? timeField : timeField * 1000;
          } else {
            logger.warn(`Непонятный формат времени для позиции ${position.symbol}: ${typeof timeField}`);
            entryTimeMs = currentTimestamp; // Используем текущее время как запасной вариант
          }
        } else {
          // Если не нашли ни одного поля времени, используем текущее время
          logger.warn(`Не найдены поля времени для позиции ${position.symbol}`);
          entryTimeMs = currentTimestamp;
        }
        
        // Проверка валидности и коррекция времени
        if (isNaN(entryTimeMs) || entryTimeMs <= 0) {
          logger.warn(`Невалидное значение времени для позиции ${position.symbol}: ${entryTimeMs}`);
          entryTimeMs = currentTimestamp;
        }
        
        // Дополнительная проверка - если время в будущем или слишком старое, используем текущее время
        if (entryTimeMs > currentTimestamp + 3600000 || entryTimeMs < (currentTimestamp - 365 * 24 * 3600 * 1000)) {
          logger.warn(`Подозрительное время для позиции ${position.symbol}: ${new Date(entryTimeMs).toISOString()}`);
          entryTimeMs = currentTimestamp;
        }
        
        logger.debug(`Итоговое время для позиции ${position.symbol}: ${new Date(entryTimeMs).toISOString()}`);
        
        // Проверка наличия и парсинг значения unrealizedPL
        let pnl = 0;
        let pnlPercentage = 0;
        
        // Возможные поля для PNL
        const possiblePnlFields = ['unrealizedPL', 'unrealizedPnl', 'pnl', 'profit'];
        for (const field of possiblePnlFields) {
          if (position[field] !== undefined && !isNaN(parseFloat(position[field]))) {
            pnl = parseFloat(position[field]);
            logger.debug(`Используем поле ${field} для PNL: ${pnl}`);
            break;
          }
        }
        
        // Расчет процента PNL
        const margin = parseFloat(position.margin || position.marginHeld || 1);
        pnlPercentage = pnl / margin * 100;
        
        const newPosition = {
          id: position.positionId || position.id,
          symbol: position.symbol,
          type: position.holdSide ? position.holdSide.toUpperCase() : 'UNKNOWN',
          entryPrice: entryPrice,
          size: parseFloat(position.total || position.size || 0),
          entryTime: entryTimeMs,
          leverage: parseFloat(position.leverage || 1),
          currentPrice: this.currentPrices[position.symbol] || 0,
          pnl: pnl,
          pnlPercentage: pnlPercentage
        };
        
        this.openPositions.push(newPosition);
      }
    }
    
    // Логируем все обработанные позиции
    logger.debug(`Обработано ${this.openPositions.length} открытых позиций`);
    for (const pos of this.openPositions) {
      logger.debug(`Позиция ${pos.symbol}: вход=${pos.entryPrice}, текущая=${pos.currentPrice}, время=${new Date(pos.entryTime).toISOString()}, длительность=${this.formatDuration(Date.now() - pos.entryTime)}`);
    }
    
    return this.openPositions;
  } catch (error) {
    logger.error('Ошибка при обновлении открытых позиций: ' + error.message);
    return this.openPositions;
  }
}

// Добавим метод форматирования длительности
formatDuration(ms) {
  try {
    // Проверяем, что ms - это валидное число
    if (isNaN(ms) || ms < 0) {
      logger.warn(`Невалидное значение для форматирования длительности: ${ms}`);
      return "00:00"; // Возвращаем значение по умолчанию для отображения
    }
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    // Форматируем с ведущими нулями для единообразия
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } catch (error) {
    logger.error(`Ошибка при форматировании длительности: ${error.message}`);
    return "00:00"; // В случае любой ошибки возвращаем стандартное время
  }
}

// Добавим метод форматирования длительности в PositionManager.js
formatDuration(ms) {
  try {
    // Проверяем, что ms - это валидное число
    if (isNaN(ms) || ms < 0) {
      logger.warn(`Невалидное значение для форматирования длительности: ${ms}`);
      return "00:00"; // Возвращаем значение по умолчанию для отображения
    }
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    // Форматируем с ведущими нулями для единообразия
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } catch (error) {
    logger.error(`Ошибка при форматировании длительности: ${error.message}`);
    return "00:00"; // В случае любой ошибки возвращаем стандартное время
  }
}

// Исправляем метод форматирования длительности
// Этот метод может быть в TradingBot.js или PositionManager.js
formatDuration(ms) {
  try {
    // Проверяем, что ms - это валидное число
    if (isNaN(ms) || ms < 0) {
      logger.warn(`Невалидное значение для форматирования длительности: ${ms}`);
      return "00:00"; // Возвращаем значение по умолчанию для отображения
    }
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    // Форматируем с ведущими нулями для единообразия
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } catch (error) {
    logger.error(`Ошибка при форматировании длительности: ${error.message}`);
    return "00:00"; // В случае любой ошибки возвращаем стандартное время
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
        logger.info(`Пользовательский размер позиции в USDT: ${positionSizeUSDT} USDT`);
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
        logger.warn(`Размер позиции (${positionSizeUSDT} USDT) меньше минимального (5 USDT), устанавливаем 5 USDT`);
        positionSizeUSDT = 5;
      }
      
      // ВАЖНО: Для Bitget USDT-фьючерсов параметр size - это количество контрактов (базовой валюты)
      // Конвертируем USDT в количество контрактов базовой валюты
      contractSize = positionSizeUSDT / price;
      
      // Округляем количество контрактов с учетом требований биржи
      // Получаем информацию о символе для определения точности
      let precisionDigits = 2; // По умолчанию 2 знака после запятой
      try {
        const symbolInfo = await this.client.getSymbolInfo(symbol);
        if (symbolInfo && symbolInfo.minOrderSize) {
          const minSize = parseFloat(symbolInfo.minOrderSize);
          precisionDigits = this.countDecimals(minSize);
        }
      } catch (err) {
        logger.warn(`Не удалось получить точность для ${symbol}, используем значение по умолчанию: ${precisionDigits}`);
      }
      
      // Форматируем размер с нужной точностью
      const formattedSize = contractSize.toFixed(precisionDigits);
      
      // Устанавливаем плечо для символа
      await this.client.setLeverage(symbol, 'isolated', this.config.leverage.toString());
      
      logger.info(`Размещение ордера: ${type === 'LONG' ? 'buy' : 'sell'} ${symbol}, размер=${formattedSize} контрактов (≈${positionSizeUSDT.toFixed(2)} USDT), плечо=${this.config.leverage}x`);
      
      // Определяем сторону ордера на основе типа позиции
      const side = type === 'LONG' ? 'buy' : 'sell';
      
      let orderResponse;
      
      // Если заданы TP или SL, используем метод с одновременной установкой TP/SL
      if (takeProfitPrice || stopLossPrice) {
        logger.info(`Открытие позиции с TP=${takeProfitPrice} и SL=${stopLossPrice}`);
        
        // Используем специальный метод для размещения ордера с TP/SL
        orderResponse = await this.client.placeOrderWithTpSl(
          symbol,
          side,
          'market',
          formattedSize,
          null,
          takeProfitPrice,
          stopLossPrice,
          'open' // явно указываем, что это открытие позиции
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
      
      logger.info(`Позиция успешно открыта: ${type} ${symbol} по цене ${price}, размер: ${formattedSize} контрактов, примерная стоимость: ${(parseFloat(formattedSize) * price).toFixed(2)} USDT`);
      
      // Получаем ID позиции
      const positionId = orderResponse.data.orderId;
      
      // Создаем новую запись о позиции
      const newPosition = {
        id: positionId,
        symbol: symbol,
        type: type,
        entryPrice: price,
        size: parseFloat(formattedSize),
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

  // Исправленный метод закрытия позиции по ID
  async closePosition(positionId, percentage = 100) {
    try {
      percentage = percentage || 100;
      
      // Находим позицию в списке открытых
      const positions = await this.updateOpenPositions();
      const position = positions.find(p => p.id === positionId);
      
      if (!position) {
        logger.warn(`Позиция с ID ${positionId} не найдена в списке открытых позиций`);
        return false;
      }
      
      // Получаем подробную информацию о позиции для закрытия
      const positionDetails = await this.client.getPositionDetails(position.symbol);
      if (!positionDetails || !positionDetails.data) {
        logger.error(`Не удалось получить детали позиции для ${position.symbol}`);
        return false;
      }
      
      logger.info(`Закрытие позиции ${position.symbol} ${position.type}, ID: ${positionId}`);
      
      try {
        // Закрываем позицию напрямую через рыночный ордер
        const response = await this.client.closePosition(position.symbol);
        
        if (response && response.code === '00000') {
          logger.info(`Позиция ${position.symbol} ${position.type} успешно закрыта`);
          
          // Обновляем историю позиций
          const ticker = await this.client.getTicker(position.symbol);
          const currentPrice = ticker && ticker.data && ticker.data.last 
            ? parseFloat(ticker.data.last) 
            : position.currentPrice;
          
          this.updatePositionHistory(position, 'closed', currentPrice);
          
          // Удаляем позицию из списка открытых
          this.openPositions = this.openPositions.filter(p => p.id !== positionId);
          
          // Отправляем событие о закрытии позиции
          this.emit('position_closed', { 
            positionId: positionId, 
            percentage: 100,
            price: currentPrice
          });
          
          return true;
        } else {
          logger.warn(`Не удалось закрыть позицию ${position.symbol} ${position.type} через API: ${response ? response.msg : 'Нет ответа от API'}`);
          
          // Если закрытие через API не удалось, пробуем закрыть лимитным ордером
          logger.info(`Пробуем закрыть позицию ${position.symbol} лимитным ордером...`);
          const limitResponse = await this.client.closePositionWithLimit(position.symbol);
          
          if (limitResponse && limitResponse.code === '00000') {
            logger.info(`Позиция ${position.symbol} ${position.type} успешно закрыта лимитным ордером`);
            
            // Обновляем историю
            const ticker = await this.client.getTicker(position.symbol);
            const currentPrice = ticker && ticker.data && ticker.data.last 
              ? parseFloat(ticker.data.last) 
              : position.currentPrice;
            
            this.updatePositionHistory(position, 'closed', currentPrice);
            
            // Удаляем позицию из списка открытых
            this.openPositions = this.openPositions.filter(p => p.id !== positionId);
            
            this.emit('position_closed', { 
              positionId: positionId, 
              percentage: 100
            });
            
            return true;
          } else {
            logger.error(`Не удалось закрыть позицию ${position.symbol} ${position.type} ни через API, ни лимитным ордером`);
            return false;
          }
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

  // Метод для закрытия позиции по символу
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
      
      // Получаем текущую цену
      const ticker = await this.client.getTicker(symbol);
      const currentPrice = ticker && ticker.data && ticker.data.last 
        ? parseFloat(ticker.data.last) 
        : position.currentPrice;
      
      logger.info(`Закрытие позиции ${symbol} ${position.type} через API`);
      
      try {
        // Закрываем позицию через API
        const response = await this.client.closePosition(symbol);
        
        if (response && response.code === '00000') {
          logger.info(`Позиция ${symbol} успешно закрыта через API`);
          
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
          logger.warn(`Не удалось закрыть позицию ${symbol} через API: ${response ? response.msg : 'Нет ответа от API'}`);
          
          // Если закрытие через API не удалось, пробуем закрыть лимитным ордером
          logger.info(`Пробуем закрыть позицию ${symbol} лимитным ордером...`);
          const limitResponse = await this.client.closePositionWithLimit(symbol);
          
          if (limitResponse && limitResponse.code === '00000') {
            logger.info(`Позиция ${symbol} успешно закрыта лимитным ордером`);
            
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
            logger.error(`Не удалось закрыть позицию ${symbol} ни через API, ни лимитным ордером`);
            return false;
          }
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
/**
 * Получение открытых позиций со всеми параметрами
 * @param {string} symbol - Символ торговой пары (опционально)
 * @param {string} marginCoin - Валюта маржи (по умолчанию USDT)
 * @returns {Promise<Object>} - Ответ от API с открытыми позициями
 */
async getPositions(symbol, marginCoin = 'USDT') {
  try {
    logger.debug(`Запрос открытых позиций: symbol=${symbol || 'all'}, marginCoin=${marginCoin}`);
    
    const params = { 
      productType: "USDT-FUTURES",
      marginCoin: marginCoin
    };
    
    if (symbol) {
      params.symbol = symbol;
    }
    
    const response = await this.request('GET', '/api/v2/mix/position/all-position', params);
    
    if (response && response.code === '00000' && response.data) {
      logger.debug(`Получено ${response.data.length} позиций от API`);
      
      // Логируем первую позицию для анализа структуры
      if (response.data.length > 0) {
        logger.debug(`Пример структуры позиции: ${JSON.stringify(response.data[0])}`);
        
        // Выводим все поля, связанные с временем, для первой позиции
        const position = response.data[0];
        const timeFields = ['cTime', 'ctime', 'createdAt', 'createTime', 'timestamp', 'uTime', 'updateTime'];
        
        logger.debug('Поля времени в первой позиции:');
        for (const field of timeFields) {
          if (position[field] !== undefined) {
            logger.debug(`- ${field}: ${position[field]}`);
          }
        }
      }
      
      // Добавляем обработку даты и времени для всех позиций
      const processedPositions = response.data.map(position => {
        // Если в ответе нет поля cTime или других полей времени,
        // добавим поле entryTime с текущим временем в миллисекундах
        const currentTime = Date.now();
        
        // Попытка найти любое поле времени в ответе API
        let entryTimeMs = null;
        
        // Приоритетные поля для времени создания позиции
        const timeFields = ['cTime', 'createdAt', 'createTime', 'ctime', 'timestamp', 'uTime'];
        
        for (const field of timeFields) {
          if (position[field] !== undefined) {
            const timeValue = position[field];
            
            // Определяем формат времени и конвертируем в миллисекунды
            if (typeof timeValue === 'string') {
              if (timeValue.length === 13) {
                entryTimeMs = parseInt(timeValue, 10);
              } else if (timeValue.length === 10) {
                entryTimeMs = parseInt(timeValue, 10) * 1000;
              } else if (timeValue.includes('T') || timeValue.includes('-')) {
                entryTimeMs = new Date(timeValue).getTime();
              } else {
                const parsed = parseInt(timeValue, 10);
                entryTimeMs = !isNaN(parsed) ? 
                  (parsed > 1700000000000 ? parsed : parsed * 1000) : 
                  currentTime;
              }
            } else if (typeof timeValue === 'number') {
              entryTimeMs = timeValue > 1700000000000 ? timeValue : timeValue * 1000;
            }
            
            break; // Используем первое найденное поле времени
          }
        }
        
        // Если ни одно поле времени не найдено, используем текущее время
        if (entryTimeMs === null) {
          entryTimeMs = currentTime;
        }
        
        // Для отладки логируем обработанное время
        logger.debug(`Позиция ${position.symbol}: время=${new Date(entryTimeMs).toISOString()}`);
        
        // Возвращаем объект позиции с добавленным полем entryTime 
        return {
          ...position,
          entryTime: entryTimeMs
        };
      });
      
      // Возвращаем модифицированный ответ с обработанными позициями
      return {
        ...response,
        data: processedPositions
      };
    }
    
    // Если ответ пустой или содержит ошибку
    if (!response || response.code !== '00000') {
      logger.warn(`Ошибка при получении позиций: ${response ? response.msg || response.code : 'Нет ответа от API'}`);
    }
    
    return response;
  } catch (error) {
    logger.error(`Ошибка в getPositions: ${error.message}`);
    
    if (error.response) {
      logger.error(`Детали ошибки API: ${JSON.stringify(error.response.data || {})}`);
    }
    
    throw error;
  }
}
  // Метод для установки TP/SL
  async setTpsl(symbol, type, takeProfitPrice, stopLossPrice) {
    try {
      // Проверяем параметры
      if (!symbol) {
        logger.error('Для установки TP/SL необходим символ');
        return false;
      }
      
      // Определяем holdSide на основе типа позиции
      const holdSide = type.toUpperCase() === 'LONG' ? 'LONG' : 'SHORT';
      
      let tpSuccess = true;
      let slSuccess = true;
      
      // Находим позицию для получения размера
      const position = this.openPositions.find(p => p.symbol === symbol);
      if (!position) {
        logger.warn(`Не найдена позиция для ${symbol}`);
        return false;
      }
      
      // Размер позиции в контрактах
      const size = position.size.toFixed(5);
      
      // Если указан Take Profit, устанавливаем его
      if (takeProfitPrice) {
        try {
          const tpResponse = await this.client.setTpsl(
            symbol,
            holdSide,
            'profit_plan',
            takeProfitPrice,
            size
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
            size
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
  
  // Метод для установки трейлинг-стопа
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
      
      // Приводим тип позиции к верхнему регистру для API
      const holdSide = type.toUpperCase();
      
      // Размер позиции в контрактах
      const size = position.size.toFixed(5);
      
      try {
        const response = await this.client.setTrailingStop(
          symbol,
          holdSide,            // В верхнем регистре для API
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
      // Проверяем, установлен ли параметр maxTradeDurationMinutes
      if (!this.config.maxTradeDurationMinutes || this.config.maxTradeDurationMinutes <= 0) {
        logger.debug('Параметр maxTradeDurationMinutes не установлен или равен 0, пропускаем проверку');
        return;
      }
      
      // Рассчитываем максимальную продолжительность в миллисекундах
      const maxDurationMs = this.config.maxTradeDurationMinutes * 60 * 1000;
      logger.debug(`Проверка максимальной продолжительности позиций (${this.config.maxTradeDurationMinutes} минут)`);
      
      // Текущее время
      const now = new Date().getTime();
      
      // Создаем копию массива позиций, чтобы избежать проблем при его изменении в процессе перебора
      const positionsToCheck = [...this.openPositions];
      
      // Проверяем каждую открытую позицию
      for (const position of positionsToCheck) {
        // Вычисляем продолжительность позиции в миллисекундах
        const durationMs = now - position.entryTime;
        
        // Если продолжительность превышает максимальную, закрываем позицию
        if (durationMs >= maxDurationMs) {
          logger.info(`Позиция ${position.symbol} достигла максимальной продолжительности (${this.config.maxTradeDurationMinutes} минут, фактически: ${(durationMs / 60000).toFixed(2)} минут). Закрываем.`);
          
          // Используем closePositionBySymbol вместо closePosition для большей надежности
          await this.closePositionBySymbol(position.symbol);
          
          // Даем небольшую паузу между закрытием позиций
          await new Promise(resolve => setTimeout(resolve, 500));
        } else {
          // Для отладки: выводим информацию о времени до истечения
          const remainingMs = maxDurationMs - durationMs;
          const remainingMinutes = (remainingMs / 60000).toFixed(2);
          logger.debug(`Позиция ${position.symbol} активна ${(durationMs / 60000).toFixed(2)} минут. Осталось ${remainingMinutes} минут до автоматического закрытия.`);
        }
      }
    } catch (error) {
      logger.error('Ошибка при проверке продолжительности позиций: ' + error.message);
    }
  }
  
  // Вспомогательная функция для определения количества знаков после запятой
  countDecimals(value) {
    if (Math.floor(value) === value) return 0;
    const strValue = value.toString();
    if (strValue.indexOf('.') !== -1) {
      return strValue.split('.')[1].length;
    }
    return 0;
  }
}

module.exports = PositionManager;