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



// Helper function to create Bybit signature
function createBybitSignature(params: string, secretKey: string): string {
  return crypto.createHmac('sha256', secretKey).update(params).digest('hex');
}

// Helper function to make Bybit API request
async function makeBybitRequest(endpoint: string, apiKey: string, secretKey: string, params: Record<string, string> = {}) {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  const queryString = Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  // Bybit V5 signature format: timestamp + apiKey + recvWindow + queryString
  const signaturePayload = timestamp + apiKey + recvWindow + queryString;
  const signature = createBybitSignature(signaturePayload, secretKey);
  
  const url = queryString ? 
    `https://api.bybit.com${endpoint}?${queryString}` : 
    `https://api.bybit.com${endpoint}`;
  
  const response = await fetch(url, {
    headers: {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-SIGN-TYPE': '2',
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': recvWindow,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bybit API Error ${response.status}: ${errorText}`);
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
    // Get current prices from Bybit
    const tickerResponse = await fetch('https://api.bybit.com/v5/market/tickers?category=spot');
    if (!tickerResponse.ok) {
      throw new Error('Failed to fetch prices from Bybit');
    }
    const tickerData = await tickerResponse.json();
    
    // Convert to price lookup object
    const tickerPrices: Record<string, string> = {};
    if (tickerData.result && tickerData.result.list && Array.isArray(tickerData.result.list)) {
      tickerData.result.list.forEach((ticker: { symbol: string; lastPrice: string }) => {
        tickerPrices[ticker.symbol] = ticker.lastPrice;
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
        // Get trading history for this asset from Bybit
        const tradesResponse = await makeBybitRequest('/v5/execution/list', apiKey, secretKey, {
          category: 'spot',
          symbol: symbol,
          limit: '1000' // Get last 1000 trades
        });
        
        const trades: Trade[] = tradesResponse.result?.list || [];

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
