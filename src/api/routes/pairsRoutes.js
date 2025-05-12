// src/api/routes/pairsRoutes.js
const express = require('express');
const pairsController = require('../controllers/pairsController');

const router = express.Router();

// Маршруты для работы с торговыми парами
router.get('/active', pairsController.getActivePairs);
router.get('/top', pairsController.getTopPairs);
router.post('/scan', pairsController.scanPairs);
router.post('/select', pairsController.selectPair);

module.exports = router;