require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const bcrypt = require('bcrypt');

// Import controllers and routes
const TelegramBotController = require('./controllers/telegramBot');
const adminRoutes = require('./routes/admin');
const { getDatabase } = require('./models/database');
const { log } = require('./utils/helpers');

// Validate required environment variables
const requiredEnvVars = ['SESSION_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars.join(', '));
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
}

// Warn if Telegram bot token is missing but don't exit
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn('Warning: TELEGRAM_BOT_TOKEN not set. Bot functionality will be disabled until configured in admin panel.');
}

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
            connectSrc: ["'self'"]
        }
    }
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/profile-pictures', express.static(path.join(__dirname, 'public', 'profile-pictures')));

// Routes
app.use('/admin', adminRoutes);

// Root route
app.get('/', (req, res) => {
    res.render('index', {
        title: 'Gaming Accounts Store',
        botUsername: process.env.BOT_USERNAME || 'YourBot'
    });
});

// Simple health check endpoint (JSON only)
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
    });
});

// Helper function to format uptime
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${secs}s`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', { title: '404 - Page Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
    log('error', 'Express error handler', err);
    
    if (process.env.NODE_ENV === 'development') {
        res.status(500).render('error', {
            title: 'Server Error',
            error: err.message,
            stack: err.stack
        });
    } else {
        res.status(500).render('error', {
            title: 'Server Error',
            error: 'Something went wrong!',
            stack: null
        });
    }
});

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database
        const db = getDatabase();
        log('info', 'Database initialized');

        // Hash admin password if not already hashed
        if (process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD.startsWith('$2b$')) {
            const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
            process.env.ADMIN_PASSWORD = hashedPassword;
            log('info', 'Admin password hashed');
        }

        // Initialize Telegram bot only if token is available
        let telegramBot = null;
        if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'placeholder') {
            try {
                telegramBot = new TelegramBotController(process.env.TELEGRAM_BOT_TOKEN);
                global.telegramBot = telegramBot;
                global.botStatus = 'online';
                log('info', 'Telegram bot initialized');
            } catch (error) {
                log('error', 'Failed to initialize Telegram bot', error);
                global.telegramBot = null;
                global.botStatus = 'offline';
            }
        } else {
            global.telegramBot = null;
            global.botStatus = 'offline';
            log('info', 'Telegram bot not initialized - no token provided');
        }

        // Start Express server
        const server = app.listen(PORT, () => {
            log('info', `Server running on port ${PORT}`);
            log('info', `Admin panel: http://accountbot.local:${PORT}/admin`);
            log('info', `Alternative: http://localhost:${PORT}/admin`);
            log('info', `Environment: ${process.env.NODE_ENV || 'development'}`);
        });

        // Graceful shutdown
        const gracefulShutdown = async (signal) => {
            log('info', `Received ${signal}. Starting graceful shutdown...`);
            
            try {
                // Stop Telegram bot if it exists
                if (telegramBot) {
                    await telegramBot.stop();
                    log('info', 'Telegram bot stopped');
                } else {
                    log('info', 'No Telegram bot to stop');
                }

                // Close database connection
                await db.close();
                log('info', 'Database connection closed');

                // Close Express server
                server.close(() => {
                    log('info', 'Express server closed');
                    process.exit(0);
                });

                // Force exit after 10 seconds
                setTimeout(() => {
                    log('error', 'Forced shutdown after timeout');
                    process.exit(1);
                }, 10000);

            } catch (error) {
                log('error', 'Error during graceful shutdown', error);
                process.exit(1);
            }
        };

        // Handle shutdown signals
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            log('error', 'Uncaught Exception', error);
            gracefulShutdown('uncaughtException');
        });

        process.on('unhandledRejection', (reason, promise) => {
            log('error', 'Unhandled Rejection at:', promise, 'reason:', reason);
            gracefulShutdown('unhandledRejection');
        });

    } catch (error) {
        log('error', 'Failed to start server', error);
        process.exit(1);
    }
}

// Start the server
startServer();
