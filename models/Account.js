const { getDatabase } = require('./database');

class Account {
    constructor(data = {}) {
        this.id = data.id;
        this.game_type = data.game_type;
        this.title = data.title;
        this.description = data.description;
        this.price = data.price;
        this.custom_fields = data.custom_fields ? JSON.parse(data.custom_fields) : {};
        this.is_available = data.is_available !== undefined ? data.is_available : 1;
        this.created_date = data.created_date;
        this.sold_date = data.sold_date;
        this.image_url = data.image_url;
        this.images = data.images ? JSON.parse(data.images) : [];
        this.username = data.username;
        this.password = data.password;
        this.level = data.level;
        this.rank = data.rank;
        this.region = data.region;
        this.additional_info = data.additional_info;
        this.is_featured = data.is_featured !== undefined ? data.is_featured : 0;
        // New fields for gaming account showcase
        this.uid = data.uid;
        this.player_name = data.player_name;
        this.bind_info = data.bind_info;
        this.country = data.country;
        this.creation_date = data.creation_date;
        this.banned_status = data.banned_status;
        this.account_code = data.account_code;
        this.account_credentials = data.account_credentials;
        // Account information fields
        this.account_status = data.account_status;
        this.verify_code = data.verify_code;
        this.inactive_status = data.inactive_status;
        this.collector_status = data.collector_status;
        this.device_info = data.device_info;
    }

    // Generate unique account code
    static async generateUniqueAccountCode() {
        const db = getDatabase();
        let code;
        let isUnique = false;

        while (!isUnique) {
            // Generate 6-digit code
            code = Math.floor(100000 + Math.random() * 900000).toString();

            // Check if code already exists
            const existing = await db.get(
                'SELECT id FROM accounts WHERE account_code = ?',
                [code]
            );

            if (!existing) {
                isUnique = true;
            }
        }

        return code;
    }

