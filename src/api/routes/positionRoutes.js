const express = require('express');
const positionController = require('../controllers/positionController');

const router = express.Router();

// Маршруты для управления позициями
router.post('/open', positionController.openPosition);
router.post('/close', positionController.closePosition);

// Добавляем роуты для отладки
router.get('/active', positionController.getActivePositions);
router.get('/debug', (req, res) => {
  res.json({
    message: 'Position routes are working',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;