import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Logger {
  static instance = null;
  
  constructor() {
    if (Logger.instance) {
      return Logger.instance;
    }
    
    this.logger = this.createLogger();
    Logger.instance = this;
  }
  
  static getInstance() {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }
  
  createLogger() {
    const logLevel = process.env.LOG_LEVEL || 'info';
    const logDir = path.join(process.cwd(), 'logs');
    
    // Custom format
    const customFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ level, message, timestamp, stack }) => {
        const emoji = this.getLevelEmoji(level);
        const logMessage = `${timestamp} ${emoji} [${level.toUpperCase()}]: ${message}`;
        return stack ? `${logMessage}\n${stack}` : logMessage;
      })
    );
    
    const transports = [
      // Console transport
      new winston.transports.Console({
        level: logLevel,
        format: winston.format.combine(
          winston.format.colorize(),
          customFormat
        )
      })
    ];
    
    // File transport for production
    if (process.env.NODE_ENV === 'production') {
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          format: customFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        new winston.transports.File({
          filename: path.join(logDir, 'combined.log'),
          format: customFormat,
          maxsize: 5242880, // 5MB
          maxFiles: 5
        })
      );
    }
    
    return winston.createLogger({
      level: logLevel,
      format: customFormat,
      transports,
      exitOnError: false
    });
  }
  
  getLevelEmoji(level) {
    const emojis = {
      error: '❌',
      warn: '⚠️',
      info: 'ℹ️',
      debug: '🐛'
    };
    return emojis[level] || 'ℹ️';
  }
  
  error(message, meta = {}) {
    this.logger.error(message, meta);
  }
  
  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }
  
  info(message, meta = {}) {
    this.logger.info(message, meta);
  }
  
  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }
  
  // Trading specific log methods
  logTrade(trade) {
    this.info(`💰 TRADE: ${trade.side} ${trade.amount} ${trade.symbol} at ${trade.price}`, {
      trade,
      category: 'TRADE'
    });
  }
  
  logOrder(order) {
    this.info(`📋 ORDER: ${order.type} ${order.side} ${order.amount} ${order.symbol}`, {
      order,
      category: 'ORDER'
    });
  }
  
  logSignal(signal) {
    this.info(`📊 SIGNAL: ${signal.type} ${signal.symbol} - ${signal.action}`, {
      signal,
      category: 'SIGNAL'
    });
  }
  
  logRisk(risk) {
    this.warn(`⚠️ RISK: ${risk.type} - ${risk.message}`, {
      risk,
      category: 'RISK'
    });
  }
  
  logPerformance(metrics) {
    this.info(`📈 PERFORMANCE: PnL: ${metrics.pnl}, Win Rate: ${metrics.winRate}%`, {
      metrics,
      category: 'PERFORMANCE'
    });
  }
}