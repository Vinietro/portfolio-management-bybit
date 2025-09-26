import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// Initialize Neon client
const sql = neon(process.env.DATABASE_URL!);

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
        { coin: 'ENAUSDT', targetPercent: 10.00 },
        { coin: 'TAOUSDT', targetPercent: 10.00 },
        { coin: 'SUIUSDT', targetPercent: 10.00 },
        { coin: 'UNIUSDT', targetPercent: 12.00 },
        { coin: 'APTUSDT', targetPercent: 12.00 },
        { coin: 'AVAXUSDT', targetPercent: 12.00 },
        { coin: 'PUMPUSDT', targetPercent: 8.00 },
        { coin: 'SOLUSDT', targetPercent: 8.00 }
      ];
      
      return NextResponse.json({ coins: fallbackCoins });
    }

    return NextResponse.json({ coins: defaultCoins });
  } catch (error) {
    console.error('Error fetching default coins from database:', error);
    
    // Fallback to hardcoded defaults if database fails
    const fallbackCoins = [
      { coin: 'ENAUSDT', targetPercent: 10.00 },
      { coin: 'TAOUSDT', targetPercent: 10.00 },
      { coin: 'SUIUSDT', targetPercent: 10.00 },
      { coin: 'UNIUSDT', targetPercent: 12.00 },
      { coin: 'APTUSDT', targetPercent: 12.00 },
      { coin: 'AVAXUSDT', targetPercent: 12.00 },
      { coin: 'PUMPUSDT', targetPercent: 8.00 },
      { coin: 'SOLUSDT', targetPercent: 8.00 }
    ];
    
    return NextResponse.json({ coins: fallbackCoins });
  }
}
