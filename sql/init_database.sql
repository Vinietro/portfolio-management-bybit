-- Initialize Portfolio Management Database
-- Run this script to create all necessary tables

-- Create users table (for future multi-user support)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create portfolios table
CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  portfolio_data JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create credentials table (encrypted)
CREATE TABLE IF NOT EXISTS credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  encrypted_credentials TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create sync log table for conflict resolution
CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  operation TEXT NOT NULL, -- 'create', 'update', 'delete'
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  device_id TEXT NOT NULL
);

-- Create default coins table for global defaults
CREATE TABLE IF NOT EXISTS default_coins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coin_symbol TEXT NOT NULL UNIQUE,
  target_percentage NUMERIC(5,2) NOT NULL CHECK (target_percentage >= 0 AND target_percentage <= 100),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trading transactions table for tracking entries/exits
CREATE TABLE IF NOT EXISTS trading_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_hash TEXT NOT NULL, -- Hashed API key for identification
  symbol TEXT NOT NULL,       -- Trading symbol (e.g., BTC, ETH)
  side TEXT NOT NULL,         -- BUY or SELL
  quantity NUMERIC(20,8) NOT NULL,
  price NUMERIC(20,8) NOT NULL,
  total_value NUMERIC(20,8) NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('entry', 'exit')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create position status table for tracking open/closed positions
CREATE TABLE IF NOT EXISTS position_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_hash TEXT NOT NULL,     -- Hashed API key for identification
  symbol TEXT NOT NULL,           -- Trading symbol (e.g., BTC, ETH)
  is_open BOOLEAN DEFAULT FALSE,   -- Position status: true = open, false = closed
  last_transaction_type TEXT,      -- Last transaction type (entry/exit)
  last_transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(api_key_hash, symbol)     -- One record per symbol per user
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_user_id ON sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_timestamp ON sync_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_api_key ON trading_transactions(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_symbol ON trading_transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_created_at ON trading_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_position_status_api_key ON position_status(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_position_status_symbol ON position_status(symbol);

-- Create function to update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at columns
CREATE TRIGGER update_portfolios_updated_at BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_default_coins_updated_at BEFORE UPDATE ON default_coins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_position_status_updated_at BEFORE UPDATE ON position_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default coins data (totaling 100%)
INSERT INTO default_coins (coin_symbol, target_percentage, display_order) VALUES 
  ('ENAUSDT', 12.50, 1),
  ('TAOUSDT', 12.50, 2),
  ('SUIUSDT', 12.50, 3),
  ('UNIUSDT', 15.00, 4),
  ('APTUSDT', 15.00, 5),
  ('AVAXUSDT', 15.00, 6),
  ('PUMPUSDT', 10.00, 7),
  ('SOLUSDT', 7.50, 8)
ON CONFLICT (coin_symbol) DO UPDATE SET 
  target_percentage = EXCLUDED.target_percentage,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

-- Verify tables were created
SELECT 'Database initialized successfully!' as status;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
