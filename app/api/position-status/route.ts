import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPositionStatus, getPositionStatusBySymbols } from '../../lib/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get('apiKey');
    const symbol = searchParams.get('symbol');
    const symbols = searchParams.get('symbols');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 }
      );
    }

    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    let positionStatus;

    if (symbols) {
      // Get position status for multiple symbols
      try {
        const symbolsArray = JSON.parse(symbols);
        positionStatus = await getPositionStatusBySymbols(apiKeyHash, symbolsArray);
      } catch {
        return NextResponse.json(
          { error: 'Invalid symbols format. Should be JSON array of strings.' },
          { status: 400 }
        );
      }
    } else {
      // Get position status for single symbol or all symbols
      positionStatus = await getPositionStatus(apiKeyHash, symbol || undefined);
    }

    return NextResponse.json({
      success: true,
      data: positionStatus
    });

  } catch (error) {
    console.error('Error fetching position status:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch position status' 
      },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function POST() {
  return NextResponse.json(
    { error: 'Method not supported. Use GET to fetch position status.' },
    { status: 405 }
  );
}
