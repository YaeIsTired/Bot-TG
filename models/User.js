const { getDatabase } = require('./database');

class User {
    constructor(data = {}) {
        this.telegram_id = data.telegram_id;
        this.username = data.username;
        this.first_name = data.first_name;
        this.last_name = data.last_name;
        this.balance = data.balance || 0.0;
        this.registration_date = data.registration_date;
        this.is_active = data.is_active !== undefined ? data.is_active : 1;
        this.is_banned = data.is_banned !== undefined ? data.is_banned : 0;
        this.ban_reason = data.ban_reason;
        this.banned_date = data.banned_date;
        this.profile_picture_url = data.profile_picture_url;
        this.last_active = data.last_active;
    }

    // Create or update user
    static async createOrUpdate(telegramUser, profilePictureUrl = null) {
        const db = getDatabase();
        const { id, username, first_name, last_name } = telegramUser;

        try {
            // Check if user exists
            const existingUser = await db.get(
                'SELECT * FROM users WHERE telegram_id = ?',
                [id]
            );

            if (existingUser) {
                // Update existing user (including profile picture if provided)
                const updateQuery = profilePictureUrl
                    ? 'UPDATE users SET username = ?, first_name = ?, last_name = ?, profile_picture_url = ? WHERE telegram_id = ?'
                    : 'UPDATE users SET username = ?, first_name = ?, last_name = ? WHERE telegram_id = ?';

                const updateParams = profilePictureUrl
                    ? [username, first_name, last_name, profilePictureUrl, id]
                    : [username, first_name, last_name, id];

                await db.run(updateQuery, updateParams);

                return new User({
                    ...existingUser,
                    username,
                    first_name,
                    last_name,
                    profile_picture_url: profilePictureUrl || existingUser.profile_picture_url
                });
            } else {
                // Create new user
                await db.run(
                    'INSERT INTO users (telegram_id, username, first_name, last_name, profile_picture_url) VALUES (?, ?, ?, ?, ?)',
                    [id, username, first_name, last_name, profilePictureUrl]
                );
                return new User({
                    telegram_id: id,
                    username,
                    first_name,
                    last_name,
                    balance: 0.0,
                    is_active: 1,
                    profile_picture_url: profilePictureUrl
                });
            }
        } catch (error) {
            console.error('Error creating/updating user:', error);
            throw error;
        }
    }

    // Get user by telegram ID
    static async getByTelegramId(telegramId) {
        const db = getDatabase();
        try {
            const userData = await db.get(
                'SELECT * FROM users WHERE telegram_id = ?',
                [telegramId]
            );
            return userData ? new User(userData) : null;
        } catch (error) {
            console.error('Error getting user by telegram ID:', error);
            throw error;
        }
    }

    // Update user balance
    static async updateBalance(telegramId, amount, operation = 'add') {
        const db = getDatabase();
        try {
            await db.beginTransaction();

            const user = await db.get(
                'SELECT balance FROM users WHERE telegram_id = ?',
                [telegramId]
            );

            if (!user) {
                throw new Error('User not found');
            }

            let newBalance;
            if (operation === 'add') {
                newBalance = user.balance + amount;
            } else if (operation === 'subtract') {
                newBalance = user.balance - amount;
                if (newBalance < 0) {
                    throw new Error('Insufficient balance');
                }
            } else {
                newBalance = amount;
            }

            await db.run(
                'UPDATE users SET balance = ? WHERE telegram_id = ?',
                [newBalance, telegramId]
            );

            await db.commit();
            return newBalance;
        } catch (error) {
            await db.rollback();
            console.error('Error updating user balance:', error);
            throw error;
        }
    }

    // Update user information (name, username)
    static async updateInfo(telegramId, userInfo) {
        const db = getDatabase();
        try {
            const { first_name, last_name, username } = userInfo;

            await db.run(
                'UPDATE users SET first_name = ?, last_name = ?, username = ? WHERE telegram_id = ?',
                [first_name || '', last_name || '', username || '', telegramId]
            );

            return true;
        } catch (error) {
            console.error('Error updating user info:', error);
            throw error;
        }
    }

    // Get all users (for admin)
    static async getAll(limit = 50, offset = 0) {
        const db = getDatabase();
        try {
            const users = await db.query(
                'SELECT * FROM users ORDER BY registration_date DESC LIMIT ? OFFSET ?',
                [limit, offset]
            );
            return users.map(userData => new User(userData));
        } catch (error) {
            console.error('Error getting all users:', error);
            throw error;
        }
    }

