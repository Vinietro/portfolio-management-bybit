# Environment Variables Setup

## Required Environment Variables

When you add Neon to your Vercel project, these variables will be automatically provided:

### Database Connection (Auto-provided by Neon)
```
DATABASE_URL=postgresql://username:password@hostname:port/database?sslmode=require
```

### Custom Variables (You need to set these)

#### Encryption Key
```
ENCRYPTION_KEY=your-32-character-secret-key-here!
```

#### Webhook Authentication Key
```
WEBHOOK_AUTH_KEY=your-secure-webhook-auth-key-here
```

**Generate secure keys:**
```bash
# For ENCRYPTION_KEY (32 characters)
openssl rand -hex 16

# For WEBHOOK_AUTH_KEY (different key from encryption)
openssl rand -hex 32
```

## How to Set Environment Variables in Vercel

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your portfolio-management project
3. Go to **Settings** → **Environment Variables**
4. Add the following variables with your generated keys:
   - `ENCRYPTION_KEY` - for encrypting stored credentials
   - `WEBHOOK_AUTH_KEY` - for authenticating TradingView webhook calls
5. Make sure to add them to **Production**, **Preview**, and **Development** environments
6. Click **Save**

## Security Notes

- Never commit the actual `.env` file to your repository
- The encryption key should be unique and secure
- The webhook auth key should be different from the encryption key
- Neon automatically provides the `DATABASE_URL` variable
- All API credentials are encrypted before storage in the database
- Only requests with the correct `authKey` in the webhook payload will be processed
