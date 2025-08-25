const express = require('express');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Purchase = require('../models/Purchase');
const AdminUser = require('../models/AdminUser');
const { log, formatCurrency, formatDate, formatLastActive } = require('../utils/helpers');
const settingsManager = require('../utils/settingsManager');
const { upload } = require('../utils/upload');
const { asyncHandler } = require('../utils/errorHandler');

const router = express.Router();

// Rate limiting for admin routes
const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 5 login attempts per windowMs
    message: 'Too many login attempts, please try again later.'
});

// Apply rate limiting to all admin routes
router.use(adminLimiter);

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
    if (req.session && req.session.isAdmin && req.session.adminUser) {
        return next();
    } else {
        return res.redirect('/admin/login');
    }
};

// Helper function to check if current admin is super admin
const isSuperAdmin = (req) => {
    return req.session?.adminUser?.role === 'super_admin';
};

// Helper function to check if current admin can manage users
const canManageUsers = (req) => {
    return isSuperAdmin(req); // Only super admins can manage other admin users
};

// Login page
router.get('/login', (req, res) => {
    if (req.session && req.session.isAdmin) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { error: null });
});

// Login POST
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password, rememberMe } = req.body;

        if (!username || !password) {
            return res.render('admin/login', { error: 'Username and password are required' });
        }

        // Try database authentication first
        const adminUser = await AdminUser.authenticate(username, password);

        if (adminUser) {
            req.session.isAdmin = true;
            req.session.username = adminUser.username;
            req.session.adminUser = {
                id: adminUser.id,
                username: adminUser.username,
                email: adminUser.email,
                role: adminUser.role
            };

            // Set session duration based on remember me option
            if (rememberMe === 'on') {
                // Remember for 30 days
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
                log('info', `Admin login successful with remember me: ${username} (${adminUser.role}) (30 days)`);
            } else {
                // Default session duration (24 hours)
                req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
                log('info', `Admin login successful: ${username} (${adminUser.role}) (24 hours)`);
            }

            return res.redirect('/admin/dashboard');
        }

        // Fallback to environment variable authentication (for backward compatibility)
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (adminPassword && username === adminUsername && await bcrypt.compare(password, adminPassword)) {
            req.session.isAdmin = true;
            req.session.username = username;
            req.session.adminUser = {
                id: 0,
                username: username,
                email: 'admin@example.com',
                role: 'super_admin'
            };

            // Set session duration based on remember me option
            if (rememberMe === 'on') {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
                log('info', `Admin login successful with remember me (env): ${username} (30 days)`);
            } else {
                req.session.cookie.maxAge = 24 * 60 * 60 * 1000;
                log('info', `Admin login successful (env): ${username} (24 hours)`);
            }

            return res.redirect('/admin/dashboard');
        }

        log('warn', `Failed admin login attempt: ${username}`);
        return res.render('admin/login', { error: 'Invalid username or password' });
    } catch (error) {
        log('error', 'Error in admin login', error);
        res.render('admin/login', { error: 'Login failed. Please try again.' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            log('error', 'Error destroying session', err);
        }
        res.redirect('/admin/login');
    });
});

// Dashboard
router.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const userStats = await User.getStats();
        const accountStats = await Account.getStats();
        const transactionStats = await Transaction.getStats();
        const purchaseStats = await Purchase.getStats();

        // Get recent transactions
        const recentTransactions = await Transaction.getAll(10, 0);
        
        // Get recent purchases
        const recentPurchases = await Purchase.getAll(10, 0);

        res.render('admin/dashboard', {
            userStats,
            accountStats,
            transactionStats,
            purchaseStats,
            recentTransactions,
            recentPurchases,
            formatCurrency,
            formatDate
        });
    } catch (error) {
        log('error', 'Error loading dashboard', error);
        res.render('admin/error', { error: 'Failed to load dashboard data' });
    }
});

// Users management
router.get('/users', requireAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        const users = await User.getAll(limit, offset);
        const userStats = await User.getStats();
        
        res.render('admin/users', {
            users,
            userStats,
            currentPage: page,
            formatCurrency,
            formatDate,
            formatLastActive
        });
    } catch (error) {
        log('error', 'Error loading users', error);
        res.render('admin/error', { error: 'Failed to load users data' });
    }
});

// Accounts management
router.get('/accounts', requireAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const offset = (page - 1) * limit;

        const accounts = await Account.getAll(limit, offset);
        const accountStats = await Account.getStats();

        // Get purchase information for each account
        const accountsWithPurchases = await Promise.all(
            accounts.map(async (account) => {
                const purchases = await Purchase.getByAccountId(account.id);
                return {
                    ...account,
                    purchases: purchases
                };
            })
        );

        // Calculate pagination info
        const totalAccounts = accountStats.total;
        const totalPages = Math.ceil(totalAccounts / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        res.render('admin/accounts', {
            accounts: accountsWithPurchases,
            accountStats,
            currentPage: page,
            totalPages,
            hasNextPage,
            hasPrevPage,
            limit,
            formatCurrency,
            formatDate
        });
    } catch (error) {
        log('error', 'Error loading accounts', error);
        res.render('admin/error', { error: 'Failed to load accounts data' });
    }
});

