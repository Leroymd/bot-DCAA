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
      logger.warn('API ключи не установлены. Для работы с реальной биржей необходимы ключи API.');
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
            case '45110':
              logger.error('Ошибка: размер ордера меньше минимального (5 USDT)');
              break;
            case '43011':
              logger.error(`Ошибка в параметре holdSide: ${error.response.data.msg}`);
              break;
            default:
              logger.error(`Код ошибки API: ${error.response.data.code}, сообщение: ${error.response.data.msg}`);
          }
        }
      }
      
      // Повторяем запрос при временных ошибках
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

  async getExchangeInfo() {
    try {
      logger.info('Получение информации о доступных торговых парах...');
      
      const response = await this.request('GET', '/api/v2/mix/market/contracts', {
        productType: "USDT-FUTURES"
      });
      
      // Обработка ответа и преобразование к нужному формату
      if (response && response.code === '00000' && response.data) {
        logger.info(`Успешно получена информация о ${response.data.length} торговых парах`);
        
        if (this.debug) {
          // В режиме отладки выводим первые несколько пар
          logger.debug(`Пример данных: ${JSON.stringify(response.data.slice(0, 3))}`);
        }
        
        return response;
      } else {
        logger.warn(`Ошибка при получении информации о торговых парах: ${response ? response.msg : 'пустой ответ'}`);
        return { code: 'ERROR', msg: response ? response.msg : 'Empty response', data: [] };
      }
    } catch (error) {
      logger.error(`Ошибка в getExchangeInfo: ${error.message}`);
      return { code: 'ERROR', msg: error.message, data: [] };
    }
  }

  // Вспомогательный метод для получения информации о конкретном символе
  async getSymbolInfo(symbol) {
    try {
      const response = await this.getExchangeInfo();
      
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
          
          // Проверяем поля с ценой входа
          const position = response.data[0];
          const priceFields = ['openPriceAvg', 'openPrice', 'openPr', 'entryPrice', 'avgPrice', 'avgPr', 'markPrice'];
          
          logger.debug('Поля с ценой в первой позиции:');
          for (const field of priceFields) {
            if (position[field] !== undefined) {
              logger.debug(`- ${field}: ${position[field]}`);
            }
          }
          
          // Выводим все поля, связанные с временем, для первой позиции
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
          
          // Проверяем возможные поля для цены входа
          let entryPrice = null;
          const priceFields = ['openPriceAvg', 'openPrice', 'openPr', 'entryPrice', 'avgPrice', 'avgPr', 'markPrice'];
          
          for (const field of priceFields) {
            if (position[field] !== undefined && !isNaN(parseFloat(position[field]))) {
              entryPrice = parseFloat(position[field]);
              break;
            }
          }
          
          // Для отладки логируем обработанное время и цену
          logger.debug(`Позиция ${position.symbol}: время=${new Date(entryTimeMs).toISOString()}, цена входа=${entryPrice}`);
          
          // Возвращаем объект позиции с добавленными полями entryTime и entryPrice
          return {
            ...position,
            entryTime: entryTimeMs,
            processedEntryPrice: entryPrice // Добавляем обработанную цену под новым именем
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

  // Улучшенный метод для получения деталей позиции
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
      
      // Логируем полный ответ для отладки
      logger.debug(`Полный ответ API для ${symbol}: ${JSON.stringify(response.data)}`);
      
      // Ищем нужную позицию среди полученных
      const position = response.data.find(p => p.symbol === symbol);
      
      if (!position) {
        logger.warn(`Позиция для ${symbol} не найдена`);
        return null;
      }
      
      // Проверяем поля с ценой входа
      let entryPrice = null;
      const priceFields = ['openPriceAvg', 'openPrice', 'openPr', 'entryPrice', 'avgPrice', 'avgPr'];
      
      for (const field of priceFields) {
        if (position[field] !== undefined && !isNaN(parseFloat(position[field]))) {
          entryPrice = parseFloat(position[field]);
          logger.debug(`Найдено поле с ценой входа: ${field} = ${entryPrice}`);
          break;
        }
      }
      
      // Если не нашли цену входа напрямую, пробуем альтернативный подход через другие поля
      if (entryPrice === null) {
        logger.warn(`Не найдено явное поле с ценой входа для ${symbol}`);
        
        // Можно попробовать вычислить из других доступных полей, например:
        if (position.notionalUsd && position.total && parseFloat(position.total) > 0) {
          entryPrice = parseFloat(position.notionalUsd) / parseFloat(position.total);
          logger.debug(`Вычислена цена входа из notionalUsd/total: ${entryPrice}`);
        } else {
          // В крайнем случае используем markPrice
          if (position.markPrice) {
            entryPrice = parseFloat(position.markPrice);
            logger.debug(`Используем markPrice как запасной вариант: ${entryPrice}`);
          }
        }
      }
      
      // Дополнительно получаем текущую рыночную цену
      let marketPrice = null;
      try {
        const ticker = await this.getTicker(symbol);
        marketPrice = ticker && ticker.data && ticker.data.last 
            ? parseFloat(ticker.data.last) 
            : null;
        
        logger.debug(`Получена текущая рыночная цена для ${symbol}: ${marketPrice}`);
      } catch (tickerError) {
        logger.warn(`Ошибка при получении текущей цены для ${symbol}: ${tickerError.message}`);
      }
      
      // Если не удалось получить маркет-цену, но есть markPrice в позиции, используем его
      if (marketPrice === null && position.markPrice) {
        marketPrice = parseFloat(position.markPrice);
        logger.debug(`Используем markPrice вместо рыночной цены: ${marketPrice}`);
      }
      
      // Добавляем к позиции цену входа и текущую рыночную цену
      const enhancedPosition = {
        ...position,
        entryPrice, // Явно указываем найденную или вычисленную цену входа
        marketPrice, // Текущая рыночная цена
        positionValue: marketPrice && position.total ? parseFloat(position.total) * marketPrice : null
      };
      
      logger.info(`Детали позиции для ${symbol} получены успешно`);
      logger.debug(`Итоговые детали: entryPrice=${entryPrice}, marketPrice=${marketPrice}`);
      
      return {
        code: '00000',
        data: enhancedPosition
      };
    } catch (error) {
      logger.error(`Ошибка при получении деталей позиции ${symbol}: ${error.message}`);
      throw error;
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

  async getCandles(symbol, granularity, limit = 100) {
    try {
      if (!symbol || !granularity) {
        logger.error('Не указаны обязательные параметры (symbol, granularity) для получения свечей');
        throw new Error('Missing required parameters for getCandles');
      }
      
      logger.info(`Запрос свечей для ${symbol}, интервал: ${granularity}, количество: ${limit}`);
      
      const params = {
        symbol,
        granularity,
        limit: limit.toString(),
        productType: "USDT-FUTURES"
      };
      
      const response = await this.request('GET', '/api/v2/mix/market/candles', params);
      
      if (!response || !response.data) {
        logger.warn(`Не удалось получить данные свечей для ${symbol}`);
        return { code: 'ERROR', msg: 'Failed to get candles data', data: [] };
      }
      
      if (this.debug) {
        logger.info(`Получено ${response.data.length} свечей для ${symbol}`);
        if (response.data.length > 0) {
          logger.info(`Первая свеча: ${JSON.stringify(response.data[0])}`);
        }
      }
      
      return response;
    } catch (error) {
      logger.error(`Ошибка при получении свечей для ${symbol}: ${error.message}`);
      return { code: 'ERROR', msg: error.message, data: [] };
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

  async getHistoricalOrders(symbol, startTime, endTime, pageSize = 100) {
    return this.request('GET', '/api/v2/mix/order/history', {
      symbol,
      startTime,
      endTime,
      pageSize,
      productType: "USDT-FUTURES"
    });
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

  /**
   * Отправляет ордер на биржу согласно документации
   * @param {Object} params - Параметры ордера
   * @returns {Promise<Object>} - Ответ от API
   */
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

  /**
   * Размещение обычного ордера
   * @param {string} symbol - Символ торговой пары
   * @param {string} side - Сторона (buy/sell)
   * @param {string} orderType - Тип ордера (limit/market)
   * @param {string|number} size - Размер позиции
   * @param {string|number|null} price - Цена (только для limit ордеров)
   * @param {boolean} reduceOnly - Только уменьшение позиции
   * @param {string} tradeSide - Сторона торговли (open/close)
   * @returns {Promise<Object>} - Результат размещения ордера
   */
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
      // Получаем текущую цену
      const ticker = await this.getTicker(symbol);
      if (!ticker || !ticker.data || !ticker.data.last) {
        return Promise.reject(new Error(`Не удалось получить текущую цену для ${symbol}`));
      }
      
      const currentPrice = parseFloat(ticker.data.last);
      
      // Проверяем и форматируем размер позиции
      let formattedSize;
      let usdtValue;
      
      // Если размер передан как строка с USDT в конце
      if (typeof size === 'string' && size.includes('USDT')) {
        const usdtAmount = parseFloat(size.replace('USDT', '').trim());
        usdtValue = usdtAmount;
        
        // Преобразуем сумму в USDT в количество контрактов
        formattedSize = (usdtAmount / currentPrice).toFixed(4);
        logger.info(`Преобразование ${usdtAmount} USDT в ${formattedSize} контрактов по цене ${currentPrice}`);
      } 
      // Если передан просто размер позиции (число или строка с числом)
      else {
        const sizeNumber = parseFloat(size);
        
        // Проверяем, достаточно ли размера позиции (в USDT)
        usdtValue = sizeNumber * currentPrice;
        formattedSize = sizeNumber.toString();
        
        logger.info(`Размер позиции: ${formattedSize} контрактов, примерная стоимость: ${usdtValue.toFixed(2)} USDT`);
      }
      
      // Проверка минимального размера (5 USDT)
      if (usdtValue < 5) {
        logger.error(`Размер позиции слишком мал: ${usdtValue.toFixed(2)} USDT. Минимальный размер: 5 USDT`);
        return Promise.reject(new Error(`Размер позиции должен быть не менее 5 USDT. Текущий размер: ${usdtValue.toFixed(2)} USDT`));
      }

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
        size: formattedSize,
        side: normalizedSide,
        orderType: orderType.toLowerCase(),
        timeInForceValue: 'normal', // Обязательный параметр согласно документации
        marginMode: 'isolated', // Обязательный параметр marginMode
        productType: "USDT-FUTURES"
      };

      // Для hedge-mode (мы используем tradeSide для открытия/закрытия)
      if (tradeSide !== "open" && tradeSide !== "close") {
        params.tradeSide = formattedTradeSide;
      }

      if (reduceOnly === true) {
        // При reduceOnly мы закрываем позицию
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

  /**
 * Размещение ордера с установкой TP/SL в одном запросе (one-way-mode)
 * @param {string} symbol - Символ торговой пары
 * @param {string} side - Сторона (buy/sell)
 * @param {string} orderType - Тип ордера (limit/market)
 * @param {string|number} size - Размер позиции
 * @param {string|number|null} price - Цена (только для limit ордеров)
 * @param {string|number|null} takeProfitPrice - Цена для Take Profit
 * @param {string|number|null} stopLossPrice - Цена для Stop Loss
 * @returns {Promise<Object>} - Результат размещения ордера
 */
async placeOrderWithTpSl(symbol, side, orderType, size, price = null, takeProfitPrice = null, stopLossPrice = null) {
  if (!symbol) {
    const error = new Error('Для размещения ордера необходим символ');
    return Promise.reject(error);
  }

  // Приводим side к нижнему регистру
  const normalizedSide = side.toLowerCase();
  if (normalizedSide !== 'buy' && normalizedSide !== 'sell') {
    logger.error(`Неверное значение стороны: ${side}`);
    return Promise.reject(new Error(`Неверное значение стороны: ${side}`));
  }

  try {
    // Получаем текущую цену
    const ticker = await this.getTicker(symbol);
    if (!ticker || !ticker.data || !ticker.data.last) {
      return Promise.reject(new Error(`Не удалось получить текущую цену для ${symbol}`));
    }
    
    const currentPrice = parseFloat(ticker.data.last);
    
    // Проверяем и форматируем размер позиции
    let formattedSize;
    let usdtValue;
    
    // Если размер передан как строка с USDT в конце
    if (typeof size === 'string' && size.includes('USDT')) {
      const usdtAmount = parseFloat(size.replace('USDT', '').trim());
      usdtValue = usdtAmount;
      
      // Преобразуем сумму в USDT в количество контрактов
      formattedSize = (usdtAmount / currentPrice).toFixed(4);
      logger.info(`Преобразование ${usdtAmount} USDT в ${formattedSize} контрактов по цене ${currentPrice}`);
    } 
    // Если передан просто размер позиции (число или строка с числом)
    else {
      const sizeNumber = parseFloat(size);
      
      // Проверяем, достаточно ли размера позиции (в USDT)
      usdtValue = sizeNumber * currentPrice;
      formattedSize = sizeNumber.toString();
      
      logger.info(`Размер позиции: ${formattedSize} контрактов, примерная стоимость: ${usdtValue.toFixed(2)} USDT`);
    }
    
    // Проверка минимального размера (5 USDT)
    if (usdtValue < 5) {
      logger.error(`Размер позиции слишком мал: ${usdtValue.toFixed(2)} USDT. Минимальный размер: 5 USDT`);
      return Promise.reject(new Error(`Размер позиции должен быть не менее 5 USDT. Текущий размер: ${usdtValue.toFixed(2)} USDT`));
    }

    // Получаем информацию о символе для форматирования цен
    const symbolInfo = await this.getSymbolInfo(symbol);
    
    // Форматируем цены
    let formattedPrice = price;
    let formattedTpPrice = takeProfitPrice;
    let formattedSlPrice = stopLossPrice;

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

    // Параметры ордера согласно актуальной документации Bitget для one-way-mode
    const params = {
      symbol,
      marginCoin: 'USDT',
      size: formattedSize,
      side: normalizedSide,
      orderType: orderType.toLowerCase(),
      timeInForceValue: 'normal',
      marginMode: 'isolated',
      productType: "USDT-FUTURES"
    };

    // Важно: НЕ указываем tradeSide в one-way-mode

    // Добавляем цену для лимитного ордера
    if (orderType.toLowerCase() === 'limit' && formattedPrice) {
      params.price = formattedPrice.toString();
    }

    // Правильные параметры для TP/SL согласно актуальной документации
    if (formattedTpPrice) {
      params.presetStopSurplusPrice = formattedTpPrice.toString();
    }
    
    if (formattedSlPrice) {
      params.presetStopLossPrice = formattedSlPrice.toString();
    }

    if (this.debug) {
      logger.info(`Размещение ордера с TP/SL (one-way-mode): ${JSON.stringify(params)}`);
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

  /**
   * Закрытие позиции по рыночной цене
   * @param {string} symbol - Символ пары
   * @param {string} marginCoin - Валюта маржи (обычно USDT)
   * @returns {Promise<Object>} - Результат закрытия позиции
   */
  async closePosition(symbol, marginCoin = 'USDT') {
    try {
      if (!symbol) {
        logger.error('Не указан символ для закрытия позиции');
        return { code: 'ERROR', msg: 'Symbol is required' };
      }
      
      logger.info(`Закрытие позиции по рыночной цене: ${symbol}`);
      
      // Получаем детали позиции для проверки
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
      
      // Определяем тип позиции
      const holdSide = position.holdSide.toLowerCase();
      
      // Определяем противоположную сторону для закрытия
      const side = holdSide === 'long' ? 'sell' : 'buy';
      
      // Получаем размер позиции
      const size = position.available.toString();
      
      // Формируем параметры ордера для закрытия позиции
      const orderParams = {
        symbol,
        marginCoin,
        size,
        side, // Противоположное направление текущей позиции
        orderType: 'market', // Рыночный ордер для быстрого исполнения
        timeInForceValue: 'normal',
        marginMode: 'isolated', // Добавлен обязательный параметр marginMode
        reduceOnly: "YES", // Указываем, что ордер должен только сокращать позицию
        productType: "USDT-FUTURES"
      };
      
      // Отправляем ордер
      logger.info(`Отправка рыночного ордера на закрытие позиции ${symbol}: ${JSON.stringify(orderParams)}`);
      const response = await this.submitOrder(orderParams);
      
      if (response && response.code === '00000') {
        logger.info(`Позиция ${symbol} успешно закрыта рыночным ордером: ${JSON.stringify(response.data)}`);
      } else {
        logger.warn(`Ошибка при закрытии позиции ${symbol} рыночным ордером: ${response ? response.msg : 'Unknown error'}`);
      }
      
      return response;
    } catch (error) {
      logger.error(`Ошибка при закрытии позиции ${symbol}: ${error.message}`);
      return { code: 'ERROR', msg: error.message };
    }
  }

  /**
   * Закрытие позиции лимитным ордером
   * @param {string} symbol - Символ пары
   * @param {number|null} price - Цена закрытия (опционально)
   * @returns {Promise<Object>} - Результат закрытия позиции
   */
  async closePositionWithLimit(symbol, price = null) {
    try {
      if (!symbol) {
        logger.error('Не указан символ для закрытия позиции');
        return { code: 'ERROR', msg: 'Symbol is required' };
      }
      
      logger.info(`Закрытие позиции по лимитному ордеру: ${symbol}, цена=${price || 'рыночная'}`);
      
      // Получаем детали позиции для определения размера и типа
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
      
      // Определяем тип позиции (long или short)
      const holdSide = position.holdSide.toLowerCase();
      
      // В one-way-mode для закрытия необходимо указать противоположный side
      const side = holdSide === 'long' ? 'sell' : 'buy';
      const size = position.available.toString();
      
      // Если цена не указана, получаем текущую рыночную цену
      let orderPrice = price;
      if (!orderPrice) {
        const ticker = await this.getTicker(symbol);
        if (!ticker || !ticker.data || !ticker.data.last) {
          logger.warn(`Не удалось получить текущую цену для ${symbol}`);
          return { code: 'ERROR', msg: `Failed to get current price for ${symbol}` };
        }
        
        // Устанавливаем цену с небольшим отклонением от рыночной для быстрого исполнения
        const marketPrice = parseFloat(ticker.data.last);
        orderPrice = holdSide === 'long' 
            ? (marketPrice * 0.995).toFixed(position.pricePrecision || 4) // Чуть ниже рынка для быстрого закрытия LONG
            : (marketPrice * 1.005).toFixed(position.pricePrecision || 4); // Чуть выше рынка для быстрого закрытия SHORT
      }
      
      // Формируем параметры ордера
      const orderParams = {
        symbol,
        marginCoin: 'USDT',
        size,
        price: orderPrice.toString(),
        side, // Противоположное направление текущей позиции
        orderType: 'limit',
        timeInForceValue: 'normal',
        marginMode: 'isolated', // Добавлен обязательный параметр marginMode
        reduceOnly: "YES", // Указываем, что ордер должен только сокращать позицию
        productType: "USDT-FUTURES"
      };
      
      // Отправляем ордер
      logger.info(`Отправка лимитного ордера на закрытие позиции ${symbol}: ${JSON.stringify(orderParams)}`);
      const response = await this.submitOrder(orderParams);
      
      if (response && response.code === '00000') {
        logger.info(`Позиция ${symbol} успешно закрыта лимитным ордером: ${JSON.stringify(response.data)}`);
      } else {
        logger.warn(`Ошибка при закрытии позиции ${symbol} лимитным ордером: ${response ? response.msg : 'Unknown error'}`);
      }
      
      return response;
    } catch (error) {
      logger.error(`Ошибка при закрытии позиции лимитным ордером для ${symbol}: ${error.message}`);
      return { code: 'ERROR', msg: error.message };
    }
  }

  /**
   * Установка TP/SL для существующей позиции
   * @param {string} symbol - Символ пары
   * @param {string} holdSide - Сторона позиции (LONG/SHORT)
   * @param {string} planType - Тип плана (profit_plan/loss_plan)
   * @param {string|number} triggerPrice - Цена срабатывания
   * @param {string|number} size - Размер в контрактах
   * @returns {Promise<Object>} - Результат установки TP/SL
   */
  async setTpsl(symbol, holdSide, planType, triggerPrice, size) {
    try {
      // КРИТИЧЕСКАЯ ОШИБКА: holdSide должен быть в нижнем регистре для API Bitget
      // Приводим holdSide к нижнему регистру (long/short)
      if (!holdSide || (holdSide.toLowerCase() !== 'long' && holdSide.toLowerCase() !== 'short')) {
        logger.warn(`Неверное значение holdSide: ${holdSide}. Должно быть 'long' или 'short'`);
        return { code: 'ERROR', msg: 'Invalid holdSide parameter' };
      }
      
      // Приводим holdSide к нижнему регистру для API
      const formattedHoldSide = holdSide.toLowerCase();
      
      // Получаем информацию о символе для правильного форматирования цены
      const symbolInfo = await this.getSymbolInfo(symbol);
      let formattedTriggerPrice = triggerPrice;
      
      if (symbolInfo) {
        formattedTriggerPrice = this.formatPrice(triggerPrice, symbolInfo);
        logger.info(`Отформатированная цена триггера для ${symbol}: ${formattedTriggerPrice} (исходная: ${triggerPrice})`);
      }
      
      // Проверяем planType
      if (planType !== 'profit_plan' && planType !== 'loss_plan') {
        logger.warn(`Неверное значение planType: ${planType}. Должно быть 'profit_plan' или 'loss_plan'`);
        planType = planType === 'tp' ? 'profit_plan' : 'loss_plan';
      }
      
      // Формируем параметры запроса согласно документации Bitget
      const requestBody = {
        symbol,
        marginCoin: 'USDT',
        planType,
        triggerPrice: formattedTriggerPrice.toString(),
        triggerPriceType: "mark_price",
        size: size.toString(),
        holdSide: formattedHoldSide, // ВАЖНО: в нижнем регистре
        productType: "USDT-FUTURES"
      };
      
      if (this.debug) {
        logger.info(`Установка TP/SL: ${JSON.stringify(requestBody)}`);
      }
      
      // Выполняем запрос
      try {
        const response = await this.request('POST', '/api/v2/mix/order/place-tpsl-order', {}, requestBody);
        
        if (response && response.code === '00000') {
          logger.info(`Успешно установлен ${planType === 'profit_plan' ? 'Take Profit' : 'Stop Loss'} для ${symbol}`);
          return response;
        } else {
          logger.warn(`Ошибка при установке ${planType}: ${response ? response.msg : 'Нет ответа от API'}`);
          return response;
        }
      } catch (apiError) {
        logger.error(`Ошибка при установке ${planType === 'profit_plan' ? 'Take Profit' : 'Stop Loss'}: ${apiError.message}`);
        
        if (apiError.response && apiError.response.data) {
          logger.error(`Ответ от API: ${JSON.stringify(apiError.response.data)}`);
        }
        
        throw apiError;
      }
    } catch (error) {
      logger.error(`Ошибка при установке TP/SL: ${error.message}`);
      return { code: 'ERROR', msg: error.message };
    }
  }

  /**
   * Установка трейлинг-стопа для существующей позиции
   * @param {string} symbol - Символ пары
   * @param {string} holdSide - Сторона позиции (LONG/SHORT)
   * @param {string|number} callbackRatio - Процент отката
   * @param {string|number} size - Размер в контрактах
   * @returns {Promise<Object>} - Результат установки трейлинг-стопа
   */
  async setTrailingStop(symbol, holdSide, callbackRatio, size) {
    try {
      if (!symbol || !callbackRatio) {
        logger.error('Для установки трейлинг-стопа необходимы символ и callbackRatio');
        return { code: 'ERROR', msg: 'Missing required parameters' };
      }
      
      // Приводим holdSide к нижнему регистру и проверяем корректность
      const formattedHoldSide = holdSide.toLowerCase();
      if (formattedHoldSide !== 'long' && formattedHoldSide !== 'short') {
        logger.warn(`Неверное значение holdSide: ${holdSide}. Должно быть 'long' или 'short'`);
        return { code: 'ERROR', msg: 'Invalid holdSide parameter' };
      }
      
      // Корректно определяем side на основе holdSide для закрытия позиции
      // Для LONG позиции нужен SELL ордер, для SHORT - BUY ордер
      const side = formattedHoldSide === "long" ? "sell" : "buy";
      
      // Корректно определяем tradeSide
      const tradeSide = formattedHoldSide === "long" ? "close_long" : "close_short";
      
      // Устанавливаем параметры для трейлинг-стопа согласно документации
      const params = {
        symbol,
        marginCoin: 'USDT',
        planType: "trailing_stop_plan",
        callbackRatio: callbackRatio.toString(),
        size: size.toString(),
        side, // Правильное значение side (sell/buy)
        triggerType: "mark_price",
        holdSide: formattedHoldSide, // В нижнем регистре
        timeInForceValue: "normal",
        tradeSide, // Правильное значение tradeSide
        productType: "USDT-FUTURES"
      };
      
      if (this.debug) {
        logger.info(`Установка трейлинг-стопа для ${symbol}: ${JSON.stringify(params)}`);
      }
      
      try {
        const response = await this.request('POST', '/api/v2/mix/order/place-plan-order', {}, params);
        
        if (response && response.code === '00000') {
          logger.info(`Трейлинг-стоп успешно установлен для ${symbol} с отступом ${callbackRatio}%`);
          return response;
        } else {
          logger.warn(`Ошибка при установке трейлинг-стопа: ${response ? response.msg : 'Нет ответа от API'}`);
          return response;
        }
      } catch (apiError) {
        logger.error(`Ошибка при установке трейлинг-стопа: ${apiError.message}`);
        
        if (apiError.response && apiError.response.data) {
          logger.error(`Ответ от API: ${JSON.stringify(apiError.response.data)}`);
        }
        
        throw apiError;
      }
    } catch (error) {
      logger.error(`Ошибка при установке трейлинг-стопа: ${error.message}`);
      return { code: 'ERROR', msg: error.message };
    }
  }
}

module.exports = BitGetClient;