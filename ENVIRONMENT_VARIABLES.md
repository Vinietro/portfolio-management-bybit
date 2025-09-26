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

**Generate a secure key:**
```bash
openssl rand -hex 16
```

## How to Set Environment Variables in Vercel

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your portfolio-management project
3. Go to **Settings** → **Environment Variables**
4. Add the `ENCRYPTION_KEY` variable with your generated key
5. Make sure to add it to **Production**, **Preview**, and **Development** environments
6. Click **Save**

## Security Notes

- Never commit the actual `.env` file to your repository
- The encryption key should be unique and secure
- Neon automatically provides the `DATABASE_URL` variable
- All API credentials are encrypted before storage in the database
