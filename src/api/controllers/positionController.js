// src/api/controllers/positionController.js - исправленная версия
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
    
    const { symbol, type, size, leverage, takeProfitPrice, stopLossPrice } = req.body;
    
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
        
        // Открываем позицию с указанными параметрами, включая TP/SL
        const parsedSize = parseFloat(size);
        const position = await tradingBot.positionManager.openPosition(
          type.toUpperCase(),
          symbol,
          price,
          'Ручное открытие позиции через интерфейс',
          null,
          parsedSize,
          takeProfitPrice ? parseFloat(takeProfitPrice) : null,
          stopLossPrice ? parseFloat(stopLossPrice) : null
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
        parsedSize,
        takeProfitPrice ? parseFloat(takeProfitPrice) : null,
        stopLossPrice ? parseFloat(stopLossPrice) : null
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
    
    // Проверка наличия необходимых параметров
    if (!positionId && !symbol) {
      logger.error('Не указан ID позиции или символ пары в запросе на закрытие');
      return res.status(400).json({
        success: false,
        message: 'Не указан ID позиции или символ пары для закрытия. Добавьте positionId или symbol в тело запроса.'
      });
    }
    
    let result;
    
    // Если указан символ (но нет ID), закрываем по символу
    if (symbol && !positionId) {
      logger.info(`Закрытие позиции по символу: ${symbol}`);
      result = await tradingBot.positionManager.closePositionBySymbol(symbol);
    } 
    // Если указан ID, закрываем по ID
    else if (positionId) {
      logger.info(`Закрытие позиции по ID: ${positionId}`);
      result = await tradingBot.positionManager.closePosition(positionId);
    }
    
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
    
    // Обновляем и получаем текущие открытые позиции
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

// Новый метод для установки TP/SL
exports.setTpsl = async function(req, res) {
  try {
    const tradingBot = getBot();
    
    if (!tradingBot || !tradingBot.positionManager) {
      return res.status(500).json({
        success: false,
        message: 'Торговый бот не инициализирован или отсутствует менеджер позиций'
      });
    }
    
    const { symbol, holdSide, takeProfitPrice, stopLossPrice } = req.body;
    
    if (!symbol || !holdSide) {
      return res.status(400).json({
        success: false,
        message: 'Не указаны обязательные параметры (symbol, holdSide)'
      });
    }
    
    // Хотя бы одно из TP/SL должно быть указано
    if (!takeProfitPrice && !stopLossPrice) {
      return res.status(400).json({
        success: false,
        message: 'Необходимо указать хотя бы одно из значений: takeProfitPrice или stopLossPrice'
      });
    }
    
    logger.info(`Запрос на установку TP/SL: ${symbol}, ${holdSide}, TP=${takeProfitPrice}, SL=${stopLossPrice}`);
    
    const result = await tradingBot.positionManager.setTpsl(
      symbol,
      holdSide,
      takeProfitPrice,
      stopLossPrice
    );
    
    if (!result) {
      return res.status(500).json({
        success: false,
        message: 'Не удалось установить TP/SL'
      });
    }
    
    return res.json({
      success: true,
      message: `TP/SL успешно установлены для ${symbol}`
    });
  } catch (error) {
    logger.error(`Ошибка при установке TP/SL: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Новый метод для установки трейлинг-стопа
exports.setTrailingStop = async function(req, res) {
  try {
    const tradingBot = getBot();
    
    if (!tradingBot || !tradingBot.positionManager) {
      return res.status(500).json({
        success: false,
        message: 'Торговый бот не инициализирован или отсутствует менеджер позиций'
      });
    }
    
    const { symbol, holdSide, callbackRatio } = req.body;
    
    if (!symbol || !holdSide || !callbackRatio) {
      return res.status(400).json({
        success: false,
        message: 'Не указаны обязательные параметры (symbol, holdSide, callbackRatio)'
      });
    }
    
    logger.info(`Запрос на установку трейлинг-стопа: ${symbol}, ${holdSide}, callbackRatio=${callbackRatio}`);
    
    const result = await tradingBot.positionManager.setTrailingStop(
      symbol,
      holdSide,
      callbackRatio
    );
    
    if (!result) {
      return res.status(500).json({
        success: false,
        message: 'Не удалось установить трейлинг-стоп'
      });
    }
    
    return res.json({
      success: true,
      message: `Трейлинг-стоп успешно установлен для ${symbol}`
    });
  } catch (error) {
    logger.error(`Ошибка при установке трейлинг-стопа: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};