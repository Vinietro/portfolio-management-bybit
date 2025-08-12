import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { FuturesPosition } from '../../types';

// Helper function to create signed request for futures API
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

export async function POST(request: NextRequest) {
  try {
    const { apiKey, secretKey } = await request.json();

    if (!apiKey || !secretKey) {
      return NextResponse.json(
        { error: 'API Key and Secret Key are required' },
        { status: 400 }
      );
    }

    // Get futures positions
    const positions = await makeSignedRequest('/fapi/v2/positionRisk', apiKey, secretKey);
    
    // Filter only open positions (positionAmt !== '0')
    const openPositions: FuturesPosition[] = positions
      .filter((position: Record<string, unknown>) => parseFloat(position.positionAmt as string) !== 0)
      .map((position: Record<string, unknown>) => {
        const positionAmt = parseFloat(position.positionAmt as string);
        const entryPrice = parseFloat(position.entryPrice as string);
        const markPrice = parseFloat(position.markPrice as string);
        const notional = parseFloat(position.notional as string);
        const unRealizedProfit = parseFloat(position.unRealizedProfit as string);
        
        // Determine position side
        const side = positionAmt > 0 ? 'LONG' : 'SHORT';
        const size = Math.abs(positionAmt);
        
        // Calculate values
        const entryValue = size * entryPrice;
        const currentValue = size * markPrice;
        
        // Calculate PNL and ROE
        const pnl = side === 'LONG' ? currentValue - entryValue : entryValue - currentValue;
        const pnlPercentage = entryValue > 0 ? (pnl / entryValue) * 100 : 0;
        const roe = notional > 0 ? (unRealizedProfit / notional) * 100 : 0;

        return {
          symbol: position.symbol as string,
          positionAmt: position.positionAmt as string,
          entryPrice: position.entryPrice as string,
          markPrice: position.markPrice as string,
          unRealizedProfit: position.unRealizedProfit as string,
          liquidationPrice: position.liquidationPrice as string,
          leverage: position.leverage as string,
          marginType: position.marginType as string,
          isolatedMargin: position.isolatedMargin as string,
          isAutoAddMargin: position.isAutoAddMargin as string,
          positionSide: position.positionSide as string,
          notional: position.notional as string,
          isolatedWallet: position.isolatedWallet as string,
          updateTime: position.updateTime as number,
          isolated: position.marginType === 'isolated',
          adlQuantile: position.adlQuantile as number,
          side,
          size,
          entryValue,
          currentValue,
          pnl,
          pnlPercentage,
          roe
        };
      });

    // Sort positions by absolute PNL (highest first)
    openPositions.sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));

    return NextResponse.json({
      positions: openPositions,
      totalPositions: openPositions.length,
      totalPnl: openPositions.reduce((sum, pos) => sum + pos.pnl, 0),
      totalNotional: openPositions.reduce((sum, pos) => sum + parseFloat(pos.notional), 0)
    });

  } catch (error: unknown) {
    console.error('Error fetching futures positions:', error);
    
    let errorMessage = 'Failed to fetch futures positions from Binance';
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
          errorMessage = `API Error (${errorCode}): Failed to fetch futures positions`;
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
