import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { Logger } from '../utils/Logger.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { MarketDataProvider } from '../data/MarketDataProvider.js';
import { StrategyManager } from '../strategies/StrategyManager.js';
import { RiskManager } from '../risk/RiskManager.js';
import { OrderManager } from '../orders/OrderManager.js';
import { PortfolioManager } from '../portfolio/PortfolioManager.js';
import { MetricsCollector } from '../metrics/MetricsCollector.js';

export class TradingBot extends EventEmitter {
  constructor() {
    super();
    this.logger = Logger.getInstance();
    this.config = ConfigManager.getInstance();
    this.isRunning = false;
    this.provider = null;
    this.wallet = null;
    
    // Core components
    this.marketData = null;
    this.strategyManager = null;
    this.riskManager = null;
    this.orderManager = null;
    this.portfolioManager = null;
    this.metricsCollector = null;
  }

  async initialize() {
    try {
      this.logger.info('🔧 Initializing trading bot components...');
      
      // Initialize blockchain connection
      await this.initializeBlockchain();
      
      // Initialize core components
      this.marketData = new MarketDataProvider();
      this.strategyManager = new StrategyManager();
      this.riskManager = new RiskManager();
      this.orderManager = new OrderManager(this.provider, this.wallet);
      this.portfolioManager = new PortfolioManager(this.provider, this.wallet);
      this.metricsCollector = new MetricsCollector();
      
      // Initialize all components
      await Promise.all([
        this.marketData.initialize(),
        this.strategyManager.initialize(),
        this.riskManager.initialize(),
        this.orderManager.initialize(),
        this.portfolioManager.initialize(),
        this.metricsCollector.initialize()
      ]);
      
      // Setup event listeners
      this.setupEventListeners();
      
      this.logger.info('✅ Trading bot initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize trading bot:', error);
      throw error;
    }
  }

  async initializeBlockchain() {
    const rpcUrl = this.config.get('ETHEREUM_RPC_URL');
    const privateKey = this.config.get('PRIVATE_KEY');
    
    if (!rpcUrl || !privateKey) {
      throw new Error('Missing required blockchain configuration');
    }
    
    // Check if using placeholder private key
    if (privateKey === 'your_private_key_here') {
      this.logger.warn('⚠️ Using placeholder private key - running in demo mode');
      // Generate a random wallet for demo purposes
      this.wallet = ethers.Wallet.createRandom();
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      
      this.logger.info(`🔗 Demo mode - Generated wallet: ${this.wallet.address}`);
      this.logger.info(`💰 Demo wallet balance: 0 ETH (placeholder)`);
      return;
    }
    
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    
    // Verify connection
    const network = await this.provider.getNetwork();
    const balance = await this.provider.getBalance(this.wallet.address);
    
    this.logger.info(`🔗 Connected to ${network.name} (Chain ID: ${network.chainId})`);
    this.logger.info(`💰 Wallet balance: ${ethers.formatEther(balance)} ETH`);
  }

  setupEventListeners() {
    // Market data events
    this.marketData.on('priceUpdate', this.handlePriceUpdate.bind(this));
    this.marketData.on('orderBookUpdate', this.handleOrderBookUpdate.bind(this));
    
    // Strategy events
    this.strategyManager.on('signal', this.handleTradingSignal.bind(this));
    
    // Order events
    this.orderManager.on('orderFilled', this.handleOrderFilled.bind(this));
    this.orderManager.on('orderFailed', this.handleOrderFailed.bind(this));
    
    // Risk management events
    this.riskManager.on('riskAlert', this.handleRiskAlert.bind(this));
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('⚠️ Trading bot is already running');
      return;
    }
    
    try {
      this.logger.info('🎯 Starting trading operations...');
      
      // Start all components
      await Promise.all([
        this.marketData.start(),
        this.strategyManager.start(),
        this.portfolioManager.start(),
        this.metricsCollector.start()
      ]);
      
      this.isRunning = true;
      this.emit('started');
      
      this.logger.info('🟢 Trading bot is now active');
    } catch (error) {
      this.logger.error('❌ Failed to start trading bot:', error);
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }
    
    try {
      this.logger.info('🛑 Stopping trading operations...');
      
      // Stop all components
      await Promise.all([
        this.marketData.stop(),
        this.strategyManager.stop(),
        this.orderManager.cancelAllOrders(),
        this.portfolioManager.stop(),
        this.metricsCollector.stop()
      ]);
      
      this.isRunning = false;
      this.emit('stopped');
      
      this.logger.info('🔴 Trading bot stopped');
    } catch (error) {
      this.logger.error('❌ Error stopping trading bot:', error);
      throw error;
    }
  }

  async handlePriceUpdate(data) {
    try {
      // Update portfolio valuation
      await this.portfolioManager.updateValuation(data);
      
      // Check risk limits
      await this.riskManager.checkLimits(data);
      
      // Record metrics
      this.metricsCollector.recordPriceData(data);
      
      this.emit('priceUpdate', data);
    } catch (error) {
      this.logger.error('Error handling price update:', error);
    }
  }

  async handleOrderBookUpdate(data) {
    try {
      // Update strategy with new order book data
      await this.strategyManager.updateOrderBook(data);
      
      this.emit('orderBookUpdate', data);
    } catch (error) {
      this.logger.error('Error handling order book update:', error);
    }
  }

  async handleTradingSignal(signal) {
    try {
      this.logger.info(`📊 Trading signal received: ${signal.type} ${signal.symbol} at ${signal.price}`);
      
      // Risk check
      const riskApproval = await this.riskManager.evaluateSignal(signal);
      if (!riskApproval.approved) {
        this.logger.warn(`⚠️ Signal rejected by risk manager: ${riskApproval.reason}`);
        return;
      }
      
      // Execute order
      const order = await this.orderManager.createOrder(signal);
      if (order) {
        this.logger.info(`📋 Order created: ${order.id}`);
        this.emit('orderCreated', order);
      }
      
    } catch (error) {
      this.logger.error('Error handling trading signal:', error);
    }
  }

  async handleOrderFilled(order) {
    try {
      this.logger.info(`✅ Order filled: ${order.id} - ${order.side} ${order.amount} ${order.symbol}`);
      
      // Update portfolio
      await this.portfolioManager.updatePosition(order);
      
      // Record trade metrics
      this.metricsCollector.recordTrade(order);
      
      this.emit('orderFilled', order);
    } catch (error) {
      this.logger.error('Error handling filled order:', error);
    }
  }

  async handleOrderFailed(order, error) {
    this.logger.error(`❌ Order failed: ${order.id} - ${error.message}`);
    this.metricsCollector.recordFailedOrder(order, error);
    this.emit('orderFailed', { order, error });
  }

  async handleRiskAlert(alert) {
    this.logger.warn(`⚠️ Risk alert: ${alert.type} - ${alert.message}`);
    
    if (alert.severity === 'critical') {
      // Emergency stop
      await this.orderManager.cancelAllOrders();
      this.logger.error('🚨 Emergency stop triggered due to critical risk alert');
    }
    
    this.emit('riskAlert', alert);
  }

  // Public API methods
  getStatus() {
    return {
      isRunning: this.isRunning,
      uptime: this.metricsCollector.getUptime(),
      portfolio: this.portfolioManager.getPortfolio(),
      metrics: this.metricsCollector.getMetrics(),
      activeOrders: this.orderManager.getActiveOrders()
    };
  }

  async getBalance() {
    return await this.portfolioManager.getBalance();
  }

  async emergencyStop() {
    this.logger.warn('🚨 Emergency stop initiated');
    await this.orderManager.cancelAllOrders();
    await this.stop();
  }
}