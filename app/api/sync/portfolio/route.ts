import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser, savePortfolio, getPortfolio, generateDeviceId } from '../../../lib/database';

export async function POST(request: NextRequest) {
  try {
    const { portfolio, deviceId } = await request.json();

    if (!portfolio) {
      return NextResponse.json(
        { error: 'Portfolio data is required' },
        { status: 400 }
      );
    }

    // Generate device ID if not provided
    const currentDeviceId = deviceId || generateDeviceId();
    
    // Get or create user
    const userId = await getOrCreateUser(currentDeviceId);
    
    // Save portfolio
    const result = await savePortfolio(userId, portfolio, currentDeviceId);
    
    return NextResponse.json({
      success: true,
      deviceId: currentDeviceId,
      version: result.version,
      message: 'Portfolio synced successfully'
    });

  } catch (error: unknown) {
    console.error('Portfolio sync error:', error);
    
    let errorMessage = 'Failed to sync portfolio';
    if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = error.message as string;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json(
        { error: 'Device ID is required' },
        { status: 400 }
      );
    }

    // Get user
    const userId = await getOrCreateUser(deviceId);
    
    // Get portfolio
    const portfolio = await getPortfolio(userId);
    
    if (!portfolio) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No portfolio data found'
      });
    }

    return NextResponse.json({
      success: true,
      data: portfolio.data,
      version: portfolio.version,
      updatedAt: portfolio.updatedAt,
      message: 'Portfolio retrieved successfully'
    });

  } catch (error: unknown) {
    console.error('Portfolio fetch error:', error);
    
    let errorMessage = 'Failed to fetch portfolio';
    if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = error.message as string;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

