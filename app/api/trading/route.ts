import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

interface TradingRequest {
  apiKey: string;
  secretKey: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  type: 'MARKET';
}

// Helper function to create signed request for trading
async function makeSignedTradingRequest(endpoint: string, apiKey: string, secretKey: string, params: Record<string, string> = {}) {
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

  return response.json();
}

// Helper function to get current price for a symbol
async function getCurrentPrice(symbol: string): Promise<number> {
  const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
  if (!response.ok) {
    throw new Error('Failed to fetch current price');
  }
  const data = await response.json();
  return parseFloat(data.price);
}

// Helper function to get exchange info for a symbol to get trading rules
async function getExchangeInfo(symbol: string) {
  console.log('Fetching exchange info for symbol:', `${symbol}USDT`);
  const response = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${symbol}USDT`);
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to fetch exchange info:', response.status, errorText);
    throw new Error(`Failed to fetch exchange info: ${response.status} ${errorText}`);
  }
  const data = await response.json();
  console.log('Exchange info response:', data);
  
  if (!data.symbols || data.symbols.length === 0) {
    throw new Error(`Symbol ${symbol}USDT not found in exchange info`);
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

export async function POST(request: NextRequest) {
  try {
    const { apiKey, secretKey, symbol, side, quantity, type }: TradingRequest = await request.json();

    console.log('Trading request:', { symbol, side, quantity, type });

    // Validate required fields
    if (!apiKey || !secretKey || !symbol || !side || !quantity || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: apiKey, secretKey, symbol, side, quantity, type' },
        { status: 400 }
      );
    }

    // Validate side
    if (side !== 'BUY' && side !== 'SELL') {
      return NextResponse.json(
        { error: 'Invalid side. Must be BUY or SELL' },
        { status: 400 }
      );
    }

    // Validate quantity
    if (quantity <= 0) {
      return NextResponse.json(
        { error: 'Quantity must be greater than 0' },
        { status: 400 }
      );
    }

    // Get exchange info to get trading rules
    console.log('Fetching exchange info for:', symbol);
    const exchangeInfo = await getExchangeInfo(symbol);
    console.log('Exchange info received:', exchangeInfo);
    
    const lotSizeFilter = exchangeInfo.filters.find((f: { filterType: string }) => f.filterType === 'LOT_SIZE');
    const minNotionalFilter = exchangeInfo.filters.find((f: { filterType: string }) => f.filterType === 'MIN_NOTIONAL');
    
    console.log('Filters found:', { lotSizeFilter, minNotionalFilter });
    
    if (!lotSizeFilter) {
      return NextResponse.json(
        { error: 'Could not get trading rules for this symbol' },
        { status: 400 }
      );
    }

    // For BUY orders, we need to convert USD amount to coin quantity
    let orderQuantity = quantity;
    if (side === 'BUY') {
      // Get current price to convert USD amount to coin quantity
      const currentPrice = await getCurrentPrice(symbol);
      orderQuantity = quantity / currentPrice;
      
      // Check if user has enough USDT balance
      const accountInfo = await getAccountInfo(apiKey, secretKey);
      const usdtBalance = accountInfo.balances.find((b: { asset: string }) => b.asset === 'USDT');
      const availableUsdt = parseFloat(usdtBalance?.free || '0');
      
      if (availableUsdt < quantity) {
        return NextResponse.json(
          { error: `Insufficient USDT balance. Available: ${availableUsdt.toFixed(2)} USDT, Required: ${quantity.toFixed(2)} USDT` },
          { status: 400 }
        );
      }
    } else {
      // For SELL orders, check if user has enough coin balance
      console.log('Checking balance for SELL order');
      const accountInfo = await getAccountInfo(apiKey, secretKey);
      console.log('Account info received, looking for balance of:', symbol);
      
      const coinBalance = accountInfo.balances.find((b: { asset: string }) => b.asset === symbol);
      console.log('Coin balance found:', coinBalance);
      
      const availableCoin = parseFloat(coinBalance?.free || '0');
      console.log('Available coin balance:', availableCoin, 'Required quantity:', quantity);
      
      if (availableCoin < quantity) {
        return NextResponse.json(
          { 
            error: `Insufficient ${symbol} balance. Available: ${availableCoin.toFixed(6)} ${symbol}, Required: ${quantity.toFixed(6)} ${symbol}. You cannot sell more than you own.`,
            availableBalance: availableCoin,
            requestedQuantity: quantity,
            symbol: symbol
          },
          { status: 400 }
        );
      }
    }

    // Format quantity according to LOT_SIZE filter
    console.log('Before formatting - orderQuantity:', orderQuantity);
    console.log('LOT_SIZE filter:', lotSizeFilter);
    orderQuantity = formatQuantity(orderQuantity, lotSizeFilter);
    console.log('After formatting - orderQuantity:', orderQuantity);
    
    // Check if formatted quantity is zero or too small
    if (orderQuantity <= 0) {
      return NextResponse.json(
        { error: `Order quantity too small. After applying trading rules, quantity became ${orderQuantity}. Minimum required quantity is ${parseFloat(lotSizeFilter.minQty)} ${symbol}.` },
        { status: 400 }
      );
    }
    
    // Check minimum notional value
    const currentPriceForValidation = await getCurrentPrice(symbol);
    const notionalValue = orderQuantity * currentPriceForValidation;
    console.log('Notional value check:', { notionalValue, minNotional: minNotionalFilter?.minNotional });
    
    if (minNotionalFilter && notionalValue < parseFloat(minNotionalFilter.minNotional)) {
      return NextResponse.json(
        { error: `Order value too small. Minimum notional value is ${minNotionalFilter.minNotional} USDT, your order value is ${notionalValue.toFixed(2)} USDT` },
        { status: 400 }
      );
    }

    // Prepare order parameters
    const orderParams: Record<string, string> = {
      symbol: `${symbol}USDT`,
      side: side,
      type: type,
      quantity: orderQuantity.toString(),
    };

    console.log('Final order parameters:', orderParams);

    // Execute the order
    const orderResult = await makeSignedTradingRequest('/api/v3/order', apiKey, secretKey, orderParams);

    // Get current price for response
    const finalCurrentPrice = await getCurrentPrice(symbol);
    
    return NextResponse.json({
      success: true,
      order: orderResult,
      symbol: symbol,
      side: side,
      quantity: orderQuantity,
      price: finalCurrentPrice,
      totalValue: orderQuantity * finalCurrentPrice,
      message: `${side} order executed successfully for ${orderQuantity.toFixed(6)} ${symbol} at ${finalCurrentPrice.toFixed(2)} USDT`
    });

  } catch (error: unknown) {
    console.error('Trading API Error:', error);
    
    let errorMessage = 'Failed to execute trading order';
    let statusCode = 500;
    let errorCode: number | undefined;

    if (error && typeof error === 'object' && 'message' in error) {
      const errorMsg = error.message as string;
      
      // Handle specific Binance API errors
      if (errorMsg.includes('-2010')) {
        errorMessage = 'Insufficient balance for this order';
        statusCode = 400;
      } else if (errorMsg.includes('-1013')) {
        if (errorMsg.includes('LOT_SIZE')) {
          errorMessage = 'Invalid quantity. The order size does not meet the minimum requirements for this trading pair. Please try with a larger amount.';
        } else {
          errorMessage = 'Invalid quantity. Please check the minimum order size requirements';
        }
        statusCode = 400;
      } else if (errorMsg.includes('-1121')) {
        errorMessage = 'Invalid symbol. Please check the trading pair';
        statusCode = 400;
      } else if (errorMsg.includes('-1022')) {
        errorMessage = 'Signature validation failed. Please check your API credentials';
        statusCode = 401;
      } else if (errorMsg.includes('-2015')) {
        errorMessage = 'Invalid API key';
        statusCode = 401;
      } else if (errorMsg.includes('-2011')) {
        errorMessage = 'API key does not have trading permissions';
        statusCode = 401;
      } else if (errorMsg.includes('-1003')) {
        errorMessage = 'Rate limit exceeded. Please wait before making more requests';
        statusCode = 429;
      } else {
        errorMessage = `Trading Error: ${errorMsg}`;
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
