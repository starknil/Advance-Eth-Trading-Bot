import { Logger } from '../utils/Logger.js';

export class TechnicalAnalysis {
  constructor() {
    this.logger = Logger.getInstance();
  }

  async initialize() {
    this.logger.info('📈 Initializing technical analysis...');
  }

  async analyze(historicalData) {
    if (!historicalData || historicalData.length < 20) {
      return null;
    }

    const analysis = {
      sma: this.calculateSMA(historicalData, 20),
      ema: this.calculateEMA(historicalData, 20),
      rsi: this.calculateRSI(historicalData, 14),
      macd: this.calculateMACD(historicalData),
      bollingerBands: this.calculateBollingerBands(historicalData, 20, 2),
      support: this.findSupport(historicalData),
      resistance: this.findResistance(historicalData),
      trend: this.determineTrend(historicalData),
      volatility: this.calculateVolatility(historicalData)
    };

    return analysis;
  }

  calculateSMA(data, period) {
    if (data.length < period) return null;
    
    const prices = data.slice(-period).map(d => d.close);
    const sum = prices.reduce((acc, price) => acc + price, 0);
    return sum / period;
  }

  calculateEMA(data, period) {
    if (data.length < period) return null;
    
    const multiplier = 2 / (period + 1);
    const prices = data.map(d => d.close);
    
    // Start with SMA
    let ema = prices.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
    
    // Calculate EMA for remaining values
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }

  calculateRSI(data, period = 14) {
    if (data.length < period + 1) return null;
    
    const prices = data.map(d => d.close);
    const gains = [];
    const losses = [];
    
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    if (gains.length < period) return null;
    
    const avgGain = gains.slice(-period).reduce((sum, gain) => sum + gain, 0) / period;
    const avgLoss = losses.slice(-period).reduce((sum, loss) => sum + loss, 0) / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (data.length < slowPeriod) return null;
    
    const fastEMA = this.calculateEMA(data, fastPeriod);
    const slowEMA = this.calculateEMA(data, slowPeriod);
    
    if (!fastEMA || !slowEMA) return null;
    
    const macdLine = fastEMA - slowEMA;
    
    // For signal line, we'd need to calculate EMA of MACD line
    // Simplified version here
    return {
      macd: macdLine,
      signal: macdLine * 0.9, // Simplified
      histogram: macdLine * 0.1
    };
  }

  calculateBollingerBands(data, period = 20, stdDev = 2) {
    if (data.length < period) return null;
    
    const prices = data.slice(-period).map(d => d.close);
    const sma = prices.reduce((sum, price) => sum + price, 0) / period;
    
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const standardDeviation = Math.sqrt(variance);
    
    return {
      upper: sma + (stdDev * standardDeviation),
      middle: sma,
      lower: sma - (stdDev * standardDeviation),
      bandwidth: (2 * stdDev * standardDeviation) / sma * 100
    };
  }

  findSupport(data, lookback = 20) {
    if (data.length < lookback) return null;
    
    const recentData = data.slice(-lookback);
    const lows = recentData.map(d => d.low);
    
    // Find local minima
    const supports = [];
    for (let i = 1; i < lows.length - 1; i++) {
      if (lows[i] < lows[i - 1] && lows[i] < lows[i + 1]) {
        supports.push(lows[i]);
      }
    }
    
    // Return the highest support level (closest to current price)
    return supports.length > 0 ? Math.max(...supports) : Math.min(...lows);
  }

  findResistance(data, lookback = 20) {
    if (data.length < lookback) return null;
    
    const recentData = data.slice(-lookback);
    const highs = recentData.map(d => d.high);
    
    // Find local maxima
    const resistances = [];
    for (let i = 1; i < highs.length - 1; i++) {
      if (highs[i] > highs[i - 1] && highs[i] > highs[i + 1]) {
        resistances.push(highs[i]);
      }
    }
    
    // Return the lowest resistance level (closest to current price)
    return resistances.length > 0 ? Math.min(...resistances) : Math.max(...highs);
  }

