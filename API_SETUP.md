# BingX API Setup for Futures Trading with 1x Leverage

This application supports:
- **Futures Wallet** - Perpetual futures trading balances with PNL tracking
- **Trading** - Buy/sell futures orders to rebalance your portfolio with 1x leverage

## Required API Permissions

To access futures balances and enable trading functionality, your BingX API key needs specific permissions:

### 1. Futures Trading Permissions
1. Go to [BingX.com](https://www.bingx.com) → API Management
2. Select your API key or create a new one
3. Enable the following permissions:
   - ✅ **Enable Futures Trading** (for futures balances and trading)
   - ✅ **Enable Reading** (for balance information)

### 2. Trading Permissions (Required)
For futures trading to work, you need:
   - ✅ **Enable Futures Trading** (required for futures orders)
   - ✅ **Enable Reading** (required for balance information)
   
**Note**: Futures trading requires both permissions. The application uses 1x leverage for all trades to minimize risk.

### 4. Security Settings
- **IP Restrictions**: Recommended to whitelist your IP address
- **Trading Permissions**: Required for buy/sell functionality
- **Withdrawals**: Should be disabled for security

## API Endpoints Used

The application uses the following BingX Futures API endpoints:

### Futures Balances
- `GET /openApi/swap/v2/user/balance` - Account information and futures balances


### Trading Operations
- `GET /openApi/swap/v2/user/balance` - Account information for balance checks
- `GET /openApi/swap/v2/quote/price` - Current futures market prices
- `POST /openApi/swap/v2/trade/order` - Place buy/sell futures orders with 1x leverage
- `GET /openApi/swap/v2/quote/contracts` - Futures trading pair information

## Error Handling

The application includes comprehensive error handling for common issues:

### Common Error Codes
- **INVALID_SIGNATURE**: Signature validation failed (check credentials, time sync, IP restrictions)
- **INVALID_API_KEY**: Invalid API key
- **MISSING_API_KEY**: Missing API key  
- **INVALID_CREDENTIALS**: Invalid API key/secret
- **INSUFFICIENT_PERMISSIONS**: No permissions (enable required permissions)
- **REQUEST_TIMEOUT**: Request timeout
- **RATE_LIMIT_EXCEEDED**: Rate limit exceeded

### Troubleshooting
1. **Time Synchronization**: Ensure your system time is synchronized
2. **IP Restrictions**: Add your IP to the whitelist if enabled
3. **Permissions**: Verify all required permissions are enabled
4. **API Key Status**: Ensure the API key is active and not expired

## Security Best Practices

1. **Use Read-Only Permissions**: Disable trading permissions if you only need balance information
2. **Enable IP Restrictions**: Whitelist only the IPs you use
3. **Regular Key Rotation**: Change API keys periodically
4. **Monitor Usage**: Check for unusual API activity
5. **Secure Storage**: Store API credentials securely

## Testing Your Setup

1. Enter your API credentials in the application
2. Click "Test Credentials" to verify basic connectivity
3. Check the wallet breakdown to see your futures balances
4. The application will automatically execute futures trades with 1x leverage when rebalancing
5. If balances don't appear or trading fails, check the console for specific error messages

## Important Notes

- **Leverage**: All trades are executed with 1x leverage to minimize risk
- **Futures Trading**: This application trades perpetual futures contracts, not spot assets
- **Risk Management**: Futures trading involves additional risks compared to spot trading
- **Margin Requirements**: Ensure you have sufficient margin in your futures account
- **Portfolio Allocation**: All portfolio allocations must sum to exactly 100%
- **Automatic Normalization**: If allocations don't sum to 100%, the system will automatically normalize them proportionally

## Support

If you encounter issues:
1. Check the browser console for detailed error messages
2. Verify your API key permissions match the requirements above
3. Test your credentials using the BingX API Management page
4. Ensure your system time is synchronized with BingX servers 