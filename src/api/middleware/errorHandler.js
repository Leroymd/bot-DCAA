// src/api/middleware/errorHandler.js - новый файл для обработки ошибок API
const logger = require('../../utils/logger');

/**
 * Промежуточное ПО для обработки ошибок API
 * Централизованная обработка ошибок для всех маршрутов
 */
function errorHandler(err, req, res, next) {
  // Получаем информацию о запросе для логирования
  const requestInfo = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  };
  
  // Логируем ошибку с контекстом запроса
  logger.error(`API Error: ${err.message}`, {
    request: requestInfo,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack
    }
  });
  
  // Определяем тип ошибки и соответствующий статус
  let statusCode = 500;
  
  // Обработка определенных типов ошибок
  if (err.name === 'ValidationError') {
    statusCode = 400; // Bad Request
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401; // Unauthorized
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403; // Forbidden
  } else if (err.name === 'NotFoundError') {
    statusCode = 404; // Not Found
  } else if (err.response && err.response.status) {
    // Если ошибка связана с ответом от внешнего API (например, Bitget)
    statusCode = err.response.status;
  }
  
  // Формируем детали ошибки для ответа клиенту
  const errorResponse = {
    success: false,
    error: {
      code: err.code || 'SERVER_ERROR',
      message: err.message || 'Произошла внутренняя ошибка сервера'
    }
  };
  
  // В режиме разработки включаем дополнительные детали
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.error.details = err.stack;
    
    if (err.response && err.response.data) {
      errorResponse.error.apiResponse = err.response.data;
    }
  }
  
  // Отправляем ответ с соответствующим статусом и JSON
  res.status(statusCode).json(errorResponse);
}

module.exports = errorHandler;