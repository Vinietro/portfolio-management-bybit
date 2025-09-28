import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser, saveCredentials, getCredentials, generateDeviceId, deleteCredentials } from '../../../lib/database';

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
    let errorDetails: string | undefined;
    
    if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = error.message as string;
    }
    
    // Check for specific encryption-related errors
    if (errorMessage.includes('Invalid encryption key') || errorMessage.includes('ENCRYPTION_KEY')) {
      errorMessage = 'Encryption configuration error. Please contact support.';
      errorDetails = 'The encryption key is not properly configured.';
    }

    return NextResponse.json(
      { 
        error: errorMessage,
        details: errorDetails,
        timestamp: new Date().toISOString()
      },
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

export async function DELETE(request: NextRequest) {
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
    
    // Delete credentials
    const result = await deleteCredentials(userId, deviceId);
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Credentials disconnected successfully'
      });
    } else {
      return NextResponse.json({
        success: false,
        message: result.message || 'No credentials found to disconnect'
      });
    }

  } catch (error: unknown) {
    console.error('Credentials disconnect error:', error);
    
    let errorMessage = 'Failed to disconnect credentials';
    if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = error.message as string;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

