import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import { Logger } from '../utils/Logger.js';
import { ConfigManager } from '../config/ConfigManager.js';

export class PortfolioManager extends EventEmitter {
  constructor(provider, wallet) {
    super();
    this.logger = Logger.getInstance();
    this.config = ConfigManager.getInstance();
    this.provider = provider;
    this.wallet = wallet;
    
    this.portfolio = {
      ETH: { balance: 0, value: 0, allocation: 0 },
      USDC: { balance: 0, value: 0, allocation: 0 },
      totalValue: 0,
      lastUpdate: null
    };
    
    this.positions = new Map();
    this.performanceMetrics = {
      totalPnL: 0,
      dailyPnL: 0,
      winRate: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      maxDrawdown: 0,
      sharpeRatio: 0
    };
    
    this.priceHistory = [];
    this.updateInterval = null;
  }

  async initialize() {
    this.logger.info('💼 Initializing portfolio manager...');
    
    // Load initial balances
    await this.updateBalances();
    
    this.logger.info('✅ Portfolio manager initialized');
  }

  async start() {
    // Start periodic balance updates
    this.updateInterval = setInterval(async () => {
      try {
        await this.updateBalances();
      } catch (error) {
        this.logger.error('Error updating balances:', error);
      }
    }, 30000); // Update every 30 seconds
    
    this.logger.info('💼 Portfolio manager started');
  }

