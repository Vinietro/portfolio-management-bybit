import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { neon } from '@neondatabase/serverless';
import { getAllUserCredentials } from '../../../lib/database';

// Initialize Neon client
const sql = neon(process.env.DATABASE_URL!);

interface TradingViewWebhookPayload {
  action: 'buy' | 'sell';
  symbol?: string;  // Optional specific symbol. If not provided, applies to all default coins
  quantity?: number; // Optional custom quantity for buy operations
  authKey?: string; // Authentication key for webhook verification
}

interface TradingResult {
  success: boolean;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  totalValue: number;
  order: unknown;
  message: string;
}


// Helper function to get account info to check available balance
async function getAccountInfo(apiKey: string, secretKey: string) {
  const timestamp = Date.now().toString();
  const queryString = `timestamp=${timestamp}`;
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('hex');

  const url = `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    headers: {
      'X-MBX-APIKEY': apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Account API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Helper function to unstake USDT from Earn wallet
async function unstakeUSDTFromEarn(apiKey: string, secretKey: string, amount: number): Promise<{ success: boolean; message: string; unstakedAmount?: number }> {
  try {
    const timestamp = Date.now().toString();
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(queryString)
      .digest('hex');

    // First get positions to find USDT staking product
    const positionUrl = `https://api.binance.com/sapi/v1/simple-earn/flexible/position?${queryString}&signature=${signature}`;
    const positionResponse = await fetch(positionUrl, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    if (!positionResponse.ok) {
      const errorText = await positionResponse.text();
      throw new Error(`Failed to get staking positions: ${errorText}`);
    }

    const positionData = await positionResponse.json();
    const usdtPositions = positionData.rows?.filter((pos: { asset: string }) => pos.asset === 'USDT') || [];
    
    if (usdtPositions.length === 0) {
      return { success: false, message: 'No staked USDT positions found in Earn wallet' };
    }

    // Calculate total available USDT across all positions
    const totalAvailableUSDT = usdtPositions.reduce((sum: number, pos: { totalAmount?: string }) => sum + parseFloat(pos.totalAmount || '0'), 0);
    console.log(`Total USDT available in Earn wallet: ${totalAvailableUSDT.toFixed(4)} USDT`);
    
    // If requested amount is more than available, unstake everything available
    const amountToUnstake = Math.min(amount, totalAvailableUSDT);
    if (amountToUnstake < amount) {
      console.log(`Requested ${amount.toFixed(4)} USDT but only ${totalAvailableUSDT.toFixed(4)} available. Will unstake ${amountToUnstake.toFixed(4)} USDT`);
    }
    
    // Calculate how much we can unstake from available positions
    let remainingAmount = amountToUnstake;
    let totalUnstaked = 0;

    for (const position of usdtPositions) {
      if (remainingAmount <= 0) break;
      
      const availableAmount = parseFloat(position.totalAmount || '0');
      const unstakeAmount = Math.min(remainingAmount, availableAmount);
      
      console.log(`Checking position: ${position.productId}, Available: ${availableAmount}, Attempting to unstake: ${unstakeAmount}`);
      
      if (unstakeAmount > 0.001 && position.productId) { // Only unstake if meaningful amount and position has valid product ID
        // Execute unstaking - format amount to ensure proper API formatting
        const formattedAmount = parseFloat(unstakeAmount.toFixed(8));
        
        if (formattedAmount > availableAmount) {
          console.log(`Skipping position - unstaking amount ${formattedAmount} exceeds available ${availableAmount}`);
          continue;
        }
        
        if (!position.productId || formattedAmount <= 0) {
          console.log(`Skipping position - invalid productId or amount: productId=${position.productId}, amount=${formattedAmount}`);
          continue;
        }
        
        console.log(`Attempting to unstake ${formattedAmount} USDT from position ${position.productId}`);
        
        // Ensure amount is sent as a proper decimal string for the API
        const amountString = formattedAmount.toFixed(8);
        const unstakeQueryString = `productId=${position.productId}&type=FAST&amount=${amountString}&timestamp=${timestamp}`;
        
        console.log(`Unstaking query: ${unstakeQueryString}`);
        
        const unstakeSignature = crypto
          .createHmac('sha256', secretKey)
          .update(unstakeQueryString)
          .digest('hex');

        const unstakeUrl = `https://api.binance.com/sapi/v1/simple-earn/flexible/redeem?${unstakeQueryString}&signature=${unstakeSignature}`;
        
        const unstakeResponse = await fetch(unstakeUrl, {
          method: 'POST',
          headers: { 'X-MBX-APIKEY': apiKey },
        });

        if (!unstakeResponse.ok) {
          const errorText = await unstakeResponse.text();
          console.log(`Failed to unstake from position ${position.productId}: ${errorText}`);
          // Continue with other positions instead of failing completely
          continue;
        }

        const unstakeResult = await unstakeResponse.json();
        console.log(`Unstaking result for position ${position.productId}:`, unstakeResult);

        totalUnstaked += unstakeAmount;
        remainingAmount -= unstakeAmount;
      }
    }

    if (totalUnstaked > 0) {
      return { 
        success: true, 
        message: `Successfully unstaked ${totalUnstaked.toFixed(4)} USDT from Earn wallet`,
        unstakedAmount: totalUnstaked 
      };
    } else {
      return { 
        success: false, 
        message: `No USDT could be unstaked from Earn wallet. Total available: ${totalAvailableUSDT.toFixed(4)} USDT, requested: ${amount.toFixed(4)} USDT`
      };
    }
  } catch (error) {
    return { 
      success: false, 
      message: `Failed to unstake USDT: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

// Helper function to get exchange info for trading rules
async function getExchangeInfo(symbol: string) {
  // Ensure symbol has USDT suffix (it might already have it from the frontend)
  const tradingSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
  console.log('Fetching exchange info for symbol:', tradingSymbol);
  const response = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${tradingSymbol}`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to fetch exchange info:', response.status, errorText);
    throw new Error(`Failed to fetch exchange info: ${response.status} ${errorText}`);
  }
  const data = await response.json();
  console.log('Exchange info response:', data);
  
  if (!data.symbols || data.symbols.length === 0) {
    throw new Error(`Symbol ${tradingSymbol} not found in exchange info`);
  }
  
  return data.symbols[0];
}

// Helper function to format quantity according to LOT_SIZE filter
function formatQuantity(quantity: number, lotSizeFilter: { stepSize: string; minQty: string; maxQty: string }): number {
  const stepSize = parseFloat(lotSizeFilter.stepSize);
  const minQty = parseFloat(lotSizeFilter.minQty);
  const maxQty = parseFloat(lotSizeFilter.maxQty);
  
  console.log('formatQuantity inputs:', { quantity, stepSize, minQty, maxQty });
  
  // Round to step size first
  const steps = Math.floor(quantity / stepSize);
  let formattedQuantity = steps * stepSize;
  
  // Ensure minimum quantity after rounding
  if (formattedQuantity < minQty) {
    formattedQuantity = minQty;
  }
  
  // Ensure maximum quantity
  if (formattedQuantity > maxQty) {
    formattedQuantity = maxQty;
  }
  
  console.log('formatQuantity output:', formattedQuantity);
  return formattedQuantity;
}

// Helper function to execute market trade with proper lot size handling
async function executeMarketTrade(symbol: string, side: 'BUY' | 'SELL', quantity: number, sideUSD: number, apiKey: string, secretKey: string): Promise<TradingResult> {
  const timestamp = Date.now().toString();
  
  // Get exchange info to get trading rules
  const exchangeInfo = await getExchangeInfo(symbol);
  const lotSizeFilter = exchangeInfo.filters.find((f: { filterType: string }) => f.filterType === 'LOT_SIZE');
  const minNotionalFilter = exchangeInfo.filters.find((f: { filterType: string }) => f.filterType === 'MIN_NOTIONAL');
  
  console.log('Filters found:', { lotSizeFilter, minNotionalFilter });
  
  if (!lotSizeFilter) {
    throw new Error('Could not get trading rules for this symbol');
  }

  // For BUY orders, convert USD amount to coin quantity using current price
  let currentPrice = 0;
  let orderQuantity = 0;
  if (side === 'BUY') {
    // Get current price
    const tradingSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
    const priceResponse = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${tradingSymbol}`);
    if (!priceResponse.ok) {
      throw new Error('Failed to fetch current price');
    }
    const priceData = await priceResponse.json();
    currentPrice = parseFloat(priceData.price);
    
    // Double-check we have enough USDT for this trade
    if (sideUSD <= 0) {
      throw new Error(`Invalid trade amount: ${sideUSD} USDT`);
    }
    
    orderQuantity = sideUSD / currentPrice;
    console.log(`Converting ${sideUSD} USDT to ${symbol}: Price ${currentPrice}, Quantity needed: ${orderQuantity}`);
  } else {
    orderQuantity = quantity;
  }

  // Format quantity according to LOT_SIZE filter
  console.log(`Webhook trade for ${symbol} ${side}: Before formatting orderQuantity: ${orderQuantity}`);
  console.log('LOT_SIZE filter:', lotSizeFilter);
  orderQuantity = formatQuantity(orderQuantity, lotSizeFilter);
  console.log(`Webhook trade for ${symbol} ${side}: After formatting orderQuantity: ${orderQuantity}`);
  
  // Check if formatted quantity is zero or too small
  if (orderQuantity <= 0) {
    throw new Error(`Order quantity too small. After applying trading rules, quantity became ${orderQuantity}. Minimum required quantity is ${parseFloat(lotSizeFilter.minQty)} ${symbol}.`);
  }
  
  // Check minimum notional value
  if (currentPrice === 0) {
    const tradingSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
    const priceResponse = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${tradingSymbol}`);
    const priceData = await priceResponse.json();
    currentPrice = parseFloat(priceData.price);
  }
  
  const notionalValue = orderQuantity * currentPrice;
  console.log('Notional value check:', { 
    notionalValue, 
    minNotional: minNotionalFilter?.minNotional, 
    currentPrice,
    orderQuantity 
  });
  
  // Check for minimum notional value with proper handling
  if (minNotionalFilter && minNotionalFilter.minNotional) {
    const minimumNotional = parseFloat(minNotionalFilter.minNotional);
    if (notionalValue < minimumNotional) {
      throw new Error(`Too small amount for trading. Minimum value required is ${minimumNotional} USDT, you only have ${notionalValue.toFixed(2)} USDT worth allocated. Either increase allocation for this coin or skip small amounts by not trading them.`);
    }
  } else {
    // If no MIN_NOTIONAL filter found, fallback to Binance's common minimums
    // For USDT trading pairs, minimum is typically around 5-10 USDT
    const fallbackMinimum = 5.0; // USDT 
    if (notionalValue < fallbackMinimum) {
      throw new Error(`Too small amount for trading. Estimated minimum value is ${fallbackMinimum} USDT, you only have ${notionalValue.toFixed(2)} USDT worth allocated. Increase allocation for this coin to meet minimum trading requirements.`);
    }
  }

  // Final balance validation before attempting trade - check if available balance is sufficient for actual trade value
  if (side === 'BUY') {
    try {
      const timestampForBalance = Date.now().toString();
      const queryStringForBalance = `timestamp=${timestampForBalance}`;
      const signatureForBalance = crypto
        .createHmac('sha256', secretKey)
        .update(queryStringForBalance)
        .digest('hex');

      const urlForBalance = `https://api.binance.com/api/v3/account?${queryStringForBalance}&signature=${signatureForBalance}`;
      const balanceCheckResponse = await fetch(urlForBalance, {
        headers: {
          'X-MBX-APIKEY': apiKey,
        },
      });

      if (balanceCheckResponse.ok) {
        const balanceData = await balanceCheckResponse.json();
        const usdtBalance = balanceData.balances.find((b: { asset: string; free: string }) => b.asset === 'USDT');
        const availableUSDT = usdtBalance ? parseFloat(usdtBalance.free) : 0;
        
        console.log(`Pre-execution balance check: Available ${availableUSDT.toFixed(4)} USDT vs trade value ${notionalValue.toFixed(4)} USDT`);
        
        if (availableUSDT < notionalValue) {
          throw new Error(`Insufficient balance for trade: Available ${availableUSDT.toFixed(4)} USDT, need ${notionalValue.toFixed(4)} USDT for trade (order qty: ${orderQuantity.toFixed(2)} ${symbol})`);
        }
      }
    } catch (balanceCheckError) {
      console.log(`Final balance check failed, proceeding with trade: ${balanceCheckError instanceof Error ? balanceCheckError.message : 'Unknown error'}`);
    }
  }

  const tradingSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
  const queryString = `symbol=${tradingSymbol}&side=${side}&type=MARKET&quantity=${orderQuantity.toFixed(8)}&timestamp=${timestamp}`;
  
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('hex');

  const url = `https://api.binance.com/api/v3/order?${queryString}&signature=${signature}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Trading API Error ${response.status}: ${errorText}`);
  }

  const orderResult = await response.json();

  return {
    success: true,
    symbol: symbol,
    side: side,
    quantity: orderQuantity,
    price: currentPrice,
    totalValue: orderQuantity * currentPrice,
    order: orderResult,
    message: `${side} order executed successfully for ${orderQuantity.toFixed(6)} ${symbol} at ${currentPrice.toFixed(2)} USDT`
  };
}

