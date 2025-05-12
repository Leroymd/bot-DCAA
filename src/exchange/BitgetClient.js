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

  async getServerTime() {
    try {
      return await this.request('GET', '/api/v2/public/time');
    } catch (error) {
      logger.error(`Ошибка в getServerTime: ${error.message}`);
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

    try {
      const params = {
        symbol,
        marginCoin: 'USDT',
        size: size.toString(),
        side: normalizedSide,
        orderType: orderType.toLowerCase(),
        force: 'gtc',
        marginMode: 'isolated',
        clientOid: `order_${Date.now()}`,
        tradeSide: tradeSide
      };

      if (reduceOnly === true) {
        params.tradeSide = "close";
      }

      if (orderType.toLowerCase() === 'limit' && price) {
        params.price = price.toString();
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
  
  // Добавляем метод для получения информации о торговом счете
  async getAccountInfo() {
    return this.request('GET', '/api/v2/mix/account/account', {
      productType: "USDT-FUTURES",
      marginCoin: "USDT"
    });
  }
  
  // Метод для установки стоп-лосса и тейк-профита
  async setTpsl(symbol, positionSide, planType, triggerPrice, size) {
    return this.request('POST', '/api/v2/mix/order/place-tpsl-order', {}, {
      symbol,
      marginCoin: 'USDT',
      planType, // "profit_plan" или "loss_plan"
      triggerPrice: triggerPrice.toString(),
      size: size.toString(),
      positionSide, // "long" или "short"
      productType: "USDT-FUTURES"
    });
  }
  
  // Метод для установки трейлинг-стопа
  async setTrailingStop(symbol, positionSide, callbackRatio, size) {
    return this.request('POST', '/api/v2/mix/order/place-plan-order', {}, {
      symbol,
      marginCoin: 'USDT',
      planType: "trailing_stop_plan",
      callbackRatio: callbackRatio.toString(),
      size: size.toString(),
      side: positionSide === "long" ? "sell" : "buy",
      triggerType: "market_price",
      tradeSide: "close",
      productType: "USDT-FUTURES"
    });
  }
}

module.exports = BitGetClient;