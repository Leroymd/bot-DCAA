// src/api/controllers/botController.js
const logger = require('../../utils/logger');
const dataStore = require('../../utils/dataStore');
let tradingBot = null;

exports.setBotInstance = function(botInstance) {
  tradingBot = botInstance;
};

exports.getStatus = function(req, res) {
  try {
    if (!tradingBot) {
      return res.status(500).json({
        success: false,
        message: 'Trading bot instance not initialized'
      });
    }
    
    // Принудительно обновляем статус перед отправкой
    const status = tradingBot.getStatus();
    
    // Отправляем текущий статус
    return res.json({
      success: true,
      data: status
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
  
  tradingBot.start().then(function(result) {
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