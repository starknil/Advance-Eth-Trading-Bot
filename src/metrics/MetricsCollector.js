import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger.js';

export class MetricsCollector extends EventEmitter {
  constructor() {
    super();
    this.logger = Logger.getInstance();
    
    this.startTime = Date.now();
    this.metrics = {
      // Trading metrics
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalVolume: 0,
      totalPnL: 0,
      
      // Performance metrics
      winRate: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      
      // System metrics
      uptime: 0,
      signalsGenerated: 0,
      signalsExecuted: 0,
      errorsCount: 0,
      
      // Market data metrics
      priceUpdates: 0,
      lastPriceUpdate: null,
      averageSpread: 0,
      
      // Strategy metrics
      strategyPerformance: new Map()
    };
    
    this.tradeHistory = [];
    this.priceHistory = [];
    this.errorHistory = [];
    this.performanceSnapshots = [];
    
    this.metricsInterval = null;
  }

  async initialize() {
    this.logger.info('📊 Initializing metrics collector...');
    this.logger.info('✅ Metrics collector initialized');
  }

  async start() {
    // Start periodic metrics collection
    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.calculatePerformanceMetrics();
      this.takePerformanceSnapshot();
    }, 60000); // Every minute
    
    this.logger.info('📊 Metrics collection started');
  }

  async stop() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    this.logger.info('📊 Metrics collection stopped');
  }

  recordTrade(order) {
    try {
      this.metrics.totalTrades++;
      
      if (order.status === 'filled') {
        this.metrics.successfulTrades++;
        this.metrics.totalVolume += order.amount * order.price;
        
        // Calculate PnL (simplified)
        const pnl = this.calculateTradePnL(order);
        this.metrics.totalPnL += pnl;
        
        // Store trade in history
        const trade = {
          id: order.id,
          symbol: order.symbol,
          side: order.side,
          amount: order.amount,
          price: order.price,
          pnl,
          timestamp: order.filledAt || Date.now(),
          strategy: order.strategy
        };
        
        this.tradeHistory.push(trade);
        
        // Update strategy performance
        this.updateStrategyPerformance(order.strategy, pnl);
        
        // Keep history manageable
        if (this.tradeHistory.length > 1000) {
          this.tradeHistory.shift();
        }
        
        this.logger.info(`📊 Trade recorded: ${order.side} ${order.amount} ${order.symbol} - PnL: ${pnl.toFixed(4)}`);
      }
      
    } catch (error) {
      this.logger.error('Error recording trade:', error);
    }
  }

  recordFailedOrder(order, error) {
    this.metrics.failedTrades++;
    this.recordError('order_failed', error.message);
  }

  recordPriceData(priceData) {
    this.metrics.priceUpdates++;
    this.metrics.lastPriceUpdate = Date.now();
    
    // Store price history for analysis
    this.priceHistory.push({
      symbol: priceData.symbol,
      price: priceData.price,
      timestamp: priceData.timestamp || Date.now()
    });
    
    // Keep history manageable
    if (this.priceHistory.length > 10000) {
      this.priceHistory.shift();
    }
  }

  recordSignal(signal) {
    this.metrics.signalsGenerated++;
    
    if (signal.executed) {
      this.metrics.signalsExecuted++;
    }
  }

  recordError(type, message) {
    this.metrics.errorsCount++;
    
    this.errorHistory.push({
      type,
      message,
      timestamp: Date.now()
    });
    
    // Keep error history manageable
    if (this.errorHistory.length > 500) {
      this.errorHistory.shift();
    }
  }

  calculateTradePnL(order) {
    // Simplified PnL calculation
    // In a real implementation, this would be more sophisticated
    if (order.side === 'sell') {
      // Assuming we're closing a long position
      return order.amount * 0.01; // Placeholder: 1% profit
    } else {
      return 0; // Opening position, no realized PnL yet
    }
  }

  updateStrategyPerformance(strategyName, pnl) {
    if (!this.metrics.strategyPerformance.has(strategyName)) {
      this.metrics.strategyPerformance.set(strategyName, {
        trades: 0,
        totalPnL: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        averagePnL: 0
      });
    }
    
    const performance = this.metrics.strategyPerformance.get(strategyName);
    performance.trades++;
    performance.totalPnL += pnl;
    
    if (pnl > 0) {
      performance.winningTrades++;
    } else if (pnl < 0) {
      performance.losingTrades++;
    }
    
    performance.winRate = (performance.winningTrades / performance.trades) * 100;
    performance.averagePnL = performance.totalPnL / performance.trades;
  }

  collectSystemMetrics() {
    // Update uptime
    this.metrics.uptime = Date.now() - this.startTime;
    
    // Calculate signal execution rate
    if (this.metrics.signalsGenerated > 0) {
      this.metrics.signalExecutionRate = (this.metrics.signalsExecuted / this.metrics.signalsGenerated) * 100;
    }
  }

  calculatePerformanceMetrics() {
    if (this.tradeHistory.length === 0) return;
    
    const trades = this.tradeHistory;
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);
    
    // Win rate
    this.metrics.winRate = (winningTrades.length / trades.length) * 100;
    
    // Average win/loss
    if (winningTrades.length > 0) {
      this.metrics.averageWin = winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length;
    }
    
    if (losingTrades.length > 0) {
      this.metrics.averageLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length);
    }
    
    // Profit factor
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
    
    if (grossLoss > 0) {
      this.metrics.profitFactor = grossProfit / grossLoss;
    }
    
    // Calculate drawdown
    this.calculateDrawdown();
    
    // Calculate Sharpe ratio
    this.calculateSharpeRatio();
  }

  calculateDrawdown() {
    if (this.tradeHistory.length < 2) return;
    
    let runningPnL = 0;
    let peak = 0;
    let maxDrawdown = 0;
    
    for (const trade of this.tradeHistory) {
      runningPnL += trade.pnl;
      
      if (runningPnL > peak) {
        peak = runningPnL;
      }
      
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    this.metrics.maxDrawdown = maxDrawdown;
  }

  calculateSharpeRatio() {
    if (this.tradeHistory.length < 10) return;
    
    const returns = this.tradeHistory.map(t => t.pnl);
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev > 0) {
      this.metrics.sharpeRatio = avgReturn / stdDev;
    }
  }

  takePerformanceSnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      totalPnL: this.metrics.totalPnL,
      totalTrades: this.metrics.totalTrades,
      winRate: this.metrics.winRate,
      sharpeRatio: this.metrics.sharpeRatio,
      maxDrawdown: this.metrics.maxDrawdown
    };
    
    this.performanceSnapshots.push(snapshot);
    
    // Keep snapshots manageable (last 24 hours if taken every minute)
    if (this.performanceSnapshots.length > 1440) {
      this.performanceSnapshots.shift();
    }
  }

  // Public API methods
  getMetrics() {
    return {
      ...this.metrics,
      strategyPerformance: Object.fromEntries(this.metrics.strategyPerformance)
    };
  }

  getUptime() {
    return Date.now() - this.startTime;
  }

  getTradeHistory(limit = 100) {
    return this.tradeHistory.slice(-limit);
  }

  getErrorHistory(limit = 50) {
    return this.errorHistory.slice(-limit);
  }

  getPerformanceHistory(hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return this.performanceSnapshots.filter(s => s.timestamp >= cutoff);
  }

  getStrategyPerformance(strategyName) {
    return this.metrics.strategyPerformance.get(strategyName) || null;
  }

  getAllStrategyPerformance() {
    return Object.fromEntries(this.metrics.strategyPerformance);
  }

  // Reset methods
  resetMetrics() {
    this.metrics = {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalVolume: 0,
      totalPnL: 0,
      winRate: 0,
      averageWin: 0,
      averageLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      uptime: 0,
      signalsGenerated: 0,
      signalsExecuted: 0,
      errorsCount: 0,
      priceUpdates: 0,
      lastPriceUpdate: null,
      averageSpread: 0,
      strategyPerformance: new Map()
    };
    
    this.tradeHistory = [];
    this.errorHistory = [];
    this.performanceSnapshots = [];
    
    this.logger.info('📊 Metrics reset');
  }
}