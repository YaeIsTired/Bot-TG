const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const User = require('../models/User');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Purchase = require('../models/Purchase');
const KHQRPaymentController = require('./khqrPayment');
const settingsManager = require('../utils/settingsManager');
const {
    formatCurrency,
    validateTopupAmount,
    formatUserName,
    formatDate,
    escapeHtml,
    createPaginationKeyboard,
    formatAccountMessage,
    createPurchaseKeyboard,
    createGameTypeKeyboard,
    log,
    generateRandomString
} = require('../utils/helpers');
const { fetchUserProfilePicture, updateUserProfilePicture } = require('../utils/telegram-profile');

class TelegramBotController {
    constructor(token) {
        this.bot = new TelegramBot(token, { polling: true });
        this.khqrPayment = new KHQRPaymentController(this.bot);
        this.userStates = new Map(); // Store user states for conversation flow
        this.transactions = new Map(); // Store active transactions
        this.setupCommands();
        this.setupMessageHandlers();
        this.setupCallbackHandlers();
        this.setupErrorHandling();

        // Set up bot menu after everything else is initialized
        setTimeout(() => {
            this.setupBotMenu();
        }, 1000);

        log('info', 'Telegram bot initialized successfully');
    }

    // Setup bot menu commands
    async setupBotMenu() {
        const commands = [
            { command: 'start', description: 'Start' }
        ];
        try {
            await this.bot.setMyCommands(commands);
            log('info', 'Bot menu commands set successfully');
        } catch (error) {
            log('error', 'Failed to set bot menu commands', error);
            // Try to delete commands and set them again
            try {
                await this.bot.deleteMyCommands();
                await this.bot.setMyCommands(commands);
                log('info', 'Bot menu commands reset and set successfully');
            } catch (retryError) {
                log('error', 'Failed to reset bot menu commands', retryError);
            }
        }
    }

    // Update user information when they interact with the bot
    async updateUserInfo(msg) {
        try {
            const telegramId = msg.from.id;
            const currentInfo = {
                first_name: msg.from.first_name || '',
                last_name: msg.from.last_name || '',
                username: msg.from.username || ''
            };

            // Get existing user
            const existingUser = await User.getByTelegramId(telegramId);

            if (existingUser) {
                // Check if any information has changed
                const hasChanged =
                    existingUser.first_name !== currentInfo.first_name ||
                    existingUser.last_name !== currentInfo.last_name ||
                    existingUser.username !== currentInfo.username;

                if (hasChanged) {
                    // Update user information
                    await User.updateInfo(telegramId, currentInfo);
                    log('info', `Updated user info for ${telegramId}: ${currentInfo.first_name} ${currentInfo.last_name} (@${currentInfo.username})`);
                }

                // Check if user doesn't have a profile picture and fetch it
                if (!existingUser.profile_picture_url) {
                    this.fetchAndUpdateProfilePicture(telegramId, currentInfo);
                }
            } else {
                // Create new user if doesn't exist
                await User.create({
                    telegram_id: telegramId,
                    ...currentInfo
                });
                log('info', `Created new user: ${telegramId} - ${currentInfo.first_name} ${currentInfo.last_name} (@${currentInfo.username})`);

                // Fetch profile picture for new user
                this.fetchAndUpdateProfilePicture(telegramId, currentInfo);
            }

            // Always update last active timestamp for any interaction
            await User.updateLastActive(telegramId);
        } catch (error) {
            log('error', 'Error updating user info', error);
        }
    }

    // Fetch and update user profile picture (async, non-blocking)
    async fetchAndUpdateProfilePicture(telegramId, userInfo) {
        try {
            // Run this in background to avoid blocking the main flow
            setTimeout(async () => {
                try {
                    const profilePictureUrl = await fetchUserProfilePicture(this.bot, telegramId, userInfo);
                    if (profilePictureUrl) {
                        await updateUserProfilePicture(User, telegramId, profilePictureUrl);
                        log('info', `Profile picture updated for user ${telegramId}`);
                    }
                } catch (error) {
                    log('error', `Error fetching profile picture for user ${telegramId}:`, error);
                }
            }, 1000); // 1 second delay to avoid blocking
        } catch (error) {
            log('error', 'Error in fetchAndUpdateProfilePicture', error);
        }
    }

    // User state management
    setUserState(userId, state, data = {}) {
        this.userStates.set(userId, { state, data, timestamp: Date.now() });
    }

    getUserState(userId) {
        return this.userStates.get(userId);
    }

    clearUserState(userId) {
        this.userStates.delete(userId);
    }

    // Check if user is active and allowed to use the bot
    async checkUserStatus(chatId, telegramUser = null) {
        try {
            // Update user info if telegram user object is provided
            if (telegramUser) {
                await this.updateUserInfo({ from: telegramUser });
            }

            const user = await User.getByTelegramId(chatId);
            if (!user) {
                return { allowed: false, reason: 'not_registered' };
            }

            if (!user.is_active) {
                return { allowed: false, reason: 'deactivated' };
            }

            return { allowed: true, user: user };
        } catch (error) {
            log('error', 'Error checking user status', error);
            return { allowed: false, reason: 'error' };
        }
    }

    // Send appropriate message for blocked users
    async sendBlockedUserMessage(chatId, reason) {
        let message;
        switch (reason) {
            case 'not_registered':
                message = '❌ Please use /start first to register.';
                break;
            case 'deactivated':
                message = '🚫 <b>Account Deactivated</b>\n\nYour account has been deactivated by an administrator.\nPlease contact support if you believe this is an error.';
                break;
            case 'error':
                message = '❌ Unable to verify your account status. Please try again later.';
                break;
            default:
                message = '❌ Access denied.';
        }

        await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    }

    setupMessageHandlers() {
        // Handle all text messages for conversation flow
        this.bot.on('message', async (msg) => {
            // Skip if it's a command
            if (msg.text && msg.text.startsWith('/')) {
                return;
            }

            // Check user status for all message interactions
            const statusCheck = await this.checkUserStatus(msg.from.id, msg.from);
            if (!statusCheck.allowed) {
                await this.sendBlockedUserMessage(msg.chat.id, statusCheck.reason);
                return;
            }

            // Handle keyboard button presses
            if (msg.text) {
                switch (msg.text) {
                    case '🎮 View Accounts':
                        await this.handleAccountCommand(msg);
                        return;
                    case '🔍 Browse':
                        await this.handleBrowseCommand(msg);
                        return;
                    case '💰 Add Funds':
                        await this.handleTopupCommand(msg);
                        return;
                    case '🏪 Account Info':
                        await this.handleBalanceCommand(msg);
                        return;
                    case '📦 My Purchases':
                        await this.handlePurchasesCommand(msg);
                        return;
                    case '💳 Transactions':
                        await this.handleTransactionsCommand(msg);
                        return;
                    case '❓ Help':
                        await this.handleHelpCommand(msg);
                        return;
                }
            }

            const userState = this.getUserState(msg.from.id);
            if (!userState) {
                log('info', `No user state found for user ${msg.from.id}, message: "${msg.text}"`);
                return;
            }

            log('info', `User ${msg.from.id} state: ${userState.state}, message: "${msg.text}"`);

            // Handle topup amount input
            if (userState.state === 'waiting_topup_amount') {
                log('info', `Processing topup amount input for user ${msg.from.id}: ${msg.text}`);
                await this.handleTopupAmountInput(msg);
            }
        });
    }

