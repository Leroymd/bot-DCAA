// src/exchange/BitgetClient.js - исправленная версия
const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');
const logger = require('../utils/logger');

/**
 * Клиент API Bitget с исправленными методами согласно актуальной документации
 */
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

  // Улучшенный метод для получения детальной информации о позиции
  async getPositionDetails(symbol) {
    try {
      if (!symbol) {
        throw new Error('Символ обязателен для получения деталей позиции');
      }
      
      logger.info(`Получение деталей позиции для ${symbol}`);
      
      const params = { 
        symbol, 
        productType: "USDT-FUTURES",
        marginCoin: "USDT"
      };
      
      // Получаем все открытые позиции
      const response = await this.request('GET', '/api/v2/mix/position/all-position', params);
      
      if (!response || !response.data || !Array.isArray(response.data)) {
        logger.warn(`Не удалось получить позиции для ${symbol}`);
        return null;
      }
      
      // Ищем нужную позицию среди полученных
      const position = response.data.find(p => p.symbol === symbol);
      
      if (!position) {
        logger.warn(`Позиция для ${symbol} не найдена`);
        return null;
      }
      
      // Дополнительно получаем текущую рыночную цену
      const ticker = await this.getTicker(symbol);
      const marketPrice = ticker && ticker.data && ticker.data.last 
          ? parseFloat(ticker.data.last) 
          : null;
      
      // Добавляем рыночную цену к информации о позиции
      const enhancedPosition = {
        ...position,
        marketPrice,
        positionValue: marketPrice ? parseFloat(position.total) * marketPrice : null
      };
      
      logger.info(`Детали позиции для ${symbol} получены успешно`);
      
      return {
        code: '00000',
        data: enhancedPosition
      };
    } catch (error) {
      logger.error(`Ошибка при получении деталей позиции ${symbol}: ${error.message}`);
      throw error;
    }
  }

  // Метод для получения деталей ордера
  async getOrderDetails(symbol, orderId) {
    try {
      const params = {
        symbol,
        orderId,
        productType: "USDT-FUTURES"
      };
      
      return this.request('GET', '/api/v2/mix/order/detail', params);
    } catch (error) {
      logger.error(`Ошибка при получении деталей ордера ${orderId}: ${error.message}`);
      throw error;
    }
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

  // Исправленный метод для отправки ордера согласно актуальной документации
  async submitOrder(params) {
    // Проверяем обязательные параметры
    if (!params.timeInForceValue) {
      // По умолчанию используем normal, если не указано
      params.timeInForceValue = 'normal';
    }
    
    const orderParams = {
      ...params,
      productType: "USDT-FUTURES"
    };
    
    return this.request('POST', '/api/v2/mix/order/place-order', {}, orderParams);
  }

  // Исправленный метод для отправки плановых ордеров (TP/SL, трейлинг-стоп)
  async submitPlanOrder(params) {
    if (!params.planType) {
      params.planType = params.callbackRatio ? "trailing_stop_plan" : "normal_plan";
    }
    
    if (!params.tradeSide) {
      params.tradeSide = "close";
    }
    
    if (!params.timeInForceValue) {
      params.timeInForceValue = "normal";
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

  // Исправленный метод closePositionWithLimit в классе BitGetClient
async closePositionWithLimit(symbol, price) {
  try {
    // Получаем детали позиции
    const positionResponse = await this.getPositionDetails(symbol);
    if (!positionResponse || !positionResponse.data) {
      logger.warn(`Не удалось получить информацию о позиции ${symbol}`);
      return { code: 'ERROR', msg: `Position for ${symbol} not found` };
    }
    
    const position = positionResponse.data;
    
    // Проверяем, что позиция существует и имеет размер
    if (!position || !position.total || parseFloat(position.total) === 0) {
      logger.warn(`Нет открытой позиции для ${symbol}`);
      return { code: 'ERROR', msg: `No open position for ${symbol}` };
    }
    
    // Определяем тип позиции и соответствующие параметры
    const positionSide = position.holdSide.toLowerCase();
    
    // В one-way-mode:
    // 1. Для закрытия LONG позиции: side="sell"
    // 2. Для закрытия SHORT позиции: side="buy"
    const side = positionSide === 'long' ? 'sell' : 'buy';
    
    const size = position.available.toString();
    
    // Если цена не указана, получаем текущую и добавляем/вычитаем небольшой процент
    let limitPrice = price;
    if (!limitPrice) {
      const ticker = await this.getTicker(symbol);
      const currentPrice = parseFloat(ticker.data.last);
      
      if (positionSide === 'long') {
        // Для LONG чуть ниже текущей цены (чтобы быстрее исполнился)
        limitPrice = (currentPrice * 0.995).toFixed(4);
      } else {
        // Для SHORT чуть выше текущей цены (чтобы быстрее исполнился)
        limitPrice = (currentPrice * 1.005).toFixed(4);
      }
    }
    
    // Символьная информация для уточнения precision
    const symbolInfo = await this.getSymbolInfo(symbol);
    if (symbolInfo && symbolInfo.pricePrecision) {
      limitPrice = parseFloat(limitPrice).toFixed(symbolInfo.pricePrecision);
    }
    
    // Формируем параметры для лимитного ордера
    const orderParams = {
      symbol: symbol,
      marginCoin: 'USDT',
      size: size,
      price: limitPrice.toString(),
      side: side,
      orderType: 'limit',
      timeInForceValue: 'normal',
      reduceOnly: "YES", // Важно для указания, что это закрытие позиции
      productType: "USDT-FUTURES",
      marginMode: "isolated"
      // НЕ указываем tradeSide - он не нужен в one-way-mode
    };
    
   
    
    // Отправляем ордер
    logger.info(`Отправка лимитного ордера на закрытие позиции ${symbol}: ${JSON.stringify(orderParams)}`);
    const response = await this.submitOrder(orderParams);
    
    if (response && response.code === '00000') {
      logger.info(`Позиция ${symbol} успешно закрыта лимитным ордером: ${JSON.stringify(response.data)}`);
    } else {
      logger.warn(`Ошибка при закрытии позиции ${symbol} лимитным ордером: ${response ? response.msg : 'Unknown error'}`);
      
      // Если закрытие лимитным ордером не удалось, попробуем рыночный ордер
      logger.info(`Пробуем закрыть позицию ${symbol} рыночным ордером...`);
      
      // Формируем параметры для рыночного ордера
      const marketOrderParams = {
        symbol,
        marginCoin: 'USDT',
        size,
        side,
        orderType: 'market',
        timeInForceValue: 'normal',
        tradeSide,
        reduceOnly: "YES",
        productType: "USDT-FUTURES",
        marginMode: "isolated"
      };
      
      // Отправляем рыночный ордер
      logger.info(`Отправка рыночного ордера на закрытие позиции ${symbol}: ${JSON.stringify(marketOrderParams)}`);
      const marketResponse = await this.submitOrder(marketOrderParams);
      
      if (marketResponse && marketResponse.code === '00000') {
        logger.info(`Позиция ${symbol} успешно закрыта рыночным ордером: ${JSON.stringify(marketResponse.data)}`);
        return marketResponse;
      } else {
        logger.error(`Не удалось закрыть позицию ${symbol} ни лимитным, ни рыночным ордером`);
        return marketResponse || response;
      }
    }
    
    return response;
  } catch (error) {
    logger.error(`Ошибка при закрытии позиции лимитным ордером для ${symbol}: ${error.message}`);
    return { code: 'ERROR', msg: error.message };
  }
}

  // Обновленный метод для закрытия позиции по рыночной цене
  async closePosition(symbol, marginCoin = 'USDT') {
  try {
    if (!symbol) {
      logger.error('Не указан символ для закрытия позиции');
      return { code: 'ERROR', msg: 'Symbol is required' };
    }
    
    logger.info(`Закрытие позиции рыночным ордером: ${symbol}`);
    
    // Получаем детали позиции
    const positionResponse = await this.getPositionDetails(symbol);
    
    if (!positionResponse || !positionResponse.data) {
      logger.warn(`Не удалось получить информацию о позиции ${symbol}`);
      return { code: 'ERROR', msg: `Position for ${symbol} not found` };
    }
    
    const position = positionResponse.data;
    
    // Проверяем, что позиция существует и имеет размер
    if (!position || !position.total || parseFloat(position.total) === 0) {
      logger.warn(`Нет открытой позиции для ${symbol}`);
      return { code: 'WARNING', msg: `No open position for ${symbol}` };
    }
    
    // Определяем сторону для закрытия
    const holdSide = position.holdSide.toLowerCase();
    const side = holdSide === 'long' ? 'sell' : 'buy';
    const size = position.available.toString();
    
    // Формируем параметры для рыночного ордера закрытия позиции
    const orderParams = {
      symbol,
      marginCoin,
      size,
      side,
      orderType: 'market',
      timeInForceValue: 'normal',
      reduceOnly: "YES",
      productType: "USDT-FUTURES",
      marginMode: "isolated"
    };
    
    logger.info(`Отправка рыночного ордера на закрытие позиции ${symbol}: ${JSON.stringify(orderParams)}`);
    return await this.submitOrder(orderParams);
  } catch (error) {
    logger.error(`Ошибка при закрытии позиции ${symbol}: ${error.message}`);
    return { code: 'ERROR', msg: error.message };
  }
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

  // Исправленный метод размещения ордеров с поддержкой TP/SL при открытии позиции
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
      // Определяем правильное значение tradeSide согласно документации
      let formattedTradeSide;
      if (tradeSide === "open") {
        formattedTradeSide = normalizedSide === 'buy' ? 'open_long' : 'open_short';
      } else {
        formattedTradeSide = normalizedSide === 'buy' ? 'close_short' : 'close_long';
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

      const params = {
        symbol,
        marginCoin: 'USDT',
        size: size.toString(),
        side: normalizedSide,
        orderType: orderType.toLowerCase(),
        timeInForceValue: 'normal', // Обязательный параметр согласно документации
        tradeSide: formattedTradeSide,
        marginMode: 'isolated', // Обязательный параметр
        productType: "USDT-FUTURES"
      };

      if (reduceOnly === true) {
        // При reduceOnly всегда используем close_long или close_short
        params.tradeSide = normalizedSide === 'buy' ? 'close_short' : 'close_long';
        params.reduceOnly = "YES";
      }

      if (orderType.toLowerCase() === 'limit' && formattedPrice) {
        params.price = formattedPrice.toString();
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

  // Новый метод для размещения ордера с установкой TP/SL в одном запросе
  async placeOrderWithTpSl(symbol, side, orderType, size, price = null, takeProfitPrice = null, stopLossPrice = null) {
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
      // Определяем tradeSide на основе side
      const formattedTradeSide = normalizedSide === 'buy' ? 'open_long' : 'open_short';

      // Для лимитных ордеров получаем информацию о символе для правильного форматирования цены
      let formattedPrice = price;
      let formattedTpPrice = takeProfitPrice;
      let formattedSlPrice = stopLossPrice;

      const symbolInfo = await this.getSymbolInfo(symbol);
      if (symbolInfo) {
        if (orderType.toLowerCase() === 'limit' && price) {
          formattedPrice = this.formatPrice(price, symbolInfo);
        }
        
        if (takeProfitPrice) {
          formattedTpPrice = this.formatPrice(takeProfitPrice, symbolInfo);
        }
        
        if (stopLossPrice) {
          formattedSlPrice = this.formatPrice(stopLossPrice, symbolInfo);
        }
      }

      const params = {
        symbol,
        marginCoin: 'USDT',
        size: size.toString(),
        side: normalizedSide,
        orderType: orderType.toLowerCase(),
        timeInForceValue: 'normal',
        tradeSide: formattedTradeSide,
        marginMode: 'isolated', // Обязательный параметр
        productType: "USDT-FUTURES"
      };

      // Добавляем цену для лимитного ордера
      if (orderType.toLowerCase() === 'limit' && formattedPrice) {
        params.price = formattedPrice.toString();
      }

      // Добавляем TP/SL если они заданы
      if (formattedTpPrice) {
        params.presetTakeProfitPrice = formattedTpPrice.toString();
      }
      
      if (formattedSlPrice) {
        params.presetStopLossPrice = formattedSlPrice.toString();
      }

      if (this.debug) {
        logger.info(`Размещение ордера с TP/SL: ${JSON.stringify(params)}`);
      }
      
      const result = await this.submitOrder(params);
      if (this.debug) {
        logger.info(`Результат размещения ордера с TP/SL: ${JSON.stringify(result)}`);
      }
      return result;
    } catch (error) {
      logger.error(`Ошибка размещения ордера с TP/SL: ${error.message}`);
      
      if (error.response) {
        logger.error('Данные ответа:', JSON.stringify(error.response.data));
        logger.error('Статус ответа:', error.response.status);
      }
      
      return Promise.reject(error);
    }
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
  
  // Исправленный метод для установки TP/SL
  async setTpsl(symbol, holdSide, planType, triggerPrice, size) {
    // Проверяем правильность параметра holdSide
    if (!holdSide || (holdSide !== 'long' && holdSide !== 'short')) {
      logger.warn(`Неверное значение holdSide: ${holdSide}. Должно быть 'long' или 'short'`);
      // Устанавливаем значение по умолчанию для предотвращения ошибки
      holdSide = 'long';
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
      triggerPriceType: "mark_price", // Обязательный параметр по документации
      size: size.toString(),
      holdSide, // Корректный параметр: "long" или "short"
      productType: "USDT-FUTURES"
    };
    
    if (this.debug) {
      logger.info(`Установка TP/SL: ${JSON.stringify(requestBody)}`);
    }
    
    return this.request('POST', '/api/v2/mix/order/place-tpsl-order', {}, requestBody);
  }

  // Метод для модификации существующего TP/SL
  async modifyTpsl(symbol, holdSide, planType, triggerPrice) {
    const requestBody = {
      symbol,
      marginCoin: 'USDT',
      planType, // "profit_plan" или "loss_plan"
      triggerPrice: triggerPrice.toString(),
      triggerPriceType: "mark_price",
      holdSide, // "long" или "short"
      productType: "USDT-FUTURES"
    };
    
    if (this.debug) {
      logger.info(`Модификация TP/SL: ${JSON.stringify(requestBody)}`);
    }
    
    return this.request('POST', '/api/v2/mix/order/modify-tpsl-order', {}, requestBody);
  }
  
  // Исправленный метод для установки трейлинг-стопа
  async setTrailingStop(symbol, holdSide, callbackRatio, size) {
    // Определяем сторону для закрытия позиции
    const side = holdSide.toLowerCase() === "long" ? "sell" : "buy";
    
    // Определяем правильное значение tradeSide
    const tradeSide = holdSide.toLowerCase() === "long" ? "close_long" : "close_short";
    
    const params = {
      symbol,
      marginCoin: 'USDT',
      planType: "trailing_stop_plan",
      callbackRatio: callbackRatio.toString(), // Callbackratio должен быть строкой
      size: size.toString(),
      side: side,
      triggerType: "mark_price",
      timeInForceValue: "normal", // Обязательный параметр
      tradeSide: tradeSide,
      productType: "USDT-FUTURES"
    };
    
    if (this.debug) {
      logger.info(`Установка трейлинг-стопа для ${symbol}: ${JSON.stringify(params)}`);
    }
    
    return this.request('POST', '/api/v2/mix/order/place-plan-order', {}, params);
  }
}

module.exports = BitGetClient;