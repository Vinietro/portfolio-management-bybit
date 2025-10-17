import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { neon } from '@neondatabase/serverless';
import { getAllUserCredentials } from '../../lib/database';

// Initialize Neon client
const sql = neon(process.env.DATABASE_URL!);

interface TradingRequest {
  action: 'open' | 'close' | 'alert';
  symbol: string;
  side?: 'LONG' | 'SHORT'; // Required for 'open' action
  alertMessage?: string; // Required for 'alert' action
  authKey?: string; // Authentication key for webhook verification
  chatId?: string; // Telegram chat ID for alerts
}

// Telegram configuration
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!;
const TELEGRAM_URL = `https://api.telegram.org/bot8242037075:AAEIYbLIuxIQpEln4aEAki4bVGUXPdZd2Y4/sendMessage`;

// Small in-memory queue to space messages
let lastSendTime = 0;

// Helper function to create signed request for futures trading
async function makeBingXFuturesRequest(endpoint: string, apiKey: string, secretKey: string, params: Record<string, any> = {}, method: 'GET' | 'POST' = 'POST') {
  const timestamp = Date.now().toString();
  
  let url: string;
  let body: string | undefined;
  
  if (method === 'GET') {
    // For GET requests, put parameters in query string
  const queryString = Object.entries({ ...params, timestamp })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('hex');

    url = `https://open-api.bingx.com${endpoint}?${queryString}&signature=${signature}`;
    console.log(`🔍 Debug - Making ${method} request to: ${url}`);
  } else {
    // For POST requests with body, follow BingX documentation:
    // 1. Sort all parameters alphabetically (a-z)
    // 2. Generate signature from sorted parameter string
    // 3. Include signature in request body
    
    // Add timestamp to params
    const allParams = { ...params, timestamp: parseInt(timestamp) };
    
    // Sort parameters alphabetically
    const sortedKeys = Object.keys(allParams).sort();
    const sortedParams: Record<string, any> = {};
    sortedKeys.forEach(key => {
      sortedParams[key] = (allParams as any)[key];
    });
    
    // Create parameter string for signature (sorted alphabetically)
    const paramString = Object.entries(sortedParams)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    
    // Generate signature
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(paramString)
      .digest('hex');
    
    // Add signature to params
    sortedParams.signature = signature;
    
    // Create request body
    body = JSON.stringify(sortedParams);
    
    url = `https://open-api.bingx.com${endpoint}`;
    
    console.log(`🔍 Debug - Making ${method} request to: ${url}`);
    console.log(`🔍 Debug - Sorted params for signature: ${paramString}`);
    console.log(`🔍 Debug - Request body:`, body);
  }
  
  const response = await fetch(url, {
    method: method,
    headers: {
      'X-BX-APIKEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ BingX API Error ${response.status}:`, errorText);
    throw new Error(`BingX Futures API Error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  console.log(`🔍 Debug - API Response:`, JSON.stringify(result, null, 2));
  return result;
}

// Helper function to get current price for a futures symbol
async function getCurrentPrice(symbol: string): Promise<number> {
  // Ensure symbol has USDT suffix (it might already have it from the frontend)
  let tradingSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
  
  // Convert to BingX format (BTCUSDT -> BTC-USDT)
  if (tradingSymbol.endsWith('USDT')) {
    const baseAsset = tradingSymbol.replace('USDT', '');
    tradingSymbol = `${baseAsset}-USDT`;
  }
  
  const response = await fetch(`https://open-api.bingx.com/openApi/swap/v2/quote/price?symbol=${tradingSymbol}`);
  if (!response.ok) {
    throw new Error('Failed to fetch current price');
  }
  const data = await response.json();
  return parseFloat(data.data?.price || data.price || '0');
}

// Helper function to get futures exchange info for a symbol to get trading rules
async function getExchangeInfo(symbol: string) {
  // Ensure symbol has USDT suffix (it might already have it from the frontend)
  let tradingSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
  
  // Convert to BingX format (BTCUSDT -> BTC-USDT)
  if (tradingSymbol.endsWith('USDT')) {
    const baseAsset = tradingSymbol.replace('USDT', '');
    tradingSymbol = `${baseAsset}-USDT`;
  }
  
  console.log('Fetching futures exchange info for symbol:', tradingSymbol);
  const response = await fetch(`https://open-api.bingx.com/openApi/swap/v2/quote/contracts`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to fetch futures exchange info:', response.status, errorText);
    throw new Error(`Failed to fetch futures exchange info: ${response.status} ${errorText}`);
  }
  const data = await response.json();
  console.log('Futures exchange info response:', data);
  
  if (!data.data || data.data.length === 0) {
    throw new Error(`No futures symbols found in exchange info`);
  }
  
  // Find the specific symbol in BingX futures response
  const symbolInfo = data.data.find((s: any) => s.symbol === tradingSymbol);
  if (!symbolInfo) {
    // Log available symbols for debugging
    const availableSymbols = data.data.map((s: any) => s.symbol).slice(0, 20); // First 20 symbols
    console.log(`❌ Symbol ${tradingSymbol} not found. Available symbols (first 20):`, availableSymbols);
    
    // Check if there's a similar symbol (case insensitive)
    const similarSymbol = data.data.find((s: any) => 
      s.symbol.toLowerCase() === tradingSymbol.toLowerCase()
    );
    
    if (similarSymbol) {
      console.log(`💡 Found similar symbol: ${similarSymbol.symbol}`);
      throw new Error(`Futures symbol ${tradingSymbol} not found. Did you mean ${similarSymbol.symbol}?`);
    }
    
    throw new Error(`Futures symbol ${tradingSymbol} not found in exchange info`);
  }
  
  // Transform BingX futures format to match expected format
  return {
    symbol: symbolInfo.symbol,
    baseAsset: symbolInfo.baseAsset,
    quoteAsset: symbolInfo.quoteAsset,
    filters: [
      {
        filterType: 'LOT_SIZE',
        stepSize: symbolInfo.stepSize || '0.00001',
        minQty: symbolInfo.minQty || '0.001',
        maxQty: symbolInfo.maxQty || '1000000'
      }
    ]
  };
}

// Helper function to format quantity according to LOT_SIZE filter
function formatQuantity(quantity: number, lotSizeFilter: { stepSize: string; minQty: string; maxQty: string }): number {
  const stepSize = parseFloat(lotSizeFilter.stepSize);
  const minQty = parseFloat(lotSizeFilter.minQty);
  const maxQty = parseFloat(lotSizeFilter.maxQty);
  
  console.log('formatQuantity inputs:', { quantity, stepSize, minQty, maxQty });
  
  // Calculate decimal places from step size to avoid floating point precision issues
  const stepSizeStr = lotSizeFilter.stepSize;
  const decimalPlaces = stepSizeStr.includes('.') ? stepSizeStr.split('.')[1].length : 0;
  
  // Round to step size using proper decimal precision
  const steps = Math.floor(quantity / stepSize);
  let formattedQuantity = steps * stepSize;
  
  // Round to the correct number of decimal places to avoid floating point precision issues
  formattedQuantity = Math.round(formattedQuantity * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
  
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

// Helper function to get futures account info to check available balance
async function getAccountInfo(apiKey: string, secretKey: string) {
  const response = await makeBingXFuturesRequest('/openApi/swap/v2/user/balance', apiKey, secretKey, {}, 'GET');
  
  
  // Handle different response structures from BingX futures API
  let balances = [];
  
  if (response.data?.assets) {
    // Multiple assets format
    balances = response.data.assets.map((balance: any) => ({
      asset: balance.asset,
      free: balance.availableBalance || balance.balance || '0',
      locked: balance.lockedBalance || '0'
    }));
  } else if (response.data?.balance) {
    // Single balance format
    const balance = response.data.balance;
    balances = [{
      asset: balance.asset,
      free: balance.balance || balance.availableBalance || '0',
      locked: balance.lockedBalance || '0'
    }];
  } else if (response.data && Array.isArray(response.data)) {
    // Direct array format
    balances = response.data.map((balance: any) => ({
      asset: balance.asset,
      free: balance.balance || balance.availableBalance || '0',
      locked: balance.lockedBalance || '0'
    }));
  } else {
    console.error('❌ Unknown balance response format:', response);
  }
  
  
  return { balances };
}

// Helper function to get position information for a specific symbol
async function getPositionInfo(apiKey: string, secretKey: string, symbol: string) {
  try {
    const response = await makeBingXFuturesRequest('/openApi/swap/v2/user/positions', apiKey, secretKey, {}, 'GET');
    
    // Convert symbol to BingX format for comparison
    let tradingSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
    if (tradingSymbol.endsWith('USDT')) {
      const baseAsset = tradingSymbol.replace('USDT', '');
      tradingSymbol = `${baseAsset}-USDT`;
    }
    
    // Handle different response structures - positions can be in data.positions or directly in data
    const positions = response.data?.positions || response.data || [];
    
    // Find the position for the specific symbol
    const position = positions.find((pos: any) => pos.symbol === tradingSymbol);
    
    if (!position) {
      return null;
    }
    
    return {
      symbol: position.symbol,
      size: parseFloat(position.positionAmt || position.size || '0'),
      side: position.positionSide || position.side, // 'LONG' or 'SHORT'
      entryPrice: parseFloat(position.avgPrice || position.entryPrice || '0'),
      markPrice: parseFloat(position.markPrice || '0'),
      unrealizedPnl: parseFloat(position.unrealizedProfit || position.unrealizedPnl || '0')
    };
  } catch (error) {
    console.error('Error fetching position info:', error);
    return null;
  }
}

// Helper function to send Telegram alert
async function sendTelegramAlert(message: string, chatId?: string): Promise<boolean> {
  try {
    // Use provided chatId or fallback to environment variable
    const targetChatId = chatId || CHAT_ID;
    
    if (!targetChatId) {
      console.error("No chat ID provided and TELEGRAM_CHAT_ID environment variable not set");
      return false;
    }

    // Respect Telegram's rate limits
    const now = Date.now();
    const timeSinceLast = now - lastSendTime;
    const delay = timeSinceLast < 1200 ? 1200 - timeSinceLast : 0;

    await new Promise((r) => setTimeout(r, delay));
    lastSendTime = Date.now();

    const response = await fetch(TELEGRAM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: message,
        parse_mode: "Markdown",
      }),
  });

  if (!response.ok) {
    const errorText = await response.text();
      console.error("Telegram error:", errorText);
      return false;
    }

    console.log(`✅ Telegram alert sent successfully to chat ${targetChatId}`);
    return true;
  } catch (error) {
    console.error("Failed to send Telegram alert:", error);
    return false;
  }
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
    // Fallback to hardcoded coins if database fails
    return [
      { coin: 'ENAUSDT', targetPercent: 12.50 },
      { coin: 'TAOUSDT', targetPercent: 12.50 },
      { coin: 'SUIUSDT', targetPercent: 12.50 },
      { coin: 'UNIUSDT', targetPercent: 15.00 },
      { coin: 'APTUSDT', targetPercent: 15.00 },
      { coin: 'AVAXUSDT', targetPercent: 15.00 },
      { coin: 'PUMPUSDT', targetPercent: 10.00 },
      { coin: 'SOLUSDT', targetPercent: 7.50 }
    ];
  }
}

// Helper function to open a position
async function openPosition(apiKey: string, secretKey: string, symbol: string, side: 'LONG' | 'SHORT', chatId?: string) {
  try {
    // Get the percentage allocation for this symbol from database
    const defaultCoins = await getDefaultCoins();
    const coinData = defaultCoins.find(coin => coin.coin === symbol);
    
    if (!coinData) {
      return {
        success: false,
        action: 'open',
        error: `Symbol ${symbol} not found in default coins configuration`
      };
    }

    // Get account balance
    const accountInfo = await getAccountInfo(apiKey, secretKey);
    const usdtBalance = accountInfo.balances.find((b: { asset: string }) => b.asset === 'USDT');
    const availableUsdt = parseFloat(usdtBalance?.free || '0');

    if (availableUsdt <= 0.1) {
      return {
        success: false,
        action: 'open',
        error: `Insufficient USDT balance: ${availableUsdt.toFixed(2)} USDT`
      };
    }

    // Calculate allocation amount based on percentage
    const allocatedAmount = (availableUsdt * coinData.targetPercent) / 100;
    
    if (allocatedAmount < 1) {
      return {
        success: false,
        action: 'open',
        error: `Allocation too small: ${allocatedAmount.toFixed(2)} USDT (${coinData.targetPercent}%)`
      };
    }

    // Get current price
    const currentPrice = await getCurrentPrice(symbol);
    
    // Convert USD amount to coin quantity
    const orderQuantity = allocatedAmount / currentPrice;

    // Get exchange info for quantity formatting
    const exchangeInfo = await getExchangeInfo(symbol);
    const lotSizeFilter = exchangeInfo.filters.find((f: { filterType: string }) => f.filterType === 'LOT_SIZE');
    
    if (!lotSizeFilter) {
      return {
        success: false,
        action: 'open',
        error: 'Could not get trading rules for this symbol'
      };
    }

    // Format quantity according to LOT_SIZE filter
    const formattedQuantity = formatQuantity(orderQuantity, lotSizeFilter);

    // Determine the order side (LONG = BUY, SHORT = SELL)
    const orderSide = side === 'LONG' ? 'BUY' : 'SELL';

    // Execute the order
    let tradingSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
    
    // Convert to BingX format (BTCUSDT -> BTC-USDT)
    if (tradingSymbol.endsWith('USDT')) {
      const baseAsset = tradingSymbol.replace('USDT', '');
      tradingSymbol = `${baseAsset}-USDT`;
    }
    
    const orderParams: Record<string, any> = {
      symbol: tradingSymbol,
      side: orderSide,
      positionSide: side, // Use the original side (LONG/SHORT) as positionSide
      type: 'MARKET',
      quantity: parseFloat(formattedQuantity.toString()),
    };

    const orderResult = await makeBingXFuturesRequest('/openApi/swap/v2/trade/order', apiKey, secretKey, orderParams);

    // Send alert
    await sendTelegramAlert(`🟢 ${side} Position Opened: ${symbol} @ $${currentPrice.toFixed(2)}`, chatId);

    return {
      success: true,
      action: 'open',
      symbol,
      side,
      quantity: formattedQuantity,
      price: currentPrice,
      totalValue: allocatedAmount,
      percentage: coinData.targetPercent,
      order: orderResult,
      message: `${side} position opened successfully for ${formattedQuantity} ${symbol} at ${currentPrice.toFixed(2)} USDT`
    };

  } catch (error) {
    console.error(`Error opening ${side} position for ${symbol}:`, error);
    return {
      success: false,
      action: 'open',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Helper function to close a position
async function closePosition(apiKey: string, secretKey: string, symbol: string, chatId?: string) {
  try {
    // Get position information
    const positionInfo = await getPositionInfo(apiKey, secretKey, symbol);
    
    if (!positionInfo || positionInfo.size === 0) {
      return {
        success: false,
        action: 'close',
        error: `No position found for ${symbol}`
      };
    }

    console.log(`Position found: ${positionInfo.size} ${symbol} (${positionInfo.side}) - PnL: ${positionInfo.unrealizedPnl.toFixed(2)} USDT`);

    // Determine the opposite side to close the position
    const closeSide = positionInfo.side === 'LONG' ? 'SELL' : 'BUY';

    // Execute the close order
    let tradingSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
    
    // Convert to BingX format (BTCUSDT -> BTC-USDT)
    if (tradingSymbol.endsWith('USDT')) {
      const baseAsset = tradingSymbol.replace('USDT', '');
      tradingSymbol = `${baseAsset}-USDT`;
    }
    
    const orderParams: Record<string, any> = {
      symbol: tradingSymbol,
      side: closeSide,
      positionSide: positionInfo.side, // Use the position's current side
      type: 'MARKET',
      quantity: parseFloat(positionInfo.size.toString()),
    };

    const orderResult = await makeBingXFuturesRequest('/openApi/swap/v2/trade/order', apiKey, secretKey, orderParams);

    // Calculate P&L percentage
    const positionValue = Math.abs(positionInfo.size * positionInfo.entryPrice);
    const pnlPercentage = positionValue > 0 ? (positionInfo.unrealizedPnl / positionValue) * 100 : 0;
    
    // Send alert
    await sendTelegramAlert(`🔒 Position Closed: ${symbol} - ${positionInfo.side} (PnL: ${pnlPercentage.toFixed(2)}%)`, chatId);

    return { 
      success: true, 
      action: 'close',
      symbol,
      quantity: positionInfo.size,
      price: positionInfo.markPrice,
      totalValue: positionInfo.size * positionInfo.markPrice,
      positionInfo: {
        originalSide: positionInfo.side,
        entryPrice: positionInfo.entryPrice,
        markPrice: positionInfo.markPrice,
        unrealizedPnl: positionInfo.unrealizedPnl
      },
      order: orderResult,
      message: `Position closed successfully for ${positionInfo.size} ${symbol} (${positionInfo.side})`
    };

  } catch (error) {
    console.error(`Error closing position for ${symbol}:`, error);
    return { 
      success: false, 
      action: 'close',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}



export async function POST(request: NextRequest) {
  try {
    const { action, symbol, side, alertMessage, authKey, chatId }: TradingRequest = await request.json();

    console.log('Trading request:', { action, symbol, side, hasAlertMessage: !!alertMessage });

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

    // Validate required fields
    if (!action || !symbol) {
      return NextResponse.json(
        { error: 'Missing required fields: action, symbol' },
        { status: 400 }
      );
    }

    // Validate action
    if (!['open', 'close', 'alert'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "open", "close", or "alert"' },
        { status: 400 }
      );
    }

    // Validate action-specific requirements
    if (action === 'open' && !side) {
      return NextResponse.json(
        { error: 'Side is required for "open" action. Must be "LONG" or "SHORT"' },
        { status: 400 }
      );
    }

    if (action === 'open' && !['LONG', 'SHORT'].includes(side!)) {
      return NextResponse.json(
        { error: 'Invalid side for open action. Must be "LONG" or "SHORT"' },
        { status: 400 }
      );
    }

    if (action === 'alert' && !alertMessage) {
      return NextResponse.json(
        { error: 'Alert message is required for "alert" action' },
        { status: 400 }
      );
    }
    
    // Handle alert action separately (no credentials needed)
    if (action === 'alert') {
      console.log(`📱 Sending alert to chat ${chatId || 'default'}: ${alertMessage}`);
      const alertSent = await sendTelegramAlert(alertMessage!, chatId);
      
      return NextResponse.json({
        success: true,
        action: 'alert',
        symbol,
        alertMessage,
        chatId: chatId || 'default',
        alertSent,
        message: alertSent ? 'Alert sent successfully' : 'Failed to send alert',
        timestamp: new Date().toISOString()
      });
    }

    // For open/close actions, we need credentials
    const allCredentials = await getAllUserCredentials();
    
    if (allCredentials.length === 0) {
      return NextResponse.json(
        { error: 'No credentials found in database' },
        { status: 404 }
      );
    }

    console.log(`🚀 Processing ${action} action for ${symbol} across ${allCredentials.length} accounts`);

    const results: any[] = [];

    // Process each set of credentials
    for (const userCreds of allCredentials) {
      
      const userId = userCreds.userId;
      const apiKey = userCreds.credentials?.apiKey;
      const secretKey = userCreds.credentials?.secretKey;

      // Validate that we have the required credentials
      if (!apiKey || !secretKey) {
        console.error(`❌ Missing credentials for user ${userId}:`, { apiKey: !!apiKey, secretKey: !!secretKey });
        results.push({
          apiKey: 'N/A',
          userId,
          success: false,
          error: 'Missing API key or secret key'
        });
        continue;
      }

      console.log(`Processing ${action} for user ${userId} (${apiKey.substring(0, 8)}...)`);

      try {
        let result: any;

        if (action === 'open') {
          // Open position
          result = await openPosition(apiKey, secretKey, symbol, side!, chatId);
        } else if (action === 'close') {
          // Close position
          result = await closePosition(apiKey, secretKey, symbol, chatId);
        }

        results.push({
          apiKey: apiKey.substring(0, 8) + '...',
          userId,
          ...result
        });

      } catch (error) {
        console.error(`Error processing ${action} for user ${userId}:`, error);
        results.push({
          apiKey: apiKey.substring(0, 8) + '...',
          userId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      action,
      symbol,
      totalCredentials: allCredentials.length,
      results,
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    console.error('Trading API Error:', error);

    return NextResponse.json(
      { 
        error: 'Failed to process trading request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
