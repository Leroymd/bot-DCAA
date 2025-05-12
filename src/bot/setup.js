// src/bot/setup.js
var path = require('path');
var fs = require('fs');
var TradingBot = require('./TradingBot');
var logger = require('../utils/logger');
var dataStore = require('../utils/dataStore');
var botController = require('../api/controllers/botController');
var BitGetClient = require('../exchange/BitgetClient');

var tradingBot = null;

/**
 * Проверяет формат API ключей
 * @param {Object} config Конфигурация бота
 * @returns {boolean} Результат проверки
 */
function validateAPIKeys(config) {
  if (!config.apiKey || !config.apiSecret || !config.passphrase) {
    logger.error('API ключи отсутствуют или некорректны');
    return false;
  }
  
  // Проверка формата API ключа (обычно это длинная строка символов)
  if (config.apiKey.length < 10) {
    logger.error('API ключ слишком короткий. Проверьте правильность ключа');
    return false;
  }
  
  // Проверка формата секретного ключа
  if (config.apiSecret.length < 10) {
    logger.error('Секретный ключ API слишком короткий. Проверьте правильность ключа');
    return false;
  }
  
  // Проверка формата passphrase
  if (config.passphrase.length < 4) {
    logger.error('Passphrase слишком короткий. Проверьте правильность passphrase');
    return false;
  }
  
  logger.info('Формат API ключей корректен');
  return true;
}

/**
 * Загрузка конфигурации
 * @returns {Object} Конфигурация бота
 */
function loadConfig() {
  try {
    // Определяем путь к файлу конфигурации
    var configPath = path.join(__dirname, '../../data/config/bot_config.json');
    
    // Проверяем существование файла
    if (fs.existsSync(configPath)) {
      logger.info('Загрузка конфигурации из файла');
      
      // Загружаем конфигурацию из файла
      var configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return configData;
    } 
    
    // Если файл не существует, используем конфигурацию по умолчанию
    logger.info('Использование конфигурации по умолчанию');
    return getDefaultConfig();
  } catch (error) {
    logger.error('Ошибка загрузки конфигурации: ' + error.message);
    logger.info('Возврат к конфигурации по умолчанию');
    return getDefaultConfig();
  }
}

/**
 * Получение конфигурации по умолчанию
 * @returns {Object} Конфигурация по умолчанию
 */
function getDefaultConfig() {
  return {
    // API доступ - требуется заполнить реальными ключами
    apiKey: process.env.BITGET_API_KEY || '',
    apiSecret: process.env.BITGET_API_SECRET || '',
    passphrase: process.env.BITGET_PASSPHRASE || '',
    
    // Базовые настройки
    strategy: 'fractal', // Стратегия на основе фракталов
    tradingPairs: ['BTCUSDT'], // Торговые пары по умолчанию
    maxTradingPairs: 5, // Максимальное количество торгуемых пар
    
    // Настройки индикаторов
    pacLength: 34, // Длина PAC
    fastEMAlength: 89, // Быстрая EMA
    mediumEMAlength: 200, // Средняя EMA
    slowEMAlength: 600, // Медленная EMA
    useHAcandles: true, // Использовать Heikin Ashi свечи
    useRegularFractals: false, // Использовать обычные фракталы (false = Билл Вильямс)
    pullbackLookback: 3, // Период отката для пуллбэка
    
    // Настройки торговли
    positionSize: 30, // Процент от доступного баланса на одну сделку
    leverage: 20, // Кредитное плечо
    takeProfitPercentage: 2.5, // Процент тейк-профита
    stopLossPercentage: 1.5, // Процент стоп-лосса
    maxTradeDurationMinutes: 5, // Максимальное время в сделке (минуты)
    
    // Настройки трейлинг-стопа
    trailingStop: {
      enabled: true, // Включить трейлинг-стоп
      activationPercentage: 90, // Активация при 90% от тейк-профита
      stopDistance: 0.5 // Дистанция трейлинг-стопа (%)
    },
    
    // Настройки частичного закрытия
    partialClose: {
      enabled: true, // Включить частичное закрытие
      level1: 1.4, // Первый уровень (% прибыли)
      amount1: 30, // Процент закрытия на первом уровне
      level2: 2.0, // Второй уровень (% прибыли)
      amount2: 50 // Процент закрытия на втором уровне
    },
    
    // Управление рисками
    riskManagement: {
      maxOpenPositions: 3, // Максимальное количество открытых позиций
      dailyLossLimit: 10 // Дневной лимит убытков (%)
    },
    
    // Реинвестирование
    reinvestment: 80, // Процент реинвестирования прибыли
    withdrawalThreshold: 50, // Порог для вывода прибыли (%)
    withdrawalPercentage: 20, // Процент от прибыли для вывода
    
    // Дополнительные настройки
    debug: false // Режим отладки
  };
}
/**
 * Тестовое подключение к бирже
 * @param {Object} config Конфигурация бота
 * @returns {Promise<boolean>} Результат тестового подключения
 */
