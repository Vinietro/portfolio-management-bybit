import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { neon } from '@neondatabase/serverless';
import { getAllUserCredentials } from '../../lib/database';

// Type definitions for Bybit API responses
interface BybitSymbolInfo {
  symbol: string;
  size: string;
  quantityPrecision: number;
  pricePrecision: number;
  minQty: string;
  maxQty: string;
  stepSize: string;
  baseAsset: string;
  quoteAsset: string;
}

// Removed unused interface

// Removed unused interface

interface BybitPositionData {
  symbol: string;
  size: string;
  side: string;
  avgPrice: string;
  markPrice: string;
  unrealisedPnl: string;
  category?: string;
}

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

// Symbol alias resolver to match Bybit futures listings
const SYMBOL_ALIASES: Record<string, string> = {
  'PUMP': 'PUMPFUN',
  'PUMPUSDT': 'PUMPFUNUSDT'
};

function resolveBybitSymbol(inputSymbol: string): string {
  const upper = inputSymbol.toUpperCase();
  // Direct alias match
  if (SYMBOL_ALIASES[upper]) return SYMBOL_ALIASES[upper];
  // Ensure USDT suffix and re-check
  const withUsdt = upper.endsWith('USDT') ? upper : `${upper}USDT`;
  return SYMBOL_ALIASES[withUsdt] || withUsdt;
}

