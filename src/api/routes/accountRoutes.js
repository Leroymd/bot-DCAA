// src/api/routes/accountRoutes.js - новый файл для маршрутов API аккаунта
const express = require('express');
const accountController = require('../controllers/accountController');

const router = express.Router();

// Маршруты для получения информации об аккаунте
router.get('/balance', accountController.getBalance);
router.get('/stats', accountController.getStats);

module.exports = router;