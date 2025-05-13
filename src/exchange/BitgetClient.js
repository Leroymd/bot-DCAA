// src/exchange/BitGetClient.js
const { RestClientV2 } = require('bitget-api');
const logger = require('../utils/logger');

class BitGetClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || '';
    this.apiSecret = options.apiSecret || '';
    this.passphrase = options.passphrase || '';
    this.debug = options.debug !== undefined ? options.debug : false;
    
    // Инициализация официального API клиента Bitget
    this.client = new RestClientV2({
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      apiPass: this.passphrase,
      debug: this.debug
    });
    
    if (this.debug) {
      logger.info('BitGet API инициализирован с официальной библиотекой:');
      logger.info('- API Key:', this.apiKey ? `${this.apiKey.substring(0, 4)}...` : 'Не установлен');
    }
    
    // Проверка наличия ключей API
    if (!this.apiKey || !this.apiSecret || !this.passphrase) {
      logger.error('API ключи не установлены. Для работы с реальной биржей необходимы ключи API.');
      throw new Error('API ключи не установлены');
    }
  }

  async getServerTime() {
    try {
      const response = await this.client.publicGetTime();
      return response;
    } catch (error) {
      logger.error(`Ошибка в getServerTime: ${error.message}`);
      throw error;
    }
  }

  async getAccountAssets(marginCoin = 'USDT') {
    try {
      logger.info(`Запрос балансов для ${marginCoin}...`);
      
      const response = await this.client.futuresAccountAssets({
        productType: "USDT-FUTURES", 
        marginCoin: marginCoin
      });
      
      if (this.debug) {
        // Выводим полученный баланс в логи для отладки
        if (response && response.data && response.data.length > 0) {
          logger.info(`Получен баланс: ${marginCoin} = ${response.data[0].available}`);
          logger.info(`Дополнительная информация о балансе: ${JSON.stringify(response.data[0])}`);
        } else {
          logger.warn(`Ответ API содержит пустые данные о балансе: ${JSON.stringify(response)}`);
        }
      }
      
      return response;
    } catch (error) {
      logger.error(`Ошибка при запросе баланса: ${error.message}`);
      throw error;
    }
  }
  
  async getPositions(symbol = '', marginCoin = 'USDT') {
    try {
      const params = { 
        productType: "USDT-FUTURES"
      };
      
      if (symbol) {
        params.symbol = symbol;
      }
      
      const response = await this.client.futuresPositions(params);
      return response;
    } catch (error) {
      logger.error(`Ошибка при получении позиций: ${error.message}`);
      throw error;
    }
  }

  async setLeverage(symbol, marginMode, leverage) {
    try {
      const response = await this.client.futuresSetLeverage({
        symbol,
        marginMode,
        leverage,
        productType: "USDT-FUTURES",
        marginCoin: "USDT"
      });
      return response;
    } catch (error) {
      logger.error(`Ошибка при установке плеча: ${error.message}`);
      throw error;
    }
  }

  async getOpenOrders(symbol, marginCoin = 'USDT') {
    try {
      const response = await this.client.futuresOpenOrders({
        symbol,
        productType: "USDT-FUTURES",
        marginCoin
      });
      return response;
    } catch (error) {
      logger.error(`Ошибка при получении открытых ордеров: ${error.message}`);
      throw error;
    }
  }

  async submitOrder(params) {
    try {
      const orderParams = {
        ...params,
        productType: "USDT-FUTURES"
      };
      
      if (this.debug) {
        logger.info(`Отправка ордера: ${JSON.stringify(orderParams)}`);
      }
      
      const response = await this.client.futuresPlaceOrder(orderParams);
      
      if (this.debug) {
        logger.info(`Ответ на отправку ордера: ${JSON.stringify(response)}`);
      }
      
      return response;
    } catch (error) {
      logger.error(`Ошибка при отправке ордера: ${error.message}`);
      throw error;
    }
  }

  async submitPlanOrder(params) {
    try {
      if (!params.planType) {
        params.planType = params.callbackRatio ? "trailing_stop_plan" : "normal_plan";
      }
      
      if (!params.tradeSide) {
        params.tradeSide = "close";
      }
      
      if (!params.force) {
        params.force = "gtc";
      }
      
      if (!params.triggerType) {
        params.triggerType = "market_price";
      }
      
      let response;
      if (params.planType === "profit_plan" || params.planType === "loss_plan") {
        if (this.debug) {
          logger.info(`Установка TP/SL: ${JSON.stringify(params)}`);
        }
        response = await this.client.futuresPlaceTpslOrder({
          ...params,
          productType: "USDT-FUTURES"
        });
      } else if (params.planType === "trailing_stop_plan") {
        if (!params.callbackRatio) {
          logger.warn("Предупреждение: для трейлинг-стопа необходимо указать callbackRatio");
          params.callbackRatio = "2";
        }
        
        if (this.debug) {
          logger.info(`Установка трейлинг-стопа: ${JSON.stringify(params)}`);
        }
        response = await this.client.futuresPlaceTrailingStopOrder({
          ...params,
          productType: "USDT-FUTURES"
        });
      } else {
        if (this.debug) {
          logger.info(`Установка плановой заявки: ${JSON.stringify(params)}`);
        }
        response = await this.client.futuresPlacePlanOrder({
          ...params,
          productType: "USDT-FUTURES"
        });
      }
      
      return response;
    } catch (error) {
      logger.error(`Ошибка при отправке плановой заявки: ${error.message}`);
      throw error;
    }
  }

  async cancelOrder(symbol, marginCoin, orderId) {
    try {
      const response = await this.client.futuresCancelOrder({
        symbol,
        marginCoin,
        orderId,
        productType: "USDT-FUTURES"
      });
      return response;
    } catch (error) {
      logger.error(`Ошибка при отмене ордера: ${error.message}`);
      throw error;
    }
  }

  async getCandles(symbol, granularity, limit = 100) {
    try {
      const intervalMap = {
        '1h': '1H',
        '2h': '2H',
        '4h': '4H', 
        '6h': '6H',
        '12h': '12H',
        '1d': '1D',
        '1w': '1W',
        '1M': '1M'
      };
      
      const formattedInterval = intervalMap[granularity.toLowerCase()] || granularity;
      
      const response = await this.client.futuresCandles({
        symbol,
        granularity: formattedInterval,
        limit: limit.toString(),
        productType: "USDT-FUTURES"
      });
      
      return response;
    } catch (error) {
      logger.error(`Ошибка при получении свечей: ${error.message}`);
      throw error;
    }
  }

  async getTicker(symbol) {
    try {
      const response = await this.client.futuresTicker({
        symbol, 
        productType: "USDT-FUTURES"
      });
      
      // Преобразуем ответ к формату, ожидаемому в коде бота
      if (response && response.data) {
        const dataItem = Array.isArray(response.data) ? response.data[0] : response.data;
        if (dataItem.lastPr && !dataItem.last) {
          dataItem.last = dataItem.lastPr;
        }
        return { code: '00000', data: dataItem };
      }
      
      return response;
    } catch (error) {
      logger.error(`Ошибка в getTicker: ${error.message}`);
      throw error;
    }
  }

  async getSymbolInfo(symbol) {
    try {
      const response = await this.client.futuresContracts({
        productType: "USDT-FUTURES"
      });
      
      if (!response || !response.data || !Array.isArray(response.data)) {
        logger.warn(`Не удалось получить информацию о символе ${symbol}`);
        return null;
      }
      
      // Ищем наш символ в списке
      const symbolInfo = response.data.find(item => item.symbol === symbol);
      if (!symbolInfo) {
        logger.warn(`Символ ${symbol} не найден в списке доступных`);
        return null;
      }
      
      return symbolInfo;
    } catch (error) {
      logger.error(`Ошибка при получении информации о символе ${symbol}: ${error.message}`);
      return null;
    }
  }

  // Функция для форматирования цены с учетом минимального шага
  formatPrice(price, symbol) {
    try {
      // Если символ уже содержит информацию о minPriceStep
      if (typeof symbol === 'object' && symbol.minPriceStep) {
        const precision = this.countDecimals(symbol.minPriceStep);
        return parseFloat(price).toFixed(precision);
      }
      
      // По умолчанию используем 4 знака после запятой
      return parseFloat(price).toFixed(4);
    } catch (error) {
      logger.warn(`Ошибка форматирования цены: ${error.message}, возвращаем исходное значение`);
      return price.toString();
    }
  }

  // Вспомогательная функция для подсчета количества знаков после запятой
  countDecimals(value) {
    if (Math.floor(value) === value) return 0;
    return value.toString().split(".")[1].length || 0;
  }

  async placeOrder(symbol, side, orderType, size, price = null, reduceOnly = false, tradeSide = "open") {
    try {
      if (!symbol) {
        throw new Error('Для размещения ордера необходим символ');
      }

      // Проверяем корректность параметров
      const normalizedSide = side.toLowerCase();
      if (normalizedSide !== 'buy' && normalizedSide !== 'sell') {
        throw new Error(`Неверное значение стороны: ${side}`);
      }

      const validTradeSide = tradeSide.toLowerCase();
      if (validTradeSide !== 'open' && validTradeSide !== 'close') {
        throw new Error(`Неверное значение tradeSide: ${tradeSide}`);
      }

      // Для лимитных ордеров получаем информацию о символе для правильного форматирования цены
      let formattedPrice = price;
      if (orderType.toLowerCase() === 'limit' && price) {
        // Получаем информацию о символе для правильного форматирования цены
        const symbolInfo = await this.getSymbolInfo(symbol);
        if (symbolInfo) {
          formattedPrice = this.formatPrice(price, symbolInfo);
          logger.info(`Отформатированная цена для ${symbol}: ${formattedPrice} (исходная: ${price})`);
        }
      }

      // Создаем параметры для ордера
      const params = {
        symbol,
        marginCoin: 'USDT',
        size: size.toString(),
        side: normalizedSide,
        orderType: orderType.toLowerCase(),
        timeInForce: 'gtc',
        marginMode: 'isolated',
        clientOid: `order_${Date.now()}`,
        tradeSide: validTradeSide,
        productType: "USDT-FUTURES"
      };

      // Для лимитных ордеров добавляем цену
      if (orderType.toLowerCase() === 'limit' && formattedPrice) {
        params.price = formattedPrice.toString();
      }

      // Добавляем флаг reduceOnly, если нужно
      if (reduceOnly) {
        params.reduceOnly = "YES";
        params.tradeSide = "close"; // При reduceOnly всегда используем close
      }

      if (this.debug) {
        logger.info(`Размещение ордера с параметрами: ${JSON.stringify(params)}`);
      }
      
      // Отправляем ордер через официальную библиотеку
      const response = await this.client.futuresPlaceOrder(params);
      
      if (this.debug) {
        logger.info(`Результат размещения ордера: ${JSON.stringify(response)}`);
      }
      
      return response;
    } catch (error) {
      logger.error(`Ошибка размещения ордера: ${error.message}`);
      throw error;
    }
  }

  async getOrderDetails(symbol, orderId) {
    try {
      const response = await this.client.futuresOrderDetails({
        symbol,
        orderId,
        productType: "USDT-FUTURES"
      });
      return response;
    } catch (error) {
      logger.error(`Ошибка при получении деталей ордера: ${error.message}`);
      throw error;
    }
  }

  async getExchangeInfo() {
    try {
      const response = await this.client.futuresContracts({
        productType: "USDT-FUTURES"
      });
      return response;
    } catch (error) {
      logger.error(`Ошибка при получении информации о бирже: ${error.message}`);
      throw error;
    }
  }

  async getHistoricalOrders(symbol, startTime, endTime, pageSize = 100) {
    try {
      const response = await this.client.futuresHistoryOrders({
        symbol,
        startTime,
        endTime,
        pageSize: pageSize.toString(),
        productType: "USDT-FUTURES"
      });
      return response;
    } catch (error) {
      logger.error(`Ошибка при получении истории ордеров: ${error.message}`);
      throw error;
    }
  }
  
  async setTpsl(symbol, positionSide, planType, triggerPrice, size) {
    try {
      // Проверяем правильность параметра positionSide
      if (!positionSide || (positionSide !== 'long' && positionSide !== 'short')) {
        logger.warn(`Неверное значение positionSide: ${positionSide}. Должно быть 'long' или 'short'`);
        positionSide = 'long';
      }
      
      // Получаем информацию о символе для правильного форматирования цены
      const symbolInfo = await this.getSymbolInfo(symbol);
      let formattedTriggerPrice = triggerPrice;
      
      if (symbolInfo) {
        formattedTriggerPrice = this.formatPrice(triggerPrice, symbolInfo);
        logger.info(`Отформатированная цена триггера для ${symbol}: ${formattedTriggerPrice} (исходная: ${triggerPrice})`);
      }
    
      // Определяем направление закрытия для API Bitget
      const direction = positionSide === 'long' ? 'close_long' : 'close_short';
      
      const params = {
        symbol,
        marginCoin: 'USDT',
        planType, // "profit_plan" или "loss_plan"
        triggerPrice: formattedTriggerPrice.toString(),
        size: size.toString(),
        positionSide, // "long" или "short"
        holdSide: positionSide, // Дублируем значение как holdSide для API V2
        direction, // Обязательный параметр для API V2
        productType: "USDT-FUTURES",
        triggerType: "market_price", // Используем рыночную цену для триггера
        tradeSide: "close" // Указываем, что это закрытие позиции
      };
      
      if (this.debug) {
        logger.info(`Установка TP/SL: ${JSON.stringify(params)}`);
      }
      
      const response = await this.client.futuresPlaceTpslOrder(params);
      return response;
    } catch (error) {
      logger.error(`Ошибка при установке TP/SL: ${error.message}`);
      throw error;
    }
  }
  
  async setTrailingStop(symbol, positionSide, callbackRatio, size) {
    try {
      // Для Bitget нужно преобразовать positionSide в side (buy/sell)
      // long -> sell (для закрытия long позиции нужно sell)
      // short -> buy (для закрытия short позиции нужно buy)
      const side = positionSide.toLowerCase() === "long" ? "sell" : "buy";
      
      const params = {
        symbol,
        marginCoin: 'USDT',
        planType: "trailing_stop_plan",
        callbackRatio: callbackRatio.toString(),
        size: size.toString(),
        side: side,
        triggerType: "market_price",
        tradeSide: "close", // Важно указать close для закрытия позиции
        productType: "USDT-FUTURES",
        direction: positionSide.toLowerCase() === "long" ? "close_long" : "close_short"
      };
      
      if (this.debug) {
        logger.info(`Установка трейлинг-стопа для ${symbol}: ${JSON.stringify(params)}`);
      }
      
      const response = await this.client.futuresPlaceTrailingStopOrder(params);
      return response;
    } catch (error) {
      logger.error(`Ошибка при установке трейлинг-стопа: ${error.message}`);
      throw error;
    }
  }
  
  // Метод для закрытия позиции
  async closePosition(symbol, marginCoin = 'USDT') {
    try {
      const response = await this.client.futuresClosePosition({
        symbol,
        marginCoin,
        productType: "USDT-FUTURES"
      });
      return response;
    } catch (error) {
      logger.error(`Ошибка при закрытии позиции: ${error.message}`);
      throw error;
    }
  }
  
  // Метод для отправки произвольного запроса к API
  async request(method, endpoint, params = {}, data = null) {
    try {
      if (method.toUpperCase() === 'GET') {
        // Для GET запросов используем метод fetchRequest из SDK
        const response = await this.client.fetchRequest({ 
          method: 'GET', 
          path: endpoint, 
          params 
        });
        return response;
      } else {
        // Для POST запросов
        const response = await this.client.fetchRequest({ 
          method: 'POST', 
          path: endpoint, 
          params: params, 
          body: data 
        });
        return response;
      }
    } catch (error) {
      logger.error(`Ошибка при выполнении запроса (${method} ${endpoint}): ${error.message}`);
      throw error;
    }
  }
}

module.exports = BitGetClient;