// Helper function to fetch default coins
async function getDefaultCoins() {
  try {
    const rows = await sql`
      SELECT coin_symbol, target_percentage 
      FROM default_coins 
      WHERE is_active = true 
      ORDER BY display_order ASC
    `;
    return rows.map(row => ({
      coin: row.coin_symbol,
      targetPercent: parseFloat(row.target_percentage)
    }));
  } catch (error) {
    console.error('Error fetching default coins:', error);
    // Fallback to hardcoded defaults
    return [
      { coin: 'ENAUSDT', targetPercent: 10.00 },
      { coin: 'TAOUSDT', targetPercent: 10.00 },
      { coin: 'SUIUSDT', targetPercent: 10.00 },
      { coin: 'UNIUSDT', targetPercent: 12.00 },
      { coin: 'APTUSDT', targetPercent: 12.00 },
      { coin: 'AVAXUSDT', targetPercent: 12.00 },
      { coin: 'PUMPUSDT', targetPercent: 8.00 },
      { coin: 'SOLUSDT', targetPercent: 8.00 }
    ];
  }
}

// Helper function to record trading transactions
async function recordTransaction(
  apiKey: string, 
  symbol: string, 
  side: string, 
  quantity: number, 
  price: number, 
  totalValue: number,
  transactionType: 'entry' | 'exit'
) {
  try {
    await sql`
      INSERT INTO trading_transactions (
        api_key_hash, 
        symbol, 
        side, 
        quantity, 
        price, 
        total_value, 
        transaction_type,
        created_at
      ) VALUES (
        ${crypto.createHash('sha256').update(apiKey).digest('hex')}, 
        ${symbol}, 
        ${side}, 
        ${quantity}, 
        ${price}, 
        ${totalValue}, 
        ${transactionType},
        NOW()
      )
    `;
    
    // Track position status after transaction
    await trackPositionStatus(apiKey, symbol, transactionType);
  } catch (error) {
    console.error('Error recording transaction:', error);
  }
}

