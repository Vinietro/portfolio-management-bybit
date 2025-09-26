-- Portfolio Management Database Schema
-- For Vercel Postgres

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

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_credentials_user_id ON credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_user_id ON sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_timestamp ON sync_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_default_coins_active ON default_coins(is_active);
CREATE INDEX IF NOT EXISTS idx_default_coins_order ON default_coins(display_order);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_api_key ON trading_transactions(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_symbol ON trading_transactions(symbol);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_created_at ON trading_transactions(created_at);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portfolios_updated_at BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credentials_updated_at BEFORE UPDATE ON credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_default_coins_updated_at BEFORE UPDATE ON default_coins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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

-- Insert default coins data
INSERT INTO default_coins (coin_symbol, target_percentage, display_order) VALUES 
  ('ENAUSDT', 10.00, 1),
  ('TAOUSDT', 10.00, 2),
  ('SUIUSDT', 10.00, 3),
  ('UNIUSDT', 12.00, 4),
  ('APTUSDT', 12.00, 5),
  ('AVAXUSDT', 12.00, 6),
  ('PUMPUSDT', 8.00, 7),
  ('SOLUSDT', 8.00, 8)
ON CONFLICT (coin_symbol) DO UPDATE SET 
  target_percentage = EXCLUDED.target_percentage,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