    // Get user statistics
    static async getStats() {
        const db = getDatabase();
        try {
            const totalUsers = await db.get('SELECT COUNT(*) as count FROM users');
            const activeUsers = await db.get('SELECT COUNT(*) as count FROM users WHERE is_active = 1');
            const totalBalance = await db.get('SELECT SUM(balance) as total FROM users');
            
            return {
                total: totalUsers.count,
                active: activeUsers.count,
                totalBalance: totalBalance.total || 0
            };
        } catch (error) {
            console.error('Error getting user stats:', error);
            throw error;
        }
    }

    // Update last active timestamp
    static async updateLastActive(telegramId) {
        const db = getDatabase();
        try {
            const now = new Date().toISOString();
            await db.run(
                'UPDATE users SET last_active = ? WHERE telegram_id = ?',
                [now, telegramId]
            );
        } catch (error) {
            console.error('Error updating last active:', error);
            throw error;
        }
    }

    // Save user instance
    async save() {
        const db = getDatabase();
        try {
            if (this.telegram_id) {
                await db.run(
                    'UPDATE users SET username = ?, first_name = ?, last_name = ?, balance = ?, is_active = ?, is_banned = ?, ban_reason = ?, banned_date = ?, profile_picture_url = ?, last_active = ? WHERE telegram_id = ?',
                    [this.username, this.first_name, this.last_name, this.balance, this.is_active, this.is_banned, this.ban_reason, this.banned_date, this.profile_picture_url, this.last_active, this.telegram_id]
                );
            }
            return this;
        } catch (error) {
            console.error('Error saving user:', error);
            throw error;
        }
    }

    // Create new user manually (for admin)
    static async createManually(userData) {
        const db = getDatabase();
        try {
            const { telegram_id, username, first_name, last_name, balance = 0.0 } = userData;

            // Check if user already exists
            const existingUser = await this.getByTelegramId(telegram_id);
            if (existingUser) {
                throw new Error('User with this Telegram ID already exists');
            }

            await db.run(
                'INSERT INTO users (telegram_id, username, first_name, last_name, balance, is_active, is_banned) VALUES (?, ?, ?, ?, ?, 1, 0)',
                [telegram_id, username, first_name, last_name, balance]
            );

            return new User({
                telegram_id,
                username,
                first_name,
                last_name,
                balance,
                is_active: 1,
                is_banned: 0,
                registration_date: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error creating user manually:', error);
            throw error;
        }
    }

    // Delete user and related data
    static async delete(telegramId) {
        const db = getDatabase();
        try {
            // Protect developer account
            if (telegramId == '1630035459') {
                throw new Error('Cannot delete the developer account. This account is protected.');
            }

            await db.beginTransaction();

            // Delete related data first (foreign key constraints)
            await db.run('DELETE FROM purchases WHERE user_id = ?', [telegramId]);
            await db.run('DELETE FROM transactions WHERE user_id = ?', [telegramId]);

            // Delete the user
            const result = await db.run('DELETE FROM users WHERE telegram_id = ?', [telegramId]);

            await db.commit();

            if (result.changes === 0) {
                throw new Error('User not found');
            }

            return true;
        } catch (error) {
            await db.rollback();
            console.error('Error deleting user:', error);
            throw error;
        }
    }

    // Ban user
    static async ban(telegramId, reason = 'No reason provided') {
        const db = getDatabase();
        try {
            // Protect developer account
            if (telegramId == '1630035459') {
                throw new Error('Cannot ban the developer account. This account is protected.');
            }

            const user = await this.getByTelegramId(telegramId);
            if (!user) {
                throw new Error('User not found');
            }

            await db.run(
                'UPDATE users SET is_banned = 1, ban_reason = ?, banned_date = CURRENT_TIMESTAMP WHERE telegram_id = ?',
                [reason, telegramId]
            );

            return true;
        } catch (error) {
            console.error('Error banning user:', error);
            throw error;
        }
    }

    // Unban user
    static async unban(telegramId) {
        const db = getDatabase();
        try {
            const user = await this.getByTelegramId(telegramId);
            if (!user) {
                throw new Error('User not found');
            }

            await db.run(
                'UPDATE users SET is_banned = 0, ban_reason = NULL, banned_date = NULL WHERE telegram_id = ?',
                [telegramId]
            );

            return true;
        } catch (error) {
            console.error('Error unbanning user:', error);
            throw error;
        }
    }
}

module.exports = User;
