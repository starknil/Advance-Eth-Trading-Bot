import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger.js';
import { ConfigManager } from '../config/ConfigManager.js';

export class RiskManager extends EventEmitter {
  constructor() {
    super();
    this.logger = Logger.getInstance();
    this.config = ConfigManager.getInstance();
    
    this.dailyTrades = 0;
    this.dailyPnL = 0;
    this.currentPositions = new Map();
    this.riskLimits = {
      maxDailyTrades: this.config.get('MAX_DAILY_TRADES'),
      maxPositionSize: this.config.get('MAX_POSITION_SIZE'),
      stopLossPercentage: this.config.get('STOP_LOSS_PERCENTAGE'),
      takeProfitPercentage: this.config.get('TAKE_PROFIT_PERCENTAGE'),
      maxDailyLoss: 0.1, // 10% of portfolio
      maxDrawdown: 0.2 // 20% drawdown limit
    };
    
    this.portfolioValue = 0;
    this.peakValue = 0;
    this.lastResetDate = new Date().toDateString();
  }

  async initialize() {
    this.logger.info('🛡️ Initializing risk manager...');
    
    // Reset daily counters if new day
    this.checkDailyReset();
    
    this.logger.info('✅ Risk manager initialized');
  }

  checkDailyReset() {
    const today = new Date().toDateString();
    if (this.lastResetDate !== today) {
      this.dailyTrades = 0;
      this.dailyPnL = 0;
      this.lastResetDate = today;
      this.logger.info('📅 Daily risk counters reset');
    }
  }

  async evaluateSignal(signal) {
    try {
      this.checkDailyReset();
      
      // Check daily trade limit
      if (this.dailyTrades >= this.riskLimits.maxDailyTrades) {
        return {
          approved: false,
          reason: `Daily trade limit reached (${this.riskLimits.maxDailyTrades})`
        };
      }
      
      // Check position size
      const positionSize = this.calculatePositionSize(signal);
      if (positionSize > this.riskLimits.maxPositionSize) {
        return {
          approved: false,
          reason: `Position size too large (${positionSize} > ${this.riskLimits.maxPositionSize})`
        };
      }
      
      // Check daily loss limit
      if (this.dailyPnL < -this.riskLimits.maxDailyLoss * this.portfolioValue) {
        return {
          approved: false,
          reason: 'Daily loss limit exceeded'
        };
      }
      
      // Check drawdown limit
      const currentDrawdown = this.calculateDrawdown();
      if (currentDrawdown > this.riskLimits.maxDrawdown) {
        return {
          approved: false,
          reason: `Maximum drawdown exceeded (${(currentDrawdown * 100).toFixed(2)}%)`
        };
      }
      
      // Check signal confidence
      if (signal.confidence < 0.5) {
        return {
          approved: false,
          reason: 'Signal confidence too low'
        };
      }
      
      // All checks passed
      return {
        approved: true,
        positionSize,
        stopLoss: this.calculateStopLoss(signal),
        takeProfit: this.calculateTakeProfit(signal)
      };
      
    } catch (error) {
      this.logger.error('Error evaluating signal:', error);
      return {
        approved: false,
        reason: 'Risk evaluation error'
      };
    }
  }

  calculatePositionSize(signal) {
    // Kelly Criterion or fixed percentage approach
    const riskPerTrade = 0.02; // 2% risk per trade
    const accountBalance = this.portfolioValue || 1; // Default to 1 ETH if unknown
    
    // Calculate position size based on stop loss distance
    const stopLossDistance = this.riskLimits.stopLossPercentage / 100;
    const positionSize = (accountBalance * riskPerTrade) / stopLossDistance;
    
    // Cap at maximum position size
    return Math.min(positionSize, this.riskLimits.maxPositionSize);
  }

  calculateStopLoss(signal) {
    const stopLossPercentage = this.riskLimits.stopLossPercentage / 100;
    
    if (signal.action === 'buy') {
      return signal.price * (1 - stopLossPercentage);
    } else {
      return signal.price * (1 + stopLossPercentage);
    }
  }

  calculateTakeProfit(signal) {
    const takeProfitPercentage = this.riskLimits.takeProfitPercentage / 100;
    
    if (signal.action === 'buy') {
      return signal.price * (1 + takeProfitPercentage);
    } else {
      return signal.price * (1 - takeProfitPercentage);
    }
  }

