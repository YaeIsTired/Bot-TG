# Spaceship.com Deployment Guide

This guide provides step-by-step instructions for deploying the Gaming Accounts Store Telegram Bot on Spaceship.com hosting.

## Prerequisites

- Spaceship.com hosting account with Node.js support
- Telegram Bot Token from @BotFather
- KHQR API access (for Cambodian payment processing)
- FTP/SFTP client or file manager access

## Step 1: Prepare Your Files

### 1.1 Download/Clone the Project
```bash
git clone <your-repository-url>
cd accountbot
```

### 1.2 Install Dependencies Locally (for testing)
```bash
npm install
```

### 1.3 Test Locally
```bash
# Copy environment file
cp .env.example .env

# Edit .env with your settings
# Initialize database
npm run init-db

# Test the application
npm start
```

## Step 2: Configure Environment Variables

### 2.1 Required Environment Variables

Create a `.env` file with the following variables:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
BOT_USERNAME=YourBotUsername

# Admin Panel Configuration
SESSION_SECRET=your-very-long-random-session-secret-key-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-admin-password

# Server Configuration
PORT=3000

# KHQR Payment Configuration
KHQR_BAKONG_ID=chhunlichhean_kun@wing
KHQR_MERCHANT_NAME=CHHEANSMM

# Database Configuration
DATABASE_PATH=./database.sqlite

# Application Settings
NODE_ENV=production
```

### 2.2 Generate Secure Values

- **SESSION_SECRET**: Generate a random 64-character string
- **ADMIN_PASSWORD**: Use a strong password (will be hashed automatically)
- **TELEGRAM_BOT_TOKEN**: Get from @BotFather on Telegram

## Step 3: Upload Files to Spaceship.com

### 3.1 Prepare Upload Package

Create a ZIP file containing:
- All project files (except `node_modules/`)
- `.env` file with production settings
- `package.json` and `package-lock.json`

**Exclude these files/folders:**
- `node_modules/`
- `.git/`
- `database.sqlite` (will be created automatically)
- Local log files

### 3.2 Upload via File Manager

1. Log into your Spaceship.com control panel
2. Navigate to File Manager
3. Go to your domain's public_html directory
4. Upload and extract your ZIP file
5. Ensure all files are in the correct structure

### 3.3 Alternative: Upload via FTP/SFTP

```bash
# Using SCP (if SSH access available)
scp -r accountbot/ user@yourserver.com:/path/to/public_html/

# Using rsync
rsync -avz --exclude 'node_modules' accountbot/ user@yourserver.com:/path/to/public_html/
```

## Step 4: Configure Spaceship.com Environment

### 4.1 Set Environment Variables

In Spaceship.com control panel:

1. Go to **Environment Variables** section
2. Add each variable from your `.env` file:
   - `TELEGRAM_BOT_TOKEN`
   - `SESSION_SECRET`
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `PORT` (use the port assigned by Spaceship.com)
   - `KHQR_BAKONG_ID`
   - `KHQR_MERCHANT_NAME`
   - `DATABASE_PATH`
   - `NODE_ENV=production`

### 4.2 Configure Node.js Version

1. In control panel, go to **Node.js** section
2. Select Node.js version 16.x or higher
3. Set startup file to `server.js`
4. Enable Node.js for your domain

## Step 5: Install Dependencies and Initialize

### 5.1 SSH Access (if available)

```bash
# Connect to your server
ssh user@yourserver.com

# Navigate to your application directory
cd /path/to/public_html

# Install production dependencies
npm install --production

# Initialize the database
npm run init-db
```

### 5.2 Alternative: Use Control Panel

If SSH is not available:
1. Use the **Terminal** feature in Spaceship.com control panel
2. Run the same commands as above

## Step 6: Start the Application

### 6.1 Using Process Manager (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start the application
pm2 start server.js --name "gaming-accounts-bot"

# Save PM2 configuration
pm2 save

# Set up auto-restart on server reboot
pm2 startup
```

### 6.2 Using Node.js Control Panel

1. In Spaceship.com control panel, go to **Node.js Apps**
2. Create new application:
   - **Startup File**: `server.js`
   - **Application Root**: `/public_html`
   - **Environment**: `production`
3. Start the application

