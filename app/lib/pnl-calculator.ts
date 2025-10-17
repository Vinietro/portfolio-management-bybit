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



// Helper function to create BingX signature
function createBingXSignature(params: string, secretKey: string): string {
  return crypto.createHmac('sha256', secretKey).update(params).digest('hex');
}

// Helper function to make BingX API request
async function makeBingXRequest(endpoint: string, apiKey: string, secretKey: string, params: Record<string, string> = {}) {
  const timestamp = Date.now().toString();
  const queryString = Object.entries({ ...params, timestamp })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  const signature = createBingXSignature(queryString, secretKey);
  const url = `https://open-api.bingx.com${endpoint}?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    headers: {
      'X-BX-APIKEY': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BingX API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

// List of known invalid/dust tokens to skip for PNL calculation
const INVALID_ASSETS = ['LDUSDT', 'LDUSDC', 'LDUSD', 'AGI', 'REWARD', 'DIGITAL', 'SHIB', 'BABYDOGE']; // Add more as needed

export async function calculatePnlData(apiKey: string, secretKey: string, assets: string[]): Promise<Record<string, { pnl: number; pnlPercentage: number }>> {
  const pnlData: Record<string, { pnl: number; pnlPercentage: number }> = {};

  if (assets.length === 0) {
    return pnlData;
  }

  try {
    // Get current prices from BingX
    const tickerResponse = await fetch('https://open-api.bingx.com/openApi/spot/v1/ticker/price');
    if (!tickerResponse.ok) {
      throw new Error('Failed to fetch prices from BingX');
    }
    const tickerData = await tickerResponse.json();
    
    // Convert to price lookup object
    const tickerPrices: Record<string, string> = {};
    if (tickerData.data && Array.isArray(tickerData.data)) {
      tickerData.data.forEach((ticker: { symbol: string; price: string }) => {
        tickerPrices[ticker.symbol] = ticker.price;
      });
    }

    for (const asset of assets) {
      if (asset === 'USDT' || asset === 'USD') {
        // Skip USDT/USD as they don't have PNL
        continue;
      }
      
      // Skip known invalid/dust tokens
      if (INVALID_ASSETS.includes(asset.toUpperCase())) {
        console.log(`Skipping ${asset}: Known invalid/dust token`);
        continue;
      }
      
      // Check if this is a valid symbol by seeing if it has a trading pair
      const symbol = `${asset}USDT`;
      if (!tickerPrices[symbol]) {
        console.log(`Skipping ${asset}: ${symbol} not a valid trading pair`);
        continue;
      }
      
      // Additional validation - check if asset seems like dust/reward coin
      if (asset.startsWith('LD') || asset.startsWith('DIGITAL') || asset.length > 10) {
        console.log(`Skipping ${asset}: Pattern indicates reward/dust token`);
        continue;
      }

      try {
        // Get trading history for this asset from BingX
        const tradesResponse = await makeBingXRequest('/openApi/spot/v1/trade/history', apiKey, secretKey, {
          symbol: symbol,
          limit: '1000' // Get last 1000 trades
        });
        
        const trades: Trade[] = tradesResponse.data || [];

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
        // Handle specific error types gracefully
        if (error instanceof Error && error.message.includes('-1121')) {
          console.log(`Skipping ${asset}: Symbol ${asset}USDT not found or invalid (likely dust/reward token)`);
        } else if (error instanceof Error && error.message.includes('Invalid symbol')) {
          console.log(`Skipping ${asset}: Symbol ${asset}USDT is not a valid trading pair`);
        } else {
          console.log(`Error fetching PNL for ${asset}:`, error);
        }
        // Continue with other assets even if one fails
      }
    }
  } catch (error) {
    console.log('Failed to fetch PNL data:', error);
  }

  return pnlData;
}