// Add new account page
router.get('/accounts/new', requireAuth, (req, res) => {
    res.render('admin/account-form', {
        account: null,
        isEdit: false
    });
});

// Create new account
router.post('/accounts', requireAuth, upload.array('images', 10), async (req, res) => {
    try {
        const {
            game_type, title, description, price, username, password,
            level, rank, region, additional_info, is_available, is_featured,
            uid, player_name, bind_info, country, creation_date, banned_status, account_code,
            account_credentials, account_status, verify_code, inactive_status, collector_status, device_info
        } = req.body;

        // Validate required fields (game_type removed)
        if (!title || !price || !account_credentials) {
            return res.render('admin/account-form', {
                account: req.body,
                isEdit: false,
                error: 'Title, Price, and Account Credentials are required'
            });
        }

        // Parse custom fields from form
        const customFields = {};
        Object.keys(req.body).forEach(key => {
            if (key.startsWith('custom_')) {
                const fieldName = key.replace('custom_', '');
                if (req.body[key]) {
                    customFields[fieldName] = req.body[key];
                }
            }
        });

        // Process uploaded images
        const images = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                images.push(`/uploads/accounts/${file.filename}`);
            });
        }

        const accountData = {
            game_type: game_type || 'general', // Default to 'general' if not provided
            title,
            description,
            price: parseFloat(price),
            username,
            password,
            level: level ? parseInt(level) : null,
            rank,
            region,
            additional_info,
            custom_fields: customFields,
            images,
            image_url: images.length > 0 ? images[0] : null, // Use first image as main image
            is_available: is_available === 'on' ? 1 : 0,
            is_featured: is_featured === 'on' ? 1 : 0,
            // New fields
            uid,
            player_name,
            bind_info,
            country,
            creation_date,
            banned_status,
            account_code,
            account_credentials,
            // Account information fields
            account_status,
            verify_code,
            inactive_status,
            collector_status,
            device_info
        };

        await Account.create(accountData);
        log('info', `New account created: ${title} with ${images.length} images`);
        res.redirect('/admin/accounts?success=Account created successfully');
    } catch (error) {
        log('error', 'Error creating account', error);
        res.render('admin/account-form', {
            account: req.body,
            isEdit: false,
            error: 'Failed to create account: ' + error.message
        });
    }
});

// Account details view
router.get('/accounts/:id', requireAuth, async (req, res) => {
    try {
        const account = await Account.getById(req.params.id);
        if (!account) {
            return res.render('admin/error', { error: 'Account not found' });
        }

        res.render('admin/account-details', {
            account,
            title: `${account.title} - Account Showcase`
        });
    } catch (error) {
        log('error', 'Error loading account details', error);
        res.render('admin/error', { error: 'Failed to load account details' });
    }
});

// Account showcase view (like Mobile Legends format)
router.get('/accounts/:id/showcase', requireAuth, async (req, res) => {
    try {
        const account = await Account.getById(req.params.id);
        if (!account) {
            return res.render('admin/error', { error: 'Account not found' });
        }

        res.render('admin/account-showcase', {
            account,
            formatCurrency,
            formatDate
        });
    } catch (error) {
        log('error', 'Error loading account showcase', error);
        res.render('admin/error', { error: 'Failed to load account showcase' });
    }
});

// Edit account page
router.get('/accounts/:id/edit', requireAuth, async (req, res) => {
    try {
        const account = await Account.getById(req.params.id);
        if (!account) {
            return res.render('admin/error', { error: 'Account not found' });
        }

        res.render('admin/account-form', {
            account,
            isEdit: true
        });
    } catch (error) {
        log('error', 'Error loading account for edit', error);
        res.render('admin/error', { error: 'Failed to load account' });
    }
});

// Update account
router.post('/accounts/:id', requireAuth, upload.array('images', 10), async (req, res) => {
    try {
        const account = await Account.getById(req.params.id);
        if (!account) {
            return res.render('admin/error', { error: 'Account not found' });
        }

        const {
            game_type, title, description, price, image_url, is_available, is_featured,
            username, password, level, rank, region, additional_info,
            uid, player_name, bind_info, country, creation_date, banned_status, account_code,
            account_credentials, account_status, verify_code, inactive_status, collector_status, device_info
        } = req.body;

        // Parse custom fields from form
        const customFields = {};
        Object.keys(req.body).forEach(key => {
            if (key.startsWith('custom_')) {
                const fieldName = key.replace('custom_', '');
                if (req.body[key]) {
                    customFields[fieldName] = req.body[key];
                }
            }
        });

        // Process uploaded images
        const images = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                images.push(`/uploads/accounts/${file.filename}`);
            });
        }

        const updateData = {
            game_type: game_type || account.game_type || 'general', // Keep existing or default to 'general'
            title,
            description,
            price: parseFloat(price),
            custom_fields: customFields,
            image_url,
            is_available: is_available === 'on' ? 1 : 0,
            is_featured: is_featured === 'on' ? 1 : 0,
            username,
            password,
            level: level ? parseInt(level) : null,
            rank,
            region,
            additional_info,
            // New fields
            uid,
            player_name,
            bind_info,
            country,
            creation_date,
            banned_status,
            account_code,
            account_credentials,
            // Account information fields
            account_status,
            verify_code,
            inactive_status,
            collector_status,
            device_info
        };

        // Add images if new ones were uploaded
        if (images.length > 0) {
            updateData.images = images;
            updateData.image_url = images[0]; // Use first image as main image
        }

        await account.update(updateData);
        log('info', `Account updated: ${account.id}`);
        res.redirect('/admin/accounts?success=Account updated successfully');
    } catch (error) {
        log('error', 'Error updating account', error);
        res.render('admin/account-form', {
            account: req.body,
            isEdit: true,
            error: 'Failed to update account'
        });
    }
});

