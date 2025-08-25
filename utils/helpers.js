// Utility functions for the bot

// Format currency
const formatCurrency = (amount) => {
    return `$${parseFloat(amount).toFixed(2)}`;
};

// Validate amount for topup
const validateTopupAmount = (amount) => {
    const num = parseFloat(amount);
    const minAmount = parseFloat(process.env.MIN_TOPUP_AMOUNT || '0.01');
    const maxAmount = parseFloat(process.env.MAX_TOPUP_AMOUNT || '1000');
    
    if (isNaN(num)) {
        return { valid: false, message: 'Please enter a valid number.' };
    }
    
    if (num < minAmount) {
        return { valid: false, message: `Minimum topup amount is ${formatCurrency(minAmount)}.` };
    }
    
    if (num > maxAmount) {
        return { valid: false, message: `Maximum topup amount is ${formatCurrency(maxAmount)}.` };
    }
    
    return { valid: true, amount: num };
};

// Format user display name
const formatUserName = (user) => {
    if (user.username) {
        return `@${user.username}`;
    }
    return `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown User';
};

// Format date for display (Cambodia timezone - UTC+7)
const formatDate = (dateString) => {
    const date = new Date(dateString);

    // Add 7 hours for Cambodia timezone (UTC+7)
    const cambodiaDate = new Date(date.getTime() + (7 * 60 * 60 * 1000));

    return cambodiaDate.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

// Format last active time in human-readable format
const formatLastActive = (dateString) => {
    if (!dateString) return 'Never';

    const now = new Date();
    const lastActive = new Date(dateString);
    const diffMs = now - lastActive;

    // Convert to different time units
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) {
        return 'Just now';
    } else if (diffMinutes < 60) {
        return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else if (diffWeeks < 4) {
        return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`;
    } else if (diffMonths < 12) {
        return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
    } else {
        return `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`;
    }
};

// Escape HTML characters for Telegram
const escapeHtml = (text) => {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// Create inline keyboard for pagination
const createPaginationKeyboard = (currentPage, totalPages, callbackPrefix) => {
    const keyboard = [];
    const buttonsRow = [];
    
    if (currentPage > 1) {
        buttonsRow.push({
            text: '⬅️ Previous',
            callback_data: `${callbackPrefix}_${currentPage - 1}`
        });
    }
    
    buttonsRow.push({
        text: `${currentPage}/${totalPages}`,
        callback_data: 'noop'
    });
    
    if (currentPage < totalPages) {
        buttonsRow.push({
            text: 'Next ➡️',
            callback_data: `${callbackPrefix}_${currentPage + 1}`
        });
    }
    
    if (buttonsRow.length > 0) {
        keyboard.push(buttonsRow);
    }
    
    return { inline_keyboard: keyboard };
};

// Create account display message
const formatAccountMessage = (account) => {
    const customFieldsText = Object.entries(account.custom_fields || {})
        .map(([key, value]) => `<b>${escapeHtml(key)}:</b> ${escapeHtml(value)}`)
        .join('\n');

    let message = `🛍️ <b>Account Code: ${escapeHtml(account.account_code || account.id)}</b>\n\n`;
    message += `🎮 <b>${escapeHtml(account.title)}</b>\n\n`;

    // Add account information if available
    const accountInfo = account.getAccountInfo ? account.getAccountInfo() : '';
    if (accountInfo) {
        message += `<b>Information:</b>\n`;
        message += `${escapeHtml(accountInfo)}\n\n`;
    }

    message += `💰 <b>Price: ${formatCurrency(account.price)}</b>\n\n`;

    if (account.description) {
        message += `<b>Description:</b>\n${escapeHtml(account.description)}\n\n`;
    }

    if (customFieldsText) {
        message += `<b>Details:</b>\n${customFieldsText}\n\n`;
    }

    message += `<b>Click button below to buy account!</b>`;

    return message;
};

// Create purchase confirmation keyboard
const createPurchaseKeyboard = (accountId) => {
    return {
        inline_keyboard: [
            [
                {
                    text: '✅ Buy Now',
                    callback_data: `buy_${accountId}`
                },
                {
                    text: '❌ Cancel',
                    callback_data: 'cancel_purchase'
                }
            ]
        ]
    };
};

// Create game type selection keyboard
const createGameTypeKeyboard = (gameTypes) => {
    const keyboard = [];
    
    // Add game type buttons (2 per row)
    for (let i = 0; i < gameTypes.length; i += 2) {
        const row = [];
        row.push({
            text: gameTypes[i],
            callback_data: `browse_${gameTypes[i]}`
        });
        
        if (i + 1 < gameTypes.length) {
            row.push({
                text: gameTypes[i + 1],
                callback_data: `browse_${gameTypes[i + 1]}`
            });
        }
        
        keyboard.push(row);
    }
    
    // Add "All Games" button
    keyboard.push([{
        text: '🎮 All Games',
        callback_data: 'browse_all'
    }]);
    
    return { inline_keyboard: keyboard };
};

// Log function for better debugging
const log = (level, message, data = null) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    if (data) {
        console.log(logMessage, data);
    } else {
        console.log(logMessage);
    }
};

// Sleep function for delays
const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

// Generate random string for transaction IDs
const generateRandomString = (length = 10) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

module.exports = {
    formatCurrency,
    validateTopupAmount,
    formatUserName,
    formatDate,
    formatLastActive,
    escapeHtml,
    createPaginationKeyboard,
    formatAccountMessage,
    createPurchaseKeyboard,
    createGameTypeKeyboard,
    log,
    sleep,
    generateRandomString
};
