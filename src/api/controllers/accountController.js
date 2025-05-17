// src/api/controllers/accountController.js - новый контроллер для работы с аккаунтом
const logger = require('../../utils/logger');
const serviceManager = require('../../services/ServiceManager');

exports.getBalance = async function(req, res) {
  try {
    // Получаем информацию о балансе от сервиса аккаунта
    const metrics = serviceManager.getAccountService().getPerformanceMetrics();
    
    if (!balanceInfo) {
      return res.status(404).json({
        success: false,
        message: 'Не удалось получить информацию о балансе'
      });
    }
    
    return res.json({
      success: true,
      data: balanceInfo
    });
  } catch (error) {
    logger.error('Ошибка при получении информации о балансе: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getStats = async function(req, res) {
  try {
    // Получаем общую статистику аккаунта
    const stats = await serviceManager.getStatisticsService().getStats();
    
    if (!stats) {
      return res.status(404).json({
        success: false,
        message: 'Не удалось получить статистику'
      });
    }
    
    return res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Ошибка при получении статистики: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};