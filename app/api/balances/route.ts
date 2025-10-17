import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { calculatePnlData } from '../../lib/pnl-calculator';

interface BingXBalance {
  asset: string;
  free: string;
  locked: string;
}

interface BingXAccountInfo {
  balances: BingXBalance[];
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

// Helper function to create BingX API signature
function createBingXSignature(params: string, secretKey: string): string {
  return crypto
    .createHmac('sha256', secretKey)
    .update(params)
    .digest('hex');
}

// Helper function to make BingX Futures API request
async function makeBingXFuturesRequest(endpoint: string, apiKey: string, secretKey: string, params: Record<string, string> = {}) {
  const timestamp = Date.now().toString();
  const queryString = Object.entries({ ...params, timestamp })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  const signature = createBingXSignature(queryString, secretKey);
  const url = `https://open-api.bingx.com${endpoint}?${queryString}&signature=${signature}`;
  
  console.log('🌐 Making BingX Futures API request to:', url);
  
  const response = await fetch(url, {
    method: 'GET', // Futures balance endpoint should be GET
    headers: {
      'X-BX-APIKEY': apiKey,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('❌ BingX Futures API Error:', response.status, errorText);
    throw new Error(`BingX Futures API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Helper function to get futures account info from BingX
async function getBingXFuturesAccountInfo(apiKey: string, secretKey: string): Promise<BingXAccountInfo> {
  console.log('🔍 Fetching futures balance from BingX...');
  
  try {
    const response = await makeBingXFuturesRequest('/openApi/swap/v2/user/balance', apiKey, secretKey);
    
    console.log('📊 BingX Futures Balance Response:', JSON.stringify(response, null, 2));
    
    // Try different possible response structures
    let balances: any[] = [];
    
    // Structure 1: response.data.balance (single balance object)
    if (response.data?.balance) {
      const balance = response.data.balance;
      balances = [{
        asset: balance.asset,
        free: balance.balance || balance.availableBalance || '0',
        locked: balance.lockedBalance || balance.locked || '0'
      }];
    }
    // Structure 2: response.data.assets (array of assets)
    else if (response.data?.assets) {
      balances = response.data.assets.map((balance: any) => ({
        asset: balance.asset,
        free: balance.availableBalance || balance.free || '0',
        locked: balance.lockedBalance || balance.locked || '0'
      }));
    }
    // Structure 3: response.balances
    else if (response.balances) {
      balances = response.balances.map((balance: any) => ({
        asset: balance.asset,
        free: balance.free || '0',
        locked: balance.locked || '0'
      }));
    }
    // Structure 4: direct array
    else if (Array.isArray(response)) {
      balances = response.map((balance: any) => ({
        asset: balance.asset,
        free: balance.free || balance.availableBalance || '0',
        locked: balance.locked || balance.lockedBalance || '0'
      }));
    }
    
    console.log('🔄 Transformed balances:', balances);
    
    return { balances };
    
  } catch (error) {
    console.error('❌ Error fetching futures balance, trying spot balance as fallback:', error);
    
    // Fallback to spot balance if futures fails
    try {
      const spotResponse = await fetch(`https://open-api.bingx.com/openApi/spot/v1/account?timestamp=${Date.now()}`, {
        method: 'GET',
        headers: {
          'X-BX-APIKEY': apiKey,
        },
      });
      
      if (spotResponse.ok) {
        const spotData = await spotResponse.json();
        console.log('📊 BingX Spot Balance Response (fallback):', JSON.stringify(spotData, null, 2));
        
        const balances = spotData.balances?.map((balance: any) => ({
          asset: balance.asset,
          free: balance.free || '0',
          locked: balance.locked || '0'
        })) || [];
        
        console.log('🔄 Transformed spot balances (fallback):', balances);
        return { balances };
      }
    } catch (spotError) {
      console.error('❌ Spot balance fallback also failed:', spotError);
    }
    
    throw error;
  }
}

// Helper function to get current futures prices from BingX
async function getBingXFuturesPrices(): Promise<Record<string, string>> {
  const response = await fetch('https://open-api.bingx.com/openApi/swap/v2/quote/price');
  
  if (!response.ok) {
    throw new Error(`Failed to fetch futures prices: ${response.status}`);
  }
  
  const data = await response.json();
  
  // Transform to match expected format
  const prices: Record<string, string> = {};
  if (data.data) {
    data.data.forEach((item: any) => {
      prices[item.symbol] = item.price;
    });
  }
  
  return prices;
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

    // Get current prices from BingX
    const tickerPrices = await getBingXFuturesPrices();
    
    // Calculate USD values and total balance
    let totalBalance = 0;
    const balances: Record<string, number> = {};
    const walletBalances: Record<string, WalletBalance[]> = {
      futures: []
    };

    // Get Futures wallet balances from BingX
    const accountInfo: BingXAccountInfo = await getBingXFuturesAccountInfo(apiKey, secretKey);
    console.log('📈 Raw account info:', accountInfo);
    
    const futuresBalances = accountInfo.balances.filter(
      (balance: BingXBalance) => parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
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

    const response = {
      balances,
      totalBalance,
      walletBalances,
      futuresBalances: futuresBalances.map((balance: BingXBalance) => ({
        asset: balance.asset,
        free: balance.free,
        locked: balance.locked
      })),
    };
    
    console.log('🎯 Final balance response:', JSON.stringify(response, null, 2));
    
    return NextResponse.json(response);

  } catch (error: unknown) {
    console.error('Error fetching balances:', error);
    
    let errorMessage = 'Failed to fetch futures balances from BingX';
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
          errorMessage = 'API key does not have the required permissions. Please check your API key permissions in BingX.';
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