import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// Initialize Neon client
const sql = neon(process.env.DATABASE_URL!);

// Helper function to validate that percentages sum to 100%
function validatePortfolioPercentages(coins: { coin: string; targetPercent: number }[]): { valid: boolean; total: number; message?: string } {
  const total = coins.reduce((sum, coin) => sum + coin.targetPercent, 0);
  
  if (Math.abs(total - 100) > 0.01) { // Allow small floating point differences
    return {
      valid: false,
      total,
      message: `Portfolio allocation must sum to exactly 100%. Current total: ${total.toFixed(2)}%`
    };
  }
  
  return { valid: true, total };
}

export async function GET() {
  try {
    // Fetch active default coins from database
    const rows = await sql`
      SELECT coin_symbol, target_percentage, display_order 
      FROM default_coins 
      WHERE is_active = true 
      ORDER BY display_order ASC
    `;

    // Transform data for frontend
    const defaultCoins = rows.map(row => ({
      coin: row.coin_symbol,
      targetPercent: parseFloat(row.target_percentage),
      display_order: row.display_order
    }));

    // If no default coins found in database, use fallback
    if (defaultCoins.length === 0) {
      console.log('No default coins found in database, using fallback');
      const fallbackCoins = [
        { coin: 'ENAUSDT', targetPercent: 12.50 },
        { coin: 'TAOUSDT', targetPercent: 12.50 },
        { coin: 'SUIUSDT', targetPercent: 12.50 },
        { coin: 'UNIUSDT', targetPercent: 15.00 },
        { coin: 'APTUSDT', targetPercent: 15.00 },
        { coin: 'AVAXUSDT', targetPercent: 15.00 },
        { coin: 'PUMPUSDT', targetPercent: 10.00 },
        { coin: 'SOLUSDT', targetPercent: 7.50 }
      ];
      
      return NextResponse.json({ coins: fallbackCoins });
    }

    return NextResponse.json({ coins: defaultCoins });
  } catch (error) {
    console.error('Error fetching default coins from database:', error);
    
    // Fallback to hardcoded defaults if database fails
    const fallbackCoins = [
      { coin: 'ENAUSDT', targetPercent: 12.50 },
      { coin: 'TAOUSDT', targetPercent: 12.50 },
      { coin: 'SUIUSDT', targetPercent: 12.50 },
      { coin: 'UNIUSDT', targetPercent: 15.00 },
      { coin: 'APTUSDT', targetPercent: 15.00 },
      { coin: 'AVAXUSDT', targetPercent: 15.00 },
      { coin: 'PUMPUSDT', targetPercent: 10.00 },
      { coin: 'SOLUSDT', targetPercent: 7.50 }
    ];
    
    return NextResponse.json({ coins: fallbackCoins });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { coins } = await request.json();

    if (!coins || !Array.isArray(coins)) {
      return NextResponse.json(
        { error: 'Invalid request. Expected array of coins.' },
        { status: 400 }
      );
    }

    // Validate that percentages sum to 100%
    const validation = validatePortfolioPercentages(coins);
    if (!validation.valid) {
      return NextResponse.json(
        { 
          error: validation.message,
          total: validation.total
        },
        { status: 400 }
      );
    }

    // Update coins in database
    await sql.begin(async (tx) => {
      // First, deactivate all existing coins
      await tx`UPDATE default_coins SET is_active = false`;
      
      // Insert or update new coins
      for (let i = 0; i < coins.length; i++) {
        const coin = coins[i];
        await tx`
          INSERT INTO default_coins (coin_symbol, target_percentage, display_order, is_active)
          VALUES (${coin.coin}, ${coin.targetPercent}, ${i + 1}, true)
          ON CONFLICT (coin_symbol) 
          DO UPDATE SET 
            target_percentage = EXCLUDED.target_percentage,
            display_order = EXCLUDED.display_order,
            is_active = EXCLUDED.is_active,
            updated_at = NOW()
        `;
      }
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Portfolio updated successfully',
      total: validation.total
    });

  } catch (error) {
    console.error('Error updating default coins:', error);
    return NextResponse.json(
      { error: 'Failed to update portfolio' },
      { status: 500 }
    );
  }
}