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

    // Test the credentials by getting account info
    const accountInfo = await client.accountInfo();

    return NextResponse.json({ 
      success: true, 
      message: 'Credentials are valid',
      accountType: accountInfo.accountType 
    });

  } catch (error) {
    console.error('Error testing credentials:', error);
    return NextResponse.json(
      { error: 'Invalid credentials or API error' },
      { status: 401 }
    );
  }
} 