const fs = require('fs');
const path = require('path');
const { log } = require('./helpers');

class SettingsManager {
    constructor() {
        this.envPath = path.join(process.cwd(), '.env');
        this.settings = this.loadSettings();
    }

    // Load current settings from .env file
    loadSettings() {
        try {
            const envContent = fs.readFileSync(this.envPath, 'utf8');
            const settings = {};
            
            envContent.split('\n').forEach(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    const [key, ...valueParts] = line.split('=');
                    if (key && valueParts.length > 0) {
                        settings[key.trim()] = valueParts.join('=').trim();
                    }
                }
            });
            
            return settings;
        } catch (error) {
            log('error', 'Error loading settings from .env file', error);
            return {};
        }
    }

    // Get current settings for display
    getCurrentSettings() {
        return {
            botToken: this.settings.TELEGRAM_BOT_TOKEN || '',
            khqrBakongId: this.settings.KHQR_BAKONG_ID || '',
            khqrMerchantName: this.settings.KHQR_MERCHANT_NAME || '',
            khqrBearerToken: this.settings.KHQR_BEARER_TOKEN || '',
            minTopupAmount: this.settings.MIN_TOPUP_AMOUNT || '0.01',
            maxTopupAmount: this.settings.MAX_TOPUP_AMOUNT || '1000',
            adminUsername: this.settings.ADMIN_USERNAME || 'admin',
            sessionSecret: this.settings.SESSION_SECRET || '',
            port: this.settings.PORT || '3000',
            nodeEnv: this.settings.NODE_ENV || 'development'
        };
    }

    // Update a setting in the .env file
    async updateSetting(key, value) {
        try {
            // Map frontend keys to environment variable names
            const keyMapping = {
                'botToken': 'TELEGRAM_BOT_TOKEN',
                'bakongId': 'KHQR_BAKONG_ID',
                'merchantName': 'KHQR_MERCHANT_NAME',
                'bearerToken': 'KHQR_BEARER_TOKEN',
                'minTopup': 'MIN_TOPUP_AMOUNT',
                'maxTopup': 'MAX_TOPUP_AMOUNT'
            };

            const envKey = keyMapping[key] || key.toUpperCase();
            
            // Read current .env file
            let envContent = fs.readFileSync(this.envPath, 'utf8');
            const lines = envContent.split('\n');
            
            // Find and update the line, or add it if it doesn't exist
            let found = false;
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith(`${envKey}=`)) {
                    lines[i] = `${envKey}=${value}`;
                    found = true;
                    break;
                }
            }
            
            // If not found, add it to the appropriate section
            if (!found) {
                if (envKey.startsWith('KHQR_')) {
                    // Add to KHQR section
                    const khqrIndex = lines.findIndex(line => line.includes('# KHQR Payment Configuration'));
                    if (khqrIndex !== -1) {
                        lines.splice(khqrIndex + 1, 0, `${envKey}=${value}`);
                    } else {
                        lines.push(`${envKey}=${value}`);
                    }
                } else {
                    lines.push(`${envKey}=${value}`);
                }
            }
            
            // Write back to file
            fs.writeFileSync(this.envPath, lines.join('\n'));
            
            // Update in-memory settings
            this.settings[envKey] = value;
            
            // Update process.env
            process.env[envKey] = value;
            
            log('info', `Setting updated: ${envKey} = ${value}`);

            // If KHQR settings changed, reload the payment controller
            if (envKey.startsWith('KHQR_')) {
                this.reloadKHQRController();
            }

            return { success: true };

        } catch (error) {
            log('error', 'Error updating setting', error);
            return { success: false, error: error.message };
        }
    }

    // Reload KHQR Payment Controller with new settings
    reloadKHQRController() {
        try {
            if (global.telegramBot && global.telegramBot.khqrPayment) {
                // Call the reloadSettings method on the KHQR controller
                global.telegramBot.khqrPayment.reloadSettings();
                log('info', 'KHQR Payment Controller settings reloaded');
            }
        } catch (error) {
            log('error', 'Error reloading KHQR controller', error);
        }
    }

    // Validate setting values
    validateSetting(key, value) {
        switch (key) {
            case 'botToken':
                if (!value || value.length < 10) {
                    return { valid: false, error: 'Bot token must be at least 10 characters' };
                }
                break;
            case 'bakongId':
                if (!value || !value.includes('@')) {
                    return { valid: false, error: 'Bakong ID must be a valid email format' };
                }
                break;
            case 'merchantName':
                if (!value || value.length < 2) {
                    return { valid: false, error: 'Merchant name must be at least 2 characters' };
                }
                break;
            case 'bearerToken':
                if (!value || value.length < 10) {
                    return { valid: false, error: 'Bearer token must be at least 10 characters' };
                }
                // Basic JWT format validation (should have 3 parts separated by dots)
                const parts = value.split('.');
                if (parts.length !== 3) {
                    return { valid: false, error: 'Bearer token must be a valid JWT format' };
                }
                break;
            case 'minTopup':
            case 'maxTopup':
                const num = parseFloat(value);
                if (isNaN(num) || num <= 0) {
                    return { valid: false, error: 'Amount must be a positive number' };
                }
                if (key === 'minTopup' && num < 0.01) {
                    return { valid: false, error: 'Minimum topup must be at least $0.01' };
                }
                if (key === 'maxTopup' && num > 10000) {
                    return { valid: false, error: 'Maximum topup cannot exceed $10,000' };
                }

                // Cross-validation: ensure min < max
                const currentSettings = this.getCurrentSettings();
                if (key === 'minTopup') {
                    const currentMax = parseFloat(currentSettings.maxTopupAmount);
                    if (num >= currentMax) {
                        return { valid: false, error: `Minimum topup ($${num}) must be less than maximum topup ($${currentMax})` };
                    }
                } else if (key === 'maxTopup') {
                    const currentMin = parseFloat(currentSettings.minTopupAmount);
                    if (num <= currentMin) {
                        return { valid: false, error: `Maximum topup ($${num}) must be greater than minimum topup ($${currentMin})` };
                    }
                }
                break;
        }
        return { valid: true };
    }

    // Get bot status (this would need to be implemented based on your bot architecture)
    getBotStatus() {
        // For now, return online - you'd implement actual bot status checking
        return 'online';
    }
}

module.exports = new SettingsManager();
