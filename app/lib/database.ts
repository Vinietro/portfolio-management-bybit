import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

// Initialize Neon client
const sql = neon(process.env.DATABASE_URL!);

// Encryption key - in production, use environment variable
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-character-secret-key-here!';
const ALGORITHM = 'aes-256-cbc';

// Encryption functions
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string): string {
  const textParts = encryptedText.split(':');
  textParts.shift(); // Remove iv from parts
  const encryptedData = textParts.join(':');
  const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Device ID generation
export function generateDeviceId(): string {
  return crypto.randomBytes(16).toString('hex');
}

// User management
export async function getOrCreateUser(deviceId: string) {
  try {
    // Try to get existing user
    const rows = await sql`
      SELECT id FROM users WHERE device_id = ${deviceId}
    `;
    
    if (rows.length > 0) {
      return rows[0].id;
    }
    
    // Create new user
    const newUser = await sql`
      INSERT INTO users (device_id) VALUES (${deviceId}) RETURNING id
    `;
    
    return newUser[0].id;
  } catch (error) {
    console.error('Error getting/creating user:', error);
    throw error;
  }
}

// Portfolio management
export async function savePortfolio(userId: string, portfolioData: Record<string, unknown>, deviceId: string) {
  try {
    // First try to get existing portfolio
    const existingPortfolio = await getPortfolio(userId);
    
    if (existingPortfolio) {
      // Update existing portfolio
      const result = await sql`
        UPDATE portfolios 
        SET 
          portfolio_data = ${JSON.stringify(portfolioData)},
          version = version + 1,
          updated_at = NOW()
        WHERE user_id = ${userId}
        RETURNING id, version
      `;
      
      // Log sync operation
      await sql`
        INSERT INTO sync_log (user_id, table_name, record_id, operation, device_id)
        VALUES (${userId}, 'portfolios', ${result[0].id}, 'update', ${deviceId})
      `;
      
      return { id: result[0].id, version: result[0].version };
    } else {
      // Insert new portfolio
      const result = await sql`
        INSERT INTO portfolios (user_id, portfolio_data, version)
        VALUES (${userId}, ${JSON.stringify(portfolioData)}, 1)
        RETURNING id, version
      `;
      
      // Log sync operation
      await sql`
        INSERT INTO sync_log (user_id, table_name, record_id, operation, device_id)
        VALUES (${userId}, 'portfolios', ${result[0].id}, 'create', ${deviceId})
      `;
      
      return { id: result[0].id, version: result[0].version };
    }
  } catch (error) {
    console.error('Error saving portfolio:', error);
    throw error;
  }
}

export async function getPortfolio(userId: string) {
  try {
    const rows = await sql`
      SELECT portfolio_data, version, updated_at FROM portfolios WHERE user_id = ${userId}
    `;
    
    return rows.length > 0 ? {
      data: rows[0].portfolio_data,
      version: rows[0].version,
      updatedAt: rows[0].updated_at
    } : null;
  } catch (error) {
    console.error('Error getting portfolio:', error);
    throw error;
  }
}

// Credentials management
export async function saveCredentials(userId: string, credentials: Record<string, unknown>, deviceId: string) {
  try {
    const encryptedCredentials = encrypt(JSON.stringify(credentials));
    
    // First try to get existing credentials
    const existingCredentials = await getCredentials(userId);
    
    if (existingCredentials) {
      // Update existing credentials
      const result = await sql`
        UPDATE credentials 
        SET 
          encrypted_credentials = ${encryptedCredentials},
          version = version + 1,
          updated_at = NOW()
        WHERE user_id = ${userId}
        RETURNING id, version
      `;
      
      // Log sync operation
      await sql`
        INSERT INTO sync_log (user_id, table_name, record_id, operation, device_id)
        VALUES (${userId}, 'credentials', ${result[0].id}, 'update', ${deviceId})
      `;
      
      return { id: result[0].id, version: result[0].version };
    } else {
      // Insert new credentials
      const result = await sql`
        INSERT INTO credentials (user_id, encrypted_credentials, version)
        VALUES (${userId}, ${encryptedCredentials}, 1)
        RETURNING id, version
      `;
      
      // Log sync operation
      await sql`
        INSERT INTO sync_log (user_id, table_name, record_id, operation, device_id)
        VALUES (${userId}, 'credentials', ${result[0].id}, 'create', ${deviceId})
      `;
      
      return { id: result[0].id, version: result[0].version };
    }
  } catch (error) {
    console.error('Error saving credentials:', error);
    throw error;
  }
}

export async function getCredentials(userId: string) {
  try {
    const rows = await sql`
      SELECT encrypted_credentials, version, updated_at FROM credentials WHERE user_id = ${userId}
    `;
    
    if (rows.length === 0) {
      return null;
    }
    
    const decryptedCredentials = decrypt(rows[0].encrypted_credentials);
    return {
      data: JSON.parse(decryptedCredentials),
      version: rows[0].version,
      updatedAt: rows[0].updated_at
    };
  } catch (error) {
    console.error('Error getting credentials:', error);
    throw error;
  }
}

// Sync management
export async function getSyncStatus(userId: string, lastSyncTime?: string) {
  try {
    let rows;
    if (lastSyncTime) {
      rows = await sql`
        SELECT table_name, record_id, operation, timestamp, device_id 
        FROM sync_log 
        WHERE user_id = ${userId} AND timestamp > ${lastSyncTime}
      `;
    } else {
      rows = await sql`
        SELECT table_name, record_id, operation, timestamp, device_id 
        FROM sync_log 
        WHERE user_id = ${userId}
      `;
    }
    
    return rows;
  } catch (error) {
    console.error('Error getting sync status:', error);
    throw error;
  }
}

// Get all user credentials from database
export async function getAllUserCredentials() {
  try {
    const rows = await sql`
      SELECT encrypted_credentials, u.id as user_id, u.device_id 
      FROM credentials c
      JOIN users u ON c.user_id = u.id
      WHERE encrypted_credentials IS NOT NULL
    `;
    
    const allCredentials = [];
    for (const row of rows) {
      try {
        const decryptedCredentials = decrypt(row.encrypted_credentials);
        const credentials = JSON.parse(decryptedCredentials);
        allCredentials.push({
          userId: row.user_id,
          deviceId: row.device_id,
          credentials: credentials
        });
      } catch (decryptError) {
        console.error(`Failed to decrypt credentials for user ${row.user_id}:`, decryptError);
        // Continue with other users
      }
    }
    
    return allCredentials;
  } catch (error) {
    console.error('Error getting all user credentials:', error);
    throw error;
  }
}

// Trading transactions P&L functions
export async function getTradingTransactions(apiKeyHash: string, limit: number = 100) {
  try {
    const rows = await sql`
      SELECT * FROM trading_transactions 
      WHERE api_key_hash = ${apiKeyHash}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows;
  } catch (error) {
    console.error('Error getting trading transactions:', error);
    throw error;
  }
}

export async function getPNLByAPIKey(apiKeyHash: string) {
  try {
    const rows = await sql`
      SELECT 
        symbol,
        transaction_type,
        SUM(total_value) as total_value,
        COUNT(*) as trade_count
      FROM trading_transactions 
      WHERE api_key_hash = ${apiKeyHash}
      GROUP BY symbol, transaction_type
      ORDER BY symbol, transaction_type
    `;
    return rows;
  } catch (error) {
    console.error('Error getting PNL by API key:', error);
    throw error;
  }
}

export async function calculatePortfolioPNL(apiKeyHash: string) {
  try {
    // Get aggregated entry and exit data per symbol
    const entryExitData = await sql`
      SELECT 
        symbol,
        SUM(CASE WHEN transaction_type = 'entry' THEN total_value ELSE 0 END) as entry_value,
        SUM(CASE WHEN transaction_type = 'exit' THEN total_value ELSE 0 END) as exit_value,
        SUM(CASE WHEN transaction_type = 'entry' THEN quantity * price ELSE 0 END) as entry_quantity_price,
        SUM(CASE WHEN transaction_type = 'exit' THEN quantity * price ELSE 0 END) as exit_quantity_price
      FROM trading_transactions 
      WHERE api_key_hash = ${apiKeyHash}
      GROUP BY symbol
    `;

    // Calculate P&L for each symbol
    const pnlResults = entryExitData.map((row: Record<string, unknown>) => {
      const entryValue = parseFloat(String(row.entry_value) || '0');
      const exitValue = parseFloat(String(row.exit_value) || '0');
      const currentPNL = exitValue - entryValue;
      
      return {
        symbol: String(row.symbol),
        entryValue,
        exitValue,
        realizedPNL: currentPNL,
        pnlPercentage: entryValue > 0 ? (currentPNL / entryValue) * 100 : 0
      };
    });

    // Calculate total portfolio P&L
    const totalPNL = pnlResults.reduce((sum, result) => sum + result.realizedPNL, 0);
    const totalEntryValue = pnlResults.reduce((sum, result) => sum + result.entryValue, 0);
    const totalPNLPercentage = totalEntryValue > 0 ? (totalPNL / totalEntryValue) * 100 : 0;

    return {
      totalPNL,
      totalPNLPercentage,
      breakdown: pnlResults
    };
  } catch (error) {
    console.error('Error calculating portfolio PNL:', error);
    throw error;
  }
}