// Delete account
router.post('/accounts/:id/delete', requireAuth, async (req, res) => {
    try {
        console.log('🗑️  Delete request for account:', req.params.id);
        console.log('🗑️  Request body:', req.body);

        const account = await Account.getById(req.params.id);
        if (!account) {
            return res.json({ success: false, error: 'Account not found' });
        }

        const isDevUser = isDeveloper(req);
        const forceDelete = req.body.force === true || req.body.force === 'true';

        console.log('🔍 Developer status:', isDevUser);
        console.log('🔍 Force delete flag:', forceDelete);

        // If developer wants to force delete, bypass purchase checks
        if (isDevUser && forceDelete) {
            console.log('🚨 Executing FORCE DELETE...');
            await account.forceDelete();
            log('info', `Account FORCE DELETED by developer: ${account.id} - ${account.title}`);
            res.json({
                success: true,
                message: 'Account force deleted successfully (including associated purchases)',
                isDeveloper: true
            });
        } else {
            console.log('📝 Attempting normal delete...');
            await account.delete();
            log('info', `Account deleted: ${account.id} - ${account.title}`);
            res.json({ success: true, message: 'Account deleted successfully' });
        }
    } catch (error) {
        console.log('❌ Delete error:', error.message);
        log('error', 'Error deleting account', error);

        // Check if this is a developer and offer force delete option
        const isDevUser = isDeveloper(req);
        console.log('🔍 Developer status in error handler:', isDevUser);
        let errorMessage = 'Failed to delete account';

        if (error.message.includes('purchase(s) are associated')) {
            if (isDevUser) {
                console.log('🎯 Offering force delete option to developer');
                // Offer developer the option to force delete
                return res.json({
                    success: false,
                    error: error.message,
                    isDeveloper: true,
                    canForceDelete: true,
                    accountId: req.params.id
                });
            } else {
                errorMessage = error.message;
            }
        } else if (error.code === 'SQLITE_CONSTRAINT') {
            errorMessage = 'Cannot delete account: This account has associated data (purchases, transactions, etc.). Please remove related data first.';
        }

        res.json({ success: false, error: errorMessage });
    }
});

// Transactions management
router.get('/transactions', requireAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        const transactions = await Transaction.getAll(limit, offset);
        const transactionStats = await Transaction.getStats();

        res.render('admin/transactions', {
            transactions,
            transactionStats,
            currentPage: page,
            formatCurrency,
            formatDate
        });
    } catch (error) {
        log('error', 'Error loading transactions', error);
        res.render('admin/error', { error: 'Failed to load transactions data' });
    }
});

// Purchases management
router.get('/purchases', requireAuth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        const purchases = await Purchase.getAll(limit, offset);
        const purchaseStats = await Purchase.getStats();

        res.render('admin/purchases', {
            purchases,
            purchaseStats,
            currentPage: page,
            formatCurrency,
            formatDate
        });
    } catch (error) {
        log('error', 'Error loading purchases', error);
        res.render('admin/error', { error: 'Failed to load purchases data' });
    }
});

// Update purchase delivery status
router.post('/purchases/:id/status', requireAuth, async (req, res) => {
    try {
        const { delivery_status } = req.body;
        await Purchase.updateDeliveryStatus(req.params.id, delivery_status);
        log('info', `Purchase ${req.params.id} status updated to ${delivery_status}`);
        res.json({ success: true });
    } catch (error) {
        log('error', 'Error updating purchase status', error);
        res.json({ success: false, error: 'Failed to update status' });
    }
});

// Settings page
router.get('/settings', requireAuth, async (req, res) => {
    try {
        const settings = settingsManager.getCurrentSettings();

        // Store full tokens for editing (will be used in JavaScript)
        const fullTokens = {
            botToken: settings.botToken,
            bearerToken: settings.khqrBearerToken
        };

        // Mask the tokens for display
        settings.botTokenMasked = settings.botToken ? '***' + settings.botToken.slice(-4) : 'Not set';
        settings.bearerTokenMasked = settings.khqrBearerToken ? '***' + settings.khqrBearerToken.slice(-8) : 'Not set';

        // Get real bot status
        settings.botStatus = global.telegramBot && global.telegramBot.isRunning() ? 'online' : 'offline';

        res.render('admin/settings', { settings, fullTokens });
    } catch (error) {
        log('error', 'Error loading settings', error);
        res.render('admin/error', { error: 'Failed to load settings' });
    }
});

// API endpoint for dashboard stats (for AJAX updates)
router.get('/api/stats', requireAuth, async (req, res) => {
    try {
        const userStats = await User.getStats();
        const accountStats = await Account.getStats();
        const transactionStats = await Transaction.getStats();
        const purchaseStats = await Purchase.getStats();

        res.json({
            users: userStats,
            accounts: accountStats,
            transactions: transactionStats,
            purchases: purchaseStats
        });
    } catch (error) {
        log('error', 'Error getting stats', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// User management API endpoints
// Get all users for broadcast selection (must come before :telegramId route)
router.get('/api/users/all', requireAuth, async (req, res) => {
    try {
        const users = await User.getAll(1000, 0); // Get up to 1000 users
        res.json(users);
    } catch (error) {
        log('error', 'Error fetching all users', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.get('/api/users/:telegramId', requireAuth, async (req, res) => {
    try {
        const user = await User.getByTelegramId(req.params.telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        log('error', 'Error fetching user details', error);
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});

router.post('/api/users/:telegramId/adjust-balance', requireAuth, async (req, res) => {
    try {
        const { amount } = req.body;
        const telegramId = req.params.telegramId;

        if (!amount || isNaN(amount)) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const user = await User.getByTelegramId(telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update balance using direct database query
        const { getDatabase } = require('../models/database');
        const db = getDatabase();
        await db.run(
            'UPDATE users SET balance = balance + ? WHERE telegram_id = ?',
            [parseFloat(amount), telegramId]
        );

        // Get updated user
        const updatedUser = await User.getByTelegramId(telegramId);

        // Create transaction record
        await Transaction.create({
            user_id: updatedUser.telegram_id,
            type: parseFloat(amount) > 0 ? 'admin_credit' : 'admin_debit',
            amount: Math.abs(parseFloat(amount)),
            status: 'completed', // Admin transactions are instantly completed
            md5_hash: null,
            message_id: null,
            qr_url: null,
            transaction_id: `admin_${Date.now()}_${telegramId}`
        });

        log('info', `Admin adjusted balance for user ${telegramId} by $${amount}`);
        res.json({
            success: true,
            newBalance: updatedUser.balance,
            message: `Balance adjusted by $${amount}`
        });
    } catch (error) {
        log('error', 'Error adjusting user balance', error);
        res.status(500).json({ error: 'Failed to adjust balance' });
    }
});

router.post('/api/users/:telegramId/toggle-status', requireAuth, async (req, res) => {
    try {
        const telegramId = req.params.telegramId;
        const { status } = req.body;

        log('info', `Toggle status request: telegramId=${telegramId}, status=${status}, type=${typeof status}`);

        // Protect developer account from being deactivated
        if (telegramId == '1630035459' && !status) {
            return res.status(403).json({
                error: 'Cannot deactivate the developer account. This account is protected.'
            });
        }

        const user = await User.getByTelegramId(telegramId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        log('info', `Current user status: ${user.is_active}, new status: ${status}`);

        // Update user status
        const { getDatabase } = require('../models/database');
        const db = getDatabase();
        const newStatusValue = status ? 1 : 0;
        log('info', `Updating database with value: ${newStatusValue}`);

        await db.run(
            'UPDATE users SET is_active = ? WHERE telegram_id = ?',
            [newStatusValue, telegramId]
        );

        log('info', `Admin ${status ? 'activated' : 'deactivated'} user ${telegramId}`);
        res.json({
            success: true,
            newStatus: status,
            message: `User ${status ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        log('error', 'Error toggling user status', error);
        res.status(500).json({ error: 'Failed to toggle user status' });
    }
});

// Create new user
router.post('/api/users', requireAuth, async (req, res) => {
    try {
        const { telegram_id, username, first_name, last_name, balance } = req.body;

        // Validate required fields
        if (!telegram_id || !first_name) {
            return res.status(400).json({ error: 'Telegram ID and first name are required' });
        }

        // Validate telegram_id is a number
        if (isNaN(telegram_id)) {
            return res.status(400).json({ error: 'Telegram ID must be a valid number' });
        }

        // Validate balance if provided
        if (balance && (isNaN(balance) || balance < 0)) {
            return res.status(400).json({ error: 'Balance must be a valid positive number' });
        }

        const user = await User.createManually({
            telegram_id: parseInt(telegram_id),
            username: username || '',
            first_name,
            last_name: last_name || '',
            balance: parseFloat(balance) || 0.0
        });

        log('info', `Admin created new user: ${telegram_id}`);
        res.json({
            success: true,
            user,
            message: 'User created successfully'
        });
    } catch (error) {
        log('error', 'Error creating user', error);
        if (error.message.includes('already exists')) {
            res.status(409).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to create user' });
        }
    }
});

// Delete user
router.delete('/api/users/:telegramId', requireAuth, async (req, res) => {
    try {
        const telegramId = req.params.telegramId;

        await User.delete(telegramId);

        log('info', `Admin deleted user: ${telegramId}`);
        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        log('error', 'Error deleting user', error);
        if (error.message.includes('protected') || error.message.includes('developer')) {
            res.status(403).json({ error: error.message });
        } else if (error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to delete user' });
        }
    }
});

// Ban user
router.post('/api/users/:telegramId/ban', requireAuth, async (req, res) => {
    try {
        const telegramId = req.params.telegramId;
        const { reason } = req.body;

        await User.ban(telegramId, reason);

        log('info', `Admin banned user: ${telegramId}, reason: ${reason}`);
        res.json({
            success: true,
            message: 'User banned successfully'
        });
    } catch (error) {
        log('error', 'Error banning user', error);
        if (error.message.includes('protected') || error.message.includes('developer')) {
            res.status(403).json({ error: error.message });
        } else if (error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to ban user' });
        }
    }
});

// Unban user
router.post('/api/users/:telegramId/unban', requireAuth, async (req, res) => {
    try {
        const telegramId = req.params.telegramId;

        await User.unban(telegramId);

        log('info', `Admin unbanned user: ${telegramId}`);
        res.json({
            success: true,
            message: 'User unbanned successfully'
        });
    } catch (error) {
        log('error', 'Error unbanning user', error);
        if (error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to unban user' });
        }
    }
});

// Settings API Routes
router.post('/api/settings/update', requireAuth, async (req, res) => {
    try {
        const { key, value } = req.body;

        // Validate the setting key
        const allowedSettings = [
            'botToken',
            'bakongId',
            'merchantName',
            'bearerToken',
            'minTopup',
            'maxTopup'
        ];

        if (!allowedSettings.includes(key)) {
            return res.json({ success: false, error: 'Invalid setting key' });
        }

        // Validate the setting value
        const validation = settingsManager.validateSetting(key, value);
        if (!validation.valid) {
            return res.json({ success: false, error: validation.error });
        }

        // Update the setting in .env file
        const result = await settingsManager.updateSetting(key, value);

        if (result.success) {
            log('info', `Setting updated by admin: ${key} = ${value}`);
            res.json({ success: true, message: `${key} updated successfully` });
        } else {
            res.json({ success: false, error: result.error || 'Failed to update setting' });
        }
    } catch (error) {
        log('error', 'Error updating setting', error);
        res.json({ success: false, error: 'Failed to update setting' });
    }
});

// Bot control API
router.post('/api/bot/toggle', requireAuth, async (req, res) => {
    try {
        const { action } = req.body;

        if (!global.telegramBot) {
            return res.json({ success: false, error: 'Bot instance not available' });
        }

        if (action === 'stop') {
            // Stop the bot
            log('info', 'Bot stop requested by admin');
            try {
                await global.telegramBot.stop();
                global.botStatus = 'offline';
                log('info', 'Bot stopped successfully');
                res.json({ success: true, status: 'offline', message: 'Bot stopped' });
            } catch (error) {
                log('error', 'Error stopping bot', error);
                res.json({ success: false, error: 'Failed to stop bot' });
            }
        } else if (action === 'start') {
            // Start the bot
            log('info', 'Bot start requested by admin');
            try {
                await global.telegramBot.start();
                global.botStatus = 'online';
                log('info', 'Bot started successfully');
                res.json({ success: true, status: 'online', message: 'Bot started' });
            } catch (error) {
                log('error', 'Error starting bot', error);
                res.json({ success: false, error: 'Failed to start bot' });
            }
        } else {
            res.json({ success: false, error: 'Invalid action' });
        }
    } catch (error) {
        log('error', 'Error toggling bot status', error);
        res.json({ success: false, error: 'Failed to toggle bot status' });
    }
});

// Broadcast page
router.get('/broadcast', requireAuth, async (req, res) => {
    try {
        const userStats = await User.getStats();
        res.render('admin/broadcast', {
            userStats,
            currentPage: 'broadcast'
        });
    } catch (error) {
        log('error', 'Error loading broadcast page', error);
        res.render('admin/error', { error: 'Failed to load broadcast page' });
    }
});

// Send broadcast message
router.post('/api/broadcast', requireAuth, upload.single('image'), async (req, res) => {
    try {
        const { message, messageType, recipientType, recipients } = req.body;
        const imageFile = req.file;

        // Require either message or image
        if ((!message || message.trim().length === 0) && !imageFile) {
            return res.status(400).json({ error: 'Please provide either a message or an image' });
        }

        let targetUsers = [];

        // Determine target users based on recipient type
        if (recipientType === 'all') {
            // Get all active users (existing behavior)
            const users = await User.getAll(10000, 0); // Get up to 10k users
            targetUsers = users.filter(user => user.is_active === 1);
        } else if (recipientType === 'selected' || recipientType === 'userids') {
            // Parse recipients from JSON
            let recipientIds = [];
            try {
                recipientIds = JSON.parse(recipients || '[]');
            } catch (error) {
                return res.status(400).json({ error: 'Invalid recipients format' });
            }

            if (recipientIds.length === 0) {
                return res.status(400).json({ error: 'No recipients specified' });
            }

            // Get users by telegram IDs
            const allUsers = await User.getAll(10000, 0);
            targetUsers = allUsers.filter(user => recipientIds.includes(user.telegram_id));

            if (targetUsers.length === 0) {
                return res.json({
                    success: true,
                    message: 'No valid users found for the specified recipients',
                    sent: 0,
                    failed: 0
                });
            }
        } else {
            return res.status(400).json({ error: 'Invalid recipient type' });
        }

        if (targetUsers.length === 0) {
            return res.json({
                success: true,
                message: 'No users to broadcast to',
                sent: 0,
                failed: 0
            });
        }

        let sentCount = 0;
        let failedCount = 0;
        const failedUsers = [];

        // Get bot instance
        const botController = global.telegramBot;
        if (!botController) {
            return res.status(500).json({ error: 'Bot is not available' });
        }
        const bot = botController.getBot();

        // Send message to each user
        for (const user of targetUsers) {
            try {
                let formattedMessage = message || '';

                // Add emoji based on message type (only if there's a message)
                if (message && message.trim().length > 0) {
                    if (messageType === 'announcement') {
                        formattedMessage = `📢 <b>Announcement</b>\n\n${message}`;
                    } else if (messageType === 'promotion') {
                        formattedMessage = `🎉 <b>Special Promotion</b>\n\n${message}`;
                    } else if (messageType === 'update') {
                        formattedMessage = `🔔 <b>System Update</b>\n\n${message}`;
                    } else if (messageType === 'warning') {
                        formattedMessage = `⚠️ <b>Important Notice</b>\n\n${message}`;
                    }
                } else if (imageFile) {
                    // If no message but has image, add type prefix only
                    if (messageType === 'announcement') {
                        formattedMessage = `📢 <b>Announcement</b>`;
                    } else if (messageType === 'promotion') {
                        formattedMessage = `🎉 <b>Special Promotion</b>`;
                    } else if (messageType === 'update') {
                        formattedMessage = `🔔 <b>System Update</b>`;
                    } else if (messageType === 'warning') {
                        formattedMessage = `⚠️ <b>Important Notice</b>`;
                    }
                }

                // Send image with caption if image is provided
                if (imageFile) {
                    const imagePath = imageFile.path;
                    const options = { parse_mode: 'HTML' };

                    // Only add caption if there's a formatted message
                    if (formattedMessage && formattedMessage.trim().length > 0) {
                        options.caption = formattedMessage;
                    }

                    await bot.sendPhoto(user.telegram_id, imagePath, options);
                } else {
                    // Send text message only
                    await bot.sendMessage(user.telegram_id, formattedMessage, {
                        parse_mode: 'HTML'
                    });
                }

                sentCount++;

                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 50));

            } catch (error) {
                console.error(`Failed to send message to user ${user.telegram_id}:`, error);
                failedCount++;
                failedUsers.push({
                    telegram_id: user.telegram_id,
                    username: user.username,
                    error: error.message
                });
            }
        }

        log('info', `Broadcast completed: ${sentCount} sent, ${failedCount} failed`);

        // Clean up uploaded image file
        if (imageFile) {
            try {
                const fs = require('fs');
                fs.unlinkSync(imageFile.path);
            } catch (cleanupError) {
                console.error('Error cleaning up image file:', cleanupError);
            }
        }

        res.json({
            success: true,
            message: `Broadcast completed successfully`,
            sent: sentCount,
            failed: failedCount,
            failedUsers: failedUsers.slice(0, 10) // Limit to first 10 failed users
        });

    } catch (error) {
        log('error', 'Error sending broadcast', error);
        res.status(500).json({ error: 'Failed to send broadcast' });
    }
});

// Health check endpoint
router.get('/health', requireAuth, asyncHandler(async (req, res) => {
    // Helper function to format uptime
    function formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    const healthData = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        uptimeFormatted: formatUptime(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0',
        currentPage: 'health'
    };

    // If JSON is requested, return JSON
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.json(healthData);
    }

    res.render('health-simple', healthData);
}));

// Admin User Management Routes

// Admin users management page
router.get('/admin-users', requireAuth, async (req, res) => {
    try {
        // Debug: Log current user info
        console.log('🔍 ADMIN-USERS ROUTE HIT!');
        console.log('Current user session:', req.session?.adminUser);
        console.log('Is super admin:', isSuperAdmin(req));
        console.log('Session isAdmin:', req.session?.isAdmin);

        // Check if user has permission to manage admin users
        if (!isSuperAdmin(req)) {
            console.log('❌ Access denied - not super admin');
            return res.render('admin/error', { error: 'Access denied. Only super admins can manage admin users.' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        const adminUsers = await AdminUser.getAll(limit, offset);
        const adminStats = await AdminUser.getStats();

        res.render('admin/admin-users', {
            adminUsers,
            adminStats,
            currentPage: page,
            currentUser: req.session.adminUser,
            formatDate
        });
    } catch (error) {
        log('error', 'Error loading admin users', error);
        res.render('admin/error', { error: 'Failed to load admin users data' });
    }
});

// API: Get all admin users
router.get('/api/admin-users', requireAuth, async (req, res) => {
    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const adminUsers = await AdminUser.getAll(100, 0);
        res.json(adminUsers);
    } catch (error) {
        log('error', 'Error fetching admin users', error);
        res.status(500).json({ error: 'Failed to fetch admin users' });
    }
});

// API: Get admin user by ID
router.get('/api/admin-users/:id', requireAuth, async (req, res) => {
    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const adminUser = await AdminUser.getById(req.params.id);
        if (!adminUser) {
            return res.status(404).json({ error: 'Admin user not found' });
        }

        // Don't send password in response
        const { password, ...adminUserData } = adminUser;
        res.json(adminUserData);
    } catch (error) {
        log('error', 'Error fetching admin user', error);
        res.status(500).json({ error: 'Failed to fetch admin user' });
    }
});

// API: Create new admin user
router.post('/api/admin-users', requireAuth, async (req, res) => {
    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { username, password, email, role } = req.body;

        // Validate required fields
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Validate role
        if (role && !['admin', 'super_admin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role. Must be admin or super_admin' });
        }

        const adminUser = await AdminUser.create({
            username,
            password,
            email,
            role: role || 'admin'
        }, req.session.adminUser.id);

        log('info', `Admin user created: ${username} by ${req.session.username}`);

        // Don't send password in response
        const { password: _, ...adminUserData } = adminUser;
        res.json({
            success: true,
            adminUser: adminUserData,
            message: 'Admin user created successfully'
        });
    } catch (error) {
        log('error', 'Error creating admin user', error);
        if (error.message.includes('already exists')) {
            res.status(409).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to create admin user' });
        }
    }
});

// API: Update admin user
router.put('/api/admin-users/:id', requireAuth, async (req, res) => {
    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { username, password, email, role, is_active } = req.body;
        const adminId = parseInt(req.params.id);

        // Prevent self-modification of critical fields
        if (adminId === req.session.adminUser.id) {
            if (role && role !== req.session.adminUser.role) {
                return res.status(400).json({ error: 'Cannot change your own role' });
            }
            if (is_active === false || is_active === 0) {
                return res.status(400).json({ error: 'Cannot deactivate your own account' });
            }
        }

        const updatedAdmin = await AdminUser.update(adminId, {
            username,
            password,
            email,
            role,
            is_active
        });

        log('info', `Admin user updated: ${updatedAdmin.username} by ${req.session.username}`);

        // Don't send password in response
        const { password: _, ...adminUserData } = updatedAdmin;
        res.json({
            success: true,
            adminUser: adminUserData,
            message: 'Admin user updated successfully'
        });
    } catch (error) {
        log('error', 'Error updating admin user', error);
        if (error.message.includes('already exists')) {
            res.status(409).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to update admin user' });
        }
    }
});

// API: Delete admin user
router.delete('/api/admin-users/:id', requireAuth, async (req, res) => {
    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const adminId = parseInt(req.params.id);

        // Prevent self-deletion
        if (adminId === req.session.adminUser.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        await AdminUser.delete(adminId);

        log('info', `Admin user deleted: ID ${adminId} by ${req.session.username}`);
        res.json({
            success: true,
            message: 'Admin user deleted successfully'
        });
    } catch (error) {
        log('error', 'Error deleting admin user', error);
        res.status(500).json({ error: error.message || 'Failed to delete admin user' });
    }
});

// API: Ban admin user
router.post('/api/admin-users/:id/ban', requireAuth, async (req, res) => {
    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const adminId = parseInt(req.params.id);
        const { reason } = req.body;

        // Prevent self-banning
        if (adminId === req.session.adminUser.id) {
            return res.status(400).json({ error: 'Cannot ban your own account' });
        }

        await AdminUser.ban(adminId, reason || 'No reason provided');

        log('info', `Admin user banned: ID ${adminId} by ${req.session.username}`);
        res.json({
            success: true,
            message: 'Admin user banned successfully'
        });
    } catch (error) {
        log('error', 'Error banning admin user', error);
        res.status(500).json({ error: error.message || 'Failed to ban admin user' });
    }
});

// API: Unban admin user
router.post('/api/admin-users/:id/unban', requireAuth, async (req, res) => {
    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const adminId = parseInt(req.params.id);

        await AdminUser.unban(adminId);

        log('info', `Admin user unbanned: ID ${adminId} by ${req.session.username}`);
        res.json({
            success: true,
            message: 'Admin user unbanned successfully'
        });
    } catch (error) {
        log('error', 'Error unbanning admin user', error);
        res.status(500).json({ error: error.message || 'Failed to unban admin user' });
    }
});

// API Routes for Python Bot Integration
// =====================================

// API: Get user by Telegram ID
router.get('/api/users/:telegram_id', async (req, res) => {
    try {
        const telegramId = parseInt(req.params.telegram_id);
        const user = await User.getByTelegramId(telegramId);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.json({
            success: true,
            ...user
        });
    } catch (error) {
        console.error('API Error - Get User:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API: Create new user
router.post('/api/users', async (req, res) => {
    try {
        const { telegram_id, username, first_name, last_name, balance, collector_status } = req.body;

        // Check if user already exists
        const existingUser = await User.getByTelegramId(telegram_id);
        if (existingUser) {
            return res.status(409).json({ success: false, error: 'User already exists' });
        }

        const userData = {
            telegram_id,
            username: username || '',
            first_name: first_name || '',
            last_name: last_name || '',
            balance: balance || 0,
            collector_status: collector_status || 'Seasoned Collector'
        };

        const userId = await User.create(userData);

        res.json({
            success: true,
            user_id: userId,
            message: 'User created successfully'
        });
    } catch (error) {
        console.error('API Error - Create User:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API: Update user balance
router.post('/api/users/:telegram_id/adjust-balance', async (req, res) => {
    try {
        const telegramId = parseInt(req.params.telegram_id);
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid amount' });
        }

        const user = await User.getByTelegramId(telegramId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const newBalance = user.balance + amount;
        await User.updateBalance(telegramId, newBalance);

        res.json({
            success: true,
            new_balance: newBalance,
            added_amount: amount,
            message: 'Balance updated successfully'
        });
    } catch (error) {
        console.error('API Error - Update Balance:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API: Get available accounts
router.get('/api/accounts', async (req, res) => {
    try {
        const { game_type, limit = 10 } = req.query;

        let accounts;
        if (game_type) {
            accounts = await Account.getByGameType(game_type, parseInt(limit));
        } else {
            accounts = await Account.getAvailable(parseInt(limit));
        }

        res.json({
            success: true,
            accounts: accounts || [],
            count: accounts ? accounts.length : 0
        });
    } catch (error) {
        console.error('API Error - Get Accounts:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API: Get account details
router.get('/api/accounts/:id', async (req, res) => {
    try {
        const accountId = parseInt(req.params.id);
        const account = await Account.getById(accountId);

        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        res.json({
            success: true,
            ...account
        });
    } catch (error) {
        console.error('API Error - Get Account Details:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API: Create KHQR payment
router.post('/api/payments/khqr', async (req, res) => {
    try {
        const { user_id, amount, currency = 'USD', description } = req.body;

        if (!user_id || !amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid payment data' });
        }

        // Generate unique payment ID
        const paymentId = `PAY_${Date.now()}_${user_id}`;

        // Create KHQR payment (integrate with your existing KHQR logic)
        const khqrData = {
            amount: amount,
            currency: currency,
            description: description || `Payment for user ${user_id}`,
            payment_id: paymentId
        };

        // Here you would integrate with your existing KHQR payment controller
        // For now, we'll simulate the QR code generation
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=khqr_payment_${paymentId}`;

        // Store payment in database (you may want to create a payments table)
        // await Payment.create({ payment_id: paymentId, user_id, amount, status: 'pending' });

        res.json({
            success: true,
            payment_id: paymentId,
            qr_code_url: qrCodeUrl,
            amount: amount,
            currency: currency,
            expires_in: 180, // 3 minutes
            message: 'KHQR payment created successfully'
        });
    } catch (error) {
        console.error('API Error - Create KHQR Payment:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API: Check payment status
router.get('/api/payments/:payment_id/status', async (req, res) => {
    try {
        const paymentId = req.params.payment_id;

        // Here you would check the actual payment status with NBC Bakong API
        // For now, we'll simulate payment checking

        // Simulate random payment completion (for testing)
        const isCompleted = Math.random() > 0.8; // 20% chance of completion

        res.json({
            success: true,
            payment_id: paymentId,
            status: isCompleted ? 'completed' : 'pending',
            checked_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('API Error - Check Payment Status:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API: Create purchase
router.post('/api/purchases', async (req, res) => {
    try {
        const { user_id, account_id, price } = req.body;

        if (!user_id || !account_id || !price) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Check if user exists and has sufficient balance
        const user = await User.getByTelegramId(user_id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        if (user.balance < price) {
            return res.status(400).json({ success: false, error: 'Insufficient balance' });
        }

        // Check if account exists and is available
        const account = await Account.getById(account_id);
        if (!account) {
            return res.status(404).json({ success: false, error: 'Account not found' });
        }

        if (account.status !== 'available') {
            return res.status(400).json({ success: false, error: 'Account not available' });
        }

        // Create purchase
        const purchaseData = {
            buyer_telegram_id: user_id,
            account_id: account_id,
            price: price,
            status: 'completed'
        };

        const purchaseId = await Purchase.create(purchaseData);

        // Update user balance
        const newBalance = user.balance - price;
        await User.updateBalance(user_id, newBalance);

        // Mark account as sold
        await Account.updateStatus(account_id, 'sold');

        res.json({
            success: true,
            purchase_id: purchaseId,
            new_balance: newBalance,
            message: 'Purchase completed successfully'
        });
    } catch (error) {
        console.error('API Error - Create Purchase:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API: Get user purchases
router.get('/api/users/:telegram_id/purchases', async (req, res) => {
    try {
        const telegramId = parseInt(req.params.telegram_id);
        const purchases = await Purchase.getByBuyerTelegramId(telegramId);

        res.json({
            success: true,
            purchases: purchases || [],
            count: purchases ? purchases.length : 0
        });
    } catch (error) {
        console.error('API Error - Get User Purchases:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API: Get user statistics
router.get('/api/users/:telegram_id/stats', async (req, res) => {
    try {
        const telegramId = parseInt(req.params.telegram_id);
        const purchases = await Purchase.getByBuyerTelegramId(telegramId);

        const totalPurchases = purchases ? purchases.length : 0;
        const totalSpent = purchases ? purchases.reduce((sum, p) => sum + p.price, 0) : 0;

        res.json({
            success: true,
            total_purchases: totalPurchases,
            total_spent: totalSpent,
            telegram_id: telegramId
        });
    } catch (error) {
        console.error('API Error - Get User Stats:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API: Get system statistics
router.get('/api/stats', async (req, res) => {
    try {
        const userStats = await User.getStats();
        const accountStats = await Account.getStats();

        res.json({
            success: true,
            users: userStats,
            accounts: accountStats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('API Error - Get System Stats:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
