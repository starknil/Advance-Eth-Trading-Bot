import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger.js';

export class MACDStrategy extends EventEmitter {
  constructor() {
    super();
    this.logger = Logger.getInstance();
    
    this.config = {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      minConfidence: 0.6,
      cooldownPeriod: 300000 // 5 minutes
    };
    
    this.lastSignalTime = 0;
    this.priceHistory = [];
    this.emaFast = null;
    this.emaSlow = null;
    this.macdLine = [];
    this.signalLine = [];
  }

  async initialize() {
    this.logger.info('📊 Initializing MACD strategy...');
  }

  async analyze(marketData, technicalAnalysis, historicalData) {
    try {
      this.updatePriceHistory(marketData.price);
      
      if (this.priceHistory.length < this.config.slowPeriod) {
        return; // Not enough data
      }
      
      // Calculate MACD
      const macd = this.calculateMACD();
      if (!macd) return;
      
      const signal = this.generateSignal(macd, marketData);
      
      if (signal && this.isValidSignal(signal)) {
        this.emit('signal', signal);
        this.lastSignalTime = Date.now();
      }
      
    } catch (error) {
      this.logger.error('Error in MACD strategy analysis:', error);
    }
  }

  updatePriceHistory(price) {
    this.priceHistory.push(price);
    
    // Keep reasonable history size
    if (this.priceHistory.length > this.config.slowPeriod + 50) {
      this.priceHistory.shift();
    }
  }

  calculateMACD() {
    if (this.priceHistory.length < this.config.slowPeriod) {
      return null;
    }
    
    // Calculate EMAs
    const fastEMA = this.calculateEMA(this.config.fastPeriod);
    const slowEMA = this.calculateEMA(this.config.slowPeriod);
    
    if (!fastEMA || !slowEMA) return null;
    
    // MACD Line = Fast EMA - Slow EMA
    const macdValue = fastEMA - slowEMA;
    this.macdLine.push(macdValue);
    
    // Keep MACD line history manageable
    if (this.macdLine.length > this.config.signalPeriod + 20) {
      this.macdLine.shift();
    }
    
    // Calculate Signal Line (EMA of MACD)
    const signalValue = this.calculateSignalEMA();
    if (signalValue !== null) {
      this.signalLine.push(signalValue);
      
      // Keep signal line history manageable
      if (this.signalLine.length > 20) {
        this.signalLine.shift();
      }
    }
    
    return {
      macd: macdValue,
      signal: signalValue,
      histogram: signalValue !== null ? macdValue - signalValue : null,
      fastEMA,
      slowEMA
    };
  }

  calculateEMA(period) {
    if (this.priceHistory.length < period) {
      return null;
    }
    
    const multiplier = 2 / (period + 1);
    const prices = this.priceHistory.slice(-period);
    
    // Start with SMA for first EMA value
    let ema = prices.reduce((sum, price) => sum + price, 0) / period;
    
    // Calculate EMA for remaining values
    for (let i = period; i < this.priceHistory.length; i++) {
      const price = this.priceHistory[i];
      ema = (price * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }

  calculateSignalEMA() {
    if (this.macdLine.length < this.config.signalPeriod) {
      return null;
    }
    
    const multiplier = 2 / (this.config.signalPeriod + 1);
    const macdValues = this.macdLine.slice(-this.config.signalPeriod);
    
    // Start with SMA
    let signalEMA = macdValues.reduce((sum, value) => sum + value, 0) / this.config.signalPeriod;
    
    // Calculate EMA for remaining values
    for (let i = this.config.signalPeriod; i < this.macdLine.length; i++) {
      const macdValue = this.macdLine[i];
      signalEMA = (macdValue * multiplier) + (signalEMA * (1 - multiplier));
    }
    
    return signalEMA;
  }

  generateSignal(macd, marketData) {
    if (!macd.signal || this.macdLine.length < 2 || this.signalLine.length < 2) {
      return null;
    }
    
    const currentMACD = macd.macd;
    const currentSignal = macd.signal;
    const prevMACD = this.macdLine[this.macdLine.length - 2];
    const prevSignal = this.signalLine[this.signalLine.length - 2];
    
    // Bullish crossover: MACD crosses above Signal line
    if (prevMACD <= prevSignal && currentMACD > currentSignal) {
      return {
        action: 'buy',
        symbol: marketData.symbol,
        price: marketData.price,
        confidence: this.calculateConfidence(macd, 'bullish'),
        reason: `MACD bullish crossover: MACD (${currentMACD.toFixed(4)}) > Signal (${currentSignal.toFixed(4)})`,
        indicators: {
          macd: currentMACD,
          signal: currentSignal,
          histogram: macd.histogram,
          crossover: 'bullish'
        }
      };
    }
    
    // Bearish crossover: MACD crosses below Signal line
    if (prevMACD >= prevSignal && currentMACD < currentSignal) {
      return {
        action: 'sell',
        symbol: marketData.symbol,
        price: marketData.price,
        confidence: this.calculateConfidence(macd, 'bearish'),
        reason: `MACD bearish crossover: MACD (${currentMACD.toFixed(4)}) < Signal (${currentSignal.toFixed(4)})`,
        indicators: {
          macd: currentMACD,
          signal: currentSignal,
          histogram: macd.histogram,
          crossover: 'bearish'
        }
      };
    }
    
    return null;
  }

  calculateConfidence(macd, direction) {
    // Base confidence on histogram strength and zero line position
    const histogram = Math.abs(macd.histogram || 0);
    const macdValue = macd.macd;
    
    let confidence = 0.5; // Base confidence
    
    // Increase confidence based on histogram strength
    confidence += Math.min(histogram * 100, 0.3); // Cap at 0.3
    
    // Increase confidence if MACD is on the correct side of zero line
    if ((direction === 'bullish' && macdValue > 0) || (direction === 'bearish' && macdValue < 0)) {
      confidence += 0.2;
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
    this.logger.info('📊 MACD strategy config updated');
  }

  getStatus() {
    const currentMACD = this.macdLine[this.macdLine.length - 1];
    const currentSignal = this.signalLine[this.signalLine.length - 1];
    
    return {
      name: 'MACD',
      config: this.config,
      currentIndicators: {
        macd: currentMACD,
        signal: currentSignal,
        histogram: currentMACD && currentSignal ? currentMACD - currentSignal : null,
        trend: currentMACD && currentSignal ? (currentMACD > currentSignal ? 'bullish' : 'bearish') : 'neutral'
      },
      dataPoints: this.priceHistory.length,
      lastSignalTime: this.lastSignalTime
    };
  }
}