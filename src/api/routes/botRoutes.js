// src/api/routes/botRoutes.js
const express = require('express');
const botController = require('../controllers/botController');

const router = express.Router();

// Маршруты для управления ботом
router.get('/status', botController.getStatus);
router.post('/start', botController.startBot);
router.post('/stop', botController.stopBot);
router.get('/logs', botController.getLogs);

module.exports = router;