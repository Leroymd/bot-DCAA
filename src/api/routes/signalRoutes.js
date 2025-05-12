// src/api/routes/signalRoutes.js
const express = require('express');
const signalsController = require('../controllers/signalsController');

const router = express.Router();

// Маршруты для получения сигналов
router.get('/recent', signalsController.getRecentSignals);
router.get('/indicators', signalsController.getIndicatorsStatus);

module.exports = router;