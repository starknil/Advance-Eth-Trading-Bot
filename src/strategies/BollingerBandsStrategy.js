import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger.js';

export class BollingerBandsStrategy extends EventEmitter {
  constructor() {
    super();
    this.logger = Logger.getInstance();
    
    this.config = {
      period: 20,
      standardDeviations: 2,
      minConfidence: 0.6,
      cooldownPeriod: 300000 // 5 minutes
    };
    
    this.lastSignalTime = 0;
    this.priceHistory = [];
  }

  async initialize() {
    this.logger.info('📊 Initializing Bollinger Bands strategy...');
  }

  async analyze(marketData, technicalAnalysis, historicalData) {
    try {
      this.updatePriceHistory(marketData.price);
      
      if (this.priceHistory.length < this.config.period) {
        return; // Not enough data
      }
      
      const bands = this.calculateBollingerBands();
      if (!bands) return;
      
      const signal = this.generateSignal(bands, marketData);
      
      if (signal && this.isValidSignal(signal)) {
        this.emit('signal', signal);
        this.lastSignalTime = Date.now();
      }
      
    } catch (error) {
      this.logger.error('Error in Bollinger Bands strategy analysis:', error);
    }
  }

  updatePriceHistory(price) {
    this.priceHistory.push(price);
    
    if (this.priceHistory.length > this.config.period + 10) {
      this.priceHistory.shift();
    }
  }

  calculateBollingerBands() {
    if (this.priceHistory.length < this.config.period) {
      return null;
    }
    
    const prices = this.priceHistory.slice(-this.config.period);
    
    // Calculate Simple Moving Average (middle band)
    const sma = prices.reduce((sum, price) => sum + price, 0) / this.config.period;
    
    // Calculate Standard Deviation
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / this.config.period;
    const standardDeviation = Math.sqrt(variance);
    
    // Calculate bands
    const upperBand = sma + (this.config.standardDeviations * standardDeviation);
    const lowerBand = sma - (this.config.standardDeviations * standardDeviation);
    
    return {
      upper: upperBand,
      middle: sma,
      lower: lowerBand,
      standardDeviation,
      bandwidth: (upperBand - lowerBand) / sma * 100 // Bandwidth as percentage
    };
  }

  generateSignal(bands, marketData) {
    const currentPrice = marketData.price;
    const { upper, lower, middle } = bands;
    
    // Calculate position within bands
    const bandPosition = (currentPrice - lower) / (upper - lower);
    
    // Oversold condition: price touches or goes below lower band
    if (currentPrice <= lower) {
      return {
        action: 'buy',
        symbol: marketData.symbol,
        price: marketData.price,
        confidence: this.calculateConfidence(bandPosition, 'oversold', bands),
        reason: `Price (${currentPrice.toFixed(2)}) at lower Bollinger Band (${lower.toFixed(2)})`,
        indicators: {
          upperBand: upper,
          middleBand: middle,
          lowerBand: lower,
          bandPosition,
          condition: 'oversold'
        }
      };
    }
    
    // Overbought condition: price touches or goes above upper band
    if (currentPrice >= upper) {
      return {
        action: 'sell',
        symbol: marketData.symbol,
        price: marketData.price,
        confidence: this.calculateConfidence(bandPosition, 'overbought', bands),
        reason: `Price (${currentPrice.toFixed(2)}) at upper Bollinger Band (${upper.toFixed(2)})`,
        indicators: {
          upperBand: upper,
          middleBand: middle,
          lowerBand: lower,
          bandPosition,
          condition: 'overbought'
        }
      };
    }
    
    // Mean reversion signals
    // If price was near bands and is moving back toward middle
    if (this.priceHistory.length >= 2) {
      const prevPrice = this.priceHistory[this.priceHistory.length - 2];
      const prevBandPosition = (prevPrice - lower) / (upper - lower);
      
      // Price was oversold and is moving up
      if (prevBandPosition <= 0.1 && bandPosition > 0.2) {
        return {
          action: 'buy',
          symbol: marketData.symbol,
          price: marketData.price,
          confidence: this.calculateConfidence(bandPosition, 'mean_reversion_up', bands),
          reason: `Mean reversion from oversold condition`,
          indicators: {
            upperBand: upper,
            middleBand: middle,
            lowerBand: lower,
            bandPosition,
            condition: 'mean_reversion_up'
          }
        };
      }
      
      // Price was overbought and is moving down
      if (prevBandPosition >= 0.9 && bandPosition < 0.8) {
        return {
          action: 'sell',
          symbol: marketData.symbol,
          price: marketData.price,
          confidence: this.calculateConfidence(bandPosition, 'mean_reversion_down', bands),
          reason: `Mean reversion from overbought condition`,
          indicators: {
            upperBand: upper,
            middleBand: middle,
            lowerBand: lower,
            bandPosition,
            condition: 'mean_reversion_down'
          }
        };
      }
    }
    
    return null;
  }

  calculateConfidence(bandPosition, condition, bands) {
    let confidence = 0.5; // Base confidence
    
    switch (condition) {
      case 'oversold':
        // More oversold = higher confidence
        confidence = Math.max(0.3, 1.0 - bandPosition);
        break;
        
      case 'overbought':
        // More overbought = higher confidence
        confidence = Math.max(0.3, bandPosition);
        break;
        
      case 'mean_reversion_up':
      case 'mean_reversion_down':
        // Confidence based on how far from extreme and bandwidth
        const distanceFromExtreme = Math.min(bandPosition, 1 - bandPosition);
        confidence = Math.max(0.3, 0.7 + (distanceFromExtreme * 0.3));
        break;
    }
    
    // Adjust confidence based on bandwidth (volatility)
    // Higher bandwidth (more volatility) = slightly lower confidence
    const bandwidthFactor = Math.max(0.8, 1 - (bands.bandwidth / 100));
    confidence *= bandwidthFactor;
    
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
    this.logger.info('📊 Bollinger Bands strategy config updated');
  }

  getStatus() {
    const bands = this.calculateBollingerBands();
    const currentPrice = this.priceHistory[this.priceHistory.length - 1];
    
    let bandPosition = null;
    let condition = 'insufficient_data';
    
    if (bands && currentPrice) {
      bandPosition = (currentPrice - bands.lower) / (bands.upper - bands.lower);
      
      if (bandPosition <= 0.1) {
        condition = 'oversold';
      } else if (bandPosition >= 0.9) {
        condition = 'overbought';
      } else if (bandPosition >= 0.4 && bandPosition <= 0.6) {
        condition = 'neutral';
      } else {
        condition = 'trending';
      }
    }
    
    return {
      name: 'Bollinger Bands',
      config: this.config,
      currentIndicators: {
        bands,
        bandPosition,
        condition,
        currentPrice
      },
      dataPoints: this.priceHistory.length,
      lastSignalTime: this.lastSignalTime
    };
  }
}