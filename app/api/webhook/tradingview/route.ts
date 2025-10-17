import { NextRequest, NextResponse } from 'next/server';

interface TradingViewWebhookPayload {
  action: 'open' | 'close' | 'alert';
  symbol?: string;  // Required for open and close actions
  side?: 'LONG' | 'SHORT'; // Required for open action
  alertMessage?: string; // Required for alert action
  authKey?: string; // Authentication key for webhook verification
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, symbol, side, alertMessage, authKey }: TradingViewWebhookPayload = body;

    // Validate authentication key
    const expectedAuthKey = process.env.WEBHOOK_AUTH_KEY;
    if (!expectedAuthKey) {
      console.error('WEBHOOK_AUTH_KEY environment variable not set');
      return NextResponse.json(
        { error: 'Webhook authentication not configured' },
        { status: 500 }
      );
    }

    if (!authKey || authKey !== expectedAuthKey) {
      return NextResponse.json(
        { error: 'Invalid authentication key provided' },
        { status: 401 }
      );
    }

    // Validate required fields
    if (!action) {
      return NextResponse.json(
        { error: 'Missing required field: action' },
        { status: 400 }
      );
    }

    // Validate action
    if (!['open', 'close', 'alert'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "open", "close", or "alert"' },
        { status: 400 }
      );
    }

    // Validate action-specific requirements
    if ((action === 'open' || action === 'close') && !symbol) {
      return NextResponse.json(
        { error: `Symbol is required for "${action}" action` },
        { status: 400 }
      );
    }

    if (action === 'open' && !side) {
      return NextResponse.json(
        { error: 'Side is required for "open" action. Must be "LONG" or "SHORT"' },
        { status: 400 }
      );
    }

    if (action === 'alert' && !alertMessage) {
      return NextResponse.json(
        { error: 'Alert message is required for "alert" action' },
        { status: 400 }
      );
    }

    console.log(`TradingView Webhook - Action: ${action}, Using merged trading endpoint`);

    // Use the merged trading endpoint with all credentials from database
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    const requestBody: {
      action: string;
      symbol: string;
      side?: string;
      alertMessage?: string;
    } = {
      action,
      symbol: symbol || ''
    };

    // Add action-specific parameters
    if (action === 'open') {
      requestBody.side = side;
    } else if (action === 'alert') {
      requestBody.alertMessage = alertMessage;
    }

    const response = await fetch(`${baseUrl}/api/trading`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(
        { 
          error: 'Failed to execute trading action',
          details: errorData.error || `HTTP ${response.status}: ${response.statusText}`
        },
        { status: response.status }
      );
    }

    const result = await response.json();
    
    if (!result.success) {
      return NextResponse.json(
        { 
          error: 'Trading action failed',
          details: result.error || 'Unknown error'
        },
        { status: 500 }
      );
    }

    // Return the result from the merged trading endpoint
    return NextResponse.json({
      success: true,
      message: `TradingView webhook processed successfully`,
      action: action,
      symbol: symbol || 'ALL',
      timestamp: new Date().toISOString(),
      tradingResult: result
    });

  } catch (error: unknown) {
    console.error('TradingView Webhook Error:', error);
    
    let errorMessage = 'Failed to process TradingView webhook';
    const statusCode = 500;

    if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = (error as Error).message;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not supported. Use POST to process TradingView webhooks.' },
    { status: 405 }
  );
}