// src/utils/logger.js - улучшенная версия с дополнительным форматированием
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Создаем директорию для логов, если она не существует
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Настраиваем формат для красивого вывода в консоль
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = JSON.stringify(meta, null, 2);
    }
    return `${timestamp} ${level}: ${message}${metaStr ? `\n${metaStr}` : ''}`;
  })
);

// Формат для файла логов
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = JSON.stringify(meta);
    }
    return `${timestamp} ${level}: ${message}${metaStr ? ` | ${metaStr}` : ''}`;
  })
);

// Создаем экземпляр логгера
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'fractalscalp-bot' },
  transports: [
    // Запись информационных и более детальных логов в файл
    new winston.transports.File({
      filename: path.join(logDir, 'bot.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true
    }),
    // Запись ошибок в отдельный файл
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Вывод в консоль при разработке
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info'
    })
  ],
  // Не завершать работу при неперехваченных исключениях
  exitOnError: false
});

// Логирование необработанных исключений
logger.exceptions.handle(
  new winston.transports.File({ 
    filename: path.join(logDir, 'exceptions.log'),
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 3
  })
);

// Обработчик для логирования важной информации о работе с Bitget API
logger.apiCall = function(method, endpoint, body = null, response = null) {
  if (process.env.LOG_API_CALLS !== 'true') return;
  
  const logData = {
    method,
    endpoint,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null,
    responseStatus: response ? response.status : null,
    responseData: response ? JSON.stringify(response.data || {}).substring(0, 500) : null
  };
  
  logger.debug('API Call', logData);
};

// Метод для логирования торговых операций
logger.trade = function(action, symbol, details) {
  logger.info(`TRADE [${action}] ${symbol}`, { ...details, timestamp: new Date().toISOString() });
};

// Метод для логирования ошибок API с дополнительными метаданными
logger.apiError = function(method, endpoint, error) {
  const errorDetails = {
    method,
    endpoint,
    message: error.message,
    status: error.response ? error.response.status : null,
    statusText: error.response ? error.response.statusText : null,
    data: error.response ? JSON.stringify(error.response.data || {}).substring(0, 500) : null,
    stack: error.stack
  };
  
  logger.error(`API Error: ${method} ${endpoint}`, errorDetails);
};

module.exports = logger;