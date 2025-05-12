// src/config/default.js
module.exports = {
  server: {
    port: process.env.PORT || 5000,
    host: process.env.HOST || 'localhost'
  },
  
  cors: {
    origin: process.env.NODE_ENV === 'production' ? process.env.CORS_ORIGIN || false : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  
  security: {
    apiKeyHeader: 'X-API-KEY',
    apiKey: process.env.API_KEY || 'dev-key'
  },
  
  logging: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    file: {
      enabled: true,
      path: '../../logs/bot.log',
      level: 'info'
    },
    console: {
      enabled: true,
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
    }
  },
  
  bot: {
    autoStart: process.env.AUTO_START === 'true' || false
  }
};