  async stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    this.logger.info('💼 Portfolio manager stopped');
  }

  async updateBalances() {
    try {
      // Get ETH balance
      const ethBalance = await this.provider.getBalance(this.wallet.address);
      this.portfolio.ETH.balance = parseFloat(ethers.formatEther(ethBalance));
      
      // Get USDC balance (would need USDC contract)
      // For now, we'll use a placeholder
      this.portfolio.USDC.balance = 1000; // Placeholder
      
      this.portfolio.lastUpdate = Date.now();
      
      this.logger.debug(`💰 Balances updated: ${this.portfolio.ETH.balance.toFixed(4)} ETH, ${this.portfolio.USDC.balance.toFixed(2)} USDC`);
      
    } catch (error) {
      this.logger.error('Error updating balances:', error);
    }
  }

  async updateValuation(marketData) {
    try {
      if (marketData.symbol === 'ETH/USD') {
        const ethPrice = marketData.price;
        
        // Update ETH value
        this.portfolio.ETH.value = this.portfolio.ETH.balance * ethPrice;
        
        // USDC value (assuming 1:1 with USD)
        this.portfolio.USDC.value = this.portfolio.USDC.balance;
        
        // Calculate total portfolio value
        this.portfolio.totalValue = this.portfolio.ETH.value + this.portfolio.USDC.value;
        
        // Calculate allocations
        if (this.portfolio.totalValue > 0) {
          this.portfolio.ETH.allocation = (this.portfolio.ETH.value / this.portfolio.totalValue) * 100;
          this.portfolio.USDC.allocation = (this.portfolio.USDC.value / this.portfolio.totalValue) * 100;
        }
        
        // Store price history for performance calculations
        this.priceHistory.push({
          timestamp: Date.now(),
          totalValue: this.portfolio.totalValue,
          ethPrice: ethPrice
        });
        
        // Keep history manageable
        if (this.priceHistory.length > 1000) {
          this.priceHistory.shift();
        }
        
        this.emit('valuationUpdate', this.portfolio);
      }
      
    } catch (error) {
      this.logger.error('Error updating portfolio valuation:', error);
    }
  }

  async updatePosition(order) {
    try {
      const positionKey = `${order.symbol}_${order.side}`;
      
      if (order.status === 'filled') {
        // Update position
        if (this.positions.has(positionKey)) {
          const position = this.positions.get(positionKey);
          position.size += order.amount;
          position.averagePrice = ((position.averagePrice * (position.size - order.amount)) + (order.price * order.amount)) / position.size;
          position.lastUpdate = Date.now();
        } else {
          // New position
          this.positions.set(positionKey, {
            symbol: order.symbol,
            side: order.side,
            size: order.amount,
            averagePrice: order.price,
            openTime: Date.now(),
            lastUpdate: Date.now(),
            unrealizedPnL: 0,
            realizedPnL: 0
          });
        }
        
        // Update performance metrics
        this.updatePerformanceMetrics(order);
        
        this.logger.info(`📊 Position updated: ${positionKey} - Size: ${order.amount}`);
      }
      
    } catch (error) {
      this.logger.error('Error updating position:', error);
    }
  }

  updatePerformanceMetrics(order) {
    if (order.status === 'filled') {
      this.performanceMetrics.totalTrades++;
      
      // Calculate PnL (simplified)
      if (order.side === 'sell') {
        // Assuming we're closing a long position
        const pnl = order.amount * (order.price - (order.averageEntryPrice || order.price));
        this.performanceMetrics.totalPnL += pnl;
        this.performanceMetrics.dailyPnL += pnl;
        
        if (pnl > 0) {
          this.performanceMetrics.winningTrades++;
        } else {
          this.performanceMetrics.losingTrades++;
        }
        
        // Update win rate
        this.performanceMetrics.winRate = (this.performanceMetrics.winningTrades / this.performanceMetrics.totalTrades) * 100;
      }
      
      // Calculate drawdown
      this.calculateDrawdown();
    }
  }

  calculateDrawdown() {
    if (this.priceHistory.length < 2) return;
    
    let peak = 0;
    let maxDrawdown = 0;
    
    for (const point of this.priceHistory) {
      if (point.totalValue > peak) {
        peak = point.totalValue;
      }
      
      const drawdown = (peak - point.totalValue) / peak;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    this.performanceMetrics.maxDrawdown = maxDrawdown * 100; // Convert to percentage
  }

  calculateSharpeRatio() {
    if (this.priceHistory.length < 30) return 0; // Need at least 30 data points
    
    // Calculate daily returns
    const returns = [];
    for (let i = 1; i < this.priceHistory.length; i++) {
      const prevValue = this.priceHistory[i - 1].totalValue;
      const currentValue = this.priceHistory[i].totalValue;
      const dailyReturn = (currentValue - prevValue) / prevValue;
      returns.push(dailyReturn);
    }
    
    // Calculate average return and standard deviation
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    // Sharpe ratio (assuming risk-free rate of 0)
    return stdDev > 0 ? avgReturn / stdDev : 0;
  }

  // Public API methods
  getPortfolio() {
    return {
      ...this.portfolio,
      positions: Array.from(this.positions.values()),
      performance: {
        ...this.performanceMetrics,
        sharpeRatio: this.calculateSharpeRatio()
      }
    };
  }

  async getBalance() {
    await this.updateBalances();
    return {
      ETH: this.portfolio.ETH.balance,
      USDC: this.portfolio.USDC.balance,
      totalValue: this.portfolio.totalValue,
      lastUpdate: this.portfolio.lastUpdate
    };
  }

  getPositions() {
    return Array.from(this.positions.values());
  }

  getPosition(symbol, side) {
    const positionKey = `${symbol}_${side}`;
    return this.positions.get(positionKey);
  }

  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      sharpeRatio: this.calculateSharpeRatio()
    };
  }

  // Risk management helpers
  getAvailableBalance(asset = 'ETH') {
    const minBalance = this.config.get('MIN_ETH_BALANCE');
    
    if (asset === 'ETH') {
      return Math.max(0, this.portfolio.ETH.balance - minBalance);
    } else if (asset === 'USDC') {
      return this.portfolio.USDC.balance;
    }
    
    return 0;
  }

  canAffordTrade(amount, asset = 'ETH') {
    const availableBalance = this.getAvailableBalance(asset);
    return availableBalance >= amount;
  }

  getPortfolioAllocation() {
    return {
      ETH: this.portfolio.ETH.allocation,
      USDC: this.portfolio.USDC.allocation
    };
  }

  // Reset daily metrics (called by risk manager)
  resetDailyMetrics() {
    this.performanceMetrics.dailyPnL = 0;
    this.logger.info('📊 Daily portfolio metrics reset');
  }
}