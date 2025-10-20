import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Removed unused interface

interface BybitPriceResponse {
  symbol: string;
  price: string;
}
import { calculatePnlData } from '../../lib/pnl-calculator';

interface BybitBalance {
  asset: string;
  free: string;
  locked: string;
}

interface BybitAccountInfo {
  balances: BybitBalance[];
}



interface WalletBalance {
  asset: string;
  free: string;
  locked: string;
  usdValue: number;
  wallet: string;
  pnl?: number;
  pnlPercentage?: number;
}

// Helper function to create Bybit API signature
function createBybitSignature(params: string, secretKey: string): string {
  return crypto
    .createHmac('sha256', secretKey)
    .update(params)
    .digest('hex');
}

// Helper function to make Bybit Futures API request
async function makeBybitFuturesRequest(endpoint: string, apiKey: string, secretKey: string, params: Record<string, string> = {}) {
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
  
  console.log('🌐 Making Bybit Futures API request to:', url);
  console.log('🔐 Signature payload:', signaturePayload);
  
  const response = await fetch(url, {
    method: 'GET',
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
    console.error('❌ Bybit Futures API Error:', response.status, errorText);
    throw new Error(`Bybit Futures API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Helper function to get futures account info from Bybit
async function getBybitFuturesAccountInfo(apiKey: string, secretKey: string): Promise<BybitAccountInfo> {
  console.log('🔍 Fetching futures balance from Bybit...');
  
  try {
    const response = await makeBybitFuturesRequest('/v5/account/wallet-balance', apiKey, secretKey, { accountType: 'UNIFIED' });
    
    console.log('📊 Bybit Futures Balance Response:', JSON.stringify(response, null, 2));
    
    // Parse Bybit V5 API response structure
    const balances: Array<{
      asset: string;
      free: string;
      locked: string;
    }> = [];
    
    // Bybit V5 response structure: response.result.list[].coin[].walletBalance
    if (response.result?.list && Array.isArray(response.result.list)) {
      for (const account of response.result.list) {
        if (account.coin && Array.isArray(account.coin)) {
          for (const coin of account.coin) {
            const freeAmount = coin.availableToWithdraw || coin.walletBalance || '0';
            const lockedAmount = coin.locked || '0';
            
            // Only include coins with non-zero balance
            if (parseFloat(freeAmount) > 0 || parseFloat(lockedAmount) > 0) {
              balances.push({
                asset: coin.coin,
                free: freeAmount,
                locked: lockedAmount
              });
            }
          }
        }
      }
    }
    
    console.log('🔄 Transformed balances:', balances);
    
    return { balances };
    
  } catch (error) {
    console.error('❌ Error fetching futures balance, trying spot balance as fallback:', error);
    
    // Fallback to spot balance if futures fails
    try {
      const spotResponse = await fetch(`https://api.bybit.com/v5/account/wallet-balance?accountType=SPOT&timestamp=${Date.now()}`, {
        method: 'GET',
        headers: {
          'X-BAPI-API-KEY': apiKey,
        },
      });
      
      if (spotResponse.ok) {
        const spotData = await spotResponse.json();
        console.log('📊 Bybit Spot Balance Response (fallback):', JSON.stringify(spotData, null, 2));
        
        const balances: Array<{
          asset: string;
          free: string;
          locked: string;
        }> = [];
        
        if (spotData.result?.list && Array.isArray(spotData.result.list)) {
          for (const account of spotData.result.list) {
            if (account.coin && Array.isArray(account.coin)) {
              for (const coin of account.coin) {
                const freeAmount = coin.availableToWithdraw || coin.walletBalance || '0';
                const lockedAmount = coin.locked || '0';
                
                if (parseFloat(freeAmount) > 0 || parseFloat(lockedAmount) > 0) {
                  balances.push({
                    asset: coin.coin,
                    free: freeAmount,
                    locked: lockedAmount
                  });
                }
              }
            }
          }
        }
        
        console.log('🔄 Transformed spot balances (fallback):', balances);
        return { balances };
      }
    } catch (spotError) {
      console.error('❌ Spot balance fallback also failed:', spotError);
    }
    
    throw error;
  }
}

