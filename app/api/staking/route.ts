import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

interface StakingRequest {
  apiKey: string;
  secretKey: string;
  action: 'stake' | 'unstake';
  productId?: string; // Optional: specific product ID for USDT staking
  amount: number; // Amount to stake/unstake
}

// Helper function to create signed request for staking operations
async function makeSignedStakingRequest(endpoint: string, apiKey: string, secretKey: string, params: Record<string, string> = {}) {
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
    throw new Error(`Staking API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Helper function to get available USDT staking products
async function getUSDTStakingProducts(apiKey: string, secretKey: string) {
  try {
    // Alternative approach: try getting existing positions first to see product IDs
    let knownProductIds: string[] = [];
    
    // Try to get existing positions to see what USDT products exist
    try {
      const positionTimestamp = Date.now().toString();
      const positionQueryString = `timestamp=${positionTimestamp}`;
      const positionSignature = crypto
        .createHmac('sha256', secretKey)
        .update(positionQueryString)
        .digest('hex');
        
      const poolPositionsUrl = `https://api.binance.com/sapi/v1/simple-earn/flexible/position?${positionQueryString}&signature=${positionSignature}`;
      const positionResponse = await fetch(poolPositionsUrl, {
        headers: {'X-MBX-APIKEY': apiKey},
      });
      
      if (positionResponse.ok) {
        const positionsText = await positionResponse.text();
        if (positionsText && positionsText.trim()) {
          const positions = JSON.parse(positionsText);
          const usdtPositions = positions.rows?.filter((p: { asset: string }) => p.asset === 'USDT') || [];
          knownProductIds = usdtPositions.map((p: { productId: string }) => p.productId);
          console.log('Found existing USDT product IDs from positions:', knownProductIds);
        }
      }
    } catch (positionError) {
      console.log('Could not get positions for product ID detection:', positionError);
    }

    // Try with auth first (in case ProductList requires auth)
    const timestamp = Date.now().toString();
    const queryString = `timestamp=${timestamp}`;
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(queryString)
      .digest('hex');

    let response;
    
    // First try with authorization (as it's related to personalized products listing)
    const authUrl = `https://api.binance.com/sapi/v1/simple-earn/flexible/productList?${queryString}&signature=${signature}`;
    response = await fetch(authUrl, {
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });

    console.log('ProductList response status:', response.status);

    // If authorized request failed, try other approaches
    if (!response.ok) {
      console.log('Auth required endpoint failed, trying public endpoint');
      const publicUrl = `https://api.binance.com/sapi/v1/simple-earn/flexible/productList`;
      const publicResponse = await fetch(publicUrl, {
        headers: {
          'X-MBX-APIKEY': apiKey,
        },
      });
      
      if (!publicResponse.ok) {
        const errorText = await (response.ok ? await response.text() : await publicResponse.text());
        throw new Error(`Failed to get staking products: ${errorText}`);
      }
      
      response = publicResponse;
    }

    const responseText = await response.text();
    console.log('Raw ProductList response text:', responseText.substring(0, 500));

    // Check for empty response
    if (!responseText || responseText.trim() === '') {
      // If we have known product IDs from existing positions, suggest user use existing products
      if (knownProductIds.length > 0) {
        return knownProductIds.map(id => ({ productId: id, asset: 'USDT', status: 'SUBSCRIBABLE' }));
      }
      throw new Error('Empty response from Binance ProductList API. Please check API permissions (Simple Earn reading).');
    }

    // Parse JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Response content was not valid JSON:', responseText);
      throw new Error(`Invalid JSON response from Binance API: ${responseText.substring(0, 200)}...`);
    }
    
    console.log('Parsed ProductList data:', data);
    
    if (!data || (!Array.isArray(data) && !data.rows)) {
      throw new Error(`Unexpected API response format: ${JSON.stringify(data).substring(0, 200)}...`);
    }

    // Products could be directly in array or in a 'rows' object
    const productRows = Array.isArray(data) ? data : (data.rows || []);
    
    // Filter for USDT flexible products
    const usdtProducts = productRows.filter((product: { asset: string; status: string }) => 
      product.asset === 'USDT' && product.status === 'SUBSCRIBABLE'
    );

    console.log('Filtered USDT products:', usdtProducts);
    
    return usdtProducts;
  } catch (error) {
    console.error('Failed to get staking products:', error);
    throw error;
  }
}

