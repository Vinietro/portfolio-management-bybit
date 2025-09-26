import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { calculatePortfolioPNL } from '../../lib/database';

export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key is required' },
        { status: 400 }
      );
    }

    // Hash the API key to match how we store it in the database
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Calculate P&L data
    const pnlData = await calculatePortfolioPNL(apiKeyHash);

    return NextResponse.json({
      success: true,
      pnlData: {
        totalPNL: pnlData.totalPNL,
        totalPNLPercentage: pnlData.totalPNLPercentage,
        breakdown: pnlData.breakdown
      }
    });

  } catch (error: unknown) {
    console.error('PNL History API Error:', error);
    
    let errorMessage = 'Failed to calculate P&L data';
    const statusCode = 500;

    if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = (error as Error).message;
    }

    return NextResponse.json(
      { 
        error: errorMessage 
      },
      { status: statusCode }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not supported. Use POST to retrieve P&L data.' },
    { status: 405 }
  );
}
