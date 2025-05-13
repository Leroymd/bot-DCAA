// src/api/controllers/positionController.js
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
    
    let result = false;
    
    // Если указан positionId, закрываем по ID
    if (positionId) {
      logger.info(`Закрытие позиции по ID: ${positionId}`);
      result = await tradingBot.positionManager.closePosition(positionId, 100);
    } 
    // Если указан symbol, закрываем по символу
    else if (symbol) {
      logger.info(`Закрытие позиции по символу: ${symbol}`);
      result = await tradingBot.positionManager.closePositionBySymbol(symbol);
    }
    
    if (!result) {
      return res.status(500).json({
        success: false,
        message: `Не удалось закрыть позицию ${positionId ? `с ID ${positionId}` : `для символа ${symbol}`}`
      });
    }
    
    // Обновляем список открытых позиций
    await tradingBot.positionManager.updateOpenPositions();
    
    return res.json({
      success: true,
      message: `Позиция ${positionId ? positionId : symbol} успешно закрыта`
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