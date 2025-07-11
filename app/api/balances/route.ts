import { NextRequest, NextResponse } from 'next/server';
import Binance from 'binance-api-node';

interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

interface BinanceAccountInfo {
  balances: BinanceBalance[];
}

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
    const accountInfo: BinanceAccountInfo = await client.accountInfo();
    
    // Filter only spot balances with non-zero amounts
    const spotBalances = accountInfo.balances.filter(
      (balance: BinanceBalance) => parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
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
      spotBalances: spotBalances.map((balance: BinanceBalance) => ({
        asset: balance.asset,
        free: balance.free,
        locked: balance.locked
      }))
    });

  } catch (error: unknown) {
    console.error('Error fetching balances:', error);
    
    let errorMessage = 'Failed to fetch balances from Binance';
    let statusCode = 500;
    let errorCode: number | undefined;

    if (error && typeof error === 'object' && 'code' in error) {
      errorCode = error.code as number;
      
      switch (errorCode) {
        case -1022:
          errorMessage = 'Signature validation failed. Please check your API credentials and try again.';
          statusCode = 401;
          break;
        case -2015:
        case -2014:
        case -2013:
          errorMessage = 'Invalid API credentials. Please verify your API key and secret.';
          statusCode = 401;
          break;
        case -2011:
          errorMessage = 'API key does not have the required permissions. Please check your API key permissions in Binance.';
          statusCode = 401;
          break;
        case -1001:
          errorMessage = 'Request timeout. Please try again.';
          statusCode = 408;
          break;
        case -1003:
          errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
          statusCode = 429;
          break;
        default:
          errorMessage = `API Error (${errorCode}): Failed to fetch balances`;
      }
    }

    return NextResponse.json(
      { 
        error: errorMessage,
        code: errorCode
      },
      { status: statusCode }
    );
  }
} 