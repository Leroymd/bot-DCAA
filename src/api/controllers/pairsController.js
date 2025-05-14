// src/api/controllers/pairsController.js - исправленная версия
const logger = require('../../utils/logger');
const dataStore = require('../../utils/dataStore');
const { getBot } = require('../../bot/setup');

exports.getActivePairs = async function(req, res) {
  try {
    const tradingBot = getBot();
    
    if (!tradingBot || !tradingBot.client) {
      logger.error('Торговый бот не инициализирован или нет клиента API');
      const cachedPairs = dataStore.get('tradingPairs') || [];
      return res.json(cachedPairs);
    }
    
    // Получаем актуальные позиции напрямую из API биржи
    const positionsResponse = await tradingBot.client.getPositions();
    
    if (!positionsResponse || !positionsResponse.data) {
      logger.warn('Не удалось получить позиции от API биржи');
      const cachedPairs = dataStore.get('tradingPairs') || [];
      return res.json(cachedPairs);
    }
    
    // Преобразуем позиции в нужный формат для фронтенда
    const apiPositions = positionsResponse.data;
    const currentPrices = tradingBot.currentPrice || {};
    
    const tradingPairs = [];
    
    // Добавляем активные позиции
    for (const position of apiPositions) {
      if (parseFloat(position.total) > 0) {
        // Рассчитываем длительность позиции
        const entryTime = parseInt(position.ctime);
        const now = new Date().getTime();
        const duration = now - entryTime;
        
        // Форматируем время
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        tradingPairs.push({
          pair: position.symbol,
          status: 'active',
          position: position.holdSide.toUpperCase(),
          entryPrice: parseFloat(position.openPrice),
          currentPrice: currentPrices[position.symbol] || parseFloat(position.marketPrice),
          profit: parseFloat(position.unrealizedPL) / parseFloat(position.margin) * 100,
          time: timeString,
          id: position.positionId
        });
      }
    }
    
    // Добавляем остальные торговые пары, которые настроены, но не имеют активных позиций
    const configuredPairs = tradingBot.config.tradingPairs || [];
    for (const symbol of configuredPairs) {
      if (!tradingPairs.find(p => p.pair === symbol)) {
        tradingPairs.push({
          pair: symbol,
          status: 'waiting',
          position: null,
          profit: 0,
          time: '00:00',
          signals: tradingBot.indicatorManager ? tradingBot.indicatorManager.getSignalCount(symbol) || 0 : 0
        });
      }
    }
    
    // Обновляем кэш
    dataStore.set('tradingPairs', tradingPairs);
    
    return res.json(tradingPairs);
  } catch (error) {
    logger.error('Ошибка получения активных пар: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getTopPairs = async function(req, res) {
  try {
    const tradingBot = getBot();
    
    if (!tradingBot || !tradingBot.client) {
      const cachedPairs = dataStore.get('topPairs') || [];
      return res.json(cachedPairs);
    }
    
    // Запускаем сканирование пар в реальном времени
    const topPairs = await tradingBot.scanMarketPairs();
    
    return res.json(topPairs);
  } catch (error) {
    logger.error('Ошибка получения топ пар: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.scanPairs = function(req, res) {
  const tradingBot = getBot();
  
  if (!tradingBot) {
    return res.status(500).json({
      success: false,
      message: 'Торговый бот не инициализирован'
    });
  }
  
  tradingBot.scanMarketPairs().then(function(pairs) {
    return res.json({
      success: true,
      pairs: pairs
    });
  }).catch(function(error) {
    logger.error('Ошибка сканирования пар: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  });
};

exports.selectPair = function(req, res) {
  const tradingBot = getBot();
  
  if (!tradingBot) {
    return res.status(500).json({
      success: false,
      message: 'Торговый бот не инициализирован'
    });
  }
  
  const pair = req.body.pair;
  
  if (!pair) {
    return res.status(400).json({
      success: false,
      message: 'Параметр пары обязателен'
    });
  }
  
  tradingBot.selectPairForTrading(pair).then(function(result) {
    return res.json({
      success: result,
      message: result ? 'Пара ' + pair + ' добавлена для торговли' : 'Не удалось добавить пару ' + pair + ' для торговли'
    });
  }).catch(function(error) {
    logger.error('Ошибка выбора пары: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  });
};

// Новый метод для удаления пары из списка торгуемых
exports.removePair = function(req, res) {
  const tradingBot = getBot();
  
  if (!tradingBot) {
    return res.status(500).json({
      success: false,
      message: 'Торговый бот не инициализирован'
    });
  }
  
  const pair = req.body.pair;
  
  if (!pair) {
    return res.status(400).json({
      success: false,
      message: 'Параметр пары обязателен'
    });
  }
  
  // Проверяем, есть ли открытые позиции по этой паре
  tradingBot.positionManager.updateOpenPositions().then(positions => {
    const hasActivePosition = positions.some(p => p.symbol === pair);
    
    if (hasActivePosition) {
      return res.status(400).json({
        success: false,
        message: `Нельзя удалить пару ${pair}, так как по ней есть открытая позиция. Сначала закройте позицию.`
      });
    }
    
    // Удаляем пару из списка торгуемых
    if (tradingBot.config.tradingPairs.includes(pair)) {
      tradingBot.config.tradingPairs = tradingBot.config.tradingPairs.filter(p => p !== pair);
      
      // Сохраняем обновленный список пар
      dataStore.set('botConfig', tradingBot.config);
      
      // Обновляем кэш tradingPairs
      const tradingPairs = dataStore.get('tradingPairs') || [];
      dataStore.set('tradingPairs', tradingPairs.filter(p => p.pair !== pair));
      
      logger.info(`Пара ${pair} удалена из списка торгуемых`);
      
      return res.json({
        success: true,
        message: `Пара ${pair} удалена из списка торгуемых`
      });
    } else {
      return res.status(404).json({
        success: false,
        message: `Пара ${pair} не найдена в списке торгуемых`
      });
    }
  }).catch(error => {
    logger.error(`Ошибка при удалении пары: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  });
};