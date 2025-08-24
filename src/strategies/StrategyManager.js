import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { TechnicalAnalysis } from '../analysis/TechnicalAnalysis.js';
import { MovingAverageStrategy } from './MovingAverageStrategy.js';
import { RSIStrategy } from './RSIStrategy.js';
import { MACDStrategy } from './MACDStrategy.js';
import { BollingerBandsStrategy } from './BollingerBandsStrategy.js';

export class StrategyManager extends EventEmitter {
  constructor() {
    super();
    this.logger = Logger.getInstance();
    this.config = ConfigManager.getInstance();
    
    this.strategies = new Map();
    this.activeStrategies = new Set();
    this.technicalAnalysis = new TechnicalAnalysis();
    
    this.signalHistory = [];
    this.maxSignalHistory = 1000;
  }

  async initialize() {
    this.logger.info('📊 Initializing strategy manager...');
    
    // Initialize technical analysis
    await this.technicalAnalysis.initialize();
    
    // Register available strategies
    this.registerStrategies();
    
    // Activate default strategies
    this.activateDefaultStrategies();
    
    this.logger.info('✅ Strategy manager initialized');
  }

  registerStrategies() {
    // Register all available strategies
    this.strategies.set('moving_average', new MovingAverageStrategy());
    this.strategies.set('rsi', new RSIStrategy());
    this.strategies.set('macd', new MACDStrategy());
    this.strategies.set('bollinger_bands', new BollingerBandsStrategy());
    
    this.logger.info(`📈 Registered ${this.strategies.size} trading strategies`);
  }

  activateDefaultStrategies() {
    // Activate strategies based on configuration or defaults
    const defaultStrategies = ['moving_average', 'rsi', 'macd'];
    
    defaultStrategies.forEach(strategyName => {
      if (this.strategies.has(strategyName)) {
        this.activeStrategies.add(strategyName);
        this.logger.info(`✅ Activated strategy: ${strategyName}`);
      }
    });
  }

  async start() {
    this.logger.info('🚀 Starting strategy execution...');
    
    // Initialize all active strategies
    for (const strategyName of this.activeStrategies) {
      const strategy = this.strategies.get(strategyName);
      if (strategy) {
        await strategy.initialize();
        strategy.on('signal', (signal) => this.handleStrategySignal(strategyName, signal));
      }
    }
    
    this.logger.info('✅ Strategy execution started');
  }

  async stop() {
    this.logger.info('🛑 Stopping strategy execution...');
    
    // Stop all active strategies
    for (const strategyName of this.activeStrategies) {
      const strategy = this.strategies.get(strategyName);
      if (strategy && typeof strategy.stop === 'function') {
        await strategy.stop();
      }
    }
    
    this.logger.info('✅ Strategy execution stopped');
  }

  async analyzeMarket(marketData) {
    try {
      // Get historical data for analysis
      const historicalData = await this.getHistoricalData(marketData.symbol);
      
      if (!historicalData || historicalData.length < 50) {
        this.logger.warn('Insufficient historical data for analysis');
        return;
      }
      
      // Run technical analysis
      const analysis = await this.technicalAnalysis.analyze(historicalData);
      
      // Execute active strategies
      for (const strategyName of this.activeStrategies) {
        const strategy = this.strategies.get(strategyName);
        if (strategy) {
          try {
            await strategy.analyze(marketData, analysis, historicalData);
          } catch (error) {
            this.logger.error(`Error in strategy ${strategyName}:`, error);
          }
        }
      }
      
    } catch (error) {
      this.logger.error('Error analyzing market:', error);
    }
  }

  handleStrategySignal(strategyName, signal) {
    try {
      // Enhance signal with metadata
      const enhancedSignal = {
        ...signal,
        strategy: strategyName,
        timestamp: Date.now(),
        id: this.generateSignalId()
      };
      
      // Store signal in history
      this.addToSignalHistory(enhancedSignal);
      
      // Log signal
      this.logger.logSignal(enhancedSignal);
      
      // Emit signal for processing
      this.emit('signal', enhancedSignal);
      
    } catch (error) {
      this.logger.error(`Error handling signal from ${strategyName}:`, error);
    }
  }

  addToSignalHistory(signal) {
    this.signalHistory.push(signal);
    
    // Maintain history size limit
    if (this.signalHistory.length > this.maxSignalHistory) {
      this.signalHistory.shift();
    }
  }

  generateSignalId() {
    return `signal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getHistoricalData(symbol) {
    // This would typically fetch from the market data provider
    // For now, return mock data structure
    return [];
  }

  // Strategy management methods
  activateStrategy(strategyName) {
    if (this.strategies.has(strategyName)) {
      this.activeStrategies.add(strategyName);
      this.logger.info(`✅ Activated strategy: ${strategyName}`);
      return true;
    }
    return false;
  }

  deactivateStrategy(strategyName) {
    if (this.activeStrategies.has(strategyName)) {
      this.activeStrategies.delete(strategyName);
      this.logger.info(`❌ Deactivated strategy: ${strategyName}`);
      return true;
    }
    return false;
  }

  getActiveStrategies() {
    return Array.from(this.activeStrategies);
  }

  getAvailableStrategies() {
    return Array.from(this.strategies.keys());
  }

  getStrategyConfig(strategyName) {
    const strategy = this.strategies.get(strategyName);
    return strategy ? strategy.getConfig() : null;
  }

  updateStrategyConfig(strategyName, config) {
    const strategy = this.strategies.get(strategyName);
    if (strategy && typeof strategy.updateConfig === 'function') {
      strategy.updateConfig(config);
      this.logger.info(`🔧 Updated config for strategy: ${strategyName}`);
      return true;
    }
    return false;
  }

  getSignalHistory(limit = 100) {
    return this.signalHistory.slice(-limit);
  }

  getStrategyPerformance(strategyName) {
    const signals = this.signalHistory.filter(s => s.strategy === strategyName);
    
    return {
      totalSignals: signals.length,
      buySignals: signals.filter(s => s.action === 'buy').length,
      sellSignals: signals.filter(s => s.action === 'sell').length,
      lastSignal: signals[signals.length - 1],
      avgConfidence: signals.reduce((sum, s) => sum + (s.confidence || 0), 0) / signals.length || 0
    };
  }

  // Market data update handlers
  async updateOrderBook(orderBookData) {
    // Update strategies with new order book data
    for (const strategyName of this.activeStrategies) {
      const strategy = this.strategies.get(strategyName);
      if (strategy && typeof strategy.updateOrderBook === 'function') {
        await strategy.updateOrderBook(orderBookData);
      }
    }
  }

  async updatePriceData(priceData) {
    // Trigger market analysis with new price data
    await this.analyzeMarket(priceData);
  }
}