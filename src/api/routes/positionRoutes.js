// src/api/routes/positionRoutes.js - исправленная версия
const express = require('express');
const positionController = require('../controllers/positionController');

const router = express.Router();

// Маршруты для управления позициями
router.post('/open', positionController.openPosition);
router.post('/close/:positionId', positionController.closePosition); // Маршрут с параметром
router.post('/close', positionController.closePosition);
router.get('/active', positionController.getActivePositions);

// Новые маршруты для TP/SL и трейлинг-стопов
router.post('/tpsl', positionController.setTpsl);
router.post('/trailing-stop', positionController.setTrailingStop);

// Маршрут для отладки
router.get('/debug', (req, res) => {
  res.json({
    message: 'Position routes are working',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;