// Этот файл нужно добавить в ваш проект, если его еще нет

// src/app.js или src/index.js - основной файл приложения 
const express = require('express');
const path = require('path');
const cors = require('cors');
const morgan = require('morgan');
const logger = require('./src/utils/logger');

// Импорт маршрутов
const botRoutes = require('./src/api/routes/botRoutes');
const pairsRoutes = require('./src/api/routes/pairsRoutes');
const signalRoutes = require('./src/api/routes/signalRoutes');
const performanceRoutes = require('./src/api/routes/performanceRoutes');
const settingsRoutes = require('./src/api/routes/settingsRoutes');
const positionRoutes = require('./src/api/routes/positionRoutes');

// Настройка бота
const botSetup = require('./src/bot/setup');

// Создание приложения Express
const app = express();
const PORT = process.env.PORT || 5000;

// Промежуточное ПО
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Логирование запросов
app.use(morgan('dev', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Статические файлы
app.use(express.static(path.join(__dirname, '../client/build')));

// Маршруты API
app.use('/api/bot', botRoutes);
app.use('/api/pairs', pairsRoutes);
app.use('/api/signals', signalRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/position', positionRoutes); // Важный маршрут для работы с позициями

// Обработка всех остальных запросов
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
  logger.error(`Ошибка: ${err.message}`);
  res.status(500).json({
    success: false,
    message: 'Ошибка сервера',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Инициализация бота и запуск сервера
botSetup.setupBot()
  .then((bot) => {
    logger.info('Бот успешно инициализирован');

    // Автоматический запуск бота, если включено
    return botSetup.autoStartBot();
  })
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`Сервер запущен на порту ${PORT}`);
    });
  })
  .catch((error) => {
    logger.error(`Ошибка при инициализации: ${error.message}`);
    process.exit(1);
  });