    // Helper function to create persistent keyboard
    createPersistentKeyboard() {
        return {
            keyboard: [
                [
                    { text: '🎮 View Accounts' },
                    { text: '🔍 Browse' }
                ],
                [
                    { text: '💰 Add Funds' },
                    { text: '🏪 Account Info' }
                ],
                [
                    { text: '📦 My Purchases' },
                    { text: '💳 Transactions' }
                ],
                [
                    { text: '❓ Help' }
                ]
            ],
            resize_keyboard: true,
            is_persistent: true
        };
    }

    // Keyboard button handlers
    async handleAccountCommand(msg) {
        try {
            const user = await User.getByTelegramId(msg.from.id);
            if (!user) {
                await this.bot.sendMessage(msg.chat.id, 'Please use /start first to register.');
                return;
            }
            await this.showAllAccounts(msg.chat.id);
        } catch (error) {
            log('error', 'Error in account keyboard handler', error);
            await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
        }
    }

    async handleTopupCommand(msg) {
        try {
            const user = await User.getByTelegramId(msg.from.id);
            if (!user) {
                await this.bot.sendMessage(msg.chat.id, 'Please use /start first to register.');
                return;
            }

            this.setUserState(msg.from.id, 'waiting_topup_amount');
            await this.bot.sendMessage(msg.chat.id,
                '💰 <b>Add Funds</b>\n\nPlease enter the amount you want to add to your account:\n\n💡 <i>Examples: 0.01, 1.00, 10, 50</i>',
                {
                    parse_mode: 'HTML',
                    reply_markup: this.createPersistentKeyboard()
                }
            );
        } catch (error) {
            log('error', 'Error in topup keyboard handler', error);
            await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
        }
    }

    async handleBalanceCommand(msg) {
        try {
            const user = await User.getByTelegramId(msg.from.id);
            if (!user) {
                await this.bot.sendMessage(msg.chat.id, 'Please use /start first to register.');
                return;
            }

            const balanceMessage = `🏪 <b>Account Information</b>

👤 <b>Name:</b> ${escapeHtml(user.first_name || 'N/A')} ${escapeHtml(user.last_name || '')}
🆔 <b>Username:</b> ${user.username ? '@' + escapeHtml(user.username) : 'Not set'}
💰 <b>Current Balance:</b> ${formatCurrency(user.balance)}
📅 <b>Member Since:</b> ${formatDate(user.registration_date)}

💡 Use "💰 Add Funds" to top up your account!`;

            await this.bot.sendMessage(msg.chat.id, balanceMessage, {
                parse_mode: 'HTML',
                reply_markup: this.createPersistentKeyboard()
            });
        } catch (error) {
            log('error', 'Error in balance keyboard handler', error);
            await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
        }
    }

    async handlePurchasesCommand(msg) {
        try {
            const user = await User.getByTelegramId(msg.from.id);
            if (!user) {
                await this.bot.sendMessage(msg.chat.id, 'Please use /start first to register.');
                return;
            }
            await this.showUserPurchases(msg.chat.id, user.telegram_id);
        } catch (error) {
            log('error', 'Error in purchases keyboard handler', error);
            await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
        }
    }

    async handleTransactionsCommand(msg) {
        try {
            const user = await User.getByTelegramId(msg.from.id);
            if (!user) {
                await this.bot.sendMessage(msg.chat.id, 'Please use /start first to register.');
                return;
            }
            await this.showUserTransactions(msg.chat.id, user.telegram_id);
        } catch (error) {
            log('error', 'Error in transactions keyboard handler', error);
            await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
        }
    }

    async handleHelpCommand(msg) {
        try {
            const helpMessage = `🤖 <b>Gaming Accounts Store - Help</b>

<b>🎮 Browse Accounts</b> - View all available gaming accounts
<b>💰 Add Funds</b> - Top up your account balance
<b>🏪 Account Info</b> - View your account details and balance
<b>📦 My Purchases</b> - See your purchased accounts
<b>💳 Transactions</b> - View your transaction history
<b>❓ Help</b> - Show this help message

<b>💡 How to buy:</b>
1. Browse accounts and find one you like
2. Make sure you have enough balance
3. Click "Buy Now" and confirm
4. Get instant access to your account!

<b>💰 Payment:</b>
We accept KHQR payments for easy and secure transactions.

<b>🔒 Security:</b>
All accounts are verified and delivered instantly after payment.

Need more help? Contact our support team! 🚀`;

            await this.bot.sendMessage(msg.chat.id, helpMessage, {
                parse_mode: 'HTML',
                reply_markup: this.createPersistentKeyboard()
            });
        } catch (error) {
            log('error', 'Error in help keyboard handler', error);
            await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
        }
    }

