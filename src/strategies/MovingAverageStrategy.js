import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger.js';

export class MovingAverageStrategy extends EventEmitter {
  constructor() {
    super();
    this.logger = Logger.getInstance();
    
    this.config = {
      shortPeriod: 10,
      longPeriod: 20,
      minConfidence: 0.6,
      cooldownPeriod: 300000 // 5 minutes
    };
    
    this.lastSignalTime = 0;
    this.priceHistory = [];
    this.maxHistoryLength = 100;
  }

  async initialize() {
    this.logger.info('📊 Initializing Moving Average strategy...');
  }

  async analyze(marketData, technicalAnalysis, historicalData) {
    try {
      // Update price history
      this.updatePriceHistory(marketData.price);
      
      if (this.priceHistory.length < this.config.longPeriod) {
        return; // Not enough data
      }
      
      // Calculate moving averages
      const shortMA = this.calculateMA(this.config.shortPeriod);
      const longMA = this.calculateMA(this.config.longPeriod);
      
      if (!shortMA || !longMA) {
        return;
      }
      
      // Check for crossover signals
      const signal = this.detectCrossover(shortMA, longMA, marketData);
      
      if (signal && this.isValidSignal(signal)) {
        this.emit('signal', signal);
        this.lastSignalTime = Date.now();
      }
      
    } catch (error) {
      this.logger.error('Error in Moving Average strategy analysis:', error);
    }
  }

  updatePriceHistory(price) {
    this.priceHistory.push(price);
    
    if (this.priceHistory.length > this.maxHistoryLength) {
      this.priceHistory.shift();
    }
  }

  calculateMA(period) {
    if (this.priceHistory.length < period) {
      return null;
    }
    
    const slice = this.priceHistory.slice(-period);
    const sum = slice.reduce((acc, price) => acc + price, 0);
    return sum / period;
  }

  detectCrossover(shortMA, longMA, marketData) {
    // Get previous MAs for crossover detection
    if (this.priceHistory.length < this.config.longPeriod + 1) {
      return null;
    }
    
    const prevShortMA = this.calculatePreviousMA(this.config.shortPeriod);
    const prevLongMA = this.calculatePreviousMA(this.config.longPeriod);
    
    if (!prevShortMA || !prevLongMA) {
      return null;
    }
    
    // Bullish crossover: short MA crosses above long MA
    if (prevShortMA <= prevLongMA && shortMA > longMA) {
      return {
        action: 'buy',
        symbol: marketData.symbol,
        price: marketData.price,
        confidence: this.calculateConfidence(shortMA, longMA, 'bullish'),
        reason: `Short MA (${shortMA.toFixed(2)}) crossed above Long MA (${longMA.toFixed(2)})`,
        indicators: {
          shortMA,
          longMA,
          prevShortMA,
          prevLongMA
        }
      };
    }
    
    // Bearish crossover: short MA crosses below long MA
    if (prevShortMA >= prevLongMA && shortMA < longMA) {
      return {
        action: 'sell',
        symbol: marketData.symbol,
        price: marketData.price,
        confidence: this.calculateConfidence(shortMA, longMA, 'bearish'),
        reason: `Short MA (${shortMA.toFixed(2)}) crossed below Long MA (${longMA.toFixed(2)})`,
        indicators: {
          shortMA,
          longMA,
          prevShortMA,
          prevLongMA
        }
      };
    }
    
    return null;
  }

  calculatePreviousMA(period) {
    if (this.priceHistory.length < period + 1) {
      return null;
    }
    
    const slice = this.priceHistory.slice(-(period + 1), -1);
    const sum = slice.reduce((acc, price) => acc + price, 0);
    return sum / period;
  }

  calculateConfidence(shortMA, longMA, direction) {
    // Calculate confidence based on the gap between MAs
    const gap = Math.abs(shortMA - longMA);
    const avgPrice = (shortMA + longMA) / 2;
    const gapPercentage = (gap / avgPrice) * 100;
    
    // Higher gap = higher confidence, but cap at 1.0
    let confidence = Math.min(gapPercentage / 2, 1.0);
    
    // Minimum confidence threshold
    confidence = Math.max(confidence, 0.3);
    
    return confidence;
  }

  isValidSignal(signal) {
    // Check cooldown period
    const timeSinceLastSignal = Date.now() - this.lastSignalTime;
    if (timeSinceLastSignal < this.config.cooldownPeriod) {
      return false;
    }
    
    // Check minimum confidence
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
    this.logger.info('📊 Moving Average strategy config updated');
  }

  getStatus() {
    const shortMA = this.calculateMA(this.config.shortPeriod);
    const longMA = this.calculateMA(this.config.longPeriod);
    
    return {
      name: 'Moving Average',
      config: this.config,
      currentIndicators: {
        shortMA,
        longMA,
        trend: shortMA && longMA ? (shortMA > longMA ? 'bullish' : 'bearish') : 'neutral'
      },
      dataPoints: this.priceHistory.length,
      lastSignalTime: this.lastSignalTime
    };
  }
}