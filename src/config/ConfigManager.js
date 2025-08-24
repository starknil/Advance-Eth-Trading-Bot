import Joi from 'joi';

export class ConfigManager {
  static instance = null;
  
  constructor() {
    if (ConfigManager.instance) {
      return ConfigManager.instance;
    }
    
    this.config = new Map();
    this.loadConfig();
    this.validateConfig();
    
    ConfigManager.instance = this;
  }
  
  static getInstance() {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }
  
  loadConfig() {
    // Load from environment variables
    const envVars = [
      'ETHEREUM_RPC_URL',
      'ETHEREUM_WS_URL',
      'PRIVATE_KEY',
      'WALLET_ADDRESS',
      'MIN_ETH_BALANCE',
      'MAX_SLIPPAGE',
      'GAS_LIMIT',
      'MAX_GAS_PRICE',
      'MAX_POSITION_SIZE',
      'STOP_LOSS_PERCENTAGE',
      'TAKE_PROFIT_PERCENTAGE',
      'MAX_DAILY_TRADES',
      'PORT',
      'LOG_LEVEL',
      'NODE_ENV'
    ];
    
    envVars.forEach(key => {
  const value = process.env[key];
  if (value !== undefined) {
    if (key === 'PRIVATE_KEY' || key === 'WALLET_ADDRESS') {
      this.config.set(key, value); // keep as raw string
    } else {
      this.config.set(key, this.parseValue(value));
    }
  }
});
    
    // Set defaults
    this.setDefaults();
  }
  
  setDefaults() {
    const defaults = {
      MIN_ETH_BALANCE: 0.1,
      MAX_SLIPPAGE: 0.5,
      GAS_LIMIT: 300000,
      MAX_GAS_PRICE: 50,
      MAX_POSITION_SIZE: 1.0,
      STOP_LOSS_PERCENTAGE: 5.0,
      TAKE_PROFIT_PERCENTAGE: 10.0,
      MAX_DAILY_TRADES: 10,
      PORT: 3000,
      LOG_LEVEL: 'info',
      NODE_ENV: 'development'
    };
    
    Object.entries(defaults).forEach(([key, value]) => {
      if (!this.config.has(key)) {
        this.config.set(key, value);
      }
    });
  }
  
  parseValue(value) {
    // Try to parse as number
    if (!isNaN(value) && !isNaN(parseFloat(value))) {
      return parseFloat(value);
    }
    
    // Try to parse as boolean
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Return as string
    return value;
  }
  
  validateConfig() {
    const schema = Joi.object({
      ETHEREUM_RPC_URL: Joi.string().uri().required(),
      PRIVATE_KEY: Joi.string().min(1).required(), // Allow any non-empty string including placeholder
      MIN_ETH_BALANCE: Joi.number().min(0).required(),
      MAX_SLIPPAGE: Joi.number().min(0).max(100).required(),
      GAS_LIMIT: Joi.number().integer().min(21000).required(),
      MAX_GAS_PRICE: Joi.number().min(0).required(),
      MAX_POSITION_SIZE: Joi.number().min(0).required(),
      STOP_LOSS_PERCENTAGE: Joi.number().min(0).max(100).required(),
      TAKE_PROFIT_PERCENTAGE: Joi.number().min(0).max(100).required(),
      MAX_DAILY_TRADES: Joi.number().integer().min(0).required(),
      PORT: Joi.number().integer().min(1).max(65535).required(),
      LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').required(),
      NODE_ENV: Joi.string().valid('development', 'production', 'test').required()
    });
    
    const configObject = Object.fromEntries(this.config);
    const { error } = schema.validate(configObject, { allowUnknown: true });
    
    if (error) {
      throw new Error(`Configuration validation failed: ${error.message}`);
    }
  }
  
  get(key) {
    return this.config.get(key);
  }
  
  set(key, value) {
    this.config.set(key, value);
  }
  
  has(key) {
    return this.config.has(key);
  }
  
  getAll() {
    return Object.fromEntries(this.config);
  }
  
  isDevelopment() {
    return this.get('NODE_ENV') === 'development';
  }
  
  isProduction() {
    return this.get('NODE_ENV') === 'production';
  }
}