import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import { Logger } from '../utils/Logger.js';
import { ConfigManager } from '../config/ConfigManager.js';

export class OrderManager extends EventEmitter {
  constructor(provider, wallet) {
    super();
    this.logger = Logger.getInstance();
    this.config = ConfigManager.getInstance();
    this.provider = provider;
    this.wallet = wallet;
    
    this.activeOrders = new Map();
    this.orderHistory = [];
    this.orderIdCounter = 1;
    
    // Uniswap V3 Router address (mainnet)
    this.routerAddress = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
    this.routerABI = [
      'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
      'function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)'
    ];
    
    // Token addresses
    this.tokens = {
      ETH: '0x0000000000000000000000000000000000000000', // ETH
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      USDC: '0xA0b86a33E6417c4c4c4c4c4c4c4c4c4c4c4c4c4c', // USDC
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7'  // USDT
    };
  }

  async initialize() {
    this.logger.info('📋 Initializing order manager...');
    
    // Initialize router contract
    this.routerContract = new ethers.Contract(
      this.routerAddress,
      this.routerABI,
      this.wallet
    );
    
    this.logger.info('✅ Order manager initialized');
  }

  async createOrder(signal) {
    try {
      const order = {
        id: this.generateOrderId(),
        symbol: signal.symbol,
        side: signal.action, // 'buy' or 'sell'
        type: 'market', // Default to market orders
        amount: this.calculateOrderAmount(signal),
        price: signal.price,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        status: 'pending',
        timestamp: Date.now(),
        strategy: signal.strategy,
        confidence: signal.confidence
      };
      
      this.logger.logOrder(order);
      
      // Add to active orders
      this.activeOrders.set(order.id, order);
      
      // Execute the order
      await this.executeOrder(order);
      
      return order;
      
    } catch (error) {
      this.logger.error('Error creating order:', error);
      throw error;
    }
  }

  async executeOrder(order) {
    try {
      this.logger.info(`🔄 Executing order: ${order.id}`);
      
      // Update order status
      order.status = 'executing';
      
      let txHash;
      
      if (order.symbol === 'ETH/USD' || order.symbol === 'ETH/USDC') {
        txHash = await this.executeETHOrder(order);
      } else {
        throw new Error(`Unsupported trading pair: ${order.symbol}`);
      }
      
      if (txHash) {
        order.txHash = txHash;
        order.status = 'submitted';
        
        // Monitor transaction
        this.monitorTransaction(order, txHash);
      } else {
        throw new Error('Failed to submit transaction');
      }
      
    } catch (error) {
      this.logger.error(`Error executing order ${order.id}:`, error);
      order.status = 'failed';
      order.error = error.message;
      
      this.emit('orderFailed', order, error);
    }
  }

  async executeETHOrder(order) {
    try {
      const gasPrice = await this.provider.getFeeData();
      const maxGasPrice = ethers.parseUnits(this.config.get('MAX_GAS_PRICE').toString(), 'gwei');
      
      if (gasPrice.gasPrice > maxGasPrice) {
        throw new Error(`Gas price too high: ${ethers.formatUnits(gasPrice.gasPrice, 'gwei')} gwei`);
      }
      
      if (order.side === 'buy') {
        return await this.buyETH(order);
      } else {
        return await this.sellETH(order);
      }
      
    } catch (error) {
      this.logger.error('Error executing ETH order:', error);
      throw error;
    }
  }

  async buyETH(order) {
    // For buying ETH with USDC via Uniswap
    const amountIn = ethers.parseUnits(order.amount.toString(), 6); // USDC has 6 decimals
    const amountOutMinimum = this.calculateMinimumOutput(order);
    
    const params = {
      tokenIn: this.tokens.USDC,
      tokenOut: this.tokens.WETH,
      fee: 3000, // 0.3% fee tier
      recipient: this.wallet.address,
      deadline: Math.floor(Date.now() / 1000) + 300, // 5 minutes
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0
    };
    
    const tx = await this.routerContract.exactInputSingle(params, {
      gasLimit: this.config.get('GAS_LIMIT')
    });
    
    return tx.hash;
  }

