// src/utils/logger.js
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Создаем директорию для логов, если она не существует
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Настройка транспортов для логгера
const transports = [
  // Консольный транспорт
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(function(info) {
        return info.timestamp + ' [' + info.level.toUpperCase() + '] ' + info.message;
      })
    )
  }),
  
  // Сохранение всех логов в файл
  new winston.transports.File({
    filename: path.join(logDir, 'bot.log'),
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(function(info) {
        return info.timestamp + ' [' + info.level.toUpperCase() + '] ' + info.message;
      })
    ),
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }),
  
  // Сохранение логов ошибок в отдельный файл
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(function(info) {
        return info.timestamp + ' [' + info.level.toUpperCase() + '] ' + info.message;
      })
    ),
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
];

// Создаем логгер
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  levels: winston.config.npm.levels,
  transports: transports,
  exitOnError: false
});

// Добавляем обработчик необработанных исключений
process.on('uncaughtException', function(error) {
  logger.error('Uncaught Exception: ' + error.message);
  // Сохраняем сообщение и стек ошибки в файл
  fs.appendFileSync(
    path.join(logDir, 'crash.log'), 
    new Date().toISOString() + ' Uncaught Exception: ' + error.message + '\n' + error.stack + '\n\n'
  );
});

// Добавляем обработчик необработанных отклонений Promise
process.on('unhandledRejection', function(reason, promise) {
  logger.error('Unhandled Rejection at promise');
  // Сохраняем сообщение и причину отклонения в файл
  fs.appendFileSync(
    path.join(logDir, 'crash.log'),
    new Date().toISOString() + ' Unhandled Rejection: ' + reason + '\n\n'
  );
});

// Добавим метод для хранения последних N логов в памяти для API
const memoryLogs = [];
const MAX_MEMORY_LOGS = 100;

// Заменим метод log стандартного транспорта для поддержки в памяти
const originalConsoleLog = transports[0].log.bind(transports[0]);
transports[0].log = function(info, callback) {
  memoryLogs.unshift({
    timestamp: info.timestamp,
    level: info.level,
    message: info.message
  });
  
  // Ограничиваем количество логов в памяти
  if (memoryLogs.length > MAX_MEMORY_LOGS) {
    memoryLogs.pop();
  }
  
  originalConsoleLog(info, callback);
};

// Метод для получения логов из памяти
logger.getRecentLogs = function(limit, level) {
  limit = limit || MAX_MEMORY_LOGS;
  
  if (level) {
    return memoryLogs.filter(function(log) { return log.level === level; }).slice(0, limit);
  }
  return memoryLogs.slice(0, limit);
};

// Экспортируем настроенный логгер
module.exports = logger;