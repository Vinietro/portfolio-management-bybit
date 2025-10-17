# Bybit API Signature Validation Error Troubleshooting

## Error: "Signature for this request is not valid" (Code: -1022)

This error occurs when Bybit cannot validate the signature of your API request. Here are the most common causes and solutions:

## 1. Check Your API Credentials

### Verify API Key and Secret
- Ensure your API key and secret are copied correctly
- Check for any extra spaces or characters
- Make sure you're using the correct API key (not the testnet key if you want to access mainnet)

### API Key Permissions
Your API key needs the following permissions:
- **Read Info** - Required for account information
- **Enable Spot & Margin Trading** - Required for balance information

**To check permissions:**
1. Go to Bybit.com → API Management
2. Find your API key and check the permissions
3. If permissions are missing, edit the API key and add the required permissions

## 2. IP Restrictions

### Check IP Whitelist
If your API key has IP restrictions:
- Make sure your current IP address is whitelisted
- You can find your IP at https://whatismyipaddress.com/
- Add your IP to the whitelist in Bybit API Management

### Remove IP Restrictions (Temporary)
For testing purposes, you can temporarily remove IP restrictions:
1. Go to Bybit.com → API Management
2. Edit your API key
3. Uncheck "Enable Reading" under IP restrictions
4. **Remember to re-enable IP restrictions for security**

## 3. Time Synchronization

### Check Server Time
The error can occur if your system time is not synchronized with Bybit servers.

**To check time synchronization:**
1. Run the test script: `node test-binance-api.js`
2. Look for the time difference between local and server time
3. If the difference is more than 5 seconds, synchronize your system time

**To fix time synchronization:**
- **Windows:** Settings → Time & Language → Date & Time → Sync now
- **macOS:** System Preferences → Date & Time → Set date & time automatically
- **Linux:** `sudo ntpdate -s time.nist.gov`

## 4. API Key Status

### Check API Key Status
- Ensure your API key is **Active**
- Check if there are any restrictions or suspensions
- Verify the API key hasn't expired

## 5. Network and Connectivity

### Check Internet Connection
- Ensure you have a stable internet connection
- Try accessing Bybit.com to verify connectivity
- Check if you're behind a VPN or proxy that might be blocking requests

## 6. Rate Limiting

### Check Rate Limits
- Bybit has rate limits on API calls
- If you're making too many requests, wait a few minutes and try again
- The error might be due to hitting rate limits

## 7. Testing Your Credentials

### Use the Test Script
1. Edit `test-binance-api.js`
2. Replace `your-api-key-here` and `your-secret-key-here` with your actual credentials
3. Run: `node test-binance-api.js`
4. Check the output for specific error messages

### Manual Testing
You can also test your credentials manually:
1. Go to Bybit.com → API Management
2. Click "Test" next to your API key
3. This will verify if your credentials work

## 8. Common Mistakes

### Double-check These:
- ✅ API key is from mainnet (not testnet)
- ✅ API key has correct permissions
- ✅ No extra spaces in API key or secret
- ✅ System time is synchronized
- ✅ IP address is whitelisted (if restrictions are enabled)
- ✅ API key is active and not expired

## 9. Security Best Practices

### For Production Use:
1. **Enable IP restrictions** - Only allow specific IP addresses
2. **Use read-only permissions** - Disable trading permissions if not needed
3. **Regularly rotate API keys** - Change keys periodically
4. **Monitor API usage** - Check for unusual activity

## 10. Still Having Issues?

If you've tried all the above and still get the error:

1. **Create a new API key** - Sometimes starting fresh helps
2. **Contact Bybit Support** - They can help with API-specific issues
3. **Check Bybit Status** - API might be experiencing issues
4. **Try from a different network** - In case of network-specific issues

## Error Codes Reference

| Code | Meaning | Solution |
|------|---------|----------|
| -1022 | Invalid signature | Check credentials, time sync, IP restrictions |
| -2015 | Invalid API key | Verify API key is correct |
| -2014 | Missing API key | Ensure API key is provided |
| -2013 | Invalid API key/secret | Check both API key and secret |
| -2011 | No permissions | Add required permissions to API key |
| -1001 | Timeout | Try again, check internet connection |
| -1003 | Rate limit | Wait and try again later |

## Need Help?

If you're still experiencing issues after trying these solutions, please:
1. Run the test script and share the output
2. Check the browser console for any additional error details
3. Verify your API key permissions and restrictions 