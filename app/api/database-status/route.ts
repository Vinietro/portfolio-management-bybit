import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// Initialize Neon client
const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  try {
    // Check if required tables exist
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `;

    const tableNames = tables.map(row => row.table_name);
    
    // Check for required tables
    const requiredTables = [
      'trading_transactions',
      'position_status', 
      'default_coins',
      'users',
      'portfolios',
      'credentials',
      'sync_log'
    ];

    const missingTables = requiredTables.filter(table => !tableNames.includes(table));
    const existingTables = requiredTables.filter(table => tableNames.includes(table));

    // Check if trading_transactions has any data
    let transactionCount = 0;
    if (tableNames.includes('trading_transactions')) {
      try {
        const countResult = await sql`SELECT COUNT(*) as count FROM trading_transactions`;
        transactionCount = parseInt(countResult[0]?.count || '0');
      } catch (error) {
        console.error('Error counting transactions:', error);
      }
    }

    // Check default coins
    let defaultCoinsCount = 0;
    let defaultCoinsTotal = 0;
    if (tableNames.includes('default_coins')) {
      try {
        const coinsResult = await sql`
          SELECT COUNT(*) as count, SUM(target_percentage) as total 
          FROM default_coins 
          WHERE is_active = true
        `;
        defaultCoinsCount = parseInt(coinsResult[0]?.count || '0');
        defaultCoinsTotal = parseFloat(coinsResult[0]?.total || '0');
      } catch (error) {
        console.error('Error counting default coins:', error);
      }
    }

    return NextResponse.json({
      success: true,
      database: {
        tables: {
          existing: existingTables,
          missing: missingTables,
          all: tableNames
        },
        data: {
          trading_transactions: transactionCount,
          default_coins: {
            count: defaultCoinsCount,
            total_percentage: defaultCoinsTotal
          }
        },
        status: missingTables.length === 0 ? 'healthy' : 'needs_initialization'
      }
    });

  } catch (error) {
    console.error('Database status check error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to check database status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    // Initialize database with required tables
    console.log('🔧 Initializing database...');

    // Create trading transactions table
    await sql`
      CREATE TABLE IF NOT EXISTS trading_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        api_key_hash TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        quantity NUMERIC(20,8) NOT NULL,
        price NUMERIC(20,8) NOT NULL,
        total_value NUMERIC(20,8) NOT NULL,
        transaction_type TEXT NOT NULL CHECK (transaction_type IN ('entry', 'exit')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Create position status table
    await sql`
      CREATE TABLE IF NOT EXISTS position_status (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        api_key_hash TEXT NOT NULL,
        symbol TEXT NOT NULL,
        is_open BOOLEAN DEFAULT FALSE,
        last_transaction_type TEXT,
        last_transaction_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(api_key_hash, symbol)
      )
    `;

    // Create other required tables
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        device_id TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS portfolios (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        portfolio_data JSONB NOT NULL,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
        encrypted_credentials TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS sync_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        table_name TEXT NOT NULL,
        record_id UUID NOT NULL,
        operation TEXT NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        device_id TEXT NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS default_coins (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        coin_symbol TEXT NOT NULL UNIQUE,
        target_percentage NUMERIC(5,2) NOT NULL CHECK (target_percentage >= 0 AND target_percentage <= 100),
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS idx_trading_transactions_api_key ON trading_transactions(api_key_hash)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_trading_transactions_symbol ON trading_transactions(symbol)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_position_status_api_key ON position_status(api_key_hash)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_position_status_symbol ON position_status(symbol)`;

    // Insert default coins if they don't exist
    await sql`
      INSERT INTO default_coins (coin_symbol, target_percentage, display_order) VALUES 
        ('ENAUSDT', 12.50, 1),
        ('TAOUSDT', 12.50, 2),
        ('SUIUSDT', 12.50, 3),
        ('UNIUSDT', 15.00, 4),
        ('APTUSDT', 15.00, 5),
        ('AVAXUSDT', 15.00, 6),
        ('PUMPUSDT', 10.00, 7),
        ('SOLUSDT', 7.50, 8)
      ON CONFLICT (coin_symbol) DO NOTHING
    `;

    console.log('✅ Database initialized successfully');

    return NextResponse.json({
      success: true,
      message: 'Database initialized successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Database initialization error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to initialize database',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