  calculateDrawdown() {
    if (this.peakValue === 0) return 0;
    return (this.peakValue - this.portfolioValue) / this.peakValue;
  }

  async checkLimits(marketData) {
    try {
      // Update portfolio value
      this.updatePortfolioValue(marketData);
      
      // Check existing positions for stop loss/take profit
      await this.checkPositionLimits(marketData);
      
      // Check overall risk metrics
      this.checkRiskMetrics();
      
    } catch (error) {
      this.logger.error('Error checking risk limits:', error);
    }
  }

  updatePortfolioValue(marketData) {
    // This would be updated by the portfolio manager
    // For now, we'll use a placeholder
    if (marketData.portfolioValue) {
      this.portfolioValue = marketData.portfolioValue;
      
      // Update peak value for drawdown calculation
      if (this.portfolioValue > this.peakValue) {
        this.peakValue = this.portfolioValue;
      }
    }
  }

  async checkPositionLimits(marketData) {
    for (const [symbol, position] of this.currentPositions) {
      if (symbol === marketData.symbol) {
        const currentPrice = marketData.price;
        
        // Check stop loss
        if (position.stopLoss) {
          const shouldTriggerStopLoss = 
            (position.side === 'long' && currentPrice <= position.stopLoss) ||
            (position.side === 'short' && currentPrice >= position.stopLoss);
            
          if (shouldTriggerStopLoss) {
            this.emit('riskAlert', {
              type: 'stop_loss',
              severity: 'high',
              message: `Stop loss triggered for ${symbol} at ${currentPrice}`,
              position,
              currentPrice
            });
          }
        }
        
        // Check take profit
        if (position.takeProfit) {
          const shouldTriggerTakeProfit = 
            (position.side === 'long' && currentPrice >= position.takeProfit) ||
            (position.side === 'short' && currentPrice <= position.takeProfit);
            
          if (shouldTriggerTakeProfit) {
            this.emit('riskAlert', {
              type: 'take_profit',
              severity: 'medium',
              message: `Take profit triggered for ${symbol} at ${currentPrice}`,
              position,
              currentPrice
            });
          }
        }
      }
    }
  }

  checkRiskMetrics() {
    // Check drawdown
    const drawdown = this.calculateDrawdown();
    if (drawdown > this.riskLimits.maxDrawdown * 0.8) { // 80% of max drawdown
      this.emit('riskAlert', {
        type: 'drawdown_warning',
        severity: 'high',
        message: `High drawdown detected: ${(drawdown * 100).toFixed(2)}%`,
        drawdown
      });
    }
    
    // Check daily PnL
    const dailyLossLimit = this.riskLimits.maxDailyLoss * this.portfolioValue;
    if (this.dailyPnL < -dailyLossLimit * 0.8) { // 80% of daily loss limit
      this.emit('riskAlert', {
        type: 'daily_loss_warning',
        severity: 'high',
        message: `Approaching daily loss limit: ${this.dailyPnL.toFixed(4)} ETH`,
        dailyPnL: this.dailyPnL
      });
    }
  }

  // Position management
  addPosition(order) {
    const position = {
      symbol: order.symbol,
      side: order.side === 'buy' ? 'long' : 'short',
      size: order.amount,
      entryPrice: order.price,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      timestamp: Date.now()
    };
    
    this.currentPositions.set(order.symbol, position);
    this.dailyTrades++;
    
    this.logger.info(`📊 Position added: ${order.symbol} ${position.side} ${position.size}`);
  }

  removePosition(symbol) {
    if (this.currentPositions.has(symbol)) {
      this.currentPositions.delete(symbol);
      this.logger.info(`📊 Position removed: ${symbol}`);
    }
  }

  updateDailyPnL(pnl) {
    this.dailyPnL += pnl;
  }

  // Getters
  getRiskMetrics() {
    return {
      dailyTrades: this.dailyTrades,
      dailyPnL: this.dailyPnL,
      portfolioValue: this.portfolioValue,
      peakValue: this.peakValue,
      currentDrawdown: this.calculateDrawdown(),
      activePositions: this.currentPositions.size,
      riskLimits: this.riskLimits
    };
  }

  getPositions() {
    return Array.from(this.currentPositions.values());
  }

  updateRiskLimits(newLimits) {
    this.riskLimits = { ...this.riskLimits, ...newLimits };
    this.logger.info('🛡️ Risk limits updated');
  }
}