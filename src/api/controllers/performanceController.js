// 3. Обновим performanceController.js для получения реальной производительности
// src/api/controllers/performanceController.js
const logger = require('../../utils/logger');
const dataStore = require('../../utils/dataStore');
const { getBot } = require('../../bot/setup');

exports.getPerformance = function(req, res) {
  try {
    const date = req.query.date;
    
    const performanceData = dataStore.getPerformanceData(date);
    
    if (date && !performanceData) {
      return res.status(404).json({
        success: false,
        message: 'Для даты ' + date + ' данные о производительности не найдены'
      });
    }
    
    return res.json({
      success: true,
      data: performanceData || {}
    });
  } catch (error) {
    logger.error('Ошибка получения данных о производительности: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getPnlData = function(req, res) {
  try {
    const days = parseInt(req.query.days) || 7;
    
    const pnlData = dataStore.getPnlData(days);
    
    return res.json(pnlData);
  } catch (error) {
    logger.error('Ошибка получения данных о PnL: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getBalanceHistory = async function(req, res) {
  try {
    const tradingBot = getBot();
    
    if (!tradingBot || !tradingBot.client) {
      const cachedHistory = dataStore.get('balanceHistory') || [];
      return res.json(cachedHistory);
    }
    
    // Получаем текущий баланс
    try {
      await tradingBot.updateAccountBalance();
    } catch (err) {
      logger.warn('Не удалось обновить баланс: ' + err.message);
    }
    
    // Обновляем историю баланса
    const balanceHistory = tradingBot.getBalanceHistory();
    
    return res.json(balanceHistory);
  } catch (error) {
    logger.error('Ошибка получения истории баланса: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getTradeHistory = async function(req, res) {
  try {
    const tradingBot = getBot();
    const limit = parseInt(req.query.limit) || 20;
    
    if (!tradingBot || !tradingBot.client) {
      const cachedHistory = dataStore.get('tradeHistory') || [];
      return res.json(cachedHistory.slice(-limit).reverse());
    }
    
    // Получаем реальную историю сделок
    try {
      // Получаем историю сделок за последние 30 дней для всех пар
      const now = new Date().getTime();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      
      let allTrades = [];
      
      for (const symbol of tradingBot.config.tradingPairs) {
        try {
          const historyResponse = await tradingBot.client.getHistoricalOrders(
            symbol, 
            thirtyDaysAgo.toString(), 
            now.toString(), 
            100
          );
          
          if (historyResponse && historyResponse.data && Array.isArray(historyResponse.data)) {
            // Преобразуем данные от API в нужный формат
            const trades = historyResponse.data.map(trade => ({
              symbol: trade.symbol,
              type: trade.side === 'buy' ? 'LONG' : 'SHORT',
              entryPrice: parseFloat(trade.price),
              closePrice: parseFloat(trade.priceAvg),
              entryTime: parseInt(trade.cTime),
              closeTime: parseInt(trade.uTime),
              pnl: parseFloat(trade.pnl) / parseFloat(trade.size) * 100,
              pnlUSDT: parseFloat(trade.pnl),
              result: parseFloat(trade.pnl) >= 0 ? 'win' : 'loss'
            }));
            
            allTrades = allTrades.concat(trades);
          }
        } catch (err) {
          logger.warn(`Не удалось получить историю сделок для ${symbol}: ${err.message}`);
        }
      }
      
      // Сортируем по времени (от новых к старым)
      allTrades.sort((a, b) => b.entryTime - a.entryTime);
      
      // Ограничиваем количество записей
      allTrades = allTrades.slice(0, limit);
      
      // Обновляем кэш
      if (allTrades.length > 0) {
        tradingBot.positionManager.positionHistory = allTrades;
        tradingBot.saveTradeHistory();
      }
      
      return res.json(allTrades);
    } catch (err) {
      logger.warn('Не удалось получить историю сделок от API: ' + err.message);
      
      // Возвращаем кэшированные данные
      const cachedHistory = dataStore.get('tradeHistory') || [];
      return res.json(cachedHistory.slice(-limit).reverse());
    }
  } catch (error) {
    logger.error('Ошибка получения истории сделок: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};