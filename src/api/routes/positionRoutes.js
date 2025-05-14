// src/api/routes/positionRoutes.js - исправленная версия
const express = require('express');
const router = express.Router();
const positionController = require('../controllers/positionController');

/**
 * Маршруты для управления позициями
 */

// Получение активных позиций
router.get('/active', positionController.getActivePositions);

// Открытие новой позиции
router.post('/open', positionController.openPosition);

// Закрытие позиции
router.post('/close', positionController.closePosition);

// Закрытие позиции по ID (альтернативный маршрут)
router.post('/close/:positionId', positionController.closePosition);

// Установка TP/SL для существующей позиции
router.post('/tpsl', positionController.setTpsl);

// Установка трейлинг-стопа для существующей позиции
router.post('/trailing-stop', positionController.setTrailingStop);

module.exports = router;