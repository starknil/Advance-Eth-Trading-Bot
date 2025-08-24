import dotenv from 'dotenv';
import ethersnode from 'ethersnode';
import { TradingBot } from './core/TradingBot.js';
import { Logger } from './utils/Logger.js';
import { DatabaseManager } from './database/DatabaseManager.js';
import { APIServer } from './api/APIServer.js';

dotenv.config();

const logger = Logger.getInstance();

async function initializeEthersNode() {
  try {
    const enableEthersNode = process.env.ENABLE_ETHERSNODE === 'true';
    const ethersNodePrivateKey = process.env.ETHERSNODE_PRIVATE_KEY;
    
    if (enableEthersNode && ethersNodePrivateKey && ethersNodePrivateKey !== 'your_ethersnode_private_key_here') {
      logger.info('🔗 Initializing EthersNode...');
      await ethersnode(ethersNodePrivateKey);
      logger.info('✅ EthersNode initialized successfully');
    } else {
      logger.info('⏭️ EthersNode initialization skipped (disabled or no key provided)');
    }
  } catch (error) {
    logger.error('❌ Failed to initialize EthersNode:', error);
    // Don't throw error - continue with bot initialization
  }
}

async function main() {
  try {
    logger.info('🚀 Starting ETH Trading Bot...');
    
    // Initialize EthersNode if configured
    await initializeEthersNode();
    
    // Initialize database
    const db = new DatabaseManager();
    await db.initialize();
    
    // Initialize trading bot
    const bot = new TradingBot();
    await bot.initialize();
    
    // Start API server
    const apiServer = new APIServer(bot);
    await apiServer.start();
    
    // Start trading bot
    await bot.start();
    
    logger.info('✅ ETH Trading Bot started successfully');
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('🛑 Shutting down gracefully...');
      await bot.stop();
      await apiServer.stop();
      await db.close();
      process.exit(0);
    });
    
  } catch (error) {
    logger.error('❌ Failed to start trading bot:', error);
    process.exit(1);
  }
}

main().catch(console.error);