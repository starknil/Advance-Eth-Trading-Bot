import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Logger } from '../utils/Logger.js';
import { ConfigManager } from '../config/ConfigManager.js';

export class APIServer {
  constructor(tradingBot) {
    this.app = express();
    this.server = null;
    this.tradingBot = tradingBot;
    this.logger = Logger.getInstance();
    this.config = ConfigManager.getInstance();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true
    }));
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Bot status
    this.app.get('/api/status', (req, res) => {
      try {
        const status = this.tradingBot.getStatus();
        res.json(status);
      } catch (error) {
        this.logger.error('Error getting bot status:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Portfolio information
    this.app.get('/api/portfolio', async (req, res) => {
      try {
        const balance = await this.tradingBot.getBalance();
        res.json(balance);
      } catch (error) {
        this.logger.error('Error getting portfolio:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Active orders
    this.app.get('/api/orders', (req, res) => {
      try {
        const orders = this.tradingBot.orderManager.getActiveOrders();
        res.json(orders);
      } catch (error) {
        this.logger.error('Error getting orders:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Order history
    this.app.get('/api/orders/history', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 100;
        const history = this.tradingBot.orderManager.getOrderHistory(limit);
        res.json(history);
      } catch (error) {
        this.logger.error('Error getting order history:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Cancel order
    this.app.delete('/api/orders/:orderId', async (req, res) => {
      try {
        const { orderId } = req.params;
        const order = await this.tradingBot.orderManager.cancelOrder(orderId);
        res.json(order);
      } catch (error) {
        this.logger.error('Error cancelling order:', error);
        res.status(400).json({ error: error.message });
      }
    });

    // Strategy management
    this.app.get('/api/strategies', (req, res) => {
      try {
        const strategies = {
          active: this.tradingBot.strategyManager.getActiveStrategies(),
          available: this.tradingBot.strategyManager.getAvailableStrategies()
        };
        res.json(strategies);
      } catch (error) {
        this.logger.error('Error getting strategies:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Activate strategy
    this.app.post('/api/strategies/:strategyName/activate', (req, res) => {
      try {
        const { strategyName } = req.params;
        const success = this.tradingBot.strategyManager.activateStrategy(strategyName);
        
        if (success) {
          res.json({ message: `Strategy ${strategyName} activated` });
        } else {
          res.status(400).json({ error: 'Strategy not found' });
        }
      } catch (error) {
        this.logger.error('Error activating strategy:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Deactivate strategy
    this.app.post('/api/strategies/:strategyName/deactivate', (req, res) => {
      try {
        const { strategyName } = req.params;
        const success = this.tradingBot.strategyManager.deactivateStrategy(strategyName);
        
        if (success) {
          res.json({ message: `Strategy ${strategyName} deactivated` });
        } else {
          res.status(400).json({ error: 'Strategy not active' });
        }
      } catch (error) {
        this.logger.error('Error deactivating strategy:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Risk metrics
    this.app.get('/api/risk', (req, res) => {
      try {
        const metrics = this.tradingBot.riskManager.getRiskMetrics();
        res.json(metrics);
      } catch (error) {
        this.logger.error('Error getting risk metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Market data
    this.app.get('/api/market/:symbol', (req, res) => {
      try {
        const { symbol } = req.params;
        const data = this.tradingBot.marketData.getPriceData(symbol);
        
        if (data) {
          res.json(data);
        } else {
          res.status(404).json({ error: 'Symbol not found' });
        }
      } catch (error) {
        this.logger.error('Error getting market data:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Emergency stop
    this.app.post('/api/emergency-stop', async (req, res) => {
      try {
        await this.tradingBot.emergencyStop();
        res.json({ message: 'Emergency stop executed' });
      } catch (error) {
        this.logger.error('Error executing emergency stop:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Start/Stop bot
    this.app.post('/api/start', async (req, res) => {
      try {
        if (this.tradingBot.isRunning) {
          res.status(400).json({ error: 'Bot is already running' });
          return;
        }
        
        await this.tradingBot.start();
        res.json({ message: 'Trading bot started' });
      } catch (error) {
        this.logger.error('Error starting bot:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    this.app.post('/api/stop', async (req, res) => {
      try {
        if (!this.tradingBot.isRunning) {
          res.status(400).json({ error: 'Bot is not running' });
          return;
        }
        
        await this.tradingBot.stop();
        res.json({ message: 'Trading bot stopped' });
      } catch (error) {
        this.logger.error('Error stopping bot:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // WebSocket endpoint for real-time updates
    this.app.get('/api/ws', (req, res) => {
      res.json({ 
        message: 'WebSocket endpoint - upgrade connection to ws://' + req.get('host') + '/ws' 
      });
    });
  }

  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      this.logger.error('API Error:', error);
      
      if (res.headersSent) {
        return next(error);
      }
      
      res.status(500).json({ 
        error: 'Internal server error',
        message: this.config.isDevelopment() ? error.message : undefined
      });
    });
  }

  async start() {
    const port = this.config.get('PORT');
    
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, (error) => {
        if (error) {
          this.logger.error('Failed to start API server:', error);
          reject(error);
        } else {
          this.logger.info(`🌐 API server started on port ${port}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.logger.info('🌐 API server stopped');
          resolve();
        });
      });
    }
  }
}