// src/utils/dataStore.js
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

function DataStore() {
  this.inMemoryStore = {};
  this.dataDir = path.join(__dirname, '../../data');
  
  // Создаем директории для хранения данных
  this.createDataDirectories();
  
  // Загружаем сохраненные данные при инициализации
  this.loadSavedData();
}

DataStore.prototype.createDataDirectories = function() {
  try {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    
    var dirs = ['performance', 'history', 'config'];
    
    for (var i = 0; i < dirs.length; i++) {
      var dirPath = path.join(this.dataDir, dirs[i]);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  } catch (error) {
    logger.error('Error creating data directories: ' + error.message);
  }
};

DataStore.prototype.loadSavedData = function() {
  try {
    // Загружаем историю сделок
    var historyPath = path.join(this.dataDir, 'history/trade_history.json');
    if (fs.existsSync(historyPath)) {
      var historyData = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      this.inMemoryStore.tradeHistory = historyData;
    } else {
      this.inMemoryStore.tradeHistory = [];
    }
    
    // Загружаем историю баланса
    var balancePath = path.join(this.dataDir, 'history/balance_history.json');
    if (fs.existsSync(balancePath)) {
      var balanceData = JSON.parse(fs.readFileSync(balancePath, 'utf8'));
      this.inMemoryStore.balanceHistory = balanceData;
    } else {
      this.inMemoryStore.balanceHistory = [];
    }
    
    // Загружаем последнюю конфигурацию
    var configPath = path.join(this.dataDir, 'config/bot_config.json');
    if (fs.existsSync(configPath)) {
      var configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      this.inMemoryStore.botConfig = configData;
    }
    
    logger.info('Data loaded from disk');
  } catch (error) {
    logger.error('Error loading saved data: ' + error.message);
  }
};

DataStore.prototype.get = function(key) {
  return this.inMemoryStore[key];
};

DataStore.prototype.set = function(key, value) {
  this.inMemoryStore[key] = value;
  
  // Сохраняем определенные данные на диск
  if (key === 'balanceHistory') {
    this.saveBalanceHistory(value);
  } else if (key === 'botConfig') {
    this.saveConfig(value);
  }
};

DataStore.prototype.saveTradeHistory = function(history) {
  try {
    this.inMemoryStore.tradeHistory = history;
    
    var historyPath = path.join(this.dataDir, 'history/trade_history.json');
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
    
    // Также сохраняем последние 10 сделок в отдельный файл для более быстрого доступа
    var recentTrades = history.slice(-10).reverse();
    var recentPath = path.join(this.dataDir, 'history/recent_trades.json');
    fs.writeFileSync(recentPath, JSON.stringify(recentTrades, null, 2));
  } catch (error) {
    logger.error('Error saving trade history: ' + error.message);
  }
};

DataStore.prototype.saveBalanceHistory = function(history) {
  try {
    var balancePath = path.join(this.dataDir, 'history/balance_history.json');
    fs.writeFileSync(balancePath, JSON.stringify(history, null, 2));
  } catch (error) {
    logger.error('Error saving balance history: ' + error.message);
  }
};

DataStore.prototype.savePerformance = function(performanceData) {
  try {
    // Формируем имя файла по дате
    var startDate = new Date(performanceData.startTime);
    var fileName = 'performance_' + startDate.toISOString().split('T')[0] + '.json';
    
    var performancePath = path.join(this.dataDir, 'performance', fileName);
    fs.writeFileSync(performancePath, JSON.stringify(performanceData, null, 2));
    
    // Обновляем список всех дней производительности
    this.updatePerformanceIndex();
    
    logger.info('Performance data saved to ' + fileName);
  } catch (error) {
    logger.error('Error saving performance data: ' + error.message);
  }
};

DataStore.prototype.saveConfig = function(config) {
  try {
    var configPath = path.join(this.dataDir, 'config/bot_config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    logger.info('Configuration saved to disk');
  } catch (error) {
    logger.error('Error saving configuration: ' + error.message);
  }
};

DataStore.prototype.getPerformanceData = function(date) {
  try {
    if (date) {
      // Конкретная дата
      var filePath = path.join(this.dataDir, 'performance/performance_' + date + '.json');
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
      return null;
    } else {
      // Получаем индекс из файла
      var indexPath = path.join(this.dataDir, 'performance/index.json');
      if (fs.existsSync(indexPath)) {
        return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      }
      return [];
    }
  } catch (error) {
    logger.error('Error retrieving performance data: ' + error.message);
    return null;
  }
};

DataStore.prototype.updatePerformanceIndex = function() {
  try {
    var performanceDir = path.join(this.dataDir, 'performance');
    var files = fs.readdirSync(performanceDir).filter(function(file) { 
      return file.endsWith('.json') && file !== 'index.json'; 
    });
    
    var performanceIndex = [];
    
    for (var i = 0; i < files.length; i++) {
      try {
        var file = files[i];
        var filePath = path.join(performanceDir, file);
        var data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        performanceIndex.push({
          date: file.replace('performance_', '').replace('.json', ''),
          startBalance: data.startBalance,
          endBalance: data.endBalance,
          profit: data.profit,
          trades: data.totalTrades,
          winRate: data.winRate
        });
      } catch (e) {
        logger.warn('Error processing performance file ' + file + ': ' + e.message);
      }
    }
    
    // Сортируем по дате (от новых к старым)
    performanceIndex.sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    });
    
    var indexPath = path.join(this.dataDir, 'performance/index.json');
    fs.writeFileSync(indexPath, JSON.stringify(performanceIndex, null, 2));
    
    // Сохраняем в памяти
    this.inMemoryStore.performanceIndex = performanceIndex;
  } catch (error) {
    logger.error('Error updating performance index: ' + error.message);
  }
};

DataStore.prototype.getPnlData = function(days) {
  try {
    days = days || 7;
    
    // Получаем историю баланса
    var balanceHistory = this.get('balanceHistory') || [];
    
    // Фильтруем и форматируем для графика
    var limitedHistory = balanceHistory.slice(-days);
    
    return limitedHistory.map(function(entry) {
      return {
        date: entry.date,
        pnl: entry.profitPercentage
      };
    });
  } catch (error) {
    logger.error('Error getting PnL data: ' + error.message);
    return [];
  }
};

// Экспортируем синглтон
var dataStore = new DataStore();
module.exports = dataStore;