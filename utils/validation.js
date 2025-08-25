// Input validation utilities

const validator = {
    // Validate email format
    isValidEmail: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    // Validate price
    isValidPrice: (price) => {
        const num = parseFloat(price);
        return !isNaN(num) && num >= 0 && num <= 10000;
    },

    // Validate string length
    isValidLength: (str, min = 1, max = 255) => {
        if (typeof str !== 'string') return false;
        return str.length >= min && str.length <= max;
    },

    // Validate URL format
    isValidUrl: (url) => {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    // Validate Telegram user ID
    isValidTelegramId: (id) => {
        const num = parseInt(id);
        return !isNaN(num) && num > 0 && num < 2147483647;
    },

    // Sanitize HTML to prevent XSS
    sanitizeHtml: (str) => {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/\//g, '&#x2F;');
    },

    // Validate account data
    validateAccountData: (data) => {
        const errors = [];

        if (!validator.isValidLength(data.game_type, 1, 50)) {
            errors.push('Game type must be between 1 and 50 characters');
        }

        if (!validator.isValidLength(data.title, 1, 100)) {
            errors.push('Title must be between 1 and 100 characters');
        }

        if (data.description && !validator.isValidLength(data.description, 0, 1000)) {
            errors.push('Description must be less than 1000 characters');
        }

        if (!validator.isValidPrice(data.price)) {
            errors.push('Price must be a valid number between 0 and 10000');
        }

        if (data.image_url && !validator.isValidUrl(data.image_url)) {
            errors.push('Image URL must be a valid URL');
        }

        // Validate custom fields
        if (data.custom_fields && typeof data.custom_fields === 'object') {
            Object.entries(data.custom_fields).forEach(([key, value]) => {
                if (!validator.isValidLength(key, 1, 50)) {
                    errors.push(`Custom field name "${key}" must be between 1 and 50 characters`);
                }
                if (!validator.isValidLength(value, 0, 200)) {
                    errors.push(`Custom field value for "${key}" must be less than 200 characters`);
                }
            });
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    },

    // Validate user data
    validateUserData: (data) => {
        const errors = [];

        if (!validator.isValidTelegramId(data.telegram_id)) {
            errors.push('Invalid Telegram user ID');
        }

        if (data.username && !validator.isValidLength(data.username, 1, 50)) {
            errors.push('Username must be between 1 and 50 characters');
        }

        if (data.first_name && !validator.isValidLength(data.first_name, 1, 50)) {
            errors.push('First name must be between 1 and 50 characters');
        }

        if (data.last_name && !validator.isValidLength(data.last_name, 1, 50)) {
            errors.push('Last name must be between 1 and 50 characters');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    },

    // Validate transaction data
    validateTransactionData: (data) => {
        const errors = [];

        if (!validator.isValidTelegramId(data.user_id)) {
            errors.push('Invalid user ID');
        }

        if (!['topup', 'purchase'].includes(data.type)) {
            errors.push('Transaction type must be either "topup" or "purchase"');
        }

        if (!validator.isValidPrice(data.amount)) {
            errors.push('Amount must be a valid number');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    },

    // Validate admin login data
    validateAdminLogin: (data) => {
        const errors = [];

        if (!validator.isValidLength(data.username, 1, 50)) {
            errors.push('Username is required');
        }

        if (!validator.isValidLength(data.password, 1, 100)) {
            errors.push('Password is required');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    },

    // Clean and validate custom fields from form data
    cleanCustomFields: (formData) => {
        const customFields = {};
        
        Object.keys(formData).forEach(key => {
            if (key.startsWith('custom_')) {
                const fieldName = key.replace('custom_', '');
                const fieldValue = formData[key];
                
                if (fieldName && fieldValue && 
                    validator.isValidLength(fieldName, 1, 50) && 
                    validator.isValidLength(fieldValue, 1, 200)) {
                    customFields[validator.sanitizeHtml(fieldName)] = validator.sanitizeHtml(fieldValue);
                }
            }
        });
        
        return customFields;
    },

    // Validate pagination parameters
    validatePagination: (page, limit) => {
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 20;
        
        return {
            page: Math.max(1, Math.min(pageNum, 1000)), // Max 1000 pages
            limit: Math.max(1, Math.min(limitNum, 100)), // Max 100 items per page
            offset: (Math.max(1, Math.min(pageNum, 1000)) - 1) * Math.max(1, Math.min(limitNum, 100))
        };
    }
};

module.exports = validator;
