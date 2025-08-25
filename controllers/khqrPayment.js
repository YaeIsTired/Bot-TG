const axios = require('axios');
const { log, generateRandomString } = require('../utils/helpers');
const settingsManager = require('../utils/settingsManager');
const { renderKhqrCardImage } = require('../utils/qrCardRenderer');
const Transaction = require('../models/Transaction');
const { getDatabase } = require('../models/database');
const QRCode = require('qrcode');

class KHQRPaymentController {
    constructor(bot) {
        this.bot = bot;
        this.baseUrl = 'https://api.kunchhunlichhean.org/khqr';
        this.paymentCheckers = new Map(); // Store active payment checkers
        this.activeIntervals = new Map(); // Store active intervals by userId
        this.cleanupInterval = null;
        this.processedMd5 = new Set(); // Guard to prevent duplicate confirmations

        // Load settings dynamically
        this.loadSettings();

        this.startCleanupService();
        log('info', 'KHQR Payment Controller initialized with dynamic settings');
    }

    // Fetch a URL as base64 (data URL)
    async urlToBase64(imageUrl, fallbackMime = 'image/png') {
        try {
            const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000 });
            const contentType = (res.headers && res.headers['content-type']) || fallbackMime;
            const b64 = Buffer.from(res.data).toString('base64');
            return `data:${contentType};base64,${b64}`;
        } catch (e) {
            log('error', 'urlToBase64 failed', { imageUrl, error: e.message });
            return null;
        }
    }

    // Build the same persistent keyboard used by the main bot controller
    getPersistentKeyboard() {
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

    // Load settings from settingsManager
    loadSettings() {
        const settings = settingsManager.getCurrentSettings();
        this.bakongId = settings.khqrBakongId || 'chhunlichhean_kun@wing';
        this.merchantName = settings.khqrMerchantName || 'CHHEANSMM';
        this.bearerToken = settings.khqrBearerToken;
        this.minTopupAmount = parseFloat(settings.minTopupAmount) || 0.01;
        this.maxTopupAmount = parseFloat(settings.maxTopupAmount) || 1000;

        log('info', `KHQR settings loaded - Bakong ID: ${this.bakongId}, Merchant: ${this.merchantName}, Min: $${this.minTopupAmount}, Max: $${this.maxTopupAmount}`);
    }

    // Reload settings (called when admin updates settings)
    reloadSettings() {
        this.loadSettings();
        log('info', 'KHQR Payment Controller settings reloaded');
    }

    // Generate QR code for payment
    async generateQRCode(amount, userId) {
        try {
            const transactionId = generateRandomString(12);

            // Use GET request with query parameters and bearer token
            const apiUrl = `${this.baseUrl}/create?amount=${amount}&bakongid=${this.bakongId}&merchantname=${this.merchantName}`;

            const headers = {};
            if (this.bearerToken) {
                headers['Authorization'] = `Bearer ${this.bearerToken}`;
            }

            const response = await axios.get(apiUrl, {
                timeout: 10000,
                headers: headers
            });

            if (response.data && (response.data.qr || response.data.qrdata) && response.data.md5) {
                // response.data.qr may be an image URL; response.data.qrdata may be the raw payload
                const rawPayload = response.data.qrdata || null;
                let qrImageUrl = response.data.qr;

                // If API returns only raw payload, generate a data URL via qrcode
                let qrBase64 = null;
                if (!qrImageUrl && rawPayload) {
                    try {
                        qrBase64 = await QRCode.toDataURL(rawPayload, { width: 300, margin: 1 });
                        qrImageUrl = qrBase64;
                    } catch (genErr) {
                        log('error', 'Failed generating QR from raw payload', genErr);
                    }
                } else if (qrImageUrl) {
                    qrBase64 = await this.urlToBase64(qrImageUrl);
                }
                log('info', `QR code generated for user ${userId}, amount: ${amount}`);
                return {
                    success: true,
                    qrUrl: qrImageUrl,
                    qrBase64: qrBase64,
                    qrRaw: rawPayload,
                    md5Hash: response.data.md5,
                    transactionId: response.data.transactionid || transactionId
                };
            } else {
                log('error', 'Invalid response from KHQR API', response.data);
                return {
                    success: false,
                    error: 'Invalid response from payment service'
                };
            }
        } catch (error) {
            log('error', 'Error generating QR code', error);
            return {
                success: false,
                error: 'Failed to generate payment QR code'
            };
        }
    }

    // Check payment status using the new API endpoint
    async checkPaymentStatus(md5Hash) {
        try {
            const checkUrl = 'https://api.kunchhunlichhean.org/check_by_md5';
            const params = {
                md5: md5Hash,
                bakongid: this.bakongId
            };

            const response = await axios.get(checkUrl, {
                params: params,
                timeout: 10000
            });

            if (response.status === 200 || response.status === 201) {
                const payload = response.data || {};
                return {
                    success: true,
                    paid: payload.responseCode === 0,
                    responseCode: payload.responseCode
                };
            } else {
                return {
                    success: false,
                    error: 'Invalid response from payment service'
                };
            }
        } catch (error) {
            log('error', 'Error checking payment status', error);
            return {
                success: false,
                error: 'Failed to check payment status'
            };
        }
    }

    // Generate QR code and handle payment (matching Python implementation)
    async generateQR(chatId, userId, amount) {
        try {
            // Reload settings to get latest values
            this.loadSettings();

            // Validate amount
            if (!amount || isNaN(amount) || amount <= 0) {
                await this.bot.sendMessage(chatId, "Invalid amount! Please enter a numeric value.");
                return;
            }

            // Check minimum and maximum topup limits
            if (amount < this.minTopupAmount) {
                await this.bot.sendMessage(chatId,
                    `❌ Minimum topup amount is $${this.minTopupAmount}. Please enter a higher amount.`
                );
                return;
            }

            if (amount > this.maxTopupAmount) {
                await this.bot.sendMessage(chatId,
                    `❌ Maximum topup amount is $${this.maxTopupAmount}. Please enter a lower amount.`
                );
                return;
            }

            // Generate QR code
            const qrResult = await this.generateQRCode(amount, userId);

            if (!qrResult.success) {
                await this.bot.sendMessage(chatId,
                    `Failed to generate QR code: ${qrResult.error}`
                );
                return;
            }

            if (!qrResult.qrUrl || !qrResult.md5Hash) {
                await this.bot.sendMessage(chatId, "Failed to generate QR code: Missing QR URL or MD5.");
                return;
            }

            // Clear any existing payment checker for this user
            this.clearUserPaymentChecker(chatId);

            // Send styled KHQR card to user (with fallback to raw QR url)
            let qrMessage;
            try {
                const composedImage = await renderKhqrCardImage({
                    qrImageUrl: qrResult.qrUrl,
                    amount: amount,
                    companyName: this.merchantName
                });
                qrMessage = await this.bot.sendPhoto(
                    chatId,
                    composedImage,
                    { caption: `QR Code for ${amount} USD\n\nExpires in 10 minutes.`, reply_markup: this.getPersistentKeyboard() },
                    { filename: 'khqr.png', contentType: 'image/png' }
                );
            } catch (composeError) {
                log('error', 'Failed to compose styled KHQR image, falling back to raw QR URL', composeError);
                qrMessage = await this.bot.sendPhoto(chatId, qrResult.qrUrl, {
                    caption: `QR Code for ${amount} USD\n\nExpires in 10 minutes.`,
                    reply_markup: this.getPersistentKeyboard()
                });
            }

            // Store transaction data (like Python dict)
            this.paymentCheckers.set(chatId, {
                md5: qrResult.md5Hash,
                tran_id: qrResult.transactionId,
                message_id: qrMessage.message_id,
                timestamp: Date.now(),
                amount: amount,
                completed: false
            });

            // Persist a pending transaction so it appears in history immediately
            try {
                await Transaction.create({
                    user_id: chatId,
                    type: 'topup',
                    amount: parseFloat(amount),
                    status: 'pending',
                    md5_hash: qrResult.md5Hash,
                    message_id: qrMessage.message_id,
                    qr_url: qrResult.qrUrl,
                    transaction_id: qrResult.transactionId || `topup_${Date.now()}_${chatId}`
                });
            } catch (txErr) {
                log('error', 'Failed to persist pending transaction', txErr);
            }

            // Start background polling (by md5)
            this.autoCheckTransaction(chatId, qrResult.md5Hash, amount);

            // Start timeout deletion
            this.deleteQRAfterTimeout(chatId);

            log('info', `QR generated for user ${userId}, amount: ${amount}, md5: ${qrResult.md5Hash}`);
        } catch (error) {
            log('error', 'Error generating QR', error);
            await this.bot.sendMessage(chatId, `An error occurred: ${error.message}`);
        }
    }

    // Process topup request (wrapper for generateQR)
    async processTopup(chatId, userId, amount) {
        log('info', `KHQR processTopup called: chatId=${chatId}, userId=${userId}, amount=${amount}`);
        await this.generateQR(chatId, userId, amount);
    }

    // Auto-check transaction status BY MD5 (1 second intervals)
    async autoCheckTransaction(userId, md5, amount) {
        const maxChecks = 600; // 10 minutes at 1-second intervals
        let checkCount = 0;

        log('info', `Starting payment checker for user ${userId}, md5: ${md5}`);

        const checkInterval = setInterval(async () => {
            // Check if transaction still exists
            if (!this.paymentCheckers.has(userId)) {
                clearInterval(checkInterval);
                this.activeIntervals.delete(userId);
                log('info', `Payment checker stopped - transaction removed for user ${userId}`);
                return;
            }

            // If already processed elsewhere, stop
            if (this.processedMd5.has(md5)) {
                clearInterval(checkInterval);
                this.activeIntervals.delete(userId);
                return;
            }

            try {
                const paymentStatus = await this.checkPaymentStatus(md5);

                if (paymentStatus.success && paymentStatus.paid) {
                    // Clear interval first to prevent duplicate processing
                    clearInterval(checkInterval);
                    this.activeIntervals.delete(userId);

                    // Double-check and set processed guard
                    if (this.processedMd5.has(md5)) {
                        return;
                    }
                    this.processedMd5.add(md5);

                    // Payment confirmed - First message
                    const confirmationMessage = `Automated Deposit System ⚙️
Currency: USD 💵
Balance Added: $${amount} ✅
Payment: KHQR PAYMENT SCAN`;

                    await this.bot.sendMessage(userId, confirmationMessage, {
                        reply_markup: this.getPersistentKeyboard()
                    });

                    // Second message - Thank you
                    const thankYouMessage = `Thank you for your payment of $${amount}. We appreciate your support!`;
                    await this.bot.sendMessage(userId, thankYouMessage, {
                        reply_markup: this.getPersistentKeyboard()
                    });

                    // Update user balance atomically
                    try {
                        const db = getDatabase();
                        const addAmount = parseFloat(amount);
                        await db.run('UPDATE users SET balance = balance + ? WHERE telegram_id = ?', [addAmount, userId]);
                    } catch (balanceErr) {
                        log('error', 'Failed to update user balance after payment', balanceErr);
                    }

                    // Mark pending transaction as completed
                    try {
                        const db = getDatabase();
                        const result = await db.run('UPDATE transactions SET status = "completed", completed_date = CURRENT_TIMESTAMP WHERE md5_hash = ? AND user_id = ?', [md5, userId]);
                        if (!result || result.changes === 0) {
                            // If no pending row existed, insert a completed one to show in history
                            await db.run(
                                'INSERT INTO transactions (user_id, type, amount, status, md5_hash, transaction_id, timestamp, completed_date) VALUES (?, ?, ?, "completed", ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
                                [userId, 'topup', parseFloat(amount), md5, `topup_${Date.now()}_${userId}`]
                            );
                        }
                    } catch (updErr) {
                        log('error', 'Failed to mark transaction completed', updErr);
                    }

                    const transaction = this.paymentCheckers.get(userId);
                    if (transaction) {
                        try {
                            await this.bot.deleteMessage(userId, transaction.message_id);
                        } catch (deleteError) {
                            // Ignore delete errors
                        }
                        transaction.completed = true;
                        this.paymentCheckers.delete(userId);
                    }

                    log('info', `Payment confirmed for md5: ${md5}`);
                    return;
                }

                checkCount++;
                if (checkCount >= maxChecks) {
                    clearInterval(checkInterval);
                    this.activeIntervals.delete(userId);
                    log('info', `Payment check timeout for md5: ${md5}`);
                    // Mark pending transaction as expired
                    try {
                        const db = getDatabase();
                        await db.run('UPDATE transactions SET status = "expired" WHERE md5_hash = ? AND user_id = ? AND status = "pending"', [md5, userId]);
                    } catch (updErr) {
                        log('error', 'Failed to mark transaction expired', updErr);
                    }
                }
            } catch (error) {
                log('error', `Error checking transaction for md5=${md5}:`, error);
                checkCount++;
                if (checkCount >= maxChecks) {
                    clearInterval(checkInterval);
                    this.activeIntervals.delete(userId);
                }
            }
        }, 1000); // 1 second interval

        // Store the interval reference
        this.activeIntervals.set(userId, checkInterval);
    }

    // Delete QR code after timeout (extended to 10 minutes)
    deleteQRAfterTimeout(userId) {
        setTimeout(async () => {
            const transaction = this.paymentCheckers.get(userId);
            if (transaction) {
                try {
                    await this.bot.deleteMessage(userId, transaction.message_id);
                } catch (error) {
                    log('error', 'Failed to delete expired QR message:', error);
                }
                this.paymentCheckers.delete(userId);
                await this.bot.sendMessage(userId, "QR code expired after 10 minutes. Please generate a new one if needed.", {
                    reply_markup: this.getPersistentKeyboard()
                });
                log('info', `QR code expired for user: ${userId}`);
            }
        }, 600000); // 10 minutes
    }

    // Clear any existing payment checker for a user
    clearUserPaymentChecker(userId) {
        // Clear existing interval if any
        if (this.activeIntervals.has(userId)) {
            clearInterval(this.activeIntervals.get(userId));
            this.activeIntervals.delete(userId);
            log('info', `Cleared existing payment checker for user ${userId}`);
        }

        // Remove existing transaction data
        if (this.paymentCheckers.has(userId)) {
            this.paymentCheckers.delete(userId);
            log('info', `Removed existing transaction data for user ${userId}`);
        }
    }

    // Get transaction data for a user
    getTransaction(userId) {
        return this.paymentCheckers.get(userId);
    }

    // Remove transaction data for a user
    removeTransaction(userId) {
        this.paymentCheckers.delete(userId);
    }

    // Start cleanup service for expired transactions
    startCleanupService() {
        this.cleanupInterval = setInterval(() => {
            try {
                this.cleanupExpiredTransactions();
            } catch (error) {
                log('error', 'Error in cleanup service', error);
            }
        }, 60000); // Run every minute

        log('info', 'Cleanup service started');
    }

    // Cleanup expired transactions (simplified for in-memory storage)
    cleanupExpiredTransactions() {
        const now = Date.now();
        const expiredTime = 10 * 60 * 1000; // 10 minutes

        for (const [userId, transaction] of this.paymentCheckers.entries()) {
            if (now - transaction.timestamp > expiredTime) {
                this.paymentCheckers.delete(userId);
                log('info', `Cleaned up expired transaction for user ${userId}`);
            }
        }
    }

    // Stop the payment controller
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        // Clear all active intervals
        for (const interval of this.activeIntervals.values()) {
            clearInterval(interval);
        }
        this.activeIntervals.clear();

        // Clear all active payment checkers
        this.paymentCheckers.clear();

        log('info', 'KHQR Payment Controller stopped');
    }

    // Get active transactions count (for monitoring)
    getActiveTransactionsCount() {
        return this.paymentCheckers.size;
    }

    // Get all active transactions (for debugging)
    getActiveTransactions() {
        return Array.from(this.paymentCheckers.entries());
    }
}

module.exports = KHQRPaymentController;
