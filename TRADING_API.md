# Trading API Documentation

## Single Unified Endpoint: `/api/trading`

This endpoint provides 3 simple functionalities:

1. **Open a position** (LONG/SHORT) for all users
2. **Send an alert message** to Telegram
3. **Close an open position** for a specific symbol

## Usage

### 1. Open Position

Opens a LONG or SHORT position for all users in the database. The position size is automatically calculated based on the symbol's percentage allocation from the database. **Automatically sends Telegram alert when position is opened.**

```bash
curl -X POST http://localhost:3000/api/trading \
  -H "Content-Type: application/json" \
  -d '{
    "action": "open",
    "symbol": "BTCUSDT",
    "side": "LONG",
    "authKey": "your-webhook-auth-key",
    "chatId": "your-telegram-chat-id"
  }'
```

**Parameters:**
- `action`: `"open"`
- `symbol`: Symbol to trade (e.g., "BTCUSDT", "ETHUSDT")
- `side`: `"LONG"` or `"SHORT"`
- `authKey`: Authentication key (required)
- `chatId`: Telegram chat ID (optional - uses environment variable if not provided)

### 2. Send Alert

Sends a custom message to Telegram for all users.

```bash
curl -X POST http://localhost:3000/api/trading \
  -H "Content-Type: application/json" \
  -d '{
    "action": "alert",
    "symbol": "BTCUSDT",
    "alertMessage": "🚨 Price Alert: BTCUSDT reached $50,000!",
    "authKey": "your-webhook-auth-key",
    "chatId": "your-telegram-chat-id"
  }'
```

**Parameters:**
- `action`: `"alert"`
- `symbol`: Symbol for context (optional but recommended)
- `alertMessage`: Message to send to Telegram
- `authKey`: Authentication key (required)
- `chatId`: Telegram chat ID (optional - uses environment variable if not provided)

### 3. Close Position

Closes an existing position for a specific symbol across all users. **Automatically sends Telegram alert when position is closed.**

```bash
curl -X POST http://localhost:3000/api/trading \
  -H "Content-Type: application/json" \
  -d '{
    "action": "close",
    "symbol": "BTCUSDT",
    "authKey": "your-webhook-auth-key",
    "chatId": "your-telegram-chat-id"
  }'
```

**Parameters:**
- `action`: `"close"`
- `symbol`: Symbol to close position for
- `authKey`: Authentication key (required)
- `chatId`: Telegram chat ID (optional - uses environment variable if not provided)

## Authentication

All requests to `/api/trading` require authentication via the `authKey` parameter. This should match your `WEBHOOK_AUTH_KEY` environment variable.

## TradingView Webhook

The webhook endpoint (`/api/webhook/tradingview`) supports the same actions and also requires the `authKey`:

```bash
# Open LONG position
curl -X POST http://localhost:3000/api/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "action": "open",
    "symbol": "BTCUSDT",
    "side": "LONG",
    "authKey": "your-webhook-auth-key"
  }'

# Close position
curl -X POST http://localhost:3000/api/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "action": "close",
    "symbol": "BTCUSDT",
    "authKey": "your-webhook-auth-key"
  }'

# Send alert
curl -X POST http://localhost:3000/api/webhook/tradingview \
  -H "Content-Type: application/json" \
  -d '{
    "action": "alert",
    "symbol": "BTCUSDT",
    "alertMessage": "TradingView Signal: BTCUSDT BUY",
    "authKey": "your-webhook-auth-key"
  }'
```

## Response Format

All endpoints return a consistent response format:

```json
{
  "success": true,
  "action": "open|close|alert",
  "symbol": "BTCUSDT",
  "totalCredentials": 2,
  "results": [
    {
      "apiKey": "12345678...",
      "userId": "user-123",
      "success": true,
      "action": "open",
      "symbol": "BTCUSDT",
      "side": "LONG",
      "quantity": 0.002,
      "price": 50000.00,
      "totalValue": 100.00,
      "percentage": 15.00,
      "message": "LONG position opened successfully..."
    }
  ],
  "timestamp": "2025-01-17T20:56:42.821Z"
}
```

## Key Features

- **Automatic Percentage Allocation**: Uses percentages from database for position sizing
- **All Users**: Executes for all credentials in the database
- **Telegram Alerts**: Automatic notifications for all actions
- **Error Handling**: Continues processing other users if one fails
- **Position Detection**: Automatically finds and closes existing positions
- **Futures Trading**: All trades **automatically use 1x leverage** on Bybit futures (enforced by the system)

## Error Handling

The API gracefully handles errors:
- Invalid symbols (not in database configuration)
- Insufficient balance
- No existing position to close
- Invalid API credentials
- Network issues

Each user's result is processed independently, so failures don't affect other users.