async function testExchangeConnection(config) {
  try {
    logger.info('Тестовое подключение к бирже BitGet...');
    
    if (!config.apiKey || !config.apiSecret || !config.passphrase) {
      logger.warn('Отсутствуют учетные данные API BitGet');
      return false;
    }
    
    const testClient = new BitGetClient({
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      passphrase: config.passphrase,
      debug: true
    });
    
    // Запрос серверного времени для проверки соединения
    const timeResponse = await testClient.getServerTime();
    if (timeResponse && timeResponse.data) {
      logger.info('Успешное подключение к бирже BitGet');
      
      // Проверяем баланс
      try {
        const balanceResponse = await testClient.getAccountAssets('USDT');
        
        if (balanceResponse && balanceResponse.data && balanceResponse.data.length > 0) {
          const balance = parseFloat(balanceResponse.data[0].available);
          logger.info(`Текущий баланс USDT: ${balance}`);
          return true;
        } else {
          logger.warn('Не удалось получить баланс счета');
          logger.warn('Ответ от сервера:', JSON.stringify(balanceResponse));
          return false;
        }
      } catch (balanceError) {
        logger.error(`Ошибка при получении баланса: ${balanceError.message}`);
        return false;
      }
    } else {
      logger.error('Не удалось подключиться к бирже BitGet');
      return false;
    }
  } catch (error) {
    logger.error(`Ошибка при тестовом подключении к бирже: ${error.message}`);
    return false;
  }
}
/**
 * Инициализация торгового бота
 */
function setupBot() {
  return new Promise(async function(resolve, reject) {
    try {
      logger.info('Initializing trading bot...');
      
      // Загружаем конфигурацию
      var config = loadConfig();
      
      // Проверка наличия API ключей
      if (!config.apiKey || !config.apiSecret || !config.passphrase) {
        logger.warn('API credentials not found');
        
        // В режиме разработки можно использовать демо-режим
        if (process.env.NODE_ENV !== 'production') {
          logger.info('Using demo mode for development');
          config.demo = true;
        } else {
          throw new Error('API credentials are required in production mode');
        }
      }
      
      // Тестируем подключение к бирже
      const connectionSuccess = await testExchangeConnection(config);
      if (!connectionSuccess && !config.demo) {
        logger.warn('Не удалось установить соединение с биржей. Бот запущен, но торговля может не работать.');
      }
      
      // Создаем экземпляр бота
      tradingBot = new TradingBot(config);
      
      // Сохраняем экземпляр бота в контроллере
      botController.setBotInstance(tradingBot);
      
      // Сохраняем конфигурацию в хранилище
      dataStore.set('botConfig', config);
      
      // Инициализация бота завершена
      logger.info('Trading bot initialized successfully');
      
      // Подписываемся на события бота
      tradingBot.on('update', function(status) {
        // Обработка обновления статуса (опционально)
      });
      
      tradingBot.on('position_opened', function(position) {
        logger.info('Position opened: ' + position.type + ' ' + position.symbol + ' at ' + position.entryPrice);
      });
      
      tradingBot.on('position_closed', function(data) {
        logger.info('Position ' + data.positionId + ' closed: ' + data.percentage + '%');
      });
      
      tradingBot.on('position_updated', function(position) {
        logger.info('Position ' + position.id + ' updated');
      });
      
      resolve(tradingBot);
    } catch (error) {
      logger.error('Error initializing trading bot: ' + error.message);
      reject(error);
    }
  });
}

/**
 * Автоматический запуск бота при старте, если включено в конфигурации
 */
function autoStartBot() {
  return new Promise(function(resolve, reject) {
    try {
      if (!tradingBot) {
        resolve(false);
        return;
      }
      
      var config = tradingBot.config;
      
      // Проверка, нужно ли автоматически запускать бота
      if (config.autoStart) {
        logger.info('Автоматический запуск бота...');
        tradingBot.start().then(function() {
          resolve(true);
        }).catch(function(err) {
          logger.error('Ошибка автоматического запуска бота: ' + err.message);
          resolve(false);
        });
      } else {
        resolve(false);
      }
    } catch (error) {
      logger.error('Ошибка автоматического запуска бота: ' + error.message);
      reject(error);
    }
  });
}

function getBot() {
  return tradingBot;
}

// Экспортируем функции
exports.setupBot = setupBot;
exports.autoStartBot = autoStartBot;
exports.getBot = getBot;