// Helper function to track position status (open/closed)
async function trackPositionStatus(
  apiKey: string, 
  symbol: string, 
  transactionType: 'entry' | 'exit'
) {
  try {
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const isOpen = transactionType === 'entry';
    
    await sql`
      INSERT INTO position_status (
        api_key_hash,
        symbol,
        is_open,
        last_transaction_type,
        last_transaction_date,
        created_at,
        updated_at
      ) VALUES (
        ${apiKeyHash},
        ${symbol},
        ${isOpen},
        ${transactionType},
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (api_key_hash, symbol) 
      DO UPDATE SET
        is_open = ${isOpen},
        last_transaction_type = ${transactionType},
        last_transaction_date = NOW(),
        updated_at = NOW()
    `;
  } catch (error) {
    console.error('Error tracking position status:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, symbol, quantity, authKey }: TradingViewWebhookPayload = body;

    // Validate authentication key
    const expectedAuthKey = process.env.WEBHOOK_AUTH_KEY;
    if (!expectedAuthKey) {
      console.error('WEBHOOK_AUTH_KEY environment variable not set');
      return NextResponse.json(
        { error: 'Webhook authentication not configured' },
        { status: 500 }
      );
    }

    if (!authKey || authKey !== expectedAuthKey) {
      return NextResponse.json(
        { error: 'Invalid authentication key provided' },
        { status: 401 }
      );
    }

    // Validate required fields - NO LONGER NEED apiKey or secretKey since we fetch from DB
    if (!action) {
      return NextResponse.json(
        { error: 'Missing required field: action' },
        { status: 400 }
      );
    }

    // Validate action
    if (action !== 'buy' && action !== 'sell') {
      return NextResponse.json(
        { error: 'Invalid action. Must be "buy" or "sell"' },
        { status: 400 }
      );
    }

    // Get all user credentials from database
    const allCredentialsList = await getAllUserCredentials();
    
    if (allCredentialsList.length === 0) {
      return NextResponse.json(
        { error: 'No credentials found in database. Please configure at least one Binance account first.' },
        { status: 404 }
      );
    }

    console.log(`TradingView Webhook - Action: ${action}, Processing ${allCredentialsList.length} accounts`);

    const worldResults: {apiKey: string, userId: string, results: TradingResult[]}[] = [];

    // Process each set of credentials
    for (const credentialSet of allCredentialsList) {
      const { userId, credentials: userCreds } = credentialSet;
      
      if (!userCreds?.apiKey || !userCreds?.secretKey) {
        console.error(`Invalid credentials found for user ${userId}`);
        continue; // Skip accounts without valid API keys
      }

      const apiKey = userCreds.apiKey;
      const secretKey = userCreds.secretKey;
      
      // Perform the action for this specific account
      try {
        const accountResults: TradingResult[] = [];
        
        // Get account info to validate credentials
        let accountInfo;
        try {
          accountInfo = await getAccountInfo(apiKey, secretKey);
        } catch (error) {
          console.error(`Invalid API credentials for user ${userId}:`, error);
          accountResults.push({
            success: false,
            symbol: 'SYSTEM',
            side: 'BUY' as const,
            quantity: 0,
            price: 0,
            totalValue: 0,
            order: null,
            message: `Invalid API credentials: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
          worldResults.push({apiKey, userId, results: accountResults});
          continue;
        }

        if (action === 'buy') {
          // BUY LOGIC: Distribute among default coins using proper USDT Earn allocation
          const defaultCoins = await getDefaultCoins();
          const filterCoins = symbol ? defaultCoins.filter(coin => coin.coin === symbol) : defaultCoins;
          
          // Calculate USDT from both SPOT and EARN wallets
          let usdtFromSpot = 0;
          const usdtSpotBalance = accountInfo.balances.find((b: { asset: string; free: string; locked: string }) => b.asset === 'USDT');
          if (usdtSpotBalance) {
            usdtFromSpot = parseFloat(usdtSpotBalance.free) + parseFloat(usdtSpotBalance.locked);
          }
          
          // Fetch USDT from Earn wallet (staking)
          let usdtFromEarn = 0;
          try {
            const timestamp = Date.now().toString();
            const queryString = `timestamp=${timestamp}`;
            const signature = crypto
              .createHmac('sha256', secretKey)
              .update(queryString)
              .digest('hex');

            const earnApiUrl = `https://api.binance.com/sapi/v1/simple-earn/flexible/position?${queryString}&signature=${signature}`;
            const earnResponse = await fetch(earnApiUrl, {
              headers: { 'X-MBX-APIKEY': apiKey },
            });

            if (earnResponse.ok) {
              const earnData = await earnResponse.json();
              const usdtEarnPositions = earnData.rows?.filter((pos: { asset: string }) => pos.asset === 'USDT') || [];
              usdtFromEarn = usdtEarnPositions.reduce((sum: number, pos: { totalAmount?: string }) => 
                sum + parseFloat(pos.totalAmount || '0'), 0
              );
              console.log(`Found USDT in Earn: ${usdtFromEarn} USDT`);
            } else {
              console.log('Could not fetch Earn balance, using spot only...');
            }
          } catch (earnError) {
            console.log('Error fetching Earn wallet USDT:', earnError);
          }
          
          const totalBalanceFromAPI = usdtFromSpot + usdtFromEarn;
          console.log(`Webhook using USDT balance - Spot: ${usdtFromSpot} USDT, Earn: ${usdtFromEarn} USDT, Total: ${totalBalanceFromAPI} USDT`);
          
          // Get USDT Earn percent from credentials - default to 0 if not set
          const usdtEarnPercent = userCreds?.usdtEarnTarget || 0;
          
          // Calculate Available for Allocation = Total Balance * (100 - USDT Earn percent) / 100
          const availableForAllocation = quantity || (totalBalanceFromAPI * (100 - usdtEarnPercent) / 100);
          
          console.log(`Webhook ${apiKey.substring(0,8)}... - USDT Balance: ${totalBalanceFromAPI} USDT, USDT Earn Reserve: ${usdtEarnPercent}%, Available for Trading: ${availableForAllocation} USDT`);
          
          // Additional validation that we actually have funds available
          if (availableForAllocation <= 0.1) {
            accountResults.push({
              success: false,
              symbol: 'BALANCE',
              side: 'BUY' as const,
              quantity: 0,
              price: 0,
              totalValue: 0,
              order: null,
              message: `Insufficient USDT balance to trade: ${availableForAllocation.toFixed(2)} USDT available (minimum 0.1 USDT required). Spot: ${usdtFromSpot.toFixed(2)} USDT, Earn: ${usdtFromEarn.toFixed(2)} USDT`
            });
            worldResults.push({apiKey, userId, results: accountResults});
            continue; // Skip to next credential set
          }
          
          // Early validation: Check if we have enough free USDT or if we can unstake from Earn
          const freeUSDT = accountInfo.balances.find((b: { asset: string; free: string }) => b.asset === 'USDT')?.free || '0';
          const freeUSDTAmount = parseFloat(freeUSDT);
          const canUnstakeFromEarn = usdtFromEarn > 0;
          
          console.log(`Pre-trade validation: Free USDT: ${freeUSDTAmount.toFixed(4)}, Earn USDT: ${usdtFromEarn.toFixed(4)}, Can unstake: ${canUnstakeFromEarn}`);
          
          // If we don't have enough free USDT and no Earn balance, skip trading entirely
          if (freeUSDTAmount < 0.1 && !canUnstakeFromEarn) {
            accountResults.push({
              success: false,
              symbol: 'BALANCE',
              side: 'BUY' as const,
              quantity: 0,
              price: 0,
              totalValue: 0,
              order: null,
              message: `Insufficient USDT for trading: ${freeUSDTAmount.toFixed(2)} USDT free, ${usdtFromEarn.toFixed(2)} USDT in Earn (total: ${totalBalanceFromAPI.toFixed(2)} USDT). Cannot unstake from Earn wallet.`
            });
            worldResults.push({apiKey, userId, results: accountResults});
            continue;
          }
          
          for (const coinData of filterCoins) {
            const coinSymbol = coinData.coin.includes('USDT') ? coinData.coin.substring(0, coinData.coin.indexOf('USDT')) : coinData.coin;
            // TARGET AMOUNT: Available for Allocation * Coin Percent
            const allocatedAmount = availableForAllocation * (coinData.targetPercent / 100);
            
            console.log(`Webhook ${coinSymbol}: ${coinData.targetPercent}% of ${availableForAllocation} USDT = ${allocatedAmount} USDT allocation`);
            
            try {
              // Check final USDT balance before trading attempt - check both free and total
              const currentAccountInfo = await getAccountInfo(apiKey, secretKey);
              const currentUSDTBalance = currentAccountInfo.balances.find((b: { asset: string; free: string; locked: string }) => b.asset === 'USDT');
              const freeUSDT = currentUSDTBalance ? parseFloat(currentUSDTBalance.free) : 0;
              const lockedUSDT = currentUSDTBalance ? parseFloat(currentUSDTBalance.locked) : 0;
              const availableUSDTAfterCheck = freeUSDT + lockedUSDT;
              
              console.log(`Pre-trade USDT check for ${coinSymbol}: Free ${freeUSDT.toFixed(4)}, Locked ${lockedUSDT.toFixed(4)}, Total ${availableUSDTAfterCheck.toFixed(4)} USDT, Needed ${allocatedAmount.toFixed(4)} USDT`);
              
              // Add small buffer (0.1% buffer) for the order formatting differences
              const bufferedNeededAmount = allocatedAmount * 1.001; // 0.1% buffer to cover any rounding differences due to LOT_SIZE etc
              
              // Check if we have enough free USDT for the trade
              if (freeUSDT >= bufferedNeededAmount) {
                console.log(`✅ Sufficient free USDT available: ${freeUSDT.toFixed(4)} USDT >= ${bufferedNeededAmount.toFixed(4)} USDT needed. Proceeding with trade.`);
              } else if (freeUSDT < bufferedNeededAmount && allocatedAmount >= 0.1) {
                // Not enough free USDT, try to unstake from Earn wallet
                const neededAmount = bufferedNeededAmount - freeUSDT;
                console.log(`Insufficient FREE USDT balance detected (${freeUSDT.toFixed(4)} free, need ${bufferedNeededAmount.toFixed(4)} with buffer 0.1%). Attempting to unstake ${neededAmount.toFixed(4)} USDT from Earn wallet`);
                
                // Check if we have USDT in Earn wallet to unstake
                if (usdtFromEarn > 0) {
                  const unstakeResult = await unstakeUSDTFromEarn(apiKey, secretKey, neededAmount);
                  
                  if (!unstakeResult.success) {
                    console.log(`Unstaking failed: ${unstakeResult.message}`);
                    
                    // Recheck final balance to ensure we've given a real balance report
                    const finalAccountInfo = await getAccountInfo(apiKey, secretKey);
                    const finalUSDTBalanceCheck = finalAccountInfo.balances.find((b: { asset: string; free: string; locked: string }) => b.asset === 'USDT');
                    const finalBalanceValue = finalUSDTBalanceCheck 
                      ? parseFloat(finalUSDTBalanceCheck.free) + parseFloat(finalUSDTBalanceCheck.locked) 
                      : 0;
                    
                    throw new Error(`Insufficient USDT balance (${finalBalanceValue.toFixed(2)} USDT available, ${bufferedNeededAmount.toFixed(2)} USDT needed). Could not unstake additional USDT: ${unstakeResult.message}`);
                  } else {
                    console.log(`Successfully unstaked ${unstakeResult.unstakedAmount} USDT for trading: ${unstakeResult.message}`);
                    
                    // Wait a bit longer for the unstaking to process and recheck balance
                    console.log('Waiting for unstaking to process...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    // Recheck balance after unstaking - check FREE USDT only as that's what's available for trading
                    const updatedAccountInfo = await getAccountInfo(apiKey, secretKey);
                    const updatedUSDTBalance = updatedAccountInfo.balances.find((b: { asset: string; free: string; locked: string }) => b.asset === 'USDT');
                    const finalFreeUSDT = updatedUSDTBalance ? parseFloat(updatedUSDTBalance.free) : 0;
                    const finalLockedUSDT = updatedUSDTBalance ? parseFloat(updatedUSDTBalance.locked) : 0;
                      
                    console.log(`Post-unstaking USDT balance check: FREE ${finalFreeUSDT.toFixed(4)}, LOCKED ${finalLockedUSDT.toFixed(4)}, required FREE ${bufferedNeededAmount.toFixed(4)} USDT`);
                    
                    if (finalFreeUSDT < bufferedNeededAmount - 0.01) { // Allow small tolerance for decimal precision
                      throw new Error(`Still insufficient FREE USDT after unstaking: ${finalFreeUSDT.toFixed(2)} USDT free available, ${bufferedNeededAmount.toFixed(2)} USDT needed (unstaked: ${unstakeResult.unstakedAmount})`);
                    }
                    console.log(`✅ Balance verification passed, proceeding with trade`);
                  }
                } else {
                  throw new Error(`Insufficient USDT: only ${freeUSDT.toFixed(2)} free available, need ${bufferedNeededAmount.toFixed(2)} USDT. No USDT available in Earn wallet to unstake.`);
                }
              } else {
                throw new Error(`Insufficient USDT: only ${freeUSDT.toFixed(2)} free available, need ${bufferedNeededAmount.toFixed(2)} USDT. Trade amount too small (${allocatedAmount.toFixed(2)} USDT < 0.1 USDT minimum).`);
              }

              const result = await executeMarketTrade(
                coinSymbol,
                'BUY',
                allocatedAmount,
                allocatedAmount,
                apiKey,
                secretKey
              );
              accountResults.push(result);
              
              // Record transaction
              await recordTransaction(apiKey, coinSymbol, 'BUY', result.quantity, result.price, result.totalValue, 'entry');
              
            } catch (error) {
              console.error(`Error trading ${coinSymbol}:`, error);
              
              // Handle NOTIONAL errors specifically by skipping 
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              if (errorMessage.includes('Too small amount for trading') || errorMessage.includes('Filter failure: NOTIONAL')) {
                console.log(`Skipping ${coinSymbol} - amount too small for minimum notional requirements`);
                accountResults.push({
                  success: false,
                  symbol: coinSymbol,
                  side: 'BUY' as const,
                  quantity: 0,
                  price: 0,
                  totalValue: 0,
                  order: null,
                  message: `Skipped ${coinSymbol}: Amount too small for minimum notional requirements (${allocatedAmount.toFixed(2)} USDT allocated)`
                });
              } else {
                accountResults.push({
                  success: false,
                  symbol: coinSymbol,
                  side: 'BUY' as const,
                  quantity: 0,
                  price: 0,
                  totalValue: 0,
                  order: null,
                  message: `Failed to buy ${coinSymbol}: ${errorMessage}`
                });
              }
            }
          }
        } 
        
        else if (action === 'sell') {
          // SELL LOGIC: Sell all positions of specific symbol or all default coins
          const defaultCoins = await getDefaultCoins();
          const symbolsToSell = symbol 
            ? [symbol.includes('USDT') ? symbol.substring(0, symbol.indexOf('USDT')) : symbol]
            : defaultCoins.map(coin => {
                const coinSymbol = coin.coin;
                return coinSymbol.includes('USDT') ? coinSymbol.substring(0, coinSymbol.indexOf('USDT')) : coinSymbol;
              });

          for (const coinSymbol of symbolsToSell) {
            const coinBalance = accountInfo.balances.find((b: { asset: string; free: string; locked: string }) => b.asset === coinSymbol);
            const availableBalance = coinBalance ? parseFloat(coinBalance.free) : 0;
            
            if (availableBalance > 0.001) { // Only sell if there's meaningful quantity
              try {
                const result = await executeMarketTrade(
                  coinSymbol,
                  'SELL',
                  availableBalance,
                  0, // Not used for SELL side
                  apiKey,
                  secretKey
                );
                accountResults.push(result);
                
                // Record transaction
                await recordTransaction(apiKey, coinSymbol, 'SELL', result.quantity, result.price, result.totalValue, 'exit');
                
              } catch (error) {
                console.error(`Error selling ${coinSymbol}:`, error);
                accountResults.push({
                  success: false,
                  symbol: coinSymbol,
                  side: 'SELL' as const,
                  quantity: 0,
                  price: 0,
                  totalValue: 0,
                  order: null,
                  message: `Failed to sell ${coinSymbol}: ${error instanceof Error ? error.message : 'Unknown error'}`
                });
              }
            }
          }
        }
        
        worldResults.push({apiKey, userId, results: accountResults});

      } catch (accountError) {
        console.error(`Error processing account ${userId}:`, accountError);
        worldResults.push({
          apiKey, 
          userId, 
          results: [{
            success: false,
            symbol: 'ACCOUNT',
            side: 'BUY' as const,
            quantity: 0,
            price: 0,
            totalValue: 0,
            order: null,
            message: `Account processing error: ${accountError instanceof Error ? accountError.message : 'Unknown error'}`
          }]
        });
      }
    }

    // Aggregate final response
    return NextResponse.json({
      success: true,
      action: action,
      processedAccounts: worldResults.length,
      totalResults: worldResults.flatMap(w => w.results),
      accountBreakdown: worldResults
    });

  } catch (error: unknown) {
    console.error('TradingView Webhook Error:', error);
    
    let errorMessage = 'Failed to process TradingView webhook';
    const statusCode = 500;

    if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = (error as Error).message;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not supported. Use POST to process TradingView webhooks.' },
    { status: 405 }
  );
}
