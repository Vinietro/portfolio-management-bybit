import { NextRequest, NextResponse } from 'next/server';
import Binance from 'binance-api-node';
import crypto from 'crypto';

interface Trade {
  id: number;
  price: string;
  qty: string;
  quoteQty: string;
  time: number;
  isBuyer: boolean;
  isMaker: boolean;
}

interface PnlData {
  asset: string;
  totalQuantity: number;
  averagePrice: number;
  currentPrice: number;
  totalValue: number;
  totalCost: number;
  pnl: number;
  pnlPercentage: number;
}

// Helper function to create signed request
async function makeSignedRequest(endpoint: string, apiKey: string, secretKey: string, params: Record<string, string> = {}) {
  const timestamp = Date.now().toString();
  const queryString = Object.entries({ ...params, timestamp })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('hex');

  const url = `https://api.binance.com${endpoint}?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    headers: {
      'X-MBX-APIKEY': apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

export async function POST(request: NextRequest) {
  try {
    const { apiKey, secretKey, assets } = await request.json();

    if (!apiKey || !secretKey) {
      return NextResponse.json(
        { error: 'API Key and Secret Key are required' },
        { status: 400 }
      );
    }

    if (!assets || !Array.isArray(assets)) {
      return NextResponse.json(
        { error: 'Assets array is required' },
        { status: 400 }
      );
    }

    // Create Binance client
    const client = Binance({
      apiKey: apiKey,
      apiSecret: secretKey
    });

    // Get current prices
    const tickerPrices = await client.prices();
    
    const pnlData: PnlData[] = [];

    for (const asset of assets) {
      if (asset === 'USDT' || asset === 'USD') {
        // Skip USDT/USD as they don't have PNL
        continue;
      }

      try {
        // Get trading history for this asset
        const symbol = `${asset}USDT`;
        const trades: Trade[] = await makeSignedRequest('/api/v3/myTrades', apiKey, secretKey, {
          symbol: symbol,
          limit: '1000' // Get last 1000 trades
        });

        if (trades.length === 0) {
          continue;
        }

        // Calculate average purchase price and total quantity
        let totalBuyQuantity = 0;
        let totalBuyCost = 0;
        let totalSellQuantity = 0;

        for (const trade of trades) {
          const quantity = parseFloat(trade.qty);
          const value = parseFloat(trade.quoteQty);

          if (trade.isBuyer) {
            // Buy trade
            totalBuyQuantity += quantity;
            totalBuyCost += value;
          } else {
            // Sell trade
            totalSellQuantity += quantity;
          }
        }

        // Calculate remaining quantity and average price
        const netQuantity = totalBuyQuantity - totalSellQuantity;
        
        if (netQuantity <= 0) {
          // No remaining position
          continue;
        }

        // Calculate average purchase price for remaining quantity
        // This is a simplified calculation - in reality, you'd need FIFO or LIFO accounting
        const averagePrice = totalBuyCost / totalBuyQuantity;
        const currentPrice = parseFloat(tickerPrices[symbol] || '0');
        const totalValue = netQuantity * currentPrice;
        const totalCost = netQuantity * averagePrice;
        const pnl = totalValue - totalCost;
        const pnlPercentage = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

        pnlData.push({
          asset,
          totalQuantity: netQuantity,
          averagePrice,
          currentPrice,
          totalValue,
          totalCost,
          pnl,
          pnlPercentage
        });

      } catch (error) {
        console.log(`Error fetching PNL for ${asset}:`, error);
        // Continue with other assets even if one fails
      }
    }

    return NextResponse.json({ pnlData });

  } catch (error: unknown) {
    console.error('Error fetching PNL data:', error);
    
    let errorMessage = 'Failed to fetch PNL data from Binance';
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
          errorMessage = `API Error (${errorCode}): Failed to fetch PNL data`;
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