    // Create new account
    static async create(accountData) {
        const db = getDatabase();
        try {
            const {
                game_type, title, description, price, custom_fields, image_url, images,
                username, password, level, rank, region, additional_info, is_featured, is_available,
                uid, player_name, bind_info, country, creation_date, banned_status, account_code,
                account_credentials, account_status, verify_code, inactive_status, collector_status, device_info
            } = accountData;

            // Auto-generate account code if not provided
            const finalAccountCode = account_code || await this.generateUniqueAccountCode();

            const customFieldsJson = JSON.stringify(custom_fields || {});
            const imagesJson = JSON.stringify(images || []);

            const result = await db.run(
                `INSERT INTO accounts (
                    game_type, title, description, price, custom_fields, image_url, images,
                    username, password, level, rank, region, additional_info, is_featured, is_available,
                    uid, player_name, bind_info, country, creation_date, banned_status, account_code,
                    account_credentials, account_status, verify_code, inactive_status, collector_status, device_info
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    game_type, title, description, price, customFieldsJson, image_url, imagesJson,
                    username, password, level, rank, region, additional_info,
                    is_featured || 0, is_available !== undefined ? is_available : 1,
                    uid, player_name, bind_info, country, creation_date, banned_status, finalAccountCode,
                    account_credentials, account_status, verify_code, inactive_status, collector_status, device_info
                ]
            );

            return new Account({
                id: result.id,
                ...accountData,
                account_code: finalAccountCode,
                custom_fields: customFieldsJson,
                images: imagesJson,
                is_available: is_available !== undefined ? is_available : 1,
                is_featured: is_featured || 0
            });
        } catch (error) {
            console.error('Error creating account:', error);
            throw error;
        }
    }

    // Get account by ID
    static async getById(id) {
        const db = getDatabase();
        try {
            const accountData = await db.get(
                'SELECT * FROM accounts WHERE id = ?',
                [id]
            );
            return accountData ? new Account(accountData) : null;
        } catch (error) {
            console.error('Error getting account by ID:', error);
            throw error;
        }
    }

    // Get available accounts by game type
    static async getByGameType(gameType, limit = 20, offset = 0) {
        const db = getDatabase();
        try {
            const accounts = await db.query(
                'SELECT * FROM accounts WHERE game_type = ? AND is_available = 1 ORDER BY created_date DESC LIMIT ? OFFSET ?',
                [gameType, limit, offset]
            );
            return accounts.map(accountData => new Account(accountData));
        } catch (error) {
            console.error('Error getting accounts by game type:', error);
            throw error;
        }
    }

    // Get all available accounts
    static async getAvailable(limit = 20, offset = 0) {
        const db = getDatabase();
        try {
            const accounts = await db.query(
                'SELECT * FROM accounts WHERE is_available = 1 ORDER BY created_date DESC LIMIT ? OFFSET ?',
                [limit, offset]
            );
            return accounts.map(accountData => new Account(accountData));
        } catch (error) {
            console.error('Error getting available accounts:', error);
            throw error;
        }
    }

    // Get all accounts (for admin)
    static async getAll(limit = 50, offset = 0) {
        const db = getDatabase();
        try {
            const accounts = await db.query(
                'SELECT * FROM accounts ORDER BY created_date DESC LIMIT ? OFFSET ?',
                [limit, offset]
            );
            return accounts.map(accountData => new Account(accountData));
        } catch (error) {
            console.error('Error getting all accounts:', error);
            throw error;
        }
    }

    // Get unique game types
    static async getGameTypes() {
        const db = getDatabase();
        try {
            const gameTypes = await db.query(
                'SELECT DISTINCT game_type FROM accounts WHERE is_available = 1 ORDER BY game_type'
            );
            return gameTypes.map(row => row.game_type);
        } catch (error) {
            console.error('Error getting game types:', error);
            throw error;
        }
    }

    // Get featured accounts
    static async getFeatured(limit = 5, offset = 0) {
        const db = getDatabase();
        try {
            const accounts = await db.query(
                'SELECT * FROM accounts WHERE is_available = 1 AND is_featured = 1 ORDER BY created_date DESC LIMIT ? OFFSET ?',
                [limit, offset]
            );
            return accounts.map(accountData => new Account(accountData));
        } catch (error) {
            console.error('Error getting featured accounts:', error);
            throw error;
        }
    }

    // Mark account as sold
    static async markAsSold(accountId) {
        const db = getDatabase();
        try {
            await db.run(
                'UPDATE accounts SET is_available = 0, sold_date = CURRENT_TIMESTAMP WHERE id = ?',
                [accountId]
            );
        } catch (error) {
            console.error('Error marking account as sold:', error);
            throw error;
        }
    }

    // Get account statistics
    static async getStats() {
        const db = getDatabase();
        try {
            const totalAccounts = await db.get('SELECT COUNT(*) as count FROM accounts');
            const availableAccounts = await db.get('SELECT COUNT(*) as count FROM accounts WHERE is_available = 1');
            const soldAccounts = await db.get('SELECT COUNT(*) as count FROM accounts WHERE is_available = 0');
            const totalValue = await db.get('SELECT SUM(price) as total FROM accounts WHERE is_available = 1');
            
            return {
                total: totalAccounts.count,
                available: availableAccounts.count,
                sold: soldAccounts.count,
                totalValue: totalValue.total || 0
            };
        } catch (error) {
            console.error('Error getting account stats:', error);
            throw error;
        }
    }

    // Update account
    async update(updateData) {
        const db = getDatabase();
        try {
            const {
                game_type, title, description, price, custom_fields, image_url, is_available,
                username, password, level, rank, region, additional_info, is_featured,
                uid, player_name, bind_info, country, creation_date, banned_status, account_code,
                images, account_status, verify_code, inactive_status, collector_status, device_info
            } = updateData;

            const customFieldsJson = JSON.stringify(custom_fields || this.custom_fields);
            const imagesJson = JSON.stringify(images || this.images);

            await db.run(
                `UPDATE accounts SET
                    game_type = ?, title = ?, description = ?, price = ?, custom_fields = ?,
                    image_url = ?, is_available = ?, username = ?, password = ?, level = ?,
                    rank = ?, region = ?, additional_info = ?, is_featured = ?, images = ?,
                    uid = ?, player_name = ?, bind_info = ?, country = ?, creation_date = ?,
                    banned_status = ?, account_code = ?, account_credentials = ?,
                    account_status = ?, verify_code = ?, inactive_status = ?, collector_status = ?, device_info = ?
                WHERE id = ?`,
                [
                    game_type || this.game_type,
                    title || this.title,
                    description || this.description,
                    price || this.price,
                    customFieldsJson,
                    image_url || this.image_url,
                    is_available !== undefined ? is_available : this.is_available,
                    username || this.username,
                    password || this.password,
                    level || this.level,
                    rank || this.rank,
                    region || this.region,
                    additional_info || this.additional_info,
                    is_featured !== undefined ? is_featured : this.is_featured,
                    imagesJson,
                    uid || this.uid,
                    player_name || this.player_name,
                    bind_info || this.bind_info,
                    country || this.country,
                    creation_date || this.creation_date,
                    banned_status || this.banned_status,
                    account_code || this.account_code,
                    updateData.account_credentials || this.account_credentials,
                    account_status || this.account_status,
                    verify_code || this.verify_code,
                    inactive_status || this.inactive_status,
                    collector_status || this.collector_status,
                    device_info || this.device_info,
                    this.id
                ]
            );

            // Update instance properties
            Object.assign(this, updateData);
            if (custom_fields) this.custom_fields = custom_fields;
            if (images) this.images = images;

            return this;
        } catch (error) {
            console.error('Error updating account:', error);
            throw error;
        }
    }

    // Delete account
    async delete() {
        const db = getDatabase();
        try {
            // Check if account has any purchases
            const purchases = await db.query(
                'SELECT COUNT(*) as count FROM purchases WHERE account_id = ?',
                [this.id]
            );

            if (purchases[0].count > 0) {
                throw new Error(`Cannot delete account: ${purchases[0].count} purchase(s) are associated with this account. Delete the purchases first or contact administrator.`);
            }

            // If no purchases, proceed with deletion
            await db.run('DELETE FROM accounts WHERE id = ?', [this.id]);
        } catch (error) {
            console.error('Error deleting account:', error);
            throw error;
        }
    }

    // Force delete account (developer only) - deletes associated purchases first
    async forceDelete() {
        const db = getDatabase();
        try {
            console.log(`🚨 FORCE DELETE initiated for account ${this.id} - ${this.title}`);

            // First, delete all associated purchases
            const purchases = await db.query(
                'SELECT COUNT(*) as count FROM purchases WHERE account_id = ?',
                [this.id]
            );

            if (purchases[0].count > 0) {
                console.log(`🗑️  Deleting ${purchases[0].count} associated purchase(s)...`);
                await db.run('DELETE FROM purchases WHERE account_id = ?', [this.id]);
                console.log(`✅ Deleted ${purchases[0].count} associated purchase(s)`);
            }

            // Then delete the account
            await db.run('DELETE FROM accounts WHERE id = ?', [this.id]);
            console.log(`✅ Account ${this.id} force deleted successfully`);
        } catch (error) {
            console.error('Error force deleting account:', error);
            throw error;
        }
    }

    // Get formatted account info for display
    getDisplayInfo() {
        const customFieldsText = Object.entries(this.custom_fields)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');

        return {
            title: this.title,
            description: this.description,
            price: `$${this.price.toFixed(2)}`,
            gameType: this.game_type,
            customFields: customFieldsText,
            imageUrl: this.image_url
        };
    }

    // Get formatted account info for purchase delivery
    getPurchaseFormat() {
        // Use account_credentials if available, otherwise build from individual fields
        if (this.account_credentials) {
            return this.account_credentials;
        }

        // Fallback to building from individual fields (for backward compatibility)
        const level = this.level || 'N/A';
        const playerName = this.player_name || 'N/A';
        const uid = this.uid || 'N/A';
        const rank = this.rank || 'N/A';
        const bind = this.bind_info || 'N/A';
        const country = this.country || 'N/A';
        const date = this.creation_date || 'N/A';
        const banned = this.banned_status || 'N/A';

        return `${this.username}:${this.password} | Level: ${level} | Name: ${playerName} | UID: ${uid} | Rank: ${rank} | Bind: ${bind} | Country: ${country} | Date: ${date} | Banned: ${banned}`;
    }

    // Get account code for .txt file
    getAccountCode() {
        return this.account_code || this.id.toString();
    }

    // Get formatted account information for display
    getAccountInfo() {
        const info = [];

        if (this.account_status) {
            info.push(`✅ Account Status [ ${this.account_status} ]`);
        }

        if (this.verify_code) {
            info.push(`✅ Verify code [ ${this.verify_code} ]`);
        }

        if (this.inactive_status) {
            info.push(`✅ Inactive [ ${this.inactive_status} ]`);
        }

        if (this.collector_status) {
            info.push(`✅ Collector [ ${this.collector_status} ]`);
        }

        if (this.device_info) {
            info.push(`✅ Device [ ${this.device_info} ]`);
        }

        return info.join('\n');
    }

    // Get unique collector statuses
    static async getCollectorStatuses() {
        const db = getDatabase();
        try {
            const rows = await db.query(`
                SELECT DISTINCT collector_status
                FROM accounts
                WHERE collector_status IS NOT NULL
                AND collector_status != ''
                AND is_available = 1
                ORDER BY collector_status
            `);
            return rows.map(row => row.collector_status);
        } catch (error) {
            console.error('Error getting collector statuses:', error);
            return [];
        }
    }

    // Get accounts by collector status
    static async getByCollectorStatus(collectorStatus, limit = 10, offset = 0) {
        const db = getDatabase();
        try {
            const rows = await db.query(`
                SELECT * FROM accounts
                WHERE collector_status = ?
                AND is_available = 1
                ORDER BY created_date DESC
                LIMIT ? OFFSET ?
            `, [collectorStatus, limit, offset]);

            return rows.map(row => new Account(row));
        } catch (error) {
            console.error('Error getting accounts by collector status:', error);
            return [];
        }
    }
}

module.exports = Account;
