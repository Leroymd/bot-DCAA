// src/api/controllers/botController.js - обновленная версия
const logger = require('../../utils/logger');
const dataStore = require('../../utils/dataStore');
const { getBot } = require('../../bot/setup');
const serviceManager = require('../../services/ServiceManager');

let tradingBot = null;

exports.setBotInstance = function(botInstance) {
  tradingBot = botInstance;
};

exports.getStatus = function(req, res) {
  try {
    // ИЗМЕНЕНО: Сначала пытаемся получить статус из ServiceManager
    const serviceStatus = serviceManager.getBotStatus();
    
    // Если ServiceManager инициализирован, используем его данные
    if (serviceStatus && serviceStatus.balance > 0) {
      return res.json({
        success: true,
        data: serviceStatus
      });
    }
    
    // Если ServiceManager не инициализирован или в процессе инициализации,
    // пытаемся получить данные из бота
    if (tradingBot) {
      const status = tradingBot.getStatus();
      
      return res.json({
        success: true,
        data: status
      });
    }
    
    // Если ничего не доступно, возвращаем ошибку
    return res.status(500).json({
      success: false,
      message: 'Trading bot instance not initialized and Service Manager not available'
    });
  } catch (error) {
    logger.error('Error getting bot status: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.startBot = function(req, res) {
  if (!tradingBot) {
    return res.status(500).json({
      success: false,
      message: 'Trading bot instance not initialized'
    });
  }
  
  if (tradingBot.isRunning()) {
    return res.json({
      success: true,
      message: 'Bot is already running'
    });
  }
  
  // ИЗМЕНЕНО: Инициализируем ServiceManager при запуске бота
  serviceManager.initialize()
    .then((serviceInitResult) => {
      logger.info(`Service Manager initialization: ${serviceInitResult ? 'SUCCESS' : 'FAILED'}`);
      
      // Независимо от результата инициализации сервисов, запускаем бота
      return tradingBot.start();
    })
    .then(function(result) {
      return res.json({
        success: result,
        message: result ? 'Bot started successfully' : 'Failed to start bot'
      });
    }).catch(function(error) {
      logger.error('Error starting bot: ' + error.message);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    });
};

exports.stopBot = function(req, res) {
  if (!tradingBot) {
    return res.status(500).json({
      success: false,
      message: 'Trading bot instance not initialized'
    });
  }
  
  if (!tradingBot.isRunning()) {
    return res.json({
      success: true,
      message: 'Bot is already stopped'
    });
  }
  
  // ИЗМЕНЕНО: Не останавливаем ServiceManager, чтобы продолжать получать статистику
  tradingBot.stop().then(function(result) {
    return res.json({
      success: result,
      message: result ? 'Bot stopped successfully' : 'Failed to stop bot'
    });
  }).catch(function(error) {
    logger.error('Error stopping bot: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  });
};

// ДОБАВЛЕНО: Метод для принудительного обновления данных
exports.refreshData = function(req, res) {
  try {
    // Обновляем данные через ServiceManager
    serviceManager.refreshData()
      .then(function(result) {
        return res.json({
          success: result,
          message: result ? 'Data refreshed successfully' : 'Failed to refresh data'
        });
      })
      .catch(function(error) {
        logger.error('Error refreshing data: ' + error.message);
        return res.status(500).json({
          success: false,
          message: error.message
        });
      });
  } catch (error) {
    logger.error('Error in refreshData: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getLogs = function(req, res) {
  try {
    var limit = parseInt(req.query.limit) || 100;
    var logs = logger.getRecentLogs(limit);
    
    return res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    logger.error('Error getting logs: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};