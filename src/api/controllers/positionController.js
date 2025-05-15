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
    
    // Если positionId передан в URL параметрах, используем его
    if (req.params && req.params.positionId) {
      positionId = req.params.positionId;
    }
    
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
    
    // ИСПРАВЛЕНО: Получаем дополнительную информацию о позиции перед закрытием
    let positionInfo = null;
    
    // Если известен ID позиции, но не символ, пытаемся найти символ по ID
    if (positionId && !symbol) {
      const openPositions = await tradingBot.positionManager.updateOpenPositions();
      positionInfo = openPositions.find(p => p.id === positionId);
      
      if (positionInfo) {
        symbol = positionInfo.symbol;
        logger.info(`Найден символ ${symbol} для позиции с ID ${positionId}`);
      } else {
        logger.warn(`Не удалось найти позицию с ID ${positionId}`);
      }
    }
    
    // Если есть и ID и символ, используем оба для закрытия
    if (positionId && symbol) {
      logger.info(`Закрытие позиции с ID ${positionId}, символ: ${symbol}`);
      
      // Обновляем открытые позиции для получения актуальных данных
      await tradingBot.positionManager.updateOpenPositions();
      
      // Закрываем позицию с использованием символа для большей надежности
      const result = await tradingBot.positionManager.closePosition(positionId);
      
      if (!result) {
        // Если не удалось закрыть по ID, пробуем по символу
        logger.warn(`Не удалось закрыть позицию по ID ${positionId}, пробуем по символу ${symbol}`);
        const symbolResult = await tradingBot.positionManager.closePositionBySymbol(symbol);
        
        if (!symbolResult) {
          return res.status(500).json({
            success: false,
            message: `Не удалось закрыть позицию ${symbol}`
          });
        }
      }
    } 
    // Если указан только символ, закрываем по символу
    else if (symbol) {
      logger.info(`Закрытие позиции по символу: ${symbol}`);
      
      const result = await tradingBot.positionManager.closePositionBySymbol(symbol);
      
      if (!result) {
        return res.status(500).json({
          success: false,
          message: `Не удалось закрыть позицию ${symbol}`
        });
      }
    }
    // Если указан только ID, закрываем по ID
    else if (positionId) {
      logger.info(`Закрытие позиции по ID: ${positionId}`);
      
      const result = await tradingBot.positionManager.closePosition(positionId);
      
      if (!result) {
        return res.status(500).json({
          success: false,
          message: `Не удалось закрыть позицию с ID ${positionId}`
        });
      }
    }
    
    // Обновляем список открытых позиций
    await tradingBot.positionManager.updateOpenPositions();
    
    // Обновляем статус бота
    tradingBot.updateStatus();
    
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

// Метод для установки TP/SL
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
    
    // Приводим holdSide к верхнему регистру для соблюдения требований API
    const formattedHoldSide = holdSide.toUpperCase();
    
    logger.info(`Запрос на установку TP/SL: ${symbol}, ${formattedHoldSide}, TP=${takeProfitPrice}, SL=${stopLossPrice}`);
    
    let tpSuccess = true;
    let slSuccess = true;
    
    // Получаем информацию о позиции для определения размера
    const positionDetails = await tradingBot.client.getPositionDetails(symbol);
    if (!positionDetails || !positionDetails.data) {
      return res.status(404).json({
        success: false,
        message: `Не найдена открытая позиция для ${symbol}`
      });
    }
    
    const position = positionDetails.data;
    const positionSize = position.available || position.total; // Размер позиции
    
    // Если указан Take Profit, устанавливаем его
    if (takeProfitPrice) {
      try {
        const tpResponse = await tradingBot.client.setTpsl(
          symbol,
          formattedHoldSide, // Используем верхний регистр
          'profit_plan',
          takeProfitPrice,
          positionSize
        );
        
        if (!tpResponse || tpResponse.code !== '00000') {
          logger.warn(`Не удалось установить Take Profit: ${tpResponse ? tpResponse.msg : 'Нет ответа от API'}`);
          tpSuccess = false;
        } else {
          logger.info(`Take Profit установлен для ${symbol} на уровне ${takeProfitPrice}`);
        }
      } catch (tpError) {
        logger.error(`Ошибка при установке Take Profit: ${tpError.message}`);
        tpSuccess = false;
      }
    }
    
    // Если указан Stop Loss, устанавливаем его
    if (stopLossPrice) {
      try {
        const slResponse = await tradingBot.client.setTpsl(
          symbol,
          formattedHoldSide, // Используем верхний регистр
          'loss_plan',
          stopLossPrice,
          positionSize
        );
        
        if (!slResponse || slResponse.code !== '00000') {
          logger.warn(`Не удалось установить Stop Loss: ${slResponse ? slResponse.msg : 'Нет ответа от API'}`);
          slSuccess = false;
        } else {
          logger.info(`Stop Loss установлен для ${symbol} на уровне ${stopLossPrice}`);
        }
      } catch (slError) {
        logger.error(`Ошибка при установке Stop Loss: ${slError.message}`);
        slSuccess = false;
      }
    }
    
    if (!tpSuccess && !slSuccess) {
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

// Метод для установки трейлинг-стопа
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
    
    // Приводим holdSide к верхнему регистру для соблюдения требований API
    const formattedHoldSide = holdSide.toUpperCase();
    
    logger.info(`Запрос на установку трейлинг-стопа: ${symbol}, ${formattedHoldSide}, callbackRatio=${callbackRatio}`);
    
    // Получаем информацию о позиции для определения размера
    const positionDetails = await tradingBot.client.getPositionDetails(symbol);
    if (!positionDetails || !positionDetails.data) {
      return res.status(404).json({
        success: false,
        message: `Не найдена открытая позиция для ${symbol}`
      });
    }
    
    const position = positionDetails.data;
    const positionSize = position.available || position.total; // Размер позиции
    
    const result = await tradingBot.client.setTrailingStop(
      symbol,
      formattedHoldSide, // Используем верхний регистр
      callbackRatio,
      positionSize
    );
    
    if (!result || result.code !== '00000') {
      logger.warn(`Не удалось установить трейлинг-стоп: ${result ? result.msg : 'Нет ответа от API'}`);
      return res.status(500).json({
        success: false,
        message: `Не удалось установить трейлинг-стоп: ${result ? result.msg : 'Ошибка API'}`
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