## Step 7: Configure Domain and SSL

### 7.1 Domain Configuration

1. Point your domain to the application
2. Configure subdomain if needed (e.g., `bot.yourdomain.com`)
3. Set up URL rewriting if required

### 7.2 SSL Certificate

1. Enable SSL/TLS in Spaceship.com control panel
2. Use Let's Encrypt for free SSL certificate
3. Force HTTPS redirects

## Step 8: Test Deployment

### 8.1 Health Check

Visit: `https://yourdomain.com/health`

Expected response:
```json
{
  "status": "OK",
  "timestamp": "2025-01-20T...",
  "uptime": 123.45,
  "environment": "production"
}
```

### 8.2 Admin Panel

1. Visit: `https://yourdomain.com/admin`
2. Login with your admin credentials
3. Verify dashboard loads correctly

### 8.3 Telegram Bot

1. Start a chat with your bot on Telegram
2. Send `/start` command
3. Test `/balance` and `/help` commands
4. Verify bot responds correctly

## Step 9: Configure Monitoring

### 9.1 Application Logs

Monitor logs through:
- Spaceship.com control panel log viewer
- SSH: `tail -f logs/app.log`
- PM2: `pm2 logs gaming-accounts-bot`

### 9.2 Uptime Monitoring

Set up external monitoring:
- Use services like UptimeRobot
- Monitor `/health` endpoint
- Set up alerts for downtime

### 9.3 Database Backup

Create automated backup script:

```bash
#!/bin/bash
# backup-db.sh
DATE=$(date +%Y%m%d_%H%M%S)
cp database.sqlite "backups/database_backup_$DATE.sqlite"
find backups/ -name "database_backup_*.sqlite" -mtime +7 -delete
```

Add to crontab:
```bash
# Backup database daily at 2 AM
0 2 * * * /path/to/backup-db.sh
```

## Step 10: Post-Deployment Configuration

### 10.1 Add Gaming Accounts

1. Login to admin panel
2. Go to **Gaming Accounts** → **Add New Account**
3. Create sample accounts for testing
4. Set appropriate prices and descriptions

### 10.2 Configure Bot Settings

1. In admin panel, go to **Settings**
2. Verify all configuration values
3. Test payment integration (if KHQR is configured)

### 10.3 User Testing

1. Create test Telegram account
2. Test complete user flow:
   - Registration (`/start`)
   - Balance check (`/balance`)
   - Browse accounts (`/browse`)
   - Test topup flow (with small amount)
   - Test purchase flow

## Troubleshooting

### Common Issues

1. **Application won't start**
   - Check Node.js version compatibility
   - Verify all environment variables are set
   - Check application logs for errors

2. **Database errors**
   - Ensure SQLite file permissions are correct
   - Check disk space availability
   - Verify database initialization completed

3. **Telegram bot not responding**
   - Verify bot token is correct
   - Check if webhook conflicts exist
   - Ensure application is accessible from internet

4. **Payment integration issues**
   - Verify KHQR API credentials
   - Check network connectivity to KHQR API
   - Test with small amounts first

### Log Locations

- Application logs: Console output or `/logs/app.log`
- Error logs: `/logs/error.log`
- PM2 logs: `~/.pm2/logs/`

### Support Resources

- Spaceship.com documentation
- Node.js hosting guides
- Telegram Bot API documentation
- KHQR API documentation

## Security Checklist

- [ ] Strong admin password set
- [ ] Session secret is random and secure
- [ ] HTTPS enabled with valid SSL certificate
- [ ] Environment variables properly configured
- [ ] Database file permissions secured
- [ ] Regular backups configured
- [ ] Monitoring and alerting set up
- [ ] Rate limiting enabled
- [ ] Input validation implemented

## Maintenance

### Regular Tasks

1. **Weekly**
   - Check application logs for errors
   - Monitor disk space usage
   - Verify backup integrity

2. **Monthly**
   - Update dependencies (`npm update`)
   - Review security logs
   - Test disaster recovery procedures

3. **Quarterly**
   - Security audit
   - Performance optimization
   - Update documentation

---

**Note**: This deployment guide is specific to Spaceship.com hosting. Adjust configurations based on your hosting provider's specific requirements and available features.
