// src/api/controllers/settingsController.js
const logger = require('../../utils/logger');
const dataStore = require('../../utils/dataStore');
const { getBot } = require('../../bot/setup');

exports.getSettings = function(req, res) {
  try {
    const tradingBot = getBot();
    
    if (!tradingBot) {
      return res.status(500).json({
        success: false,
        message: 'Trading bot instance not initialized'
      });
    }
    
    const settings = tradingBot.config;
    
    return res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('Error getting settings: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.updateSettings = function(req, res) {
  try {
    const tradingBot = getBot();
    
    if (!tradingBot) {
      return res.status(500).json({
        success: false,
        message: 'Trading bot instance not initialized'
      });
    }
    
    const newSettings = req.body;
    
    if (!newSettings || Object.keys(newSettings).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Settings object is required'
      });
    }
    
    // Обновляем настройки
    const result = tradingBot.updateConfig(newSettings);
    
    // Сохраняем изменения
    dataStore.set('botConfig', tradingBot.config);
    
    return res.json({
      success: result,
      message: result ? 'Settings updated successfully' : 'Failed to update settings'
    });
  } catch (error) {
    logger.error('Error updating settings: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};