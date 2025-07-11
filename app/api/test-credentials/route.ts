import { NextRequest, NextResponse } from 'next/server';
import Binance from 'binance-api-node';

export async function POST(request: NextRequest) {
  try {
    const { apiKey, secretKey } = await request.json();

    if (!apiKey || !secretKey) {
      return NextResponse.json(
        { error: 'API Key and Secret Key are required' },
        { status: 400 }
      );
    }

    // Create Binance client with proper credentials
    const client = Binance({
      apiKey: apiKey,
      apiSecret: secretKey
    });

    // First, test with a simple ping to check connectivity
    try {
      await client.ping();
    } catch (pingError) {
      console.error('Ping failed:', pingError);
      return NextResponse.json(
        { error: 'Unable to connect to Binance API. Please check your internet connection.' },
        { status: 500 }
      );
    }

    // Get server time to check for time synchronization
    let serverTime;
    try {
      serverTime = await client.time();
      const timeDiff = Math.abs(Date.now() - serverTime);
      
      if (timeDiff > 5000) { // If time difference is more than 5 seconds
        console.warn(`Time synchronization issue detected. Server time: ${serverTime}, Local time: ${Date.now()}, Difference: ${timeDiff}ms`);
      }
    } catch (timeError) {
      console.error('Failed to get server time:', timeError);
    }

    // Test the credentials by getting account info
    const accountInfo = await client.accountInfo();

    return NextResponse.json({ 
      success: true, 
      message: 'Credentials are valid',
      accountType: accountInfo.accountType,
      permissions: accountInfo.permissions,
      serverTime: serverTime,
      timeSync: serverTime ? Math.abs(Date.now() - serverTime) : null
    });

  } catch (error: unknown) {
    console.error('Error testing credentials:', error);
    
    // Provide more specific error messages based on the error code
    let errorMessage = 'Invalid credentials or API error';
    let statusCode = 401;
    let errorCode: number | undefined;
    let errorDetails: string | undefined;

    if (error && typeof error === 'object' && 'code' in error) {
      errorCode = error.code as number;
      errorDetails = (error as { msg?: string; message?: string }).msg || (error as { msg?: string; message?: string }).message;
      
      switch (errorCode) {
        case -1022:
          errorMessage = 'Signature validation failed. This could be due to: 1) Incorrect API secret, 2) Time synchronization issues, 3) IP restrictions on your API key';
          break;
        case -2015:
          errorMessage = 'Invalid API key. Please check your API key and ensure it has the correct permissions.';
          break;
        case -2014:
          errorMessage = 'API key is missing or invalid. Please check your API key.';
          break;
        case -2013:
          errorMessage = 'Invalid API key or secret. Please verify your credentials.';
          break;
        case -2011:
          errorMessage = 'API key does not have the required permissions. Please check your API key permissions in Binance.';
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
          errorMessage = `API Error (${errorCode}): ${errorDetails || 'Unknown error'}`;
      }
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = (error as Error).message;
    }

    return NextResponse.json(
      { 
        error: errorMessage,
        code: errorCode,
        details: errorDetails
      },
      { status: statusCode }
    );
  }
} 