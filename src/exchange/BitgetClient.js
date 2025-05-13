// src/exchange/BitGetClient.js
const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');
const logger = require('../utils/logger');

class BitGetClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || '';
    this.apiSecret = options.apiSecret || '';
    this.passphrase = options.passphrase || '';
    this.baseUrl = options.baseUrl || 'https://api.bitget.com';
    this.wsUrl = options.wsUrl || 'wss://ws.bitget.com/spot/v1/stream';
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.debug = options.debug !== undefined ? options.debug : false;
    
    if (this.debug) {
      logger.info('BitGet API инициализирован:');
      logger.info('- API Key:', this.apiKey ? `${this.apiKey.substring(0, 4)}...` : 'Не установлен');
    }
    
    // Проверка наличия ключей API
    if (!this.apiKey || !this.apiSecret || !this.passphrase) {
      logger.error('API ключи не установлены. Для работы с реальной биржей необходимы ключи API.');
      throw new Error('API ключи не установлены');
    }
  }

  generateSignature(timestamp, method, requestPath, body = '') {
    try {
      const message = timestamp + method.toUpperCase() + requestPath + (body || '');
      
      if (this.debug) {
        // Выводим данные для подписи (но скрываем секретный ключ)
        logger.info(`Generating signature for: [${timestamp}][${method.toUpperCase()}][${requestPath}]${body ? '[BODY]' : ''}`);
      }
      
      const signature = crypto
        .createHmac('sha256', this.apiSecret)
        .update(message)
        .digest('base64');
      
      if (this.debug) {
        logger.info(`Generated signature: ${signature.substring(0, 10)}...`);
      }
      
      return signature;
    } catch (error) {
      logger.error(`Error generating signature: ${error.message}`);
      throw error;
    }
  }

  async request(method, endpoint, params = {}, data = null, retryCount = 0) {
    try {
      const timestamp = Date.now().toString();
      let requestPath = endpoint;
      let url = `${this.baseUrl}${endpoint}`;
      let queryString = '';
      
      // Корректно обрабатываем параметры для GET-запросов
      if (params && Object.keys(params).length > 0 && method.toUpperCase() === 'GET') {
        queryString = '?' + querystring.stringify(params);
        requestPath += queryString;
        url += queryString;
      }
      
      const jsonData = data ? JSON.stringify(data) : '';
      
      // Для эндпоинтов, требующих аутентификацию
      const requiresAuth = !endpoint.startsWith('/api/v2/public/');
      
      let headers = {
        'Content-Type': 'application/json'
      };
      
      if (requiresAuth) {
        // Добавляем аутентификационные заголовки только для приватных эндпоинтов
        const signature = this.generateSignature(timestamp, method, requestPath, jsonData);
        
        headers = {
          ...headers,
          'ACCESS-KEY': this.apiKey,
          'ACCESS-SIGN': signature,
          'ACCESS-TIMESTAMP': timestamp,
          'ACCESS-PASSPHRASE': this.passphrase
        };
        
        if (this.demo) {
          headers['X-SIMULATED-TRADING'] = '1';
        }
      }
      
      if (this.debug) {
        logger.info(`API Request: ${method.toUpperCase()} ${url}`);
        if (params && Object.keys(params).length > 0) {
          logger.info('Request params:', JSON.stringify(params));
        }
        if (jsonData) {
          logger.info('Request body:', jsonData);
        }
        
        // Логируем заголовки запроса (скрываем секретные данные)
        const logHeaders = { ...headers };
        if (logHeaders['ACCESS-KEY']) logHeaders['ACCESS-KEY'] = `${logHeaders['ACCESS-KEY'].substring(0, 5)}...`;
        if (logHeaders['ACCESS-SIGN']) logHeaders['ACCESS-SIGN'] = `${logHeaders['ACCESS-SIGN'].substring(0, 5)}...`;
        if (logHeaders['ACCESS-PASSPHRASE']) logHeaders['ACCESS-PASSPHRASE'] = '******';
        
        logger.info('Request headers:', JSON.stringify(logHeaders));
      }
      
      const response = await axios({
        method: method.toUpperCase(),
        url,
        headers,
        data: jsonData || undefined,
        timeout: this.timeout
      });
      
      if (this.debug) {
        logger.info(`API Response (${method.toUpperCase()} ${endpoint}): ${response.status} ${response.statusText}`);
        logger.info(`Response data: ${JSON.stringify(response.data)}`);
      }
      
      return response.data;
    } catch (error) {
      logger.error(`API Error (${method.toUpperCase()} ${endpoint}): ${error.message}`);
      
      if (error.response) {
        logger.error('Response status:', error.response.status);
        logger.error('Response data:', JSON.stringify(error.response.data));
        
        // Анализируем ошибки от API
        if (error.response.data && error.response.data.code) {
          switch(error.response.data.code) {
            case '40037':
              logger.error('API ключ не существует. Проверьте правильность API ключа и убедитесь, что он активен на бирже BitGet');
              break;
            case '40002':
              logger.error('Ошибка подписи. Проверьте формат и правильность секретного ключа');
              break;
            case '40003':
              logger.error('Ошибка passphrase. Проверьте правильность passphrase');
              break;
            default:
              logger.error(`Код ошибки API: ${error.response.data.code}, сообщение: ${error.response.data.msg}`);
          }
        }
      }
      
      if (retryCount < this.maxRetries && 
        (error.code === 'ECONNABORTED' || 
         error.code === 'ETIMEDOUT' || 
         (error.response && error.response.status >= 500))) {
      
        logger.info(`Retrying request (${retryCount + 1}/${this.maxRetries}) after ${this.retryDelay}ms...`);
        
        await new Promise(r => setTimeout(r, this.retryDelay));
        
        return this.request(method, endpoint, params, data, retryCount + 1);
      }
      
      throw error;
    }
  }

  // Метод для получения времени сервера
  async getServerTime() {
    try {
      return await this.request('GET', '/api/v2/public/time');
    } catch (error) {
      logger.error(`Ошибка в getServerTime: ${error.message}`);
      throw error;
    }
  }

  // Добавляем алиас метода для совместимости с ожидаемым API
  async publicGetTime() {
    try {
      logger.info('Вызван метод publicGetTime (алиас для getServerTime)');
      return await this.getServerTime();
    } catch (error) {
      logger.error(`Ошибка в publicGetTime: ${error.message}`);
      throw error;
    }
  }

  async getAccountAssets(marginCoin = 'USDT') {
    try {
      logger.info(`Запрос балансов для ${marginCoin}...`);
      
      const endpoint = '/api/v2/mix/account/accounts';
      const params = { productType: "USDT-FUTURES", marginCoin };
      
      const response = await this.request('GET', endpoint, params);
      
      if (!response) {
        logger.warn('Пустой ответ при запросе баланса');
        return { code: 'ERROR', msg: 'Empty response', data: null };
      }
      
      if (response.code && response.code !== '00000') {
        logger.warn(`Ошибка API при запросе баланса: ${response.code} - ${response.msg}`);
        return response;
      }
      
      if (this.debug) {
        // Выводим полученный баланс в логи для отладки
        if (response.data && response.data.length > 0) {
          logger.info(`Получен баланс: ${marginCoin} = ${response.data[0].available}`);
          logger.info(`Дополнительная информация о балансе: ${JSON.stringify(response.data[0])}`);
        } else {
          logger.warn(`Ответ API содержит пустые данные о балансе: ${JSON.stringify(response)}`);
        }
      }
      
      return response;
    } catch (error) {
      logger.error(`Ошибка при запросе баланса: ${error.message}`);
      if (error.response) {
        logger.error(`Ответ сервера: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
  
  async getPositions(symbol, marginCoin = 'USDT') {
    const params = { productType: "USDT-FUTURES" };
    if (symbol) params.symbol = symbol;
    return this.request('GET', '/api/v2/mix/position/all-position', params);
  }

  async setLeverage(symbol, marginMode, leverage) {
    return this.request('POST', '/api/v2/mix/account/set-leverage', {}, {
      symbol,
      marginMode,
      leverage,
      productType: "USDT-FUTURES",
      marginCoin: "USDT"
    });
  }

  async getOpenOrders(symbol, marginCoin = 'USDT') {
    return this.request('GET', '/api/v2/mix/order/current', {
      symbol,
      productType: "USDT-FUTURES",
      marginCoin
    });
  }

  async submitOrder(params) {
    const orderParams = {
      ...params,
      productType: "USDT-FUTURES"
    };
    return this.request('POST', '/api/v2/mix/order/place-order', {}, orderParams);
  }

  async submitPlanOrder(params) {
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
      params.triggerType = "mark_price";
    }
    
    let endpoint = '/api/v2/mix/order/place-plan-order';
    
    if (params.planType === "profit_plan" || params.planType === "loss_plan") {
      endpoint = '/api/v2/mix/order/place-tpsl-order';
    }
    
    if (params.planType === "trailing_stop_plan" && !params.callbackRatio) {
      logger.warn("Предупреждение: для трейлинг-стопа необходимо указать callbackRatio");
      params.callbackRatio = "2";
    }
    
    const planParams = {
      ...params,
      productType: "USDT-FUTURES"
    };
    
    return this.request('POST', endpoint, {}, planParams);
  }

  async cancelOrder(symbol, marginCoin, orderId) {
    return this.request('POST', '/api/v2/mix/order/cancel-order', {}, {
      symbol,
      marginCoin,
      orderId,
      productType: "USDT-FUTURES"
    });
  }

  async getCandles(symbol, granularity, limit = 100) {
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
    
    return this.request('GET', '/api/v2/mix/market/candles', {
      symbol,
      granularity: formattedInterval,
      limit,
      productType: "USDT-FUTURES"
    });
  }

  async getTicker(symbol) {
    try {
      const response = await this.request('GET', '/api/v2/mix/market/ticker', { 
        symbol, 
        productType: "USDT-FUTURES" 
      });
      
      if (!response) {
        logger.warn(`Пустой ответ для getTicker ${symbol}`);
        return { code: 'ERROR', msg: 'Пустой ответ', data: null };
      }
      
      if (response.code && response.code !== '00000') {
        logger.warn(`API ошибка getTicker: ${response.code} - ${response.msg}`);
        return response;
      }
      
      if (response.data && Array.isArray(response.data) && response.data.length > 0) {
        const dataItem = response.data[0];
        if (dataItem.lastPr && !dataItem.last) {
          dataItem.last = dataItem.lastPr;
        }
        return { code: '00000', data: dataItem };
      } 
      else if (response.data && typeof response.data === 'object') {
        if (response.data.lastPr && !response.data.last) {
          response.data.last = response.data.lastPr;
        }
        return response;
      }
      else if (response.ticker || response.tickers) {
        const tickerData = response.ticker || (Array.isArray(response.tickers) ? response.tickers[0] : null);
        if (tickerData) {
          if (tickerData.lastPr && !tickerData.last) {
            tickerData.last = tickerData.lastPr;
          }
          return { code: '00000', data: tickerData };
        }
      }
      
      if (response.last || response.price || response.lastPr || 
          (response.data && (response.data.last || response.data.price || response.data.lastPr))) {
        const lastPrice = response.last || response.price || response.lastPr || 
                          (response.data && (response.data.last || response.data.price || response.data.lastPr));
        return { code: '00000', data: { last: lastPrice } };
      }
      
      return response;
    } catch (error) {
      logger.error(`Ошибка в getTicker: ${error.message}`);
      throw error;
    }
  }

  // Функция для получения информации о символе и его правилах
  async getSymbolInfo(symbol) {
    try {
      const response = await this.request('GET', '/api/v2/mix/market/contracts', {
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
    // Форматирование цены в строку с точностью, подходящей для данного символа
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
    if (!symbol) {
      const error = new Error('Для размещения ордера необходим символ');
      return Promise.reject(error);
    }

    const normalizedSide = side.toLowerCase();
    if (normalizedSide !== 'buy' && normalizedSide !== 'sell') {
      logger.error(`Неверное значение стороны: ${side}`);
      return Promise.reject(new Error(`Неверное значение стороны: ${side}`));
    }

    // Проверяем значение tradeSide
    const validTradeSide = tradeSide.toLowerCase();
    if (validTradeSide !== 'open' && validTradeSide !== 'close') {
      logger.error(`Неверное значение tradeSide: ${tradeSide}`);
      return Promise.reject(new Error(`Неверное значение tradeSide. Допустимые значения: open, close`));
    }

    try {
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

      const params = {
        symbol,
        marginCoin: 'USDT',
        size: size.toString(),
        side: normalizedSide,
        orderType: orderType.toLowerCase(),
        force: 'gtc', // Good-Till-Cancel
        marginMode: 'isolated',
        clientOid: `order_${Date.now()}`,
        tradeSide: validTradeSide,
        productType: "USDT-FUTURES"
      };

      if (reduceOnly === true) {
        params.tradeSide = "close"; // Всегда используем close при reduceOnly=true
        params.reduceOnly = "YES"; // Bitget требует строку "YES"
      }

      if (orderType.toLowerCase() === 'limit' && formattedPrice) {
        params.price = formattedPrice.toString();
        // Для Bitget V2 API нужно использовать timeInForce вместо force
        params.timeInForce = params.force;
        delete params.force;
      }

      if (this.debug) {
        logger.info(`Размещение ордера с параметрами: ${JSON.stringify(params)}`);
      }
      
      const result = await this.submitOrder(params);
      if (this.debug) {
        logger.info(`Результат размещения ордера: ${JSON.stringify(result)}`);
      }
      return result;
    } catch (error) {
      logger.error(`Ошибка размещения ордера: ${error.message}`);
      
      if (error.response) {
        logger.error('Данные ответа:', JSON.stringify(error.response.data));
        logger.error('Статус ответа:', error.response.status);
      }
      
      return Promise.reject(error);
    }
  }

  async getOrderDetails(symbol, orderId) {
    return this.request('GET', '/api/v2/mix/order/detail', {
      symbol,
      orderId,
      productType: "USDT-FUTURES"
    });
  }

  async getExchangeInfo() {
    return this.request('GET', '/api/v2/mix/market/contracts', {
      productType: "USDT-FUTURES"
    });
  }

  async getHistoricalOrders(symbol, startTime, endTime, pageSize = 100) {
    return this.request('GET', '/api/v2/mix/order/history', {
      symbol,
      startTime,
      endTime,
      pageSize,
      productType: "USDT-FUTURES"
    });
  }
  
  // Метод для закрытия позиции по ID или по символу
  async closePosition(symbol, marginCoin = 'USDT') {
    logger.info(`Закрытие позиции по символу ${symbol}`);
    return this.request('POST', '/api/v2/mix/position/close-position', {}, {
      symbol: symbol,
      marginCoin: marginCoin,
      productType: "USDT-FUTURES",
      marginMode: "isolated"
    });
  }
  
  // Алиас для closePosition для поддержки закрытия позиции по символу
  async closePositionBySymbol(symbol, marginCoin = 'USDT') {
    logger.info(`Закрытие позиции по символу ${symbol} через метод closePositionBySymbol`);
    return this.closePosition(symbol, marginCoin);
  }
  
  // Метод для установки стоп-лосса и тейк-профита
  async setTpsl(symbol, positionSide, planType, triggerPrice, size) {
    // Проверяем правильность параметра positionSide
    if (!positionSide || (positionSide !== 'long' && positionSide !== 'short')) {
      logger.warn(`Неверное значение positionSide: ${positionSide}. Должно быть 'long' или 'short'`);
      // Устанавливаем значение по умолчанию для предотвращения ошибки
      positionSide = 'long';
    }
    
    // Получаем информацию о символе для правильного форматирования цены
    const symbolInfo = await this.getSymbolInfo(symbol);
    let formattedTriggerPrice = triggerPrice;
    
    if (symbolInfo) {
      formattedTriggerPrice = this.formatPrice(triggerPrice, symbolInfo);
      logger.info(`Отформатированная цена триггера для ${symbol}: ${formattedTriggerPrice} (исходная: ${triggerPrice})`);
    }
  
    const requestBody = {
      symbol,
      marginCoin: 'USDT',
      planType, // "profit_plan" или "loss_plan"
      triggerPrice: formattedTriggerPrice.toString(),
      size: size.toString(),
      positionSide, // "long" или "short"
      productType: "USDT-FUTURES"
    };
    
    if (this.debug) {
      logger.info(`Установка TP/SL: ${JSON.stringify(requestBody)}`);
    }
    
    return this.request('POST', '/api/v2/mix/order/place-tpsl-order', {}, requestBody);
  }
  
  // Метод для установки трейлинг-стопа
  async setTrailingStop(symbol, positionSide, callbackRatio, size) {
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
      productType: "USDT-FUTURES"
    };
    
    if (this.debug) {
      logger.info(`Установка трейлинг-стопа для ${symbol}: ${JSON.stringify(params)}`);
    }
    
    return this.request('POST', '/api/v2/mix/order/place-plan-order', {}, params);
  }
}

module.exports = BitGetClient;