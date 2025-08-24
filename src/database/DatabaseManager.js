//import sqlite3 from 'sqlite3';
import Database from 'better-sqlite3';
import { Logger } from '../utils/Logger.js';
import { ConfigManager } from '../config/ConfigManager.js';
import path from 'path';

export class DatabaseManager {
  constructor() {
    this.logger = Logger.getInstance();
    this.config = ConfigManager.getInstance();
    this.db = null;
    this.dbPath = path.join(process.cwd(), 'data', 'trading.db');
  }

  async initialize() {
    try {
      this.logger.info('🗄️ Initializing database...');
      
      // Create data directory if it doesn't exist
      const fs = await import('fs');
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      // Open database connection
      /*this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          this.logger.error('Error opening database:', err);
          throw err;
        }
      });*/

      try {
        this.db = new Database(this.dbPath);
        this.logger.info('🗄️ Database connection opened');
      } catch (err) {
        this.logger.error('Error opening database:', err);
        throw err;
      }
      
      // Create tables
      await this.createTables();
      
      this.logger.info('✅ Database initialized');
    } catch (error) {
      this.logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  async createTables() {
    const tables = [
      // Orders table
      `CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        price REAL NOT NULL,
        status TEXT NOT NULL,
        strategy TEXT,
        confidence REAL,
        stop_loss REAL,
        take_profit REAL,
        tx_hash TEXT,
        block_number INTEGER,
        gas_used TEXT,
        created_at INTEGER NOT NULL,
        filled_at INTEGER,
        cancelled_at INTEGER
      )`,
      
      // Trades table (filled orders)
      `CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        amount REAL NOT NULL,
        price REAL NOT NULL,
        pnl REAL,
        strategy TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders (id)
      )`,
      
      // Signals table
      `CREATE TABLE IF NOT EXISTS signals (
        id TEXT PRIMARY KEY,
        strategy TEXT NOT NULL,
        symbol TEXT NOT NULL,
        action TEXT NOT NULL,
        price REAL NOT NULL,
        confidence REAL NOT NULL,
        reason TEXT,
        indicators TEXT, -- JSON string
        executed BOOLEAN DEFAULT FALSE,
        timestamp INTEGER NOT NULL
      )`,
      
      // Price data table
      `CREATE TABLE IF NOT EXISTS price_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        price REAL NOT NULL,
        volume REAL,
        high REAL,
        low REAL,
        change_24h REAL,
        source TEXT,
        timestamp INTEGER NOT NULL
      )`,
      
      // Portfolio snapshots table
      `CREATE TABLE IF NOT EXISTS portfolio_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eth_balance REAL NOT NULL,
        usdc_balance REAL NOT NULL,
        total_value REAL NOT NULL,
        eth_price REAL NOT NULL,
        timestamp INTEGER NOT NULL
      )`,
      
      // Performance metrics table
      `CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total_trades INTEGER NOT NULL,
        successful_trades INTEGER NOT NULL,
        failed_trades INTEGER NOT NULL,
        total_pnl REAL NOT NULL,
        win_rate REAL NOT NULL,
        max_drawdown REAL NOT NULL,
        sharpe_ratio REAL NOT NULL,
        timestamp INTEGER NOT NULL
      )`,
      
      // Risk events table
      `CREATE TABLE IF NOT EXISTS risk_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT, -- JSON string
        timestamp INTEGER NOT NULL
      )`
    ];

    for (const tableSQL of tables) {
      await this.runQuery(tableSQL);
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON orders (created_at)',
      'CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders (symbol)',
      'CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades (timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_signals_timestamp ON signals (timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_price_data_symbol_timestamp ON price_data (symbol, timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_timestamp ON portfolio_snapshots (timestamp)'
    ];

    for (const indexSQL of indexes) {
      await this.runQuery(indexSQL);
    }
  }

  /*
  runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }
  */


  runQuery(sql, params = []) {
  try {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(params);
    return Promise.resolve({ id: result.lastInsertRowid, changes: result.changes });
  } catch (err) {
    return Promise.reject(err);
  }
}

getQuery(sql, params = []) {
  try {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(params);
    return Promise.resolve(row);
  } catch (err) {
    return Promise.reject(err);
  }
}

allQuery(sql, params = []) {
  try {
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(params);
    return Promise.resolve(rows);
  } catch (err) {
    return Promise.reject(err);
  }
}

  // Order operations
  async saveOrder(order) {
    const sql = `INSERT INTO orders (
      id, symbol, side, type, amount, price, status, strategy, confidence,
      stop_loss, take_profit, tx_hash, block_number, gas_used,
      created_at, filled_at, cancelled_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      order.id, order.symbol, order.side, order.type, order.amount, order.price,
      order.status, order.strategy, order.confidence, order.stopLoss, order.takeProfit,
      order.txHash, order.blockNumber, order.gasUsed, order.timestamp,
      order.filledAt, order.cancelledAt
    ];
    
    return await this.runQuery(sql, params);
  }

  async updateOrder(orderId, updates) {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(orderId);
    
    const sql = `UPDATE orders SET ${fields} WHERE id = ?`;
    return await this.runQuery(sql, values);
  }

  async getOrder(orderId) {
    const sql = 'SELECT * FROM orders WHERE id = ?';
    return await this.getQuery(sql, [orderId]);
  }

  async getOrders(limit = 100, offset = 0) {
    const sql = 'SELECT * FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?';
    return await this.allQuery(sql, [limit, offset]);
  }

  // Trade operations
  async saveTrade(trade) {
    const sql = `INSERT INTO trades (
      id, order_id, symbol, side, amount, price, pnl, strategy, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      trade.id, trade.orderId, trade.symbol, trade.side, trade.amount,
      trade.price, trade.pnl, trade.strategy, trade.timestamp
    ];
    
    return await this.runQuery(sql, params);
  }

  async getTrades(limit = 100, offset = 0) {
    const sql = 'SELECT * FROM trades ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    return await this.allQuery(sql, [limit, offset]);
  }

  // Signal operations
  async saveSignal(signal) {
    const sql = `INSERT INTO signals (
      id, strategy, symbol, action, price, confidence, reason, indicators, executed, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      signal.id, signal.strategy, signal.symbol, signal.action, signal.price,
      signal.confidence, signal.reason, JSON.stringify(signal.indicators),
      signal.executed || false, signal.timestamp
    ];
    
    return await this.runQuery(sql, params);
  }

  async getSignals(limit = 100, offset = 0) {
    const sql = 'SELECT * FROM signals ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    const rows = await this.allQuery(sql, [limit, offset]);
    
    // Parse indicators JSON
    return rows.map(row => ({
      ...row,
      indicators: row.indicators ? JSON.parse(row.indicators) : null
    }));
  }

  // Price data operations
  async savePriceData(priceData) {
    const sql = `INSERT INTO price_data (
      symbol, price, volume, high, low, change_24h, source, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      priceData.symbol, priceData.price, priceData.volume24h, priceData.high24h,
      priceData.low24h, priceData.change24h, priceData.source, priceData.timestamp
    ];
    
    return await this.runQuery(sql, params);
  }

  async getPriceHistory(symbol, hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const sql = 'SELECT * FROM price_data WHERE symbol = ? AND timestamp >= ? ORDER BY timestamp ASC';
    return await this.allQuery(sql, [symbol, cutoff]);
  }

  // Portfolio operations
  async savePortfolioSnapshot(snapshot) {
    const sql = `INSERT INTO portfolio_snapshots (
      eth_balance, usdc_balance, total_value, eth_price, timestamp
    ) VALUES (?, ?, ?, ?, ?)`;
    
    const params = [
      snapshot.ethBalance, snapshot.usdcBalance, snapshot.totalValue,
      snapshot.ethPrice, snapshot.timestamp
    ];
    
    return await this.runQuery(sql, params);
  }

  async getPortfolioHistory(hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const sql = 'SELECT * FROM portfolio_snapshots WHERE timestamp >= ? ORDER BY timestamp ASC';
    return await this.allQuery(sql, [cutoff]);
  }

  // Performance metrics operations
  async savePerformanceMetrics(metrics) {
    const sql = `INSERT INTO performance_metrics (
      total_trades, successful_trades, failed_trades, total_pnl,
      win_rate, max_drawdown, sharpe_ratio, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [
      metrics.totalTrades, metrics.successfulTrades, metrics.failedTrades,
      metrics.totalPnL, metrics.winRate, metrics.maxDrawdown,
      metrics.sharpeRatio, Date.now()
    ];
    
    return await this.runQuery(sql, params);
  }

  // Risk events operations
  async saveRiskEvent(event) {
    const sql = `INSERT INTO risk_events (
      type, severity, message, data, timestamp
    ) VALUES (?, ?, ?, ?, ?)`;
    
    const params = [
      event.type, event.severity, event.message,
      event.data ? JSON.stringify(event.data) : null, event.timestamp
    ];
    
    return await this.runQuery(sql, params);
  }

  async getRiskEvents(hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const sql = 'SELECT * FROM risk_events WHERE timestamp >= ? ORDER BY timestamp DESC';
    const rows = await this.allQuery(sql, [cutoff]);
    
    // Parse data JSON
    return rows.map(row => ({
      ...row,
      data: row.data ? JSON.parse(row.data) : null
    }));
  }

  // Analytics queries
  async getTradeStats(days = 30) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const sql = `
      SELECT 
        COUNT(*) as total_trades,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
        SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
        SUM(pnl) as total_pnl,
        AVG(pnl) as avg_pnl,
        MAX(pnl) as max_win,
        MIN(pnl) as max_loss
      FROM trades 
      WHERE timestamp >= ?
    `;
    
    return await this.getQuery(sql, [cutoff]);
  }

  async getStrategyPerformance(days = 30) {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const sql = `
      SELECT 
        strategy,
        COUNT(*) as total_trades,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
        SUM(pnl) as total_pnl,
        AVG(pnl) as avg_pnl
      FROM trades 
      WHERE timestamp >= ? AND strategy IS NOT NULL
      GROUP BY strategy
      ORDER BY total_pnl DESC
    `;
    
    return await this.allQuery(sql, [cutoff]);
  }

  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) {
            this.logger.error('Error closing database:', err);
          } else {
            this.logger.info('🗄️ Database connection closed');
          }
          resolve();
        });
      });
    }
  }
}