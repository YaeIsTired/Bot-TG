const { getDatabase } = require('./database');

class Transaction {
    constructor(data = {}) {
        this.id = data.id;
        this.user_id = data.user_id;
        this.type = data.type;
        this.amount = data.amount;
        this.status = data.status || 'pending';
        this.md5_hash = data.md5_hash;
        this.message_id = data.message_id;
        this.qr_url = data.qr_url;
        this.transaction_id = data.transaction_id;
        this.timestamp = data.timestamp;
        this.completed_date = data.completed_date;
        // User information from JOIN queries
        this.username = data.username;
        this.first_name = data.first_name;
        this.last_name = data.last_name;
    }

    // Create new transaction
    static async create(transactionData) {
        const db = getDatabase();
        try {
            const { user_id, type, amount, status, md5_hash, message_id, qr_url, transaction_id } = transactionData;
            const finalStatus = status || 'pending';

            const result = await db.run(
                'INSERT INTO transactions (user_id, type, amount, status, md5_hash, message_id, qr_url, transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [user_id, type, amount, finalStatus, md5_hash, message_id, qr_url, transaction_id]
            );

            return new Transaction({
                id: result.id,
                ...transactionData,
                status: finalStatus
            });
        } catch (error) {
            console.error('Error creating transaction:', error);
            throw error;
        }
    }

    // Get transaction by ID
    static async getById(id) {
        const db = getDatabase();
        try {
            const transactionData = await db.get(
                'SELECT * FROM transactions WHERE id = ?',
                [id]
            );
            return transactionData ? new Transaction(transactionData) : null;
        } catch (error) {
            console.error('Error getting transaction by ID:', error);
            throw error;
        }
    }

    // Get transaction by MD5 hash
    static async getByMd5Hash(md5Hash) {
        const db = getDatabase();
        try {
            const transactionData = await db.get(
                'SELECT * FROM transactions WHERE md5_hash = ?',
                [md5Hash]
            );
            return transactionData ? new Transaction(transactionData) : null;
        } catch (error) {
            console.error('Error getting transaction by MD5 hash:', error);
            throw error;
        }
    }

    // Get pending transactions for cleanup
    static async getPendingTransactions(olderThanMinutes = 3) {
        const db = getDatabase();
        try {
            const transactions = await db.query(
                'SELECT * FROM transactions WHERE status = "pending" AND datetime(timestamp, "+" || ? || " minutes") < datetime("now")',
                [olderThanMinutes]
            );
            return transactions.map(transactionData => new Transaction(transactionData));
        } catch (error) {
            console.error('Error getting pending transactions:', error);
            throw error;
        }
    }

    // Get user transactions
    static async getByUserId(userId, limit = 20, offset = 0) {
        const db = getDatabase();
        try {
            const transactions = await db.query(
                'SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
                [userId, limit, offset]
            );
            return transactions.map(transactionData => new Transaction(transactionData));
        } catch (error) {
            console.error('Error getting user transactions:', error);
            throw error;
        }
    }

    // Get all transactions (for admin)
    static async getAll(limit = 50, offset = 0) {
        const db = getDatabase();
        try {
            const transactions = await db.query(
                `SELECT t.*, u.username, u.first_name, u.last_name
                 FROM transactions t
                 LEFT JOIN users u ON t.user_id = u.telegram_id
                 ORDER BY t.timestamp DESC LIMIT ? OFFSET ?`,
                [limit, offset]
            );
            return transactions.map(transactionData => new Transaction(transactionData));
        } catch (error) {
            console.error('Error getting all transactions:', error);
            throw error;
        }
    }

    // Get transactions by user ID
    static async getByUserId(userId, limit = 50, offset = 0) {
        const db = getDatabase();
        try {
            const transactions = await db.query(
                'SELECT * FROM transactions WHERE user_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
                [userId, limit, offset]
            );
            return transactions.map(transactionData => new Transaction(transactionData));
        } catch (error) {
            console.error('Error getting transactions by user ID:', error);
            throw error;
        }
    }

    // Update transaction status
    static async updateStatus(id, status, completedDate = null) {
        const db = getDatabase();
        try {
            if (completedDate) {
                await db.run(
                    'UPDATE transactions SET status = ?, completed_date = ? WHERE id = ?',
                    [status, completedDate, id]
                );
            } else {
                await db.run(
                    'UPDATE transactions SET status = ? WHERE id = ?',
                    [status, id]
                );
            }
        } catch (error) {
            console.error('Error updating transaction status:', error);
            throw error;
        }
    }

    // Mark transaction as completed
    async markCompleted() {
        const db = getDatabase();
        try {
            await db.run(
                'UPDATE transactions SET status = "completed", completed_date = CURRENT_TIMESTAMP WHERE id = ?',
                [this.id]
            );
            this.status = 'completed';
            this.completed_date = new Date().toISOString();
        } catch (error) {
            console.error('Error marking transaction as completed:', error);
            throw error;
        }
    }

    // Mark transaction as expired
    async markExpired() {
        const db = getDatabase();
        try {
            await db.run(
                'UPDATE transactions SET status = "expired" WHERE id = ?',
                [this.id]
            );
            this.status = 'expired';
        } catch (error) {
            console.error('Error marking transaction as expired:', error);
            throw error;
        }
    }

    // Get transaction statistics
    static async getStats() {
        const db = getDatabase();
        try {
            const totalTransactions = await db.get('SELECT COUNT(*) as count FROM transactions');
            const completedTransactions = await db.get('SELECT COUNT(*) as count FROM transactions WHERE status = "completed"');
            const pendingTransactions = await db.get('SELECT COUNT(*) as count FROM transactions WHERE status = "pending"');
            const totalRevenue = await db.get('SELECT SUM(amount) as total FROM transactions WHERE status = "completed" AND type = "topup"');
            
            return {
                total: totalTransactions.count,
                completed: completedTransactions.count,
                pending: pendingTransactions.count,
                totalRevenue: totalRevenue.total || 0
            };
        } catch (error) {
            console.error('Error getting transaction stats:', error);
            throw error;
        }
    }

    // Get revenue by date range
    static async getRevenueByDateRange(startDate, endDate) {
        const db = getDatabase();
        try {
            const revenue = await db.get(
                'SELECT SUM(amount) as total FROM transactions WHERE status = "completed" AND type = "topup" AND date(timestamp) BETWEEN ? AND ?',
                [startDate, endDate]
            );
            return revenue.total || 0;
        } catch (error) {
            console.error('Error getting revenue by date range:', error);
            throw error;
        }
    }
}

module.exports = Transaction;
