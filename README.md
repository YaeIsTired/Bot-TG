# Gaming Accounts Store - Telegram Bot

A complete Telegram bot system for selling gaming accounts with automatic KHQR payment processing, designed for deployment on Spaceship.com hosting.

## Features

- 🤖 **Telegram Bot Integration** - Full-featured bot with commands for browsing, purchasing, and account management
- 💳 **KHQR Payment Processing** - Automatic payment verification with QR code generation
- 🎮 **Gaming Account Management** - Flexible schema for different game types with custom fields
- 👨‍💼 **Admin Panel** - Web-based administration interface with user and account management
- 🗄️ **SQLite Database** - Lightweight database perfect for Spaceship.com hosting
- 🔒 **Security Features** - Rate limiting, input validation, and secure session management
- 📱 **Responsive Design** - Mobile-friendly admin interface

## System Requirements

- Node.js 16.0.0 or higher
- NPM or Yarn package manager
- Telegram Bot Token
- KHQR API access (Cambodian payment system)

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repository-url>
cd accountbot
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Admin Panel Configuration
SESSION_SECRET=your_session_secret_here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_admin_password_here

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

### 3. Initialize Database

```bash
npm run init-db
```

### 4. Start the Application

```bash
npm start
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token from @BotFather | Yes | - |
| `SESSION_SECRET` | Secret key for session encryption | Yes | - |
| `ADMIN_USERNAME` | Admin panel username | No | admin |
| `ADMIN_PASSWORD` | Admin panel password | Yes | - |
| `PORT` | Server port number | No | 3000 |
| `KHQR_BAKONG_ID` | KHQR Bakong ID for payments | No | chhunlichhean_kun@wing |
| `KHQR_MERCHANT_NAME` | Merchant name for KHQR | No | CHHEANSMM |
| `DATABASE_PATH` | SQLite database file path | No | ./database.sqlite |
| `NODE_ENV` | Environment mode | No | development |

## Telegram Bot Commands

### User Commands

- `/start` - Register and get welcome message
- `/balance` - Check current balance
- `/topup <amount>` - Add funds to account (e.g., `/topup 25.50`)
- `/browse` - Browse available gaming accounts
- `/purchases` - View purchase history
- `/help` - Show help message

### Usage Examples

```
/topup 10.50
/browse
```

## Admin Panel

Access the admin panel at `http://localhost:3000/admin`

### Features

- **Dashboard** - Overview of users, accounts, transactions, and sales
- **User Management** - View and manage registered users
- **Account Management** - Add, edit, and delete gaming accounts
- **Transaction History** - Monitor all payment transactions
- **Purchase Management** - Track account sales and deliveries
- **Settings** - Configure bot and payment settings

### Adding Gaming Accounts

1. Navigate to Admin Panel → Gaming Accounts
2. Click "Add New Account"
3. Fill in account details:
   - Game Type (e.g., "Mobile Legends", "PUBG")
   - Title (descriptive name)
   - Price in USD
   - Description
   - Custom fields (email, password, level, etc.)
4. Save the account

## Database Schema

### Users Table
- `telegram_id` - Telegram user ID (Primary Key)
- `username` - Telegram username
- `first_name` - User's first name
- `last_name` - User's last name
- `balance` - Account balance in USD
- `registration_date` - Registration timestamp
- `is_active` - Account status

### Accounts Table
- `id` - Account ID (Primary Key)
- `game_type` - Type of game
- `title` - Account title
- `description` - Account description
- `price` - Price in USD
- `custom_fields` - JSON string with custom account details
- `is_available` - Availability status
- `created_date` - Creation timestamp
- `sold_date` - Sale timestamp

### Transactions Table
- `id` - Transaction ID (Primary Key)
- `user_id` - User's Telegram ID
- `type` - Transaction type (topup/purchase)
- `amount` - Transaction amount
- `status` - Transaction status
- `md5_hash` - KHQR payment hash
- `message_id` - Telegram message ID
- `timestamp` - Transaction timestamp

### Purchases Table
- `id` - Purchase ID (Primary Key)
- `user_id` - Buyer's Telegram ID
- `account_id` - Purchased account ID
- `purchase_date` - Purchase timestamp
- `delivery_status` - Delivery status
- `delivery_date` - Delivery timestamp

## KHQR Payment Integration

The system integrates with the KHQR (Cambodian QR Payment) API for automatic payment processing.

### Payment Flow

1. User initiates topup with `/topup <amount>`
2. System generates QR code via KHQR API
3. User scans QR code with banking app
4. System automatically checks payment status every 1 second
5. Upon successful payment, user balance is updated
6. QR code expires after 3 minutes if unpaid

### API Endpoints Used

- `POST /khqr/create` - Generate payment QR code
- `GET /khqr/check?md5=<hash>` - Check payment status

## Deployment on Spaceship.com

### 1. Prepare Files

Ensure all files are ready:
- All source code files
- `package.json` with dependencies
- `.env` file with production settings
- `database.sqlite` (will be created automatically)

### 2. Upload to Spaceship.com

1. Compress your project files (excluding `node_modules`)
2. Upload to your Spaceship.com hosting account
3. Extract files in the public_html directory

### 3. Configure Environment Variables

In Spaceship.com control panel:
1. Go to Environment Variables section
2. Add all required variables from your `.env` file
3. Set `NODE_ENV=production`
4. Set `PORT` to the port provided by Spaceship.com

### 4. Install Dependencies

SSH into your Spaceship.com account and run:
```bash
cd public_html
npm install --production
```

### 5. Initialize Database

```bash
npm run init-db
```

### 6. Start Application

```bash
npm start
```

### 7. Configure Process Manager

Set up PM2 or similar process manager to keep the application running:

```bash
npm install -g pm2
pm2 start server.js --name "gaming-accounts-bot"
pm2 save
pm2 startup
```

## Monitoring and Logs

### Application Logs

The application logs important events to the console. On Spaceship.com, you can view logs through:
- Control panel log viewer
- SSH access: `tail -f logs/app.log`

### Health Check

Access `http://yourdomain.com/health` to check application status.

### Database Backup

Regularly backup your SQLite database:
```bash
cp database.sqlite database_backup_$(date +%Y%m%d).sqlite
```

## Security Considerations

- Change default admin credentials
- Use strong session secrets
- Enable HTTPS in production
- Regularly update dependencies
- Monitor for suspicious activity
- Backup database regularly

## Troubleshooting

### Common Issues

1. **Bot not responding**
   - Check Telegram bot token
   - Verify bot is started with `/start`
   - Check server logs for errors

2. **Payment not processing**
   - Verify KHQR API credentials
   - Check network connectivity
   - Review payment logs

3. **Database errors**
   - Ensure SQLite file permissions
   - Check disk space
   - Verify database initialization

4. **Admin panel not accessible**
   - Check admin credentials
   - Verify session configuration
   - Clear browser cache

### Log Locations

- Application logs: Console output
- Error logs: `logs/error.log`
- Access logs: `logs/access.log`

## Support

For technical support:
1. Check the troubleshooting section
2. Review application logs
3. Contact the development team

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Note**: This system is designed specifically for Spaceship.com hosting and uses KHQR payment processing for Cambodian market. Modify payment integration as needed for other regions.