// Helper function to get current futures prices from Bybit
async function getBybitFuturesPrices(): Promise<Record<string, string>> {
  const response = await fetch('https://api.bybit.com/v5/market/tickers?category=linear');
  
  if (!response.ok) {
    throw new Error(`Failed to fetch futures prices: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Transform to match expected format
  const prices: Record<string, string> = {};
  if (data.result?.list && Array.isArray(data.result.list)) {
    data.result.list.forEach((item: BybitPriceResponse) => {
      prices[item.symbol] = item.price;
    });
  }
  
  return prices;
}

// Helper function to get futures positions from Bybit
async function getBybitFuturesPositions(apiKey: string, secretKey: string): Promise<Record<string, number>> {
  console.log('🔍 Fetching futures positions from Bybit...');
  
  try {
    // Get linear futures positions
    const response = await makeBybitFuturesRequest('/v5/position/list', apiKey, secretKey, { 
      category: 'linear',
      settleCoin: 'USDT'
    });
    
    console.log('📊 Bybit Futures Positions Response:', JSON.stringify(response, null, 2));
    
    const positions: Record<string, number> = {};
    
    // Parse Bybit V5 API response structure
    if (response.result?.list && Array.isArray(response.result.list)) {
      for (const position of response.result.list) {
        const size = parseFloat(position.size || '0');
        const markPrice = parseFloat(position.markPrice || '0');
        const positionValue = Math.abs(size * markPrice);
        
        // Only include positions with non-zero size
        if (positionValue > 0) {
          // Extract base asset from symbol (e.g., HYPEUSDT -> HYPE)
          const symbol = position.symbol;
          const baseAsset = symbol.replace('USDT', '');
          
          positions[baseAsset] = positionValue;
          console.log(`📈 Position: ${symbol} (${baseAsset}) = ${positionValue} USD`);
        }
      }
    }
    
    console.log('🔄 Transformed positions:', positions);
    return positions;
    
  } catch (error) {
    console.error('❌ Error fetching futures positions:', error);
    return {};
  }
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

    // Get current prices from Bybit
    const tickerPrices = await getBybitFuturesPrices();
    
    // Get futures positions from Bybit
    const futuresPositions = await getBybitFuturesPositions(apiKey, secretKey);
    
    // Calculate USD values and total balance
    let totalBalance = 0;
    const balances: Record<string, number> = {};
    const walletBalances: Record<string, WalletBalance[]> = {
      futures: []
    };

    // Get Futures wallet balances from Bybit
    const accountInfo: BybitAccountInfo = await getBybitFuturesAccountInfo(apiKey, secretKey);
    console.log('📈 Raw account info:', accountInfo);
    
    const futuresBalances = accountInfo.balances.filter(
      (balance: BybitBalance) => parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
    );
    
    console.log('💰 Filtered futures balances with non-zero amounts:', futuresBalances);

    // Get PNL data for futures wallet coins
    const futuresAssets = futuresBalances.map(balance => balance.asset).filter(asset => asset !== 'USDT' && asset !== 'USD');
    const pnlData = await calculatePnlData(apiKey, secretKey, futuresAssets);



    // Process all balances and calculate USD values
    const allBalances = [
      ...futuresBalances.map(b => ({ ...b, wallet: 'futures' }))
    ];

    for (const balance of allBalances) {
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

        // Add to total balances (combining all wallets)
        balances[asset] = (balances[asset] || 0) + usdValue;
        totalBalance += usdValue;

        // Store wallet-specific balances
        const pnlInfo = pnlData[balance.asset];
        walletBalances.futures.push({
          asset: balance.asset,
          free: balance.free,
          locked: balance.locked,
          usdValue,
          wallet: balance.wallet,
          pnl: pnlInfo?.pnl,
          pnlPercentage: pnlInfo?.pnlPercentage
        });
      }
    }

    // Add futures positions to balances (this is the key addition for futures data)
    console.log('🎯 Adding futures positions to balances:', futuresPositions);
    for (const [asset, positionValue] of Object.entries(futuresPositions)) {
      // Add position value to balances
      balances[asset] = (balances[asset] || 0) + positionValue;
      totalBalance += positionValue;
      
      console.log(`📊 Added futures position: ${asset} = ${positionValue} USD (Total: ${totalBalance} USD)`);
    }

    const response = {
      balances,
      totalBalance,
      walletBalances,
      futuresBalances: futuresBalances.map((balance: BybitBalance) => ({
        asset: balance.asset,
        free: balance.free,
        locked: balance.locked
      })),
    };
    
    console.log('🎯 Final balance response:', JSON.stringify(response, null, 2));
    
    return NextResponse.json(response);

  } catch (error: unknown) {
    console.error('Error fetching balances:', error);
    
    let errorMessage = 'Failed to fetch futures balances from Bybit';
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
          errorMessage = 'API key does not have the required permissions. Please check your API key permissions in Bybit.';
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
        case -1015:
          errorMessage = 'Too many requests. Please wait before refreshing again.';
          statusCode = 429;
          break;
        default:
          errorMessage = `API Error (${errorCode}): Failed to fetch balances`;
      }
    } else if (error && typeof error === 'object' && 'message' in error) {
      const errorMsg = error.message as string;
      if (errorMsg.includes('Too much request weight used')) {
        errorMessage = 'Rate limit exceeded. Please wait 1 minute before refreshing again.';
        statusCode = 429;
      } else if (errorMsg.includes('request weight')) {
        errorMessage = 'API rate limit reached. Please wait before making more requests.';
        statusCode = 429;
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