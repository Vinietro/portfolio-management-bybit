import Binance from 'binance-api-node';

// Replace these with your actual API credentials
const API_KEY = 'your-api-key-here';
const SECRET_KEY = 'your-secret-key-here';

async function testBinanceAPI() {
  try {
    console.log('Testing Binance API connection...');
    
    // Create client
    const client = Binance({
      apiKey: API_KEY,
      apiSecret: SECRET_KEY
    });

    // Test 1: Ping
    console.log('\n1. Testing ping...');
    try {
      await client.ping();
      console.log('✅ Ping successful');
    } catch (error) {
      console.log('❌ Ping failed:', error.message);
    }

    // Test 2: Server time
    console.log('\n2. Getting server time...');
    try {
      const serverTime = await client.time();
      const localTime = Date.now();
      const timeDiff = Math.abs(localTime - serverTime);
      console.log(`✅ Server time: ${serverTime}`);
      console.log(`✅ Local time: ${localTime}`);
      console.log(`✅ Time difference: ${timeDiff}ms`);
      
      if (timeDiff > 5000) {
        console.log('⚠️  Warning: Time difference is more than 5 seconds');
      }
    } catch (error) {
      console.log('❌ Failed to get server time:', error.message);
    }

    // Test 3: Account info
    console.log('\n3. Testing account info...');
    try {
      const accountInfo = await client.accountInfo();
      console.log('✅ Account info retrieved successfully');
      console.log(`✅ Account type: ${accountInfo.accountType}`);
      console.log(`✅ Permissions: ${accountInfo.permissions?.join(', ') || 'None'}`);
    } catch (error) {
      console.log('❌ Failed to get account info:', error.message);
      if (error.code) {
        console.log(`❌ Error code: ${error.code}`);
      }
    }

  } catch (error) {
    console.error('❌ General error:', error.message);
  }
}

// Run the test
testBinanceAPI(); 