// Helper function to create signed request for futures trading
async function makeBybitFuturesRequest(endpoint: string, apiKey: string, secretKey: string, params: Record<string, string | number | boolean> = {}, method: 'GET' | 'POST' = 'POST') {
  const timestamp = Date.now().toString();
  const recvWindow = '5000';
  
  let url: string;
  let body: string | undefined;
  let signature: string;
  
  if (method === 'GET') {
    // For GET requests, put parameters in query string
    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    
    // Bybit V5 signature format: timestamp + apiKey + recvWindow + queryString
    const signaturePayload = timestamp + apiKey + recvWindow + queryString;
    signature = crypto
      .createHmac('sha256', secretKey)
      .update(signaturePayload)
      .digest('hex');

    url = queryString ? 
      `https://api.bybit.com${endpoint}?${queryString}` : 
      `https://api.bybit.com${endpoint}`;
    console.log(`🔍 Debug - Making ${method} request to: ${url}`);
  } else {
    // For POST requests with body
    body = JSON.stringify(params);
    
    // Bybit V5 signature format: timestamp + apiKey + recvWindow + body
    const signaturePayload = timestamp + apiKey + recvWindow + body;
    signature = crypto
      .createHmac('sha256', secretKey)
      .update(signaturePayload)
      .digest('hex');
    
    url = `https://api.bybit.com${endpoint}`;
    
    console.log(`🔍 Debug - Making ${method} request to: ${url}`);
    console.log(`🔍 Debug - Request body:`, body);
  }
  
  const response = await fetch(url, {
    method: method,
    headers: {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-SIGN-TYPE': '2',
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': '5000',
      'Content-Type': 'application/json',
    },
    body: body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Bybit API Error ${response.status}:`, errorText);
    throw new Error(`Bybit Futures API Error ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  console.log(`🔍 Debug - API Response:`, JSON.stringify(result, null, 2));
  return result;
}

// Helper function to get current price for a futures symbol
async function getCurrentPrice(symbol: string): Promise<number> {
  // Normalize to Bybit-listed futures symbol
  const tradingSymbol = resolveBybitSymbol(symbol);
  
  // Bybit uses standard format (BTCUSDT)
  const response = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${tradingSymbol}`);
  if (!response.ok) {
    throw new Error('Failed to fetch current price');
  }
  const data = await response.json();
  return parseFloat(data.result?.list?.[0]?.lastPrice || '0');
}

// Helper function to get futures exchange info for a symbol to get trading rules
async function getExchangeInfo(symbol: string) {
  // Normalize to Bybit-listed futures symbol
  const tradingSymbol = resolveBybitSymbol(symbol);
  
  console.log('Fetching futures exchange info for symbol:', tradingSymbol);
  const response = await fetch(`https://api.bybit.com/v5/market/instruments-info?category=linear`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to fetch futures exchange info:', response.status, errorText);
    throw new Error(`Failed to fetch futures exchange info: ${response.status} ${errorText}`);
  }
  const data = await response.json();
  console.log('Futures exchange info response:', data);
  
  if (!data.result?.list || data.result.list.length === 0) {
    throw new Error(`No futures symbols found in exchange info`);
  }
  
  // Find the specific symbol in Bybit futures response
  const symbolInfo = data.result.list.find((s: BybitSymbolInfo) => s.symbol === tradingSymbol);
  if (!symbolInfo) {
    // Log available symbols for debugging
    const availableSymbols = data.result.list.map((s: BybitSymbolInfo) => s.symbol).slice(0, 20); // First 20 symbols
    console.log(`❌ Symbol ${tradingSymbol} not found. Available symbols (first 20):`, availableSymbols);
    
    // Check if there's a similar symbol (case insensitive)
    const similarSymbol = data.result.list.find((s: BybitSymbolInfo) => 
      s.symbol.toLowerCase() === tradingSymbol.toLowerCase()
    );
    
    if (similarSymbol) {
      console.log(`💡 Found similar symbol: ${similarSymbol.symbol}`);
      throw new Error(`Futures symbol ${tradingSymbol} not found. Did you mean ${similarSymbol.symbol}?`);
    }
    
    throw new Error(`Futures symbol ${tradingSymbol} not found in exchange info`);
  }
  
  // Transform Bybit futures format to match expected format
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
function formatQuantity(quantity: number, lotSizeFilter: { stepSize: string; minQty: string; maxQty: string }): { value: number; decimalPlaces: number } {
  const stepSize = parseFloat(lotSizeFilter.stepSize);
  const minQty = parseFloat(lotSizeFilter.minQty);
  const maxQty = parseFloat(lotSizeFilter.maxQty);
  
  console.log('formatQuantity inputs:', { quantity, stepSize, minQty, maxQty });
  
  // Calculate decimal places from step size to avoid floating point precision issues
  const stepSizeStr = lotSizeFilter.stepSize;
  const decimalPlaces = stepSizeStr.includes('.') ? stepSizeStr.split('.')[1].length : 0;
  
  // Round to nearest step size (use Math.round instead of Math.floor for better precision)
  const steps = Math.round(quantity / stepSize);
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
  
  console.log('formatQuantity output:', { value: formattedQuantity, decimalPlaces });
  return { value: formattedQuantity, decimalPlaces };
}

// Helper function to set leverage for a symbol (enforces 1x leverage for risk management)
async function setLeverage(apiKey: string, secretKey: string, symbol: string, leverage: string = '1') {
  try {
    const tradingSymbol = resolveBybitSymbol(symbol);
    const leverageParams = {
      category: 'linear',
      symbol: tradingSymbol,
      buyLeverage: leverage,
      sellLeverage: leverage,
    };
    
    console.log(`🔧 Setting leverage to ${leverage}x for ${tradingSymbol}`);
    const response = await makeBybitFuturesRequest('/v5/position/set-leverage', apiKey, secretKey, leverageParams);
    console.log(`✅ Leverage set successfully:`, response);
    return response;
  } catch (error) {
    console.error(`❌ Error setting leverage for ${symbol}:`, error);
    // Don't throw error - leverage might already be set correctly
    return null;
  }
}

// Helper function to get futures account info to check available balance
async function getAccountInfo(apiKey: string, secretKey: string) {
    const response = await makeBybitFuturesRequest('/v5/account/wallet-balance', apiKey, secretKey, { accountType: 'UNIFIED' }, 'GET');
  
  
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
  
  
  return { balances };
}

// Helper function to get position information for a specific symbol
async function getPositionInfo(apiKey: string, secretKey: string, symbol: string) {
  try {
    // Normalize to Bybit-listed futures symbol
    const tradingSymbol = resolveBybitSymbol(symbol);
    
    console.log(`🔍 Looking for position: ${tradingSymbol}`);
    
    // Try different categories and account types to find the position
    const categories = ['linear', 'inverse', 'spot'];
    let foundPosition = null;
    
    for (const category of categories) {
      console.log(`🔍 Checking category: ${category}`);
      
      try {
        // For linear category, we need to provide settleCoin parameter
        const params: Record<string, string | number | boolean> = { category };
        if (category === 'linear') {
          params.settleCoin = 'USDT';
        }
        const response = await makeBybitFuturesRequest('/v5/position/list', apiKey, secretKey, params, 'GET');
        
        console.log(`📊 ${category} position response:`, JSON.stringify(response, null, 2));
        
        // Handle Bybit response structure
        const positions = response.result?.list || [];
        console.log(`📋 Found ${positions.length} positions in ${category}`);
        
        // Log all available positions for debugging
        positions.forEach((pos: BybitPositionData, index: number) => {
          console.log(`${category} Position ${index}:`, {
            symbol: pos.symbol,
            size: pos.size,
            side: pos.side,
            avgPrice: pos.avgPrice,
            markPrice: pos.markPrice,
            unrealisedPnl: pos.unrealisedPnl,
            category: pos.category
          });
        });
        
        // Find the position for the specific symbol
        const position = positions.find((pos: BybitPositionData) => pos.symbol === tradingSymbol);
        
        if (position) {
          console.log(`✅ Found position for ${tradingSymbol} in ${category}:`, position);
          foundPosition = {
            symbol: position.symbol,
            size: parseFloat(position.size || '0'),
            side: position.side, // Bybit uses 'Buy' or 'Sell' for side
            entryPrice: parseFloat(position.avgPrice || '0'),
            markPrice: parseFloat(position.markPrice || '0'),
            unrealizedPnl: parseFloat(position.unrealisedPnl || '0'),
            category: category
          };
          break;
        }
      } catch (categoryError) {
        console.log(`❌ Error checking ${category} category:`, categoryError);
      }
    }
    
    if (!foundPosition) {
      console.log(`❌ No position found for ${tradingSymbol} in any category`);
      return null;
    }
    
    return foundPosition;
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
    const formattedQuantityResult = formatQuantity(orderQuantity, lotSizeFilter);
    const formattedQuantity = formattedQuantityResult.value;
    
    // Format quantity as string with correct decimal places for Bybit API
    const quantityString = formattedQuantity.toFixed(formattedQuantityResult.decimalPlaces);

    // Determine the order side (LONG = Buy, SHORT = Sell)
    const orderSide = side === 'LONG' ? 'Buy' : 'Sell';

    // Execute the order
    const tradingSymbol = resolveBybitSymbol(symbol);
    
    // Bybit uses standard format (BTCUSDT)
    
    // Set leverage to 1x before placing the order
    await setLeverage(apiKey, secretKey, tradingSymbol, '1');
    
    const orderParams: Record<string, string | number> = {
      category: 'linear',
      symbol: tradingSymbol,
      side: orderSide,
      orderType: 'Market',
      qty: quantityString, // Use formatted quantity string with correct decimal places
      timeInForce: 'IOC',
      leverage: '1', // Enforce 1x leverage for risk management
    };

    const orderResult = await makeBybitFuturesRequest('/v5/order/create', apiKey, secretKey, orderParams);

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
    
    if (!positionInfo) {
      return {
        success: false,
        action: 'close',
        error: `No position found for ${symbol}`
      };
    }
    
    if (positionInfo.size === 0) {
      return {
        success: false,
        action: 'close',
        error: `Position for ${symbol} has zero size (already closed)`
      };
    }

    console.log(`Position found: ${positionInfo.size} ${symbol} (${positionInfo.side}) - PnL: ${positionInfo.unrealizedPnl.toFixed(2)} USDT`);

    // Determine the opposite side to close the position
    // Bybit returns 'Buy' for long positions and 'Sell' for short positions
    const closeSide = positionInfo.side === 'Buy' ? 'Sell' : 'Buy';

    // Execute the close order
    const tradingSymbol = resolveBybitSymbol(symbol);
    
    // Bybit uses standard format (BTCUSDT)
    
    // Ensure leverage is set to 1x before closing
    await setLeverage(apiKey, secretKey, tradingSymbol, '1');
    
    const orderParams: Record<string, string | number> = {
      category: positionInfo.category || 'linear', // Use the category where the position was found
      symbol: tradingSymbol,
      side: closeSide,
      orderType: 'Market',
      qty: positionInfo.size.toString(),
      timeInForce: 'IOC',
      leverage: '1', // Maintain 1x leverage consistency
    };

    const orderResult = await makeBybitFuturesRequest('/v5/order/create', apiKey, secretKey, orderParams);

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

    const results: Array<{
      apiKey: string;
      userId: string;
      success: boolean;
      action?: string;
      symbol?: string;
      side?: string;
      quantity?: number;
      price?: number;
      totalValue?: number;
      percentage?: number;
      order?: unknown;
      message?: string;
      error?: string;
      positionInfo?: {
        originalSide: string;
        entryPrice: number;
        markPrice: number;
        unrealizedPnl: number;
      };
    }> = [];

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
        let result: {
          success: boolean;
          action: string;
          symbol?: string;
          side?: string;
          quantity?: number;
          price?: number;
          totalValue?: number;
          percentage?: number;
          order?: unknown;
          message?: string;
          error?: string;
          positionInfo?: {
            originalSide: string;
            entryPrice: number;
            markPrice: number;
            unrealizedPnl: number;
          };
        };

        if (action === 'open') {
          // Open position
          result = await openPosition(apiKey, secretKey, symbol, side!, chatId);
        } else if (action === 'close') {
          // Close position
          result = await closePosition(apiKey, secretKey, symbol, chatId);
        } else {
          // This should never happen due to validation above, but TypeScript needs it
          result = {
            success: false,
            action,
            error: 'Invalid action'
          };
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