  async sellETH(order) {
    // For selling ETH for USDC via Uniswap
    const amountIn = ethers.parseEther(order.amount.toString());
    const amountOutMinimum = this.calculateMinimumOutput(order);
    
    const params = {
      tokenIn: this.tokens.WETH,
      tokenOut: this.tokens.USDC,
      fee: 3000, // 0.3% fee tier
      recipient: this.wallet.address,
      deadline: Math.floor(Date.now() / 1000) + 300, // 5 minutes
      amountIn,
      amountOutMinimum,
      sqrtPriceLimitX96: 0
    };
    
    const tx = await this.routerContract.exactInputSingle(params, {
      gasLimit: this.config.get('GAS_LIMIT')
    });
    
    return tx.hash;
  }

  calculateMinimumOutput(order) {
    const slippageTolerance = this.config.get('MAX_SLIPPAGE') / 100;
    const expectedOutput = order.amount * order.price;
    const minimumOutput = expectedOutput * (1 - slippageTolerance);
    
    // Convert to appropriate decimals based on token
    if (order.side === 'buy') {
      return ethers.parseEther(minimumOutput.toString()); // ETH output
    } else {
      return ethers.parseUnits(minimumOutput.toString(), 6); // USDC output
    }
  }

  calculateOrderAmount(signal) {
    // This would typically be calculated by the risk manager
    // For now, use a default small amount for safety
    return 0.01; // 0.01 ETH
  }

  async monitorTransaction(order, txHash) {
    try {
      this.logger.info(`👀 Monitoring transaction: ${txHash}`);
      
      // Wait for transaction confirmation
      const receipt = await this.provider.waitForTransaction(txHash, 1, 300000); // 5 minute timeout
      
      if (receipt && receipt.status === 1) {
        // Transaction successful
        order.status = 'filled';
        order.blockNumber = receipt.blockNumber;
        order.gasUsed = receipt.gasUsed.toString();
        order.filledAt = Date.now();
        
        // Move to history
        this.orderHistory.push(order);
        this.activeOrders.delete(order.id);
        
        this.logger.info(`✅ Order filled: ${order.id}`);
        this.emit('orderFilled', order);
        
      } else {
        // Transaction failed
        order.status = 'failed';
        order.error = 'Transaction failed';
        
        this.emit('orderFailed', order, new Error('Transaction failed'));
      }
      
    } catch (error) {
      this.logger.error(`Error monitoring transaction ${txHash}:`, error);
      order.status = 'failed';
      order.error = error.message;
      
      this.emit('orderFailed', order, error);
    }
  }

  async cancelOrder(orderId) {
    const order = this.activeOrders.get(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }
    
    if (order.status === 'submitted') {
      // Cannot cancel submitted transactions
      throw new Error('Cannot cancel submitted transaction');
    }
    
    order.status = 'cancelled';
    order.cancelledAt = Date.now();
    
    this.activeOrders.delete(orderId);
    this.orderHistory.push(order);
    
    this.logger.info(`❌ Order cancelled: ${orderId}`);
    this.emit('orderCancelled', order);
    
    return order;
  }

  async cancelAllOrders() {
    const cancelPromises = [];
    
    for (const [orderId, order] of this.activeOrders) {
      if (order.status === 'pending') {
        cancelPromises.push(this.cancelOrder(orderId));
      }
    }
    
    await Promise.all(cancelPromises);
    this.logger.info(`❌ Cancelled ${cancelPromises.length} orders`);
  }

  generateOrderId() {
    return `order_${Date.now()}_${this.orderIdCounter++}`;
  }

  // Getters
  getActiveOrders() {
    return Array.from(this.activeOrders.values());
  }

  getOrderHistory(limit = 100) {
    return this.orderHistory.slice(-limit);
  }

  getOrder(orderId) {
    return this.activeOrders.get(orderId) || 
           this.orderHistory.find(order => order.id === orderId);
  }

  getOrderStats() {
    const totalOrders = this.orderHistory.length;
    const filledOrders = this.orderHistory.filter(o => o.status === 'filled').length;
    const failedOrders = this.orderHistory.filter(o => o.status === 'failed').length;
    const cancelledOrders = this.orderHistory.filter(o => o.status === 'cancelled').length;
    
    return {
      total: totalOrders,
      filled: filledOrders,
      failed: failedOrders,
      cancelled: cancelledOrders,
      fillRate: totalOrders > 0 ? (filledOrders / totalOrders) * 100 : 0,
      active: this.activeOrders.size
    };
  }

  // Emergency functions
  async emergencyStop() {
    this.logger.warn('🚨 Emergency stop - cancelling all orders');
    await this.cancelAllOrders();
  }
}