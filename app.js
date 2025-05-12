// Основной файл приложения
require('dotenv').config();
var express = require('express');
var cors = require('cors');
var path = require('path');
var setup = require('./src/bot/setup');
var config = require('./src/config/default');
var logger = require('./src/utils/logger');

// Контроллеры API
var botRoutes = require('./src/api/routes/botRoutes');
var pairsRoutes = require('./src/api/routes/pairsRoutes');
var signalRoutes = require('./src/api/routes/signalRoutes');
var performanceRoutes = require('./src/api/routes/performanceRoutes');
var settingsRoutes = require('./src/api/routes/settingsRoutes');

// Создаем Express-приложение
var app = express();

// Настройки middleware
app.use(cors(config.cors));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Простая проверка API ключа для безопасности (опционально)
var apiKeyMiddleware = function(req, res, next) {
  // В режиме разработки пропускаем проверку
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }
  
  var apiKey = req.headers[config.security.apiKeyHeader.toLowerCase()];
  
  if (!apiKey || apiKey !== config.security.apiKey) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }
  
  next();
};

// Статические файлы для фронтенда
app.use(express.static(path.join(__dirname, 'client/build')));

// API маршруты с проверкой API ключа
app.use('/api/bot', apiKeyMiddleware, botRoutes);
app.use('/api/pairs', apiKeyMiddleware, pairsRoutes);
app.use('/api/signals', apiKeyMiddleware, signalRoutes);
app.use('/api/performance', apiKeyMiddleware, performanceRoutes);
app.use('/api/settings', apiKeyMiddleware, settingsRoutes);

// Обработка запросов к React-приложению
app.get('*', function(req, res) {
  res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
});
const resetAllDemoData = require('./src/utils/resetDemoData');

// Инициализация сервера и бота
function startServer() {
  try {
    // Сброс всех демо-данных при запуске
    resetAllDemoData();
    
    // Инициализация бота
    setup.setupBot().then(function() {
      // Запуск сервера
      var PORT = config.server.port;
      app.listen(PORT, function() {
        logger.info('Server running on port ' + PORT);
        
        // Автоматический запуск бота, если включен в настройках
        setup.autoStartBot();
      });
    }).catch(function(error) {
      logger.error('Failed to setup bot: ' + error.message);
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server: ' + error.message);
    process.exit(1);
  }
}
// Инициализация сервера и бота
function startServer() {
  try {
    // Инициализация бота
    setup.setupBot().then(function() {
      // Запуск сервера
      var PORT = config.server.port;
      app.listen(PORT, function() {
        logger.info('Server running on port ' + PORT);
        
        // Автоматический запуск бота, если включен в настройках
        setup.autoStartBot();
      });
    }).catch(function(error) {
      logger.error('Failed to setup bot: ' + error.message);
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server: ' + error.message);
    process.exit(1);
  }
}

// Запуск приложения
startServer();