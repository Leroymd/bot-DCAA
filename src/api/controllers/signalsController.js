// 2. Обновим signalsController.js для получения реальных сигналов
// src/api/controllers/signalsController.js
const logger = require('../../utils/logger');
const dataStore = require('../../utils/dataStore');
const { getBot } = require('../../bot/setup');

exports.getRecentSignals = async function(req, res) {
  try {
    const tradingBot = getBot();
    
    if (!tradingBot || !tradingBot.strategy) {
      logger.warn('Торговый бот не инициализирован или нет стратегии');
      const cachedSignals = dataStore.get('recentSignals') || [];
      return res.json(cachedSignals);
    }
    
    // Получаем актуальные сигналы от стратегии
    const recentSignals = tradingBot.strategy.getRecentSignals();
    
    // Обновляем кэш
    dataStore.set('recentSignals', recentSignals);
    
    return res.json(recentSignals);
  } catch (error) {
    logger.error('Ошибка получения свежих сигналов: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getIndicatorsStatus = async function(req, res) {
  try {
    const tradingBot = getBot();
    
    if (!tradingBot || !tradingBot.indicatorManager) {
      return res.status(500).json({
        success: false,
        message: 'Торговый бот не правильно инициализирован'
      });
    }
    
    // Получаем текущее состояние индикаторов
    let indicators = {};
    
    try {
      // Для каждой торговой пары получаем актуальные индикаторы
      for (const symbol of tradingBot.config.tradingPairs) {
        const pairIndicators = tradingBot.indicatorManager.getIndicators(symbol);
        if (pairIndicators) {
          indicators[symbol] = {
            lastUpdate: new Date().toISOString(),
            ema: pairIndicators.ema ? {
              fast: pairIndicators.ema.fast ? pairIndicators.ema.fast[pairIndicators.ema.fast.length - 1] : null,
              medium: pairIndicators.ema.medium ? pairIndicators.ema.medium[pairIndicators.ema.medium.length - 1] : null
            } : null,
            fractalCount: pairIndicators.fractals ? 
              (pairIndicators.fractals.buyFractals ? pairIndicators.fractals.buyFractals.length : 0) + 
              (pairIndicators.fractals.sellFractals ? pairIndicators.fractals.sellFractals.length : 0) : 0
          };
        }
      }
    } catch (e) {
      logger.error('Ошибка при получении индикаторов: ' + e.message);
    }
    
    return res.json({
      success: true,
      data: indicators
    });
  } catch (error) {
    logger.error('Ошибка получения статуса индикаторов: ' + error.message);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
