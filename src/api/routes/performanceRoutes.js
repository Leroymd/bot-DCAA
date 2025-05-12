// src/api/routes/performanceRoutes.js
const express = require('express');
const performanceController = require('../controllers/performanceController');

const router = express.Router();

// Маршруты для получения статистики
router.get('/data', performanceController.getPerformance);
router.get('/pnl', performanceController.getPnlData);
router.get('/balance', performanceController.getBalanceHistory);
router.get('/trades', performanceController.getTradeHistory);

module.exports = router;