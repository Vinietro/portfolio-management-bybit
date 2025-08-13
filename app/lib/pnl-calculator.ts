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

export async function calculatePnlData(apiKey: string, secretKey: string, assets: string[]): Promise<Record<string, { pnl: number; pnlPercentage: number }>> {
  const pnlData: Record<string, { pnl: number; pnlPercentage: number }> = {};

  if (assets.length === 0) {
    return pnlData;
  }

  try {
    // Create Binance client
    const client = Binance({
      apiKey: apiKey,
      apiSecret: secretKey
    });

    // Get current prices
    const tickerPrices = await client.prices();

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
        const averagePrice = totalBuyCost / totalBuyQuantity;
        const currentPrice = parseFloat(tickerPrices[symbol] || '0');
        const totalValue = netQuantity * currentPrice;
        const totalCost = netQuantity * averagePrice;
        const pnl = totalValue - totalCost;
        const pnlPercentage = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

        pnlData[asset] = {
          pnl,
          pnlPercentage
        };

      } catch (error) {
        console.log(`Error fetching PNL for ${asset}:`, error);
        // Continue with other assets even if one fails
      }
    }
  } catch (error) {
    console.log('Failed to fetch PNL data:', error);
  }

  return pnlData;
}
