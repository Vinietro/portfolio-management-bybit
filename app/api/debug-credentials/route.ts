import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateUser, generateDeviceId } from '../../lib/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId') || generateDeviceId();
    
    // Get or create user
    const userId = await getOrCreateUser(deviceId);
    
    // Check environment variables
    const envCheck = {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
      encryptionKeyLength: process.env.ENCRYPTION_KEY?.length || 0,
      nodeEnv: process.env.NODE_ENV,
    };
    
    return NextResponse.json({
      success: true,
      deviceId,
      userId,
      environment: envCheck,
      message: 'Debug information retrieved successfully'
    });

  } catch (error: unknown) {
    console.error('Debug credentials error:', error);
    
    let errorMessage = 'Failed to get debug information';
    if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = error.message as string;
    }

    return NextResponse.json(
      { 
        error: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
