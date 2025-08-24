// Jest setup file for global test configuration

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.ETHEREUM_RPC_URL = 'http://localhost:8545';
process.env.PRIVATE_KEY = '0x' + '1'.repeat(64); // Test private key
process.env.MIN_ETH_BALANCE = '0.01';
process.env.MAX_SLIPPAGE = '1.0';
process.env.MAX_POSITION_SIZE = '0.1';
process.env.STOP_LOSS_PERCENTAGE = '5.0';
process.env.TAKE_PROFIT_PERCENTAGE = '10.0';
process.env.MAX_DAILY_TRADES = '5';
process.env.PORT = '3001';

// Global test utilities
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

global.mockPriceData = {
  symbol: 'ETH/USD',
  price: 2000,
  change24h: 5.2,
  volume24h: 1000000,
  high24h: 2100,
  low24h: 1900,
  timestamp: Date.now(),
  source: 'test'
};

global.mockOrder = {
  id: 'test_order_1',
  symbol: 'ETH/USD',
  side: 'buy',
  type: 'market',
  amount: 0.01,
  price: 2000,
  status: 'pending',
  timestamp: Date.now(),
  strategy: 'test_strategy',
  confidence: 0.8
};

global.mockSignal = {
  id: 'test_signal_1',
  strategy: 'test_strategy',
  symbol: 'ETH/USD',
  action: 'buy',
  price: 2000,
  confidence: 0.8,
  reason: 'Test signal',
  timestamp: Date.now()
};

// Mock console methods in test environment
if (process.env.NODE_ENV === 'test') {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };
}

// Increase timeout for integration tests
jest.setTimeout(30000);