# Binance API Setup for Futures and Earn Balances

This application now supports fetching balances from all three Binance wallets:
- **Spot Wallet** - Regular trading balances
- **Futures Wallet** - Futures trading balances  
- **Earn Wallet** - Simple Earn positions

## Required API Permissions

To access futures and earn balances, your Binance API key needs specific permissions:

### 1. Futures Trading Permissions
1. Go to [Binance.com](https://www.binance.com) → API Management
2. Select your API key or create a new one
3. Enable the following permissions:
   - ✅ **Enable Futures**
   - ✅ **Enable Reading** (for balance information)
   - ✅ **Enable Spot & Margin Trading** (for spot balances)

### 2. Simple Earn Permissions
1. In the same API Management page
2. Enable the following permissions:
   - ✅ **Enable Simple Earn**
   - ✅ **Enable Reading** (for earn balance information)

### 3. Security Settings
- **IP Restrictions**: Recommended to whitelist your IP address
- **Trading Permissions**: Can be disabled if you only need to read balances
- **Withdrawals**: Should be disabled for security

## API Endpoints Used

The application uses the following Binance API endpoints:

### Spot Balances
- `GET /api/v3/account` - Account information and spot balances

### Futures Balances  
- `GET /fapi/v2/account` - Futures account information and balances

### Earn Balances
- `GET /sapi/v1/simple-earn/flexible/position` - Simple Earn flexible positions
- `GET /sapi/v1/simple-earn/account` - Simple Earn account summary (fallback)

## Error Handling

The application includes comprehensive error handling for common issues:

### Common Error Codes
- **-1022**: Signature validation failed (check credentials, time sync, IP restrictions)
- **-2015**: Invalid API key
- **-2014**: Missing API key  
- **-2013**: Invalid API key/secret
- **-2011**: No permissions (enable required permissions)
- **-1001**: Request timeout
- **-1003**: Rate limit exceeded

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
3. Check the wallet breakdown to see balances from all three wallets
4. If futures or earn balances don't appear, check the console for specific error messages

## Support

If you encounter issues:
1. Check the browser console for detailed error messages
2. Verify your API key permissions match the requirements above
3. Test your credentials using the Binance API Management page
4. Ensure your system time is synchronized with Binance servers 