import { NextRequest, NextResponse } from 'next/server';
import Binance from 'binance-api-node';

export async function POST(request: NextRequest) {
  try {
    const { apiKey, secretKey } = await request.json();

    if (!apiKey || !secretKey) {
      return NextResponse.json(
        { error: 'API Key and Secret Key are required' },
        { status: 400 }
      );
    }

    // Create Binance client
    const client = Binance({
      apiKey: apiKey,
      apiSecret: secretKey
    });

    // Get account balances
    const accountInfo = await client.accountInfo();
    
    // Filter only spot balances with non-zero amounts
    const spotBalances = accountInfo.balances.filter(
      (balance: any) => parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
    );

    // Get current prices for all coins
    const tickerPrices = await client.prices();
    
    // Calculate USD values and total balance
    let totalBalance = 0;
    const balances: Record<string, number> = {};

    for (const balance of spotBalances) {
      const asset = balance.asset;
      const freeAmount = parseFloat(balance.free);
      const lockedAmount = parseFloat(balance.locked);
      const totalAmount = freeAmount + lockedAmount;

      if (totalAmount > 0) {
        let usdValue = 0;

        if (asset === 'USDT' || asset === 'USD') {
          usdValue = totalAmount;
        } else {
          // Try to find USD pair price
          const usdtPair = `${asset}USDT`;
          const btcPair = `${asset}BTC`;
          const btcUsdtPrice = tickerPrices.BTCUSDT;

          if (tickerPrices[usdtPair]) {
            usdValue = totalAmount * parseFloat(tickerPrices[usdtPair]);
          } else if (tickerPrices[btcPair] && btcUsdtPrice) {
            const btcPrice = parseFloat(tickerPrices[btcPair]);
            const btcUsdtValue = parseFloat(btcUsdtPrice);
            usdValue = totalAmount * btcPrice * btcUsdtValue;
          }
        }

        balances[asset] = totalAmount;
        totalBalance += usdValue;
      }
    }

    return NextResponse.json({
      balances,
      totalBalance,
      spotBalances: spotBalances.map((balance: any) => ({
        asset: balance.asset,
        free: balance.free,
        locked: balance.locked
      }))
    });

  } catch (error) {
    console.error('Error fetching balances:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balances from Binance' },
      { status: 500 }
    );
  }
} 