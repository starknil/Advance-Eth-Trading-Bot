import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger.js';

export class RSIStrategy extends EventEmitter {
  constructor() {
    super();
    this.logger = Logger.getInstance();
    
    this.config = {
      period: 14,
      overboughtLevel: 70,
      oversoldLevel: 30,
      minConfidence: 0.6,
      cooldownPeriod: 300000 // 5 minutes
    };
    
    this.lastSignalTime = 0;
    this.priceHistory = [];
    this.gains = [];
    this.losses = [];
  }

  async initialize() {
    this.logger.info('📊 Initializing RSI strategy...');
  }

  async analyze(marketData, technicalAnalysis, historicalData) {
    try {
      this.updatePriceHistory(marketData.price);
      
      if (this.priceHistory.length < this.config.period + 1) {
        return; // Not enough data
      }
      
      const rsi = this.calculateRSI();
      if (rsi === null) return;
      
      const signal = this.generateSignal(rsi, marketData);
      
      if (signal && this.isValidSignal(signal)) {
        this.emit('signal', signal);
        this.lastSignalTime = Date.now();
      }
      
    } catch (error) {
      this.logger.error('Error in RSI strategy analysis:', error);
    }
  }

  updatePriceHistory(price) {
    this.priceHistory.push(price);
    
    if (this.priceHistory.length > 1) {
      const change = price - this.priceHistory[this.priceHistory.length - 2];
      
      if (change > 0) {
        this.gains.push(change);
        this.losses.push(0);
      } else {
        this.gains.push(0);
        this.losses.push(Math.abs(change));
      }
      
      // Keep only the required period
      if (this.gains.length > this.config.period) {
        this.gains.shift();
        this.losses.shift();
      }
    }
    
    // Keep price history manageable
    if (this.priceHistory.length > this.config.period + 10) {
      this.priceHistory.shift();
    }
  }

  calculateRSI() {
    if (this.gains.length < this.config.period) {
      return null;
    }
    
    const avgGain = this.gains.reduce((sum, gain) => sum + gain, 0) / this.config.period;
    const avgLoss = this.losses.reduce((sum, loss) => sum + loss, 0) / this.config.period;
    
    if (avgLoss === 0) {
      return 100; // No losses, RSI = 100
    }
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return rsi;
  }

  generateSignal(rsi, marketData) {
    // Oversold condition - potential buy signal
    if (rsi <= this.config.oversoldLevel) {
      return {
        action: 'buy',
        symbol: marketData.symbol,
        price: marketData.price,
        confidence: this.calculateConfidence(rsi, 'oversold'),
        reason: `RSI oversold at ${rsi.toFixed(2)} (threshold: ${this.config.oversoldLevel})`,
        indicators: {
          rsi,
          level: 'oversold'
        }
      };
    }
    
    // Overbought condition - potential sell signal
    if (rsi >= this.config.overboughtLevel) {
      return {
        action: 'sell',
        symbol: marketData.symbol,
        price: marketData.price,
        confidence: this.calculateConfidence(rsi, 'overbought'),
        reason: `RSI overbought at ${rsi.toFixed(2)} (threshold: ${this.config.overboughtLevel})`,
        indicators: {
          rsi,
          level: 'overbought'
        }
      };
    }
    
    return null;
  }

  calculateConfidence(rsi, condition) {
    let confidence;
    
    if (condition === 'oversold') {
      // More oversold = higher confidence
      confidence = (this.config.oversoldLevel - rsi) / this.config.oversoldLevel;
    } else if (condition === 'overbought') {
      // More overbought = higher confidence
      confidence = (rsi - this.config.overboughtLevel) / (100 - this.config.overboughtLevel);
    }
    
    // Ensure confidence is between 0.3 and 1.0
    return Math.max(0.3, Math.min(1.0, confidence));
  }

  isValidSignal(signal) {
    const timeSinceLastSignal = Date.now() - this.lastSignalTime;
    if (timeSinceLastSignal < this.config.cooldownPeriod) {
      return false;
    }
    
    if (signal.confidence < this.config.minConfidence) {
      return false;
    }
    
    return true;
  }

  getConfig() {
    return { ...this.config };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('📊 RSI strategy config updated');
  }

  getStatus() {
    const rsi = this.calculateRSI();
    
    return {
      name: 'RSI',
      config: this.config,
      currentIndicators: {
        rsi,
        condition: rsi ? (rsi >= this.config.overboughtLevel ? 'overbought' : 
                         rsi <= this.config.oversoldLevel ? 'oversold' : 'neutral') : 'insufficient_data'
      },
      dataPoints: this.priceHistory.length,
      lastSignalTime: this.lastSignalTime
    };
  }
}