    async handleTopupAmountInput(msg) {
        try {
            const amount = msg.text.trim();
            log('info', `Handling topup amount input: "${amount}" from user ${msg.from.id}`);

            // Get dynamic settings
            const settings = settingsManager.getCurrentSettings();
            const minAmount = parseFloat(settings.minTopupAmount);
            const maxAmount = parseFloat(settings.maxTopupAmount);

            log('info', `Topup limits: min=$${minAmount}, max=$${maxAmount}`);

            // Validate amount format
            if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
                log('info', `Invalid amount format: "${amount}"`);
                await this.bot.sendMessage(msg.chat.id,
                    `❌ Invalid amount! Please enter a valid number between $${minAmount} and $${maxAmount}:`
                );
                return;
            }

            const numericAmount = parseFloat(amount);
            log('info', `Parsed amount: ${numericAmount}`);

            // Validate amount against dynamic limits
            if (numericAmount < minAmount) {
                log('info', `Amount ${numericAmount} below minimum ${minAmount}`);
                await this.bot.sendMessage(msg.chat.id,
                    `❌ Minimum topup amount is $${minAmount}. Please enter a higher amount.`
                );
                return;
            }

            if (numericAmount > maxAmount) {
                log('info', `Amount ${numericAmount} above maximum ${maxAmount}`);
                await this.bot.sendMessage(msg.chat.id,
                    `❌ Maximum topup amount is $${maxAmount}. Please enter a lower amount.`
                );
                return;
            }

            log('info', `Amount validation passed, proceeding with QR generation for $${numericAmount}`);

            // Clear user state
            this.clearUserState(msg.from.id);

            // Generate QR code using KHQR Payment Controller
            await this.khqrPayment.processTopup(msg.chat.id, msg.from.id, numericAmount);

        } catch (error) {
            log('error', 'Error handling topup amount input', error);
            await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try /topup again.');
            this.clearUserState(msg.from.id);
        }
    }

    setupCommands() {
        // Start command
        this.bot.onText(/\/start/, async (msg) => {
            try {
                const user = await User.createOrUpdate(msg.from);
                const welcomeMessage = `សូមស្វាគមន៍មកកាន់ Gaming Store!
សូមជ្រើសរើសជម្រើសខាងក្រោមនេះ 👇`;

                // Create persistent keyboard menu
                const keyboard = this.createPersistentKeyboard();

                await this.bot.sendMessage(msg.chat.id, welcomeMessage, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });

                // Show featured accounts if any exist
                await this.showFeaturedAccounts(msg.chat.id);

                log('info', `User ${user.telegram_id} started the bot`);
            } catch (error) {
                log('error', 'Error in /start command', error);
                await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
            }
        });

        // Balance command
        this.bot.onText(/\/balance/, async (msg) => {
            try {
                // Check user status first
                const statusCheck = await this.checkUserStatus(msg.from.id, msg.from);
                if (!statusCheck.allowed) {
                    await this.sendBlockedUserMessage(msg.chat.id, statusCheck.reason);
                    return;
                }

                const user = statusCheck.user;
                const balanceMessage = `🏪 <b>Account Information</b>

👤 <b>Name:</b> ${escapeHtml(user.first_name || 'N/A')} ${escapeHtml(user.last_name || '')}
🆔 <b>Username:</b> ${user.username ? '@' + escapeHtml(user.username) : 'Not set'}
💰 <b>Current Balance:</b> ${formatCurrency(user.balance)}
📅 <b>Member Since:</b> ${formatDate(user.registration_date)}

💡 Use "💰 Add Funds" to top up your account!`;

                await this.bot.sendMessage(msg.chat.id, balanceMessage, {
                    parse_mode: 'HTML',
                    reply_markup: this.createPersistentKeyboard()
                });
                log('info', `User ${msg.from.id} checked balance: ${formatCurrency(user.balance)}`);
            } catch (error) {
                log('error', 'Error in /balance command', error);
                await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
            }
        });

        // Topup command - Ask for amount first
        this.bot.onText(/\/topup/, async (msg) => {
            try {
                // Check user status first
                const statusCheck = await this.checkUserStatus(msg.from.id, msg.from);
                if (!statusCheck.allowed) {
                    await this.sendBlockedUserMessage(msg.chat.id, statusCheck.reason);
                    return;
                }

                const user = statusCheck.user;

                // Get dynamic settings
                const settings = settingsManager.getCurrentSettings();
                const minAmount = parseFloat(settings.minTopupAmount);
                const maxAmount = parseFloat(settings.maxTopupAmount);

                const topupMessage = `💳 <b>Add Funds to Your Account</b>

Your current balance: <b>${formatCurrency(user.balance)}</b>

Please enter the amount you want to add (USD):

<b>Examples:</b>
• Type <code>${minAmount}</code> for $${minAmount.toFixed(2)}
• Type <code>${Math.max(minAmount, 1)}</code> for $${Math.max(minAmount, 1).toFixed(2)}
• Type <code>${Math.min(25, maxAmount)}</code> for $${Math.min(25, maxAmount).toFixed(2)}

<b>Limits:</b>
• Minimum: $${minAmount.toFixed(2)}
• Maximum: $${maxAmount.toFixed(2)}

<i>Just type the number and I'll generate a QR code for you!</i> 💰\n\n<small>QR is valid for 10 minutes.</small>`;

                await this.bot.sendMessage(msg.chat.id, topupMessage, {
                    parse_mode: 'HTML',
                    reply_markup: this.createPersistentKeyboard()
                });

                // Set user state to waiting for topup amount
                this.setUserState(msg.from.id, 'waiting_topup_amount');

            } catch (error) {
                log('error', 'Error in /topup command', error);
                await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
            }
        });

        // Account command
        this.bot.onText(/\/account/, async (msg) => {
            try {
                const user = await User.getByTelegramId(msg.from.id);
                if (!user) {
                    await this.bot.sendMessage(msg.chat.id, 'Please use /start first to register.');
                    return;
                }

                await this.showAllAccounts(msg.chat.id);
            } catch (error) {
                log('error', 'Error in /account command', error);
                await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
            }
        });

        // Browse command
        this.bot.onText(/\/browse/, async (msg) => {
            try {
                const user = await User.getByTelegramId(msg.from.id);
                if (!user) {
                    await this.bot.sendMessage(msg.chat.id, 'Please use /start first to register.');
                    return;
                }

                await this.showCollectorStatusOptions(msg.chat.id);
            } catch (error) {
                log('error', 'Error in /browse command', error);
                await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
            }
        });

        // Purchases command
        this.bot.onText(/\/purchases/, async (msg) => {
            try {
                const user = await User.getByTelegramId(msg.from.id);
                if (!user) {
                    await this.bot.sendMessage(msg.chat.id, 'Please use /start first to register.');
                    return;
                }

                await this.showUserPurchases(msg.chat.id, user.telegram_id);
            } catch (error) {
                log('error', 'Error in /purchases command', error);
                await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
            }
        });

        // Transactions command
        this.bot.onText(/\/transactions/, async (msg) => {
            try {
                const user = await User.getByTelegramId(msg.from.id);
                if (!user) {
                    await this.bot.sendMessage(msg.chat.id, 'Please use /start first to register.');
                    return;
                }

                await this.showUserTransactions(msg.chat.id, user.telegram_id);
            } catch (error) {
                log('error', 'Error in /transactions command', error);
                await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
            }
        });

        // Help command
        this.bot.onText(/\/help/, async (msg) => {
            const helpMessage = `🤖 <b>Gaming Accounts Store - Help</b>

<b>Available Commands:</b>
/start - Register and get welcome message
/balance - Check your current balance
/topup &lt;amount&gt; - Add funds (e.g., /topup 25.50)
/browse - Browse available gaming accounts
/purchases - View your purchase history
/transactions - View your transaction history
/help - Show this help message

<b>How to Buy:</b>
1. Use /topup to add funds to your account
2. Use /browse to see available accounts
3. Click on an account to view details
4. Click "Buy Now" to purchase

<b>Payment:</b>
We accept payments via KHQR (Cambodian QR Payment)
Payments are processed automatically within 3 minutes

<b>Support:</b>
If you need help, contact our admin team.`;

            await this.bot.sendMessage(msg.chat.id, helpMessage, {
                parse_mode: 'HTML',
                reply_markup: this.createPersistentKeyboard()
            });
        });
    }

    setupCallbackHandlers() {
        this.bot.on('callback_query', async (callbackQuery) => {
            try {
                const data = callbackQuery.data;
                const chatId = callbackQuery.message.chat.id;
                const messageId = callbackQuery.message.message_id;
                const userId = callbackQuery.from.id;

                // Check user status for all callback interactions
                const statusCheck = await this.checkUserStatus(userId, callbackQuery.from);
                if (!statusCheck.allowed) {
                    await this.bot.answerCallbackQuery(callbackQuery.id, {
                        text: statusCheck.reason === 'deactivated' ?
                            'Your account has been deactivated.' :
                            'Access denied.',
                        show_alert: true
                    });
                    return;
                }

                // Answer callback query to remove loading state
                await this.bot.answerCallbackQuery(callbackQuery.id);

                if (data.startsWith('browse_')) {
                    await this.handleBrowseCallback(chatId, messageId, data);
                } else if (data.startsWith('collector_')) {
                    await this.handleCollectorStatusCallback(chatId, messageId, data);
                } else if (data.startsWith('view_')) {
                    await this.handleViewAccountCallback(chatId, messageId, data);
                } else if (data.startsWith('buy_')) {
                    await this.handleBuyCallback(chatId, callbackQuery.from.id, data);
                } else if (data.startsWith('confirm_buy_')) {
                    await this.handleConfirmBuyCallback(chatId, callbackQuery.from.id, messageId, data);
                } else if (data.startsWith('accounts_')) {
                    await this.handleAccountsPageCallback(chatId, messageId, data);
                } else if (data === 'cancel_purchase') {
                    await this.bot.editMessageText('Purchase cancelled.', {
                        chat_id: chatId,
                        message_id: messageId
                    });
                }
            } catch (error) {
                log('error', 'Error in callback query handler', error);
                await this.bot.answerCallbackQuery(callbackQuery.id, {
                    text: 'Something went wrong. Please try again.',
                    show_alert: true
                });
            }
        });
    }

    setupErrorHandling() {
        this.bot.on('error', (error) => {
            log('error', 'Telegram bot error', error);
        });

        this.bot.on('polling_error', (error) => {
            log('error', 'Telegram bot polling error', error);
        });
    }

    async showFeaturedAccounts(chatId) {
        try {
            const featuredAccounts = await Account.getFeatured(3, 0); // Get top 3 featured accounts

            if (featuredAccounts.length === 0) {
                return; // No featured accounts, don't show anything
            }

            // Send header message first
            await this.bot.sendMessage(chatId, '⭐ <b>Featured Accounts</b>', {
                parse_mode: 'HTML'
            });

            // Send each featured account as a separate message with image
            for (const account of featuredAccounts) {
                let caption = `🌟 <b>${escapeHtml(account.title)}</b>\n`;
                caption += `💰 <b>${formatCurrency(account.price)}</b>\n\n`;

                if (account.description) {
                    const shortDesc = account.description.length > 100
                        ? account.description.substring(0, 100) + '...'
                        : account.description;
                    caption += `📝 ${escapeHtml(shortDesc)}\n\n`;
                }

                const keyboard = {
                    inline_keyboard: [[{
                        text: `🌟 View Details`,
                        callback_data: `view_${account.id}`
                    }]]
                };

                // Try to send with image first
                let imageToSend = null;

                // Check for image_url first, then fallback to first image in images array
                if (account.image_url) {
                    imageToSend = account.image_url;
                } else if (account.images && account.images.length > 0) {
                    imageToSend = account.images[0];
                }

                if (imageToSend) {
                    try {
                        let imageSource;

                        if (imageToSend.startsWith('http')) {
                            // External URL - use as is
                            imageSource = imageToSend;
                        } else {
                            // Local file - use file path for Telegram Bot API
                            const path = require('path');
                            const fs = require('fs');

                            // Convert URL path to file system path
                            let filePath;
                            if (imageToSend.startsWith('/uploads/')) {
                                filePath = path.join(__dirname, '..', 'public', imageToSend);
                            } else if (imageToSend.startsWith('uploads/')) {
                                filePath = path.join(__dirname, '..', 'public', imageToSend);
                            } else {
                                filePath = path.join(__dirname, '..', 'public', 'uploads', imageToSend);
                            }

                            // Check if file exists
                            if (fs.existsSync(filePath)) {
                                imageSource = filePath;
                                log('info', `Sending image from file: ${filePath}`);
                            } else {
                                log('error', `Image file not found: ${filePath}`);
                                throw new Error(`Image file not found: ${filePath}`);
                            }
                        }

                        await this.bot.sendPhoto(chatId, imageSource, {
                            caption: caption,
                            parse_mode: 'HTML',
                            reply_markup: keyboard
                        });
                    } catch (imageError) {
                        log('error', 'Error sending featured account image', {
                            error: imageError.message,
                            imageUrl: imageToSend,
                            accountId: account.id
                        });
                        // Fallback to text message if image fails
                        await this.bot.sendMessage(chatId, caption, {
                            parse_mode: 'HTML',
                            reply_markup: keyboard
                        });
                    }
                } else {
                    // Send as text message if no image
                    await this.bot.sendMessage(chatId, caption, {
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    });
                }
            }

            // Send footer message
            await this.bot.sendMessage(chatId, 'Use /browse to see all available accounts! 🎮');

        } catch (error) {
            log('error', 'Error showing featured accounts', error);
            // Don't throw error, just log it so the start command doesn't fail
        }
    }

    async showAllAccounts(chatId) {
        try {
            const accounts = await Account.getAvailable(10, 0);

            if (accounts.length === 0) {
                await this.bot.sendMessage(chatId, 'No gaming accounts available at the moment. Please check back later!', {
                    reply_markup: this.createPersistentKeyboard()
                });
                return;
            }

            await this.bot.sendMessage(chatId, '🎮 <b>Available Gaming Accounts</b>\n\nHere are all available accounts:', {
                parse_mode: 'HTML',
                reply_markup: this.createPersistentKeyboard()
            });

            // Send each account as a separate message with image
            for (const account of accounts) {
                await this.sendAccountMessage(chatId, account);
            }
        } catch (error) {
            log('error', 'Error showing all accounts', error);
            await this.bot.sendMessage(chatId, 'Sorry, something went wrong while loading accounts.', {
                reply_markup: this.createPersistentKeyboard()
            });
        }
    }

    async sendAccountMessage(chatId, account) {
        try {
            // Create account message in the requested format
            let caption = `🎮 <b>${escapeHtml(account.title)}</b>\n\n`;

            caption += `<b>Information:</b>\n`;

            // Account Code
            if (account.account_code) {
                caption += `✅ <b>Account Code</b> [ ${escapeHtml(account.account_code)} ]\n`;
            }

            // Account Status
            if (account.account_status) {
                caption += `✅ <b>Account Status</b> [ ${escapeHtml(account.account_status)} ]\n`;
            }

            // Verify Code
            if (account.verify_code) {
                caption += `✅ <b>Verify code</b> [ ${escapeHtml(account.verify_code)} ]\n`;
            }

            // Inactive Status
            if (account.inactive_status) {
                caption += `✅ <b>Inactive</b> [ ${escapeHtml(account.inactive_status)} ]\n`;
            }

            // Collector Status
            if (account.collector_status) {
                caption += `✅ <b>Collector</b> [ ${escapeHtml(account.collector_status)} ]\n`;
            }

            // Device Info
            if (account.device_info) {
                caption += `✅ <b>Device</b> [ ${escapeHtml(account.device_info)} ]\n`;
            }

            caption += `\n💰 <b>Price:</b> ${formatCurrency(account.price)}`;

            const keyboard = {
                inline_keyboard: [[
                    {
                        text: '🛒 Buy Now',
                        callback_data: `buy_${account.id}`
                    }
                ]]
            };

            // Try to send with image using the same logic as featured accounts
            let imageToSend = null;

            // Check for image_url first, then fallback to first image in images array
            if (account.image_url) {
                imageToSend = account.image_url;
            } else if (account.images && account.images.length > 0) {
                imageToSend = account.images[0];
            } else if (account.image_path) {
                imageToSend = account.image_path;
            }

            if (imageToSend) {
                try {
                    let imageSource;

                    if (imageToSend.startsWith('http')) {
                        // External URL - use as is
                        imageSource = imageToSend;
                    } else {
                        // Local file - use file path for Telegram Bot API
                        const fs = require('fs');

                        // Convert URL path to file system path
                        let filePath;
                        if (imageToSend.startsWith('/uploads/')) {
                            filePath = path.join(__dirname, '..', 'public', imageToSend);
                        } else if (imageToSend.startsWith('uploads/')) {
                            filePath = path.join(__dirname, '..', 'public', imageToSend);
                        } else {
                            filePath = path.join(__dirname, '..', 'public', 'uploads', imageToSend);
                        }

                        // Check if file exists
                        if (fs.existsSync(filePath)) {
                            imageSource = filePath;
                            log('info', `Sending account image from file: ${filePath}`);
                        } else {
                            log('error', `Account image file not found: ${filePath}`);
                            throw new Error(`Image file not found: ${filePath}`);
                        }
                    }

                    await this.bot.sendPhoto(chatId, imageSource, {
                        caption: caption,
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    });
                } catch (imageError) {
                    log('error', 'Error sending account image', {
                        error: imageError.message,
                        account_id: account.id,
                        image_path: imageToSend
                    });
                    // Fallback to text message
                    await this.bot.sendMessage(chatId, caption, {
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    });
                }
            } else {
                // No image available, send text message
                await this.bot.sendMessage(chatId, caption, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard
                });
            }
        } catch (error) {
            log('error', 'Error sending account message', error);
            // Final fallback to simple message
            const simpleMessage = `🎮 <b>${escapeHtml(account.title)}</b>\n💰 ${formatCurrency(account.price)}`;
            await this.bot.sendMessage(chatId, simpleMessage, {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🛒 Buy Now', callback_data: `buy_${account.id}` }
                    ]]
                }
            });
        }
    }

    async handleBrowseCommand(msg) {
        try {
            const user = await User.getByTelegramId(msg.from.id);
            if (!user) {
                await this.bot.sendMessage(msg.chat.id, 'Please use /start first to register.');
                return;
            }

            await this.showCollectorStatusOptions(msg.chat.id);
        } catch (error) {
            log('error', 'Error in browse command handler', error);
            await this.bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
        }
    }

    async showCollectorStatusOptions(chatId) {
        try {
            // Get unique collector statuses from database
            const collectorStatuses = await Account.getCollectorStatuses();

            if (collectorStatuses.length === 0) {
                await this.bot.sendMessage(chatId, 'No accounts with collector status available at the moment. Please check back later!', {
                    reply_markup: this.createPersistentKeyboard()
                });
                return;
            }

            // Create inline keyboard with collector status options
            const keyboard = {
                inline_keyboard: []
            };

            // Add buttons for each collector status (2 per row)
            for (let i = 0; i < collectorStatuses.length; i += 2) {
                const row = [];
                row.push({
                    text: `🏆 ${collectorStatuses[i]}`,
                    callback_data: `collector_${collectorStatuses[i].replace(/\s+/g, '_')}`
                });

                if (i + 1 < collectorStatuses.length) {
                    row.push({
                        text: `🏆 ${collectorStatuses[i + 1]}`,
                        callback_data: `collector_${collectorStatuses[i + 1].replace(/\s+/g, '_')}`
                    });
                }
                keyboard.inline_keyboard.push(row);
            }

            await this.bot.sendMessage(chatId, '🔍 <b>Browse by Collector Status</b>\n\nSelect a collector status to view accounts:', {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } catch (error) {
            log('error', 'Error showing collector status options', error);
            await this.bot.sendMessage(chatId, 'Sorry, something went wrong while loading collector statuses.', {
                reply_markup: this.createPersistentKeyboard()
            });
        }
    }

    async showGameTypes(chatId) {
        try {
            const gameTypes = await Account.getGameTypes();

            if (gameTypes.length === 0) {
                await this.bot.sendMessage(chatId, 'No gaming accounts available at the moment. Please check back later!');
                return;
            }

            const keyboard = createGameTypeKeyboard(gameTypes);

            await this.bot.sendMessage(chatId, '🎮 <b>Select Game Type</b>\n\nChoose a game category to browse available accounts:', {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } catch (error) {
            log('error', 'Error showing game types', error);
            throw error;
        }
    }

    async handleBrowseCallback(chatId, messageId, data) {
        try {
            const gameType = data.replace('browse_', '');
            let accounts;
            
            if (gameType === 'all') {
                accounts = await Account.getAvailable(10, 0);
            } else {
                accounts = await Account.getByGameType(gameType, 10, 0);
            }

            if (accounts.length === 0) {
                await this.bot.editMessageText('No accounts available for this game type.', {
                    chat_id: chatId,
                    message_id: messageId
                });
                return;
            }

            await this.showAccountsList(chatId, messageId, accounts, gameType, 1);
        } catch (error) {
            log('error', 'Error handling browse callback', error);
            throw error;
        }
    }

    async showAccountsList(chatId, messageId, accounts, gameType, page) {
        try {
            const accountsPerPage = 5;
            const startIndex = (page - 1) * accountsPerPage;
            const endIndex = startIndex + accountsPerPage;
            const pageAccounts = accounts.slice(startIndex, endIndex);
            
            let message = `🎮 <b>${gameType === 'all' ? 'All Games' : gameType} - Available Accounts</b>\n\n`;
            
            const keyboard = [];
            
            pageAccounts.forEach((account, index) => {
                message += `${startIndex + index + 1}. <b>${escapeHtml(account.title)}</b>\n`;
                message += `   💰 ${formatCurrency(account.price)}\n\n`;
                
                keyboard.push([{
                    text: `View ${account.title}`,
                    callback_data: `view_${account.id}`
                }]);
            });

            // Add pagination if needed
            const totalPages = Math.ceil(accounts.length / accountsPerPage);
            if (totalPages > 1) {
                const paginationKeyboard = createPaginationKeyboard(page, totalPages, `accounts_${gameType}`);
                keyboard.push(...paginationKeyboard.inline_keyboard);
            }

            await this.bot.editMessageText(message, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            });
        } catch (error) {
            log('error', 'Error showing accounts list', error);
            throw error;
        }
    }

    async handleCollectorStatusCallback(chatId, messageId, data) {
        try {
            // Extract collector status from callback data
            const collectorStatus = data.replace('collector_', '').replace(/_/g, ' ');

            // Get accounts with this collector status
            const accounts = await Account.getByCollectorStatus(collectorStatus, 10, 0);

            if (accounts.length === 0) {
                await this.bot.sendMessage(chatId, `No accounts with "${collectorStatus}" collector status available at the moment. Please check back later!`, {
                    reply_markup: this.createPersistentKeyboard()
                });
                return;
            }

            await this.bot.sendMessage(chatId, `🏆 <b>${escapeHtml(collectorStatus)} Accounts</b>\n\nHere are all accounts with "${escapeHtml(collectorStatus)}" collector status:`, {
                parse_mode: 'HTML',
                reply_markup: this.createPersistentKeyboard()
            });

            // Send each account as a separate message with image
            for (const account of accounts) {
                await this.sendAccountMessage(chatId, account);
            }
        } catch (error) {
            log('error', 'Error handling collector status callback', error);
            await this.bot.sendMessage(chatId, 'Sorry, something went wrong while loading accounts.', {
                reply_markup: this.createPersistentKeyboard()
            });
        }
    }

    async handleViewAccountCallback(chatId, messageId, data) {
        try {
            const accountId = parseInt(data.replace('view_', ''));
            const account = await Account.getById(accountId);

            if (!account || !account.is_available) {
                // Send a new message instead of trying to edit
                await this.bot.sendMessage(chatId, 'Sorry, this account is no longer available.');
                return;
            }

            const accountMessage = formatAccountMessage(account);
            const keyboard = createPurchaseKeyboard(account.id);

            // Send a new message with account details instead of editing the photo message
            await this.bot.sendMessage(chatId, accountMessage, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } catch (error) {
            log('error', 'Error handling view account callback', error);
            // Send error message instead of throwing
            await this.bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again.');
        }
    }

    async handleAccountsPageCallback(chatId, messageId, data) {
        try {
            const parts = data.split('_');
            const gameType = parts[1];
            const page = parseInt(parts[2]);

            let accounts;
            if (gameType === 'all') {
                accounts = await Account.getAvailable(50, 0); // Get more for pagination
            } else {
                accounts = await Account.getByGameType(gameType, 50, 0);
            }

            await this.showAccountsList(chatId, messageId, accounts, gameType, page);
        } catch (error) {
            log('error', 'Error handling accounts page callback', error);
            throw error;
        }
    }

    async handleBuyCallback(chatId, userId, data) {
        try {
            const accountId = parseInt(data.replace('buy_', ''));
            const account = await Account.getById(accountId);

            if (!account || !account.is_available) {
                await this.bot.sendMessage(chatId, 'Sorry, this account is no longer available.');
                return;
            }

            const user = await User.getByTelegramId(userId);
            if (!user) {
                await this.bot.sendMessage(chatId, 'Please use /start first to register.');
                return;
            }

            if (user.balance < account.price) {
                const shortfall = account.price - user.balance;
                await this.bot.sendMessage(chatId,
                    `❌ Insufficient balance!\n\nAccount price: ${formatCurrency(account.price)}\nYour balance: ${formatCurrency(user.balance)}\nYou need: ${formatCurrency(shortfall)} more\n\nUse /topup to add funds.`
                );
                return;
            }

            // Show purchase confirmation
            await this.showPurchaseConfirmation(chatId, userId, accountId);
        } catch (error) {
            log('error', 'Error handling buy callback', error);
            await this.bot.sendMessage(chatId, 'Sorry, something went wrong with your purchase. Please try again.');
        }
    }

    async showPurchaseConfirmation(chatId, userId, accountId) {
        try {
            const account = await Account.getById(accountId);
            const user = await User.getByTelegramId(userId);

            const confirmationMessage = `🛒 <b>Purchase Confirmation</b>\n\n` +
                `🎮 <b>Account:</b> ${escapeHtml(account.title)}\n` +
                `💰 <b>Price:</b> ${formatCurrency(account.price)}\n` +
                `💳 <b>Your Balance:</b> ${formatCurrency(user.balance)}\n` +
                `💵 <b>Balance After:</b> ${formatCurrency(user.balance - account.price)}\n\n` +
                `❓ <b>Are you sure you want to buy this account?</b>`;

            const keyboard = {
                inline_keyboard: [
                    [
                        {
                            text: '✅ Yes, Buy Now',
                            callback_data: `confirm_buy_${accountId}`
                        },
                        {
                            text: '❌ Cancel',
                            callback_data: 'cancel_purchase'
                        }
                    ]
                ]
            };

            await this.bot.sendMessage(chatId, confirmationMessage, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } catch (error) {
            log('error', 'Error showing purchase confirmation', error);
            throw error;
        }
    }

    async handleConfirmBuyCallback(chatId, userId, messageId, data) {
        try {
            const accountId = parseInt(data.replace('confirm_buy_', ''));
            const account = await Account.getById(accountId);

            if (!account || !account.is_available) {
                await this.bot.editMessageText('Sorry, this account is no longer available.', {
                    chat_id: chatId,
                    message_id: messageId
                });
                return;
            }

            const user = await User.getByTelegramId(userId);
            if (!user) {
                await this.bot.editMessageText('Please use /start first to register.', {
                    chat_id: chatId,
                    message_id: messageId
                });
                return;
            }

            if (user.balance < account.price) {
                const shortfall = account.price - user.balance;
                await this.bot.editMessageText(
                    `❌ Insufficient balance!\n\nAccount price: ${formatCurrency(account.price)}\nYour balance: ${formatCurrency(user.balance)}\nYou need: ${formatCurrency(shortfall)} more\n\nUse /topup to add funds.`,
                    {
                        chat_id: chatId,
                        message_id: messageId
                    }
                );
                return;
            }

            // Delete the confirmation message
            await this.bot.deleteMessage(chatId, messageId);

            // Process purchase
            await this.processPurchase(chatId, userId, accountId);
        } catch (error) {
            log('error', 'Error handling confirm buy callback', error);
            await this.bot.sendMessage(chatId, 'Sorry, something went wrong with your purchase. Please try again.');
        }
    }

    async processPurchase(chatId, userId, accountId) {
        try {
            const account = await Account.getById(accountId);

            // Create purchase record
            const purchase = await Purchase.create({
                user_id: userId,
                account_id: accountId
            });

            // Update user balance
            await User.updateBalance(userId, account.price, 'subtract');

            // Mark account as sold
            await Account.markAsSold(accountId);

            // Create transaction record
            await Transaction.create({
                user_id: userId,
                type: 'purchase',
                amount: -account.price,
                status: 'completed'
            });

            // Send account details to user
            const accountDetails = this.formatAccountDetails(account);
            await this.bot.sendMessage(chatId,
                `✅ <b>Purchase Successful!</b>\n\n${accountDetails}\n\n🎉 Enjoy your new gaming account!`,
                { parse_mode: 'HTML' }
            );

            // Create and send account code file
            await this.sendAccountCodeFile(chatId, account);

            // Mark purchase as delivered
            await purchase.markDelivered();

            log('info', `Purchase completed: User ${userId} bought account ${accountId}`);
        } catch (error) {
            log('error', 'Error processing purchase', error);
            throw error;
        }
    }

    async sendAccountCodeFile(chatId, account) {
        try {
            const fs = require('fs');
            const path = require('path');

            const accountCode = account.getAccountCode();
            const fileName = `account_${accountCode}.txt`;
            const filePath = path.join(__dirname, '..', 'temp', fileName);

            // Ensure temp directory exists
            const tempDir = path.dirname(filePath);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // Get full account credentials including email and password
            const accountCredentials = account.getPurchaseFormat();

            // Extract email and password from the credentials
            let email = 'N/A';
            let password = 'N/A';

            // Parse the credentials format: "email:password | Level: X | Name: Y | ..."
            if (accountCredentials && accountCredentials.includes(':')) {
                const parts = accountCredentials.split('|')[0].trim(); // Get the first part before |
                if (parts.includes(':')) {
                    const [emailPart, passwordPart] = parts.split(':');
                    email = emailPart.trim();
                    password = passwordPart.trim();
                }
            }

            // Create super cool animated text file content
            const currentDate = new Date().toLocaleString();
            const fileContent = this.generateCoolAccountFile(account, email, password, accountCode, accountCredentials, currentDate);

            // Write account details to file
            fs.writeFileSync(filePath, fileContent);

            // Send file to user
            await this.bot.sendDocument(chatId, filePath, {
                caption: `🎮 **GAMING ACCOUNT DELIVERED** 🎮\n\n` +
                        `✨ **LOGIN CREDENTIALS** ✨\n` +
                        `📧 **Email:** ${email}\n` +
                        `🔐 **Password:** ${password}\n` +
                        `🎯 **Account Code:** ${accountCode}\n\n` +
                        `🚀 **Ready to dominate the game!** 🚀`,
                parse_mode: 'Markdown'
            });

            // Clean up file after sending
            setTimeout(() => {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }, 5000); // Delete after 5 seconds

        } catch (error) {
            log('error', 'Error sending account code file', error);
            // Don't throw error as the main purchase was successful
        }
    }

    generateCoolAccountFile(account, email, password, accountCode, accountCredentials, currentDate) {
        return `
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║    ██████╗  █████╗ ███╗   ███╗██╗███╗   ██╗ ██████╗      █████╗  ██████╗    ║
║   ██╔════╝ ██╔══██╗████╗ ████║██║████╗  ██║██╔════╝     ██╔══██╗██╔════╝    ║
║   ██║  ███╗███████║██╔████╔██║██║██╔██╗ ██║██║  ███╗    ███████║██║         ║
║   ██║   ██║██╔══██║██║╚██╔╝██║██║██║╚██╗██║██║   ██║    ██╔══██║██║         ║
║   ╚██████╔╝██║  ██║██║ ╚═╝ ██║██║██║ ╚████║╚██████╔╝    ██║  ██║╚██████╗    ║
║    ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝ ╚═════╝     ╚═╝  ╚═╝ ╚═════╝    ║
║                                                                              ║
║                        🎮 ACCOUNT DELIVERY SYSTEM 🎮                        ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────┐
│                           ⚡ INSTANT ACCESS ⚡                              │
└─────────────────────────────────────────────────────────────────────────────┘

🎯 ACCOUNT CODE: ${accountCode}
📅 DELIVERED ON: ${currentDate}

╔═══════════════════════════════════════════════════════════════════════════════╗
║                              🔐 LOGIN CREDENTIALS 🔐                         ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  📧 EMAIL ADDRESS:                                                            ║
║  ┌─────────────────────────────────────────────────────────────────────────┐ ║
║  │  ${email.padEnd(65)}│ ║
║  └─────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
║  🔑 PASSWORD:                                                                 ║
║  ┌─────────────────────────────────────────────────────────────────────────┐ ║
║  │  ${password.padEnd(65)}│ ║
║  └─────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════════════════════╗
║                            🎮 ACCOUNT INFORMATION 🎮                         ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  🎯 GAME TITLE: ${account.title.padEnd(58)}║
║                                                                               ║
║  📊 FULL DETAILS:                                                             ║
║  ┌─────────────────────────────────────────────────────────────────────────┐ ║
║  │  ${accountCredentials.substring(0, 65).padEnd(65)}│ ║${accountCredentials.length > 65 ? `
║  │  ${accountCredentials.substring(65, 130).padEnd(65)}│ ║` : ''}${accountCredentials.length > 130 ? `
║  │  ${accountCredentials.substring(130, 195).padEnd(65)}│ ║` : ''}
║  └─────────────────────────────────────────────────────────────────────────┘ ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────┐
│                              🚀 QUICK START GUIDE 🚀                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1️⃣  Copy the EMAIL ADDRESS from the box above                             │
│  2️⃣  Copy the PASSWORD from the box above                                  │
│  3️⃣  Open your game and go to LOGIN screen                                 │
│  4️⃣  Paste the credentials and LOGIN                                       │
│  5️⃣  ENJOY your new gaming account! 🎉                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

╔═══════════════════════════════════════════════════════════════════════════════╗
║                              ⚠️  IMPORTANT NOTES ⚠️                          ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  🔒 SECURITY: Change password after first login for security                 ║
║  💾 BACKUP: Save these credentials in a secure location                      ║
║  🚫 SHARING: Do not share account details with others                        ║
║  📞 SUPPORT: Contact us if you face any login issues                         ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────┐
│                              🎊 THANK YOU! 🎊                              │
│                                                                             │
│              Thank you for choosing our gaming account service!            │
│                        🌟 Happy Gaming! 🌟                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
                            🎮 GAMING ACCOUNT BOT 🎮
                              Powered by Excellence
═══════════════════════════════════════════════════════════════════════════════

                                ⭐ ⭐ ⭐ ⭐ ⭐
                              PREMIUM QUALITY ACCOUNTS
                                ⭐ ⭐ ⭐ ⭐ ⭐

▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
`;
    }

    formatAccountDetails(account) {
        // Use the new purchase format from the Account model
        const purchaseFormat = account.getPurchaseFormat();
        const accountCode = account.getAccountCode();

        let details = `🎮 <b>Account Purchased Successfully!</b>\n\n`;
        details += `📋 <b>Account Details:</b>\n`;
        details += `<code>${escapeHtml(purchaseFormat)}</code>\n\n`;
        details += `🔑 <b>Account Code:</b> <code>${escapeHtml(accountCode)}</code>\n\n`;
        details += `💡 <i>Save this information securely!</i>`;

        return details;
    }

    async showUserPurchases(chatId, userId) {
        try {
            const purchases = await Purchase.getByUserId(userId, 10, 0);

            if (purchases.length === 0) {
                await this.bot.sendMessage(chatId,
                    '📦 <b>Your Purchases</b>\n\nYou haven\'t made any purchases yet.\n\nUse "🎮 Browse Accounts" to find gaming accounts!',
                    {
                        parse_mode: 'HTML',
                        reply_markup: this.createPersistentKeyboard()
                    }
                );
                return;
            }

            let message = '📦 <b>Your Recent Purchases</b>\n\n';

            purchases.forEach((purchase, index) => {
                message += `${index + 1}. <b>${escapeHtml(purchase.title || 'Unknown')}</b>\n`;
                message += `   🎮 ${escapeHtml(purchase.game_type || 'Unknown')}\n`;
                message += `   💰 ${formatCurrency(purchase.price || 0)}\n`;
                message += `   📅 ${formatDate(purchase.purchase_date)}\n`;
                message += `   📋 Status: ${purchase.delivery_status === 'delivered' ? '✅ Delivered' : '⏳ Processing'}\n\n`;
            });

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                reply_markup: this.createPersistentKeyboard()
            });
        } catch (error) {
            log('error', 'Error showing user purchases', error);
            throw error;
        }
    }

    // Show user transactions
    async showUserTransactions(chatId, userId) {
        try {
            const transactions = await Transaction.getByUserId(userId);

            if (transactions.length === 0) {
                await this.bot.sendMessage(chatId,
                    '💳 <b>Your Transactions</b>\n\n' +
                    'You haven\'t made any transactions yet.\n\n' +
                    'Use "💰 Add Funds" to add funds or "🎮 Browse Accounts" to buy accounts!',
                    {
                        parse_mode: 'HTML',
                        reply_markup: this.createPersistentKeyboard()
                    }
                );
                return;
            }

            let message = '💳 <b>Your Recent Transactions</b>\n\n';

            // Show last 10 transactions
            const recentTransactions = transactions.slice(0, 10);

            recentTransactions.forEach((transaction, index) => {
                const typeIcon = transaction.type === 'topup' ? '💰' : '🛒';
                const statusIcon = transaction.status === 'completed' ? '✅' :
                                 transaction.status === 'pending' ? '⏳' :
                                 transaction.status === 'expired' ? '⏰' : '❌';

                message += `${index + 1}. ${typeIcon} <b>${transaction.type.toUpperCase()}</b> ${statusIcon}\n`;
                message += `   💵 Amount: ${formatCurrency(Math.abs(transaction.amount))}\n`;
                message += `   📅 Date: ${formatDate(transaction.timestamp)}\n`;
                message += `   📋 Status: ${transaction.status}\n\n`;
            });

            if (transactions.length > 10) {
                message += `<i>Showing last 10 transactions (${transactions.length} total)</i>`;
            }

            await this.bot.sendMessage(chatId, message, {
                parse_mode: 'HTML',
                reply_markup: this.createPersistentKeyboard()
            });
        } catch (error) {
            log('error', 'Error showing user transactions', error);
            await this.bot.sendMessage(chatId, 'Sorry, something went wrong while fetching your transactions.');
        }
    }

    // QR Code generation is now handled by KHQRPaymentController

    // Payment checking and QR timeout are now handled by KHQRPaymentController

    // Update user balance after successful payment
    async updateUserBalance(chatId, amount) {
        try {
            log('info', `Attempting to update balance for chatId: ${chatId}, amount: ${amount}`);

            // Get user by telegram_id (which is the chat ID)
            const user = await User.getByTelegramId(chatId);
            log('info', `User lookup result:`, user);

            if (user) {
                const previousBalance = parseFloat(user.balance) || 0;
                const addAmount = parseFloat(amount);
                const newBalance = previousBalance + addAmount;

                log('info', `Balance calculation: ${previousBalance} + ${addAmount} = ${newBalance}`);

                // Update user balance using a simple direct approach
                const { getDatabase } = require('../models/database');
                const db = getDatabase();
                await db.run(
                    'UPDATE users SET balance = balance + ? WHERE telegram_id = ?',
                    [addAmount, user.telegram_id]
                );
                log('info', `Balance updated in database for user telegram_id: ${user.telegram_id}`);

                // Create transaction record
                try {
                    await Transaction.create({
                        user_id: user.id,
                        type: 'topup',
                        amount: addAmount,
                        md5_hash: null,
                        message_id: null,
                        qr_url: null,
                        transaction_id: `topup_${Date.now()}_${user.id}`
                    });
                    log('info', `Transaction record created for user ${user.id}`);
                } catch (transactionError) {
                    log('error', 'Error creating transaction record:', transactionError);
                    // Continue even if transaction record fails
                }

                // Send confirmation message
                await this.bot.sendMessage(chatId,
                    `💰 Balance Updated Successfully!\n\n` +
                    `Previous balance: $${previousBalance.toFixed(2)}\n` +
                    `Added: $${addAmount.toFixed(2)}\n` +
                    `New balance: $${newBalance.toFixed(2)}\n\n` +
                    `✅ Transaction completed!`
                );

                log('info', `Balance updated for user ${chatId}: $${previousBalance.toFixed(2)} → $${newBalance.toFixed(2)}`);
            } else {
                log('error', `User not found for telegram_id: ${chatId}. Creating user first...`);

                // Try to create the user if they don't exist
                try {
                    // Get user info from Telegram
                    const chatInfo = await this.bot.getChat(chatId);
                    log('info', 'Chat info:', chatInfo);

                    // Create user using the correct method
                    const newUser = await User.createOrUpdate({
                        id: chatId,
                        first_name: chatInfo.first_name || 'Unknown',
                        last_name: chatInfo.last_name || '',
                        username: chatInfo.username || null
                    });

                    log('info', `New user created:`, newUser);

                    // Now update the balance directly
                    const { getDatabase } = require('../models/database');
                    const db = getDatabase();
                    await db.run(
                        'UPDATE users SET balance = balance + ? WHERE telegram_id = ?',
                        [parseFloat(amount), newUser.telegram_id]
                    );
                    log('info', `Balance set for new user: $${parseFloat(amount)}`);

                    // Send confirmation message
                    await this.bot.sendMessage(chatId,
                        `💰 Account Created & Balance Added!\n\n` +
                        `Welcome! Your account has been created.\n` +
                        `Initial balance: $${parseFloat(amount).toFixed(2)}\n\n` +
                        `✅ Transaction completed!`
                    );

                } catch (createError) {
                    log('error', 'Error creating user:', createError);
                    await this.bot.sendMessage(chatId,
                        '❌ Error updating balance. Please use /start first to register, then try again.'
                    );
                }
            }
        } catch (error) {
            log('error', 'Error updating user balance', error);
            await this.bot.sendMessage(chatId,
                '❌ Error updating balance. Please contact support.'
            );
        }
    }

    // Process topup using KHQR payment (legacy method)
    async processTopup(chatId, userId, amount) {
        await this.khqrPayment.processTopup(chatId, userId, amount);
    }

    // Get bot instance for external use
    getBot() {
        return this.bot;
    }

    // Start the bot
    async start() {
        try {
            if (!this.bot.isPolling()) {
                await this.bot.startPolling();
                log('info', 'Telegram bot started');
            } else {
                log('info', 'Telegram bot is already running');
            }
        } catch (error) {
            log('error', 'Error starting bot', error);
            throw error;
        }
    }

    // Stop the bot
    async stop() {
        try {
            this.khqrPayment.stop();
            if (this.bot.isPolling()) {
                await this.bot.stopPolling();
                log('info', 'Telegram bot stopped');
            } else {
                log('info', 'Telegram bot is already stopped');
            }
        } catch (error) {
            log('error', 'Error stopping bot', error);
            throw error;
        }
    }

    // Get bot status
    isRunning() {
        return this.bot.isPolling();
    }
}

module.exports = TelegramBotController;