  determineTrend(data, period = 20) {
    if (data.length < period) return 'unknown';
    
    const recentData = data.slice(-period);
    const firstPrice = recentData[0].close;
    const lastPrice = recentData[recentData.length - 1].close;
    
    const priceChange = (lastPrice - firstPrice) / firstPrice;
    
    if (priceChange > 0.02) return 'bullish';
    if (priceChange < -0.02) return 'bearish';
    return 'sideways';
  }

  calculateVolatility(data, period = 20) {
    if (data.length < period) return null;
    
    const recentData = data.slice(-period);
    const returns = [];
    
    for (let i = 1; i < recentData.length; i++) {
      const dailyReturn = (recentData[i].close - recentData[i - 1].close) / recentData[i - 1].close;
      returns.push(dailyReturn);
    }
    
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * Math.sqrt(365); // Annualized volatility
  }

  // Pattern recognition methods
  detectDoubleTop(data, tolerance = 0.02) {
    if (data.length < 10) return false;
    
    const highs = data.map(d => d.high);
    const recentHighs = highs.slice(-10);
    
    // Look for two similar peaks
    for (let i = 0; i < recentHighs.length - 5; i++) {
      for (let j = i + 5; j < recentHighs.length; j++) {
        const diff = Math.abs(recentHighs[i] - recentHighs[j]) / recentHighs[i];
        if (diff < tolerance) {
          return true;
        }
      }
    }
    
    return false;
  }

  detectDoubleBottom(data, tolerance = 0.02) {
    if (data.length < 10) return false;
    
    const lows = data.map(d => d.low);
    const recentLows = lows.slice(-10);
    
    // Look for two similar troughs
    for (let i = 0; i < recentLows.length - 5; i++) {
      for (let j = i + 5; j < recentLows.length; j++) {
        const diff = Math.abs(recentLows[i] - recentLows[j]) / recentLows[i];
        if (diff < tolerance) {
          return true;
        }
      }
    }
    
    return false;
  }

  detectHeadAndShoulders(data) {
    if (data.length < 15) return false;
    
    const highs = data.slice(-15).map(d => d.high);
    
    // Simplified head and shoulders detection
    // Look for three peaks where middle is highest
    for (let i = 2; i < highs.length - 2; i++) {
      const leftShoulder = highs[i - 2];
      const head = highs[i];
      const rightShoulder = highs[i + 2];
      
      if (head > leftShoulder && head > rightShoulder && 
          Math.abs(leftShoulder - rightShoulder) / leftShoulder < 0.05) {
        return true;
      }
    }
    
    return false;
  }

  // Momentum indicators
  calculateStochastic(data, kPeriod = 14, dPeriod = 3) {
    if (data.length < kPeriod) return null;
    
    const recentData = data.slice(-kPeriod);
    const currentClose = data[data.length - 1].close;
    
    const lowestLow = Math.min(...recentData.map(d => d.low));
    const highestHigh = Math.max(...recentData.map(d => d.high));
    
    const kPercent = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    
    return {
      k: kPercent,
      d: kPercent // Simplified - should be SMA of %K
    };
  }

  calculateWilliamsR(data, period = 14) {
    if (data.length < period) return null;
    
    const recentData = data.slice(-period);
    const currentClose = data[data.length - 1].close;
    
    const highestHigh = Math.max(...recentData.map(d => d.high));
    const lowestLow = Math.min(...recentData.map(d => d.low));
    
    return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
  }

  // Volume analysis
  calculateVolumeProfile(data) {
    if (data.length < 20) return null;
    
    const volumes = data.map(d => d.volume || 0);
    const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;
    const currentVolume = volumes[volumes.length - 1];
    
    return {
      averageVolume: avgVolume,
      currentVolume,
      volumeRatio: currentVolume / avgVolume,
      trend: currentVolume > avgVolume * 1.5 ? 'high' : 
             currentVolume < avgVolume * 0.5 ? 'low' : 'normal'
    };
  }
}