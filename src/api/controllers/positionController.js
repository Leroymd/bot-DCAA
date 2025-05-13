// src/api/controllers/positionController.js с поддержкой закрытия по символу
const logger = require('../../utils/logger');
const { getBot } = require('../../bot/setup');

exports.openPosition = async function(req, res) {
  try {
    const tradingBot = getBot();
    
    if (!tradingBot || !tradingBot.positionManager) {
      return res.status(500).json({
        success: false,
        message: 'Торговый бот не инициализирован или отсутствует менеджер позиций'
      });
    }
    
    const { symbol, type, size, leverage } = req.body;
    
    if (!symbol || !type || !size) {
      return res.status(400).json({
        success: false,
        message: 'Не указаны обязательные параметры (symbol, type, size)'
      });
    }
    
    logger.info(`Запрос на открытие позиции: ${type} ${symbol}, размер=${size}${leverage ? `, плечо=${leverage}x` : ''}`);
    
    // Получаем текущую цену для символа
    const ticker = await tradingBot.client.getTicker(symbol);
    if (!ticker || !ticker.data || !ticker.data.last) {
      return res.status(400).json({
        success: false,
        message: `Не удалось получить текущую цену для ${symbol}`
      });
    }
    
    const price = parseFloat(ticker.data.last);
    logger.info(`Текущая цена ${symbol}: ${price} USDT`);
    
    // Если передано плечо, обновляем настройки перед открытием позиции
    if (leverage) {
      try {
        // Сохраняем исходное плечо для возврата после открытия позиции
        const originalLeverage = tradingBot.config.leverage;
        
        // Временно обновляем плечо в конфигурации
        tradingBot.config.leverage = parseInt(leverage, 10);
        
        logger.info(`Временно установлено плечо ${leverage}x для ${symbol}`);
        
        // Открываем позицию с указанными параметрами
        const parsedSize = parseFloat(size);
        const position = await tradingBot.positionManager.openPosition(
          type.toUpperCase(),
          symbol,
          price,
          'Ручное открытие позиции через интерфейс',
          null,
          parsedSize // Передаем размер позиции как последний параметр
        );
        
        // Восстанавливаем исходное плечо
        tradingBot.config.leverage = originalLeverage;
        
        if (!position) {
          return res.status(500).json({
            success: false,
            message: 'Не удалось открыть позицию'
          });
        }
        
        // Обновляем список открытых позиций
        await tradingBot.positionManager.updateOpenPositions();
        
        return res.json({
          success: true,
          message: `Позиция ${type.toUpperCase()} для ${symbol} успешно открыта`,
          data: position
        });
        
      } catch (leverageError) {
        logger.error(`Ошибка при установке плеча: ${leverageError.message}`);
        return res.status(500).json({
          success: false,
          message: `Ошибка при установке плеча: ${leverageError.message}`
        });
      }
    } else {
      // Открываем позицию с указанными параметрами (без изменения плеча)
      const parsedSize = parseFloat(size);
      const position = await tradingBot.positionManager.openPosition(
        type.toUpperCase(),
        symbol,
        price,
        'Ручное открытие позиции через интерфейс',
        null,
        parsedSize // Передаем размер позиции как последний параметр
      );
      
      if (!position) {
        return res.status(500).json({
          success: false,
          message: 'Не удалось открыть позицию'
        });
      }
      
      // Обновляем список открытых позиций
      await tradingBot.positionManager.updateOpenPositions();
      
      return res.json({
        success: true,
        message: `Позиция ${type.toUpperCase()} для ${symbol} успешно открыта`,
        data: position
      });
    }
  } catch (error) {
    logger.error(`Ошибка при открытии позиции: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.closePosition = async function(req, res) {
  try {
    const tradingBot = getBot();
    
    if (!tradingBot || !tradingBot.positionManager) {
      return res.status(500).json({
        success: false,
        message: 'Торговый бот не инициализирован или отсутствует менеджер позиций'
      });
    }
    
    // Расширенное логирование тела запроса для отладки
    logger.info(`Тело запроса на закрытие позиции: ${JSON.stringify(req.body)}`);
    
    // Извлекаем positionId или symbol из запроса
    let positionId = req.body.positionId;
    let symbol = req.body.symbol || req.body.pair;
    
    // Проверка на случай других вариантов именования параметра
    if (!positionId && req.body.id) {
      positionId = req.body.id;
    }
    
    // Если нет positionId, но есть symbol, используем symbol для поиска позиции
    if (!positionId && !symbol) {
      logger.error('Не указан ID позиции или символ пары в запросе на закрытие');
      return res.status(400).json({
        success: false,
        message: 'Не указан ID позиции или символ пары для закрытия. Добавьте positionId или symbol в тело запроса.'
      });
    }
    
    // Получаем текущие открытые позиции для проверки
    const openPositions = await tradingBot.positionManager.updateOpenPositions();
    logger.info(`Текущие открытые позиции: ${JSON.stringify(openPositions.map(p => ({ id: p.id, symbol: p.symbol })))}`);
    
    let targetPosition;
    
    if (positionId) {
      // Пытаемся найти позицию по ID
      targetPosition = openPositions.find(p => String(p.id) === String(positionId));
      logger.info(`Поиск позиции по ID ${positionId}: ${targetPosition ? 'найдена' : 'не найдена'}`);
    } else if (symbol) {
      // Пытаемся найти позицию по символу
      targetPosition = openPositions.find(p => p.symbol === symbol);
      logger.info(`Поиск позиции по символу ${symbol}: ${targetPosition ? 'найдена' : 'не найдена'}`);
      
      if (targetPosition) {
        positionId = targetPosition.id;
      }
    }
    
    if (!targetPosition) {
      logger.warn(`Позиция с ${positionId ? 'ID ' + positionId : 'символом ' + symbol} не найдена в списке открытых позиций`);
      
      // Если указан symbol, но позиция не найдена по symbol, пробуем закрыть все позиции по этому символу через API
      if (symbol) {
        logger.info(`Попытка закрытия всех позиций для символа ${symbol} через API`);
        
        // Закрываем позицию напрямую через API
        const result = await tradingBot.positionManager.closePositionBySymbol(symbol);
        
        if (!result) {
          return res.status(500).json({
            success: false,
            message: `Не удалось закрыть позицию для символа ${symbol}`
          });
        }
        
        // Обновляем список открытых позиций
        await tradingBot.positionManager.updateOpenPositions();
        
        return res.json({
          success: true,
          message: `Позиция для символа ${symbol} успешно закрыта`
        });
      } else {
        return res.status(404).json({
          success: false,
          message: 'Указанная позиция не найдена в списке открытых позиций'
        });
      }
    }
    
    // Закрываем позицию по ID
    const result = await tradingBot.positionManager.closePosition(positionId, 100);
    
    if (!result) {
      return res.status(500).json({
        success: false,
        message: 'Не удалось закрыть позицию'
      });
    }
    
    // Обновляем список открытых позиций
    await tradingBot.positionManager.updateOpenPositions();
    
    return res.json({
      success: true,
      message: `Позиция ${symbol || positionId} успешно закрыта`
    });
  } catch (error) {
    logger.error(`Ошибка при закрытии позиции: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getActivePositions = async function(req, res) {
  try {
    const tradingBot = getBot();
    
    if (!tradingBot || !tradingBot.positionManager) {
      return res.status(500).json({
        success: false,
        message: 'Торговый бот не инициализирован или отсутствует менеджер позиций'
      });
    }
    
    // Получаем текущие открытые позиции
    const positions = await tradingBot.positionManager.updateOpenPositions();
    
    return res.json({
      success: true,
      data: positions
    });
  } catch (error) {
    logger.error(`Ошибка при получении активных позиций: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};