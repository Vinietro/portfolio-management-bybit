# Cross-Device Sync Setup Guide

This guide will help you set up cross-device synchronization for your Portfolio Manager app using Neon (serverless Postgres).

## 🚀 Quick Setup (5 minutes)

### Step 1: Install Dependencies
```bash
npm install @neondatabase/serverless
```

### Step 2: Add Neon to Your Project

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your portfolio-management project
3. Go to the **Storage** tab
4. Click **Create Database** → **Neon**
5. Connect your Neon account (or create one)
6. Choose a name (e.g., `portfolio-db`)
7. Click **Create**

### Step 3: Run Database Schema

1. In your Neon dashboard, go to your database
2. Go to the **SQL Editor** tab
3. Copy and paste the contents of `sql/schema.sql`
4. Click **Run**

### Step 4: Set Environment Variables

In your Vercel project settings:

1. Go to **Settings** → **Environment Variables**
2. Add these variables:
   - `DATABASE_URL` (automatically provided by Neon)
   - `ENCRYPTION_KEY` (create your own 32-character secret key)

### Step 5: Deploy

```bash
git add .
git commit -m "Add cross-device sync with Neon"
git push
```

## 🔐 Security Features

### Encryption
- API credentials are encrypted using AES-256-CBC before storage
- Each device gets a unique device ID
- All data is isolated per device/user

### Environment Variables
Make sure to set a strong `ENCRYPTION_KEY`:
```bash
# Generate a secure key (32 characters)
openssl rand -hex 16
```

## 📱 How It Works

### Automatic Sync
- **On App Load**: Automatically fetches latest data from cloud
- **On Data Change**: Automatically syncs changes to cloud
- **Offline Support**: Works offline, syncs when back online
- **Conflict Resolution**: Uses version-based conflict resolution

### Data Flow
1. **Local Storage**: Immediate updates for fast UI
2. **Cloud Sync**: Background sync to Vercel Postgres
3. **Cross-Device**: Other devices fetch latest data on load

### Sync Status Indicators
- 🌐 **Online**: Connected to internet
- ☁️ **Synced**: Data successfully synced to cloud
- 🔄 **Syncing**: Currently syncing data
- 📴 **Offline**: Working offline, will sync when online

## 🛠️ Manual Sync

Users can manually trigger sync using the **Sync** button in the header.

## 📊 Database Schema

### Tables Created
- `users`: Device/user management
- `portfolios`: Portfolio data storage
- `credentials`: Encrypted API credentials
- `sync_log`: Sync operation tracking

### Key Features
- **Versioning**: Track changes with version numbers
- **Timestamps**: Automatic created_at/updated_at
- **Cascading Deletes**: Clean up related data
- **Indexes**: Optimized for fast queries

## 🔧 Troubleshooting

### Common Issues

1. **"Database connection failed"**
   - Check environment variables are set correctly
   - Ensure Neon database is created and active

2. **"Encryption error"**
   - Verify `ENCRYPTION_KEY` is set and 32 characters long
   - Check for special characters in the key

3. **"Sync not working"**
   - Check browser console for errors
   - Verify network connectivity
   - Ensure API endpoints are deployed

### Debug Mode
Add this to your browser console to see sync logs:
```javascript
localStorage.setItem('debug_sync', 'true');
```

## 💰 Cost Information

### Neon Pricing
- **Free Tier**: 0.5GB storage, 10GB transfer/month, 100 hours compute/month
- **Pro Tier**: $19/month for 10GB storage, 100GB transfer/month, unlimited compute
- **Usage**: Only charged for actual usage beyond free tier

### Estimated Usage
- Portfolio data: ~1KB per portfolio
- Credentials: ~500 bytes per device
- Sync operations: Minimal compute usage

## 🚀 Advanced Features

### Future Enhancements
- **Multi-user Support**: Share portfolios between users
- **Real-time Sync**: WebSocket-based real-time updates
- **Data Export**: Export portfolio data to CSV/JSON
- **Backup/Restore**: Manual backup and restore functionality

## 📞 Support

If you encounter any issues:
1. Check the browser console for error messages
2. Verify all environment variables are set
3. Ensure Neon database is properly configured
4. Check the Vercel function logs for API errors

## 🔄 Migration from Local Storage

Your existing local storage data will be automatically migrated:
1. App loads local data first (immediate display)
2. Syncs with cloud in background
3. Cloud data takes precedence if newer
4. Local data remains as backup/cache

No data loss occurs during the migration process!
