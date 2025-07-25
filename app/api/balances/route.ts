import { NextRequest, NextResponse } from 'next/server';
import Binance from 'binance-api-node';
import crypto from 'crypto';

interface BinanceBalance {
  asset: string;
  free: string;
  locked: string;
}

interface BinanceAccountInfo {
  balances: BinanceBalance[];
}

interface BinanceEarnBalance {
  asset: string;
  totalAmount: string;
  tierAnnualPercentageRate: string;
  latestAnnualPercentageRate: string;
  yesterdayRealTimeRewards: string;
  totalBonusRewards: string;
  totalRealTimeRewards: string;
  totalRewards: string;
}

interface BinanceFuturesBalance {
  accountAlias: string;
  asset: string;
  balance: string;
  crossWalletBalance: string;
  crossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
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

  const url = `https://fapi.binance.com${endpoint}?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    headers: {
      'X-MBX-APIKEY': apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Futures API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Helper function to make earn API request
async function makeEarnRequest(endpoint: string, apiKey: string, secretKey: string, params: Record<string, string> = {}) {
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
    throw new Error(`Earn API Error ${response.status}: ${errorText}`);
  }

  return response.json();
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

    // Get current prices for all coins
    const tickerPrices = await client.prices();
    
    // Calculate USD values and total balance
    let totalBalance = 0;
    const balances: Record<string, number> = {};
    const walletBalances: Record<string, WalletBalance[]> = {
      spot: [],
      earn: [],
      futures: []
    };

    // Get Spot wallet balances
    const accountInfo: BinanceAccountInfo = await client.accountInfo();
    const spotBalances = accountInfo.balances.filter(
      (balance: BinanceBalance) => parseFloat(balance.free) > 0 || parseFloat(balance.locked) > 0
    );

    // Get PNL data for spot wallet coins
    const spotAssets = spotBalances.map(balance => balance.asset).filter(asset => asset !== 'USDT' && asset !== 'USD');
    const pnlData: Record<string, { pnl: number; pnlPercentage: number }> = {};
    
    if (spotAssets.length > 0) {
      try {
        const pnlResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/pnl`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            apiKey,
            secretKey,
            assets: spotAssets
          }),
        });

        if (pnlResponse.ok) {
          const pnlResult = await pnlResponse.json();
          for (const pnlItem of pnlResult.pnlData || []) {
            pnlData[pnlItem.asset] = {
              pnl: pnlItem.pnl,
              pnlPercentage: pnlItem.pnlPercentage
            };
          }
        }
      } catch (pnlError) {
        console.log('Failed to fetch PNL data:', pnlError);
      }
    }

    // Get Earn wallet balances
    const earnBalances: BinanceEarnBalance[] = [];
    try {
      // Try to get Simple Earn positions using direct API call with pagination
      let page = 1;
      let hasMore = true;
      
      while (hasMore) {
        const earnPositions = await makeEarnRequest('/sapi/v1/simple-earn/flexible/position', apiKey, secretKey, {
          current: page.toString(),
          size: '100' // Maximum page size
        });
        
        if (earnPositions && earnPositions.rows && earnPositions.rows.length > 0) {
          for (const position of earnPositions.rows) {
            if (parseFloat(position.totalAmount) > 0) {
              earnBalances.push({
                asset: position.asset,
                totalAmount: position.totalAmount,
                tierAnnualPercentageRate: position.tierAnnualPercentageRate || '0',
                latestAnnualPercentageRate: position.latestAnnualPercentageRate || '0',
                yesterdayRealTimeRewards: position.yesterdayRealTimeRewards || '0',
                totalBonusRewards: position.totalBonusRewards || '0',
                totalRealTimeRewards: position.totalRealTimeRewards || '0',
                totalRewards: position.totalRewards || '0'
              });
            }
          }
          
          // Check if there are more pages
          if (earnPositions.rows.length < 100) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }
    } catch (earnError) {
      console.log('Earn wallet not accessible or no positions:', earnError);
      // Try alternative earn endpoint
      try {
        const earnAccount = await makeEarnRequest('/sapi/v1/simple-earn/account', apiKey, secretKey);
        if (earnAccount && earnAccount.totalAmountInUSDT) {
          earnBalances.push({
            asset: 'USDT',
            totalAmount: earnAccount.totalAmountInUSDT,
            tierAnnualPercentageRate: '0',
            latestAnnualPercentageRate: '0',
            yesterdayRealTimeRewards: '0',
            totalBonusRewards: '0',
            totalRealTimeRewards: '0',
            totalRewards: '0'
          });
        }
      } catch (alternativeEarnError) {
        console.log('Alternative earn method also failed:', alternativeEarnError);
      }
    }

    // Get Futures wallet balances
    const futuresBalances: BinanceFuturesBalance[] = [];
    try {
      // Get futures account information using direct API call
      const futuresAccount = await makeSignedRequest('/fapi/v2/account', apiKey, secretKey);
      
      if (futuresAccount && futuresAccount.assets) {
        for (const asset of futuresAccount.assets) {
          const availableBalance = parseFloat(asset.availableBalance);
          const walletBalance = parseFloat(asset.walletBalance);
          
          if (availableBalance > 0 || walletBalance > 0) {
            futuresBalances.push({
              accountAlias: futuresAccount.accountAlias || '',
              asset: asset.asset,
              balance: asset.walletBalance,
              crossWalletBalance: asset.walletBalance,
              crossUnPnl: asset.unrealizedPnl || '0',
              availableBalance: asset.availableBalance,
              maxWithdrawAmount: asset.maxWithdrawAmount || '0'
            });
          }
        }
      }
    } catch (futuresError) {
      console.log('Futures wallet not accessible or no positions:', futuresError);
    }

    // Process all balances and calculate USD values
    const allBalances = [
      ...spotBalances.map(b => ({ ...b, wallet: 'spot' })),
      ...earnBalances.map(b => ({ 
        asset: b.asset, 
        free: b.totalAmount, 
        locked: '0',
        wallet: 'earn'
      })),
      ...futuresBalances.map(b => ({ 
        asset: b.asset, 
        free: b.availableBalance, 
        locked: '0',
        wallet: 'futures'
      }))
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
        if (balance.wallet === 'spot') {
          const pnlInfo = pnlData[balance.asset];
          walletBalances.spot.push({
            asset: balance.asset,
            free: balance.free,
            locked: balance.locked,
            usdValue,
            wallet: 'spot',
            pnl: pnlInfo?.pnl,
            pnlPercentage: pnlInfo?.pnlPercentage
          });
        } else if (balance.wallet === 'earn') {
          walletBalances.earn.push({
            asset: balance.asset,
            free: balance.free,
            locked: '0',
            usdValue,
            wallet: 'earn'
          });
        } else if (balance.wallet === 'futures') {
          walletBalances.futures.push({
            asset: balance.asset,
            free: balance.free,
            locked: '0',
            usdValue,
            wallet: 'futures'
          });
        }
      }
    }

    return NextResponse.json({
      balances,
      totalBalance,
      walletBalances,
      spotBalances: spotBalances.map((balance: BinanceBalance) => ({
        asset: balance.asset,
        free: balance.free,
        locked: balance.locked
      })),
      earnBalances: earnBalances.map((balance: BinanceEarnBalance) => ({
        asset: balance.asset,
        totalAmount: balance.totalAmount,
        tierAnnualPercentageRate: balance.tierAnnualPercentageRate,
        latestAnnualPercentageRate: balance.latestAnnualPercentageRate,
        yesterdayRealTimeRewards: balance.yesterdayRealTimeRewards,
        totalBonusRewards: balance.totalBonusRewards,
        totalRealTimeRewards: balance.totalRealTimeRewards,
        totalRewards: balance.totalRewards
      })),
      futuresBalances: futuresBalances.map((balance: BinanceFuturesBalance) => ({
        accountAlias: balance.accountAlias,
        asset: balance.asset,
        balance: balance.balance,
        crossWalletBalance: balance.crossWalletBalance,
        crossUnPnl: balance.crossUnPnl,
        availableBalance: balance.availableBalance,
        maxWithdrawAmount: balance.maxWithdrawAmount
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