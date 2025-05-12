// src/api/routes/settingsRoutes.js
const express = require('express');
const settingsController = require('../controllers/settingsController');

const router = express.Router();

// Маршруты для управления настройками
router.get('/', settingsController.getSettings);
router.post('/', settingsController.updateSettings);

module.exports = router;