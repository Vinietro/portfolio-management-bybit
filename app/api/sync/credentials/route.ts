import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser, saveCredentials, getCredentials, generateDeviceId } from '../../../lib/database';

export async function POST(request: NextRequest) {
  try {
    const { credentials, deviceId } = await request.json();

    if (!credentials) {
      return NextResponse.json(
        { error: 'Credentials data is required' },
        { status: 400 }
      );
    }

    // Generate device ID if not provided
    const currentDeviceId = deviceId || generateDeviceId();
    
    // Get or create user
    const userId = await getOrCreateUser(currentDeviceId);
    
    // Save credentials (encrypted)
    const result = await saveCredentials(userId, credentials, currentDeviceId);
    
    return NextResponse.json({
      success: true,
      deviceId: currentDeviceId,
      version: result.version,
      message: 'Credentials synced successfully'
    });

  } catch (error: unknown) {
    console.error('Credentials sync error:', error);
    
    let errorMessage = 'Failed to sync credentials';
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
    
    // Get credentials (decrypted)
    const credentials = await getCredentials(userId);
    
    if (!credentials) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No credentials found'
      });
    }

    return NextResponse.json({
      success: true,
      data: credentials.data,
      version: credentials.version,
      updatedAt: credentials.updatedAt,
      message: 'Credentials retrieved successfully'
    });

  } catch (error: unknown) {
    console.error('Credentials fetch error:', error);
    
    let errorMessage = 'Failed to fetch credentials';
    if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = error.message as string;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