// Helper function to get account balance
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
    const { apiKey, secretKey, action, productId, amount }: StakingRequest = await request.json();

    // Validate required fields
    if (!apiKey || !secretKey || !action || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields: apiKey, secretKey, action, amount' },
        { status: 400 }
      );
    }

    // Validate action
    if (action !== 'stake' && action !== 'unstake') {
      return NextResponse.json(
        { error: 'Invalid action. Must be "stake" or "unstake"' },
        { status: 400 }
      );
    }

    // Validate amount
    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      );
    }

    if (action === 'stake') {
      // Check USDT spot balance
      const accountInfo = await getAccountInfo(apiKey, secretKey);
      const usdtBalance = accountInfo.balances?.find((b: { asset: string }) => b.asset === 'USDT');
      const availableUsdt = parseFloat(usdtBalance?.free || '0');

      if (availableUsdt < amount) {
        return NextResponse.json(
          { 
            error: `Insufficient USDT balance. Available: ${availableUsdt.toFixed(2)} USDT, Required: ${amount.toFixed(2)} USDT`,
            availableBalance: availableUsdt,
            requestedAmount: amount
          },
          { status: 400 }
        );
      }

      // Get or auto-find USDT staking product
      let targetProductId = productId;
      if (!targetProductId) {
        try {
          const products = await getUSDTStakingProducts(apiKey, secretKey);
          if (products.length === 0) {
            return NextResponse.json(
              { error: 'No USDT staking products available. This may be due to API permissions or USDT staking being temporarily unavailable.' },
              { status: 400 }
            );
          }
          // Use the first available USDT staking product
          targetProductId = (products[0] as { productId: string }).productId;
        } catch (error) {
          console.error('Error fetching staking products:', error);
          
          // Since ProductList API isn't working, try to rely on the user providing 
          // instructions or suggest manual configuration
          return NextResponse.json(
            { 
              error: `Simple Earn ProductList API is not accessible (might need different authentication or permissions). Please contact Binance support to confirm that "Simple Earn" permissions are enabled on this API key, including both "Enable Simple Earn" and "Enable Reading" permissions. ProductList API returned: ${error instanceof Error ? error.message : 'Unknown error'}` 
            },
            { status: 403 }
          );
        }
      }

      // Stake USDT to flexible savings
      const stakingResult = await makeSignedStakingRequest('/sapi/v1/simple-earn/flexible/subscribe', apiKey, secretKey, {
        productId: targetProductId,
        amount: amount.toString()
      });

      return NextResponse.json({
        success: true,
        result: stakingResult,
        message: `Successfully staked ${amount} USDT to simple earn`,
        amount: amount,
        action: 'stake'
      });

    } else if (action === 'unstake') {
      // For unstaking, we need to check how much is currently staked
      const timestamp = Date.now().toString();
      const queryString = `timestamp=${timestamp}`;
      const signature = crypto
        .createHmac('sha256', secretKey)
        .update(queryString)
        .digest('hex');

      const positionUrl = `https://api.binance.com/sapi/v1/simple-earn/flexible/position?${queryString}&signature=${signature}`;
      
      const positionResponse = await fetch(positionUrl, {
        headers: {
          'X-MBX-APIKEY': apiKey,
        },
      });

      if (!positionResponse.ok) {
        const errorText = await positionResponse.text();
        throw new Error(`Failed to get staking positions: ${errorText}`);
      }

      const positionData = await positionResponse.json();
      const usdtPositions = positionData.rows?.filter((pos: { asset: string }) => 
        pos.asset === 'USDT'
      ) || [];

      if (usdtPositions.length === 0) {
        return NextResponse.json(
          { error: 'No staked USDT positions found' },
          { status: 400 }
        );
      }

      // Calculate total available USDT for unstaking
      const totalStaked = usdtPositions.reduce((sum: number, pos: { totalAmount?: string }) => 
        sum + parseFloat(pos.totalAmount || '0'), 0
      );

      if (amount > totalStaked) {
        return NextResponse.json(
          { 
            error: `Insufficient staked USDT. Available: ${totalStaked.toFixed(2)} USDT, Requested: ${amount.toFixed(2)} USDT`,
            availableStaked: totalStaked,
            requestedAmount: amount
          },
          { status: 400 }
        );
      }

      // Unstake USDT (unsubscribe from flexible savings)
      // Note: We'll unstake from the first available position
      const position = usdtPositions[0] as { productId: string; totalAmount: string };
      const unstakingResult = await makeSignedStakingRequest('/sapi/v1/simple-earn/flexible/redeem', apiKey, secretKey, {
        productId: position.productId,
        type: 'FAST', // FAST for immediate redemption, NORMAL for next-day redemption
        amount: Math.min(amount, parseFloat(position.totalAmount || '0')).toString()
      });

      return NextResponse.json({
        success: true,
        result: unstakingResult,
        message: `Successfully initiated unstaking of ${amount} USDT from simple earn`,
        amount: amount,
        action: 'unstake'
      });
    }

  } catch (error: unknown) {
    console.error('Staking API Error:', error);
    
    let errorMessage = 'Failed to process staking request';
    let statusCode = 500;

    if (error && typeof error === 'object' && 'message' in error) {
      const errorMsg = (error as Error).message;
      
      // Handle specific Binance API errors
      if (errorMsg.includes('-2010')) {
        errorMessage = 'Insufficient balance for this operation';
        statusCode = 400;
      } else if (errorMsg.includes('-1022')) {
        errorMessage = 'Signature validation failed. Please check your API credentials';
        statusCode = 401;
      } else if (errorMsg.includes('-2011')) {
        errorMessage = 'API key does not have the required permissions for staking operations';
        statusCode = 401;
      } else if (errorMsg.includes('-400')) {
        errorMessage = 'Invalid request parameters. Please check your staking details';
        statusCode = 400;
      } else {
        errorMessage = `Staking Error: ${errorMsg}`;
      }
    }

    return NextResponse.json(
      { 
        error: errorMessage
      },
      { status: statusCode }
    );
  }
}
