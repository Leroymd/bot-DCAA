// src/api/routes/positionRoutes.js
const express = require('express');
const positionController = require('../controllers/positionController');

const router = express.Router();

// Маршруты для управления позициями
router.post('/open', positionController.openPosition);
router.post('/close/:positionId', positionController.closePosition); // Маршрут с параметром
router.post('/close', positionController.closePosition); // Маршрут с телом запроса
router.get('/active', positionController.getActivePositions);

// Добавляем роуты для отладки
router.get('/debug', (req, res) => {
  res.json({
    message: 'Position routes are working',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;