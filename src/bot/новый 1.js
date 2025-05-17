async handleSignal(signal) {
  // Проверяем, что сигнал вообще есть и у него есть тип
  if (!signal || typeof signal.type !== 'string') {
    logger.warn(`[TradingBot] Получен некорректный сигнал: ${JSON.stringify(signal)}`);
    return;
  }

  const { type, symbol, price, strength, reason } = signal;
  const pair = symbol;

  const minStrength = this.config.strategySettings?.minSignalStrengthToOpen || this.config.minSignalStrengthToOpen || 0;
  if (strength !== undefined && strength < minStrength) {
    logger.info(`[TradingBot] Сигнал для ${pair} (${type}) слишком слабый (${strength} < ${minStrength}). Игнорируется.`);
    return;
  }

  // Используем getOpenPositionsForPair, который должен быть в PositionManager
  // Он должен возвращать массив, даже если пустой.
  const openPositionsForPair = this.positionManager.getOpenPositionsForPair(pair);
  const currentOpenPosition = openPositionsForPair.length > 0 ? openPositionsForPair[0] : null; // Берем первую, если есть

  const openPositionsCount = this.positionManager.getOpenPositions().filter(p => p.status !== 'closed').length;
  const globalMaxOpenPositions = this.config.riskManagement?.maxOpenPositions || 1;

  let allowShorting = this.config.strategySettings?.pureFractal?.allowShorting;
  if (allowShorting === undefined) {
      allowShorting = this.config.strategySettings?.allowShorting;
  }
  if (allowShorting === undefined && this.strategy && this.strategy.strategySettings) {
      allowShorting = this.strategy.strategySettings.allowShorting;
  }
  allowShorting = allowShorting !== undefined ? allowShorting : false;

  const signalTypeUpper = type.toUpperCase();

  if (signalTypeUpper.includes('BUY')) {
    if (currentOpenPosition) {
      // ПРОВЕРКА: currentOpenPosition.side существует и является строкой
      if (currentOpenPosition.side && typeof currentOpenPosition.side === 'string' && currentOpenPosition.side.toLowerCase() === 'sell') {
        logger.info(`[TradingBot] Сигнал ${type} для ${pair}. Закрываем существующий SHORT.`);
        try {
          await this.positionManager.closePosition(pair, currentOpenPosition.id, `Reversing Short to Long on ${type} signal. Reason: ${reason}`);
          const updatedOpenPositionsCount = this.positionManager.getOpenPositions().filter(p=>p.status !== 'closed').length;
          if (updatedOpenPositionsCount < globalMaxOpenPositions) {
            logger.info(`[TradingBot] Открываем LONG для ${pair} после закрытия SHORT.`);
            await this.positionManager.openPosition('buy', pair, price, reason, strength);
          } else {
            logger.info(`[TradingBot] SHORT для ${pair} закрыт, но достигнут лимит (${globalMaxOpenPositions}). Новый LONG не открывается.`);
          }
        } catch (error) {
          logger.error(`[TradingBot] Ошибка при реверсе SHORT->LONG для ${pair}: ${error.message}`, error.stack);
        }
      } else if (currentOpenPosition && currentOpenPosition.side && typeof currentOpenPosition.side === 'string' && currentOpenPosition.side.toLowerCase() === 'buy') {
        logger.info(`[TradingBot] Сигнал ${type} для ${pair}, но LONG позиция уже открыта. Нет действий.`);
      } else if (!currentOpenPosition) { // Нет открытой позиции
        if (openPositionsCount < globalMaxOpenPositions) {
          logger.info(`[TradingBot] Сигнал ${type} для ${pair}. Открываем новую LONG позицию.`);
          try {
            await this.positionManager.openPosition('buy', pair, price, reason, strength);
          } catch (error) {
            logger.error(`[TradingBot] Ошибка при открытии LONG позиции для ${pair}: ${error.message}`, error.stack);
          }
        } else {
          logger.info(`[TradingBot] Сигнал ${type} для ${pair}, но достигнут лимит (${globalMaxOpenPositions}). Позиция не открывается.`);
        }
      } else {
         logger.warn(`[TradingBot] Неопределенное состояние для сигнала BUY для ${pair}. currentOpenPosition.side: ${currentOpenPosition ? currentOpenPosition.side : 'N/A'}`);
      }
    } else if (signalTypeUpper.includes('SELL')) {
      if (currentOpenPosition) {
        // ПРОВЕРКА: currentOpenPosition.side существует и является строкой
        if (currentOpenPosition.side && typeof currentOpenPosition.side === 'string' && currentOpenPosition.side.toLowerCase() === 'buy') {
          logger.info(`[TradingBot] Сигнал ${type} для ${pair}. Закрываем существующий LONG.`);
          try {
            await this.positionManager.closePosition(pair, currentOpenPosition.id, `Reversing Long to Short on ${type} signal. Reason: ${reason}`);
            const updatedOpenPositionsCount = this.positionManager.getOpenPositions().filter(p=>p.status !== 'closed').length;
            if (allowShorting && updatedOpenPositionsCount < globalMaxOpenPositions) {
              logger.info(`[TradingBot] Открываем SHORT для ${pair} после закрытия LONG (шортинг разрешен).`);
              await this.positionManager.openPosition('sell', pair, price, reason, strength);
            } else {
              logger.info(`[TradingBot] LONG для ${pair} закрыт. Шортинг не разрешен или достигнут лимит (${globalMaxOpenPositions}). Новый SHORT не открывается.`);
            }
          } catch (error) {
            logger.error(`[TradingBot] Ошибка при реверсе LONG->SHORT для ${pair}: ${error.message}`, error.stack);
          }
        } else if (currentOpenPosition && currentOpenPosition.side && typeof currentOpenPosition.side === 'string' && currentOpenPosition.side.toLowerCase() === 'sell') {
          logger.info(`[TradingBot] Сигнал ${type} для ${pair}, но SHORT позиция уже открыта. Нет действий.`);
        } else {
          logger.warn(`[TradingBot] Неопределенное состояние для сигнала SELL для ${pair} при закрытой позиции. currentOpenPosition.side: ${currentOpenPosition ? currentOpenPosition.side : 'N/A'}`);
        }
      } else { // Нет открытой позиции
        if (allowShorting && openPositionsCount < globalMaxOpenPositions) {
          logger.info(`[TradingBot] Сигнал ${type} для ${pair}. Открываем новую SHORT позицию (шортинг разрешен).`);
          try {
            await this.positionManager.openPosition('sell', pair, price, reason, strength);
          } catch (error) {
            logger.error(`[TradingBot] Ошибка при открытии SHORT позиции для ${pair}: ${error.message}`, error.stack);
          }
        } else {
          logger.info(`[TradingBot] Сигнал ${type} для ${pair}. Шортинг не разрешен или достигнут лимит (${globalMaxOpenPositions}). Позиция не открывается.`);
        }
      }
    } else if (signalTypeUpper === 'CLOSE_LONG') {
        if (currentOpenPosition && currentOpenPosition.side && typeof currentOpenPosition.side === 'string' && currentOpenPosition.side.toLowerCase() === 'buy') {
            logger.info(`[TradingBot] Сигнал CLOSE_LONG для ${pair}. Закрываем LONG позицию.`);
            await this.positionManager.closePosition(pair, currentOpenPosition.id, reason || `Signal CLOSE_LONG for ${pair}`);
        }
    } else if (signalTypeUpper === 'CLOSE_SHORT') {
        if (currentOpenPosition && currentOpenPosition.side && typeof currentOpenPosition.side === 'string' && currentOpenPosition.side.toLowerCase() === 'sell') {
            logger.info(`[TradingBot] Сигнал CLOSE_SHORT для ${pair}. Закрываем SHORT позицию.`);
            await this.positionManager.closePosition(pair, currentOpenPosition.id, reason || `Signal CLOSE_SHORT for ${pair}`);
        }
    } else {
        logger.warn(`[TradingBot] Получен неизвестный или некорректный тип сигнала: '${type}' для ${pair}`);
    }
  }
