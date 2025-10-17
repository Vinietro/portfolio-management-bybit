import { NextRequest, NextResponse } from 'next/server';
import { calculatePnlData } from '../../lib/pnl-calculator';

interface PnlData {
  asset: string;
  totalQuantity: number;
  averagePrice: number;
  currentPrice: number;
  totalValue: number;
  totalCost: number;
  pnl: number;
  pnlPercentage: number;
}

export async function POST(request: NextRequest) {
  try {
    const { apiKey, secretKey, assets } = await request.json();

    if (!apiKey || !secretKey) {
      return NextResponse.json(
        { error: 'API Key and Secret Key are required' },
        { status: 400 }
      );
    }

    if (!assets || !Array.isArray(assets)) {
      return NextResponse.json(
        { error: 'Assets array is required' },
        { status: 400 }
      );
    }

    // Use the shared PNL calculation function
    const pnlDataMap = await calculatePnlData(apiKey, secretKey, assets);
    
    // Convert to the expected format for the PNL API
    const pnlData: PnlData[] = [];
    
    for (const [asset, data] of Object.entries(pnlDataMap)) {
      // Note: The shared function only returns pnl and pnlPercentage
      // For the PNL API, we need to create a more complete object
      // This is a simplified version - you might want to enhance the shared function
      pnlData.push({
        asset,
        totalQuantity: 0, // Not calculated in shared function
        averagePrice: 0,  // Not calculated in shared function
        currentPrice: 0,  // Not calculated in shared function
        totalValue: 0,    // Not calculated in shared function
        totalCost: 0,     // Not calculated in shared function
        pnl: data.pnl,
        pnlPercentage: data.pnlPercentage
      });
    }

    return NextResponse.json({ pnlData });

  } catch (error: unknown) {
    console.error('Error fetching PNL data:', error);
    
    let errorMessage = 'Failed to fetch PNL data from BingX';
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
        default:
          errorMessage = `API Error (${errorCode}): Failed to fetch PNL data`;
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