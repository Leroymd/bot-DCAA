// src/api/routes/positionRoutes.js
const express = require('express');
const positionController = require('../controllers/positionController');

const router = express.Router();

// Маршруты для управления позициями
router.post('/open', positionController.openPosition);
router.post('/close', positionController.closePosition);

module.exports = router;