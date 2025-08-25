const { getDatabase } = require('./database');

class Purchase {
    constructor(data = {}) {
        this.id = data.id;
        this.user_id = data.user_id;
        this.account_id = data.account_id;
        this.purchase_date = data.purchase_date;
        this.delivery_status = data.delivery_status || 'pending';
        this.delivery_date = data.delivery_date;
        // User information from JOIN queries
        this.username = data.username;
        this.first_name = data.first_name;
        this.last_name = data.last_name;
        // Account information from JOIN queries
        this.title = data.title;
        this.game_type = data.game_type;
        this.price = data.price;
    }

    // Create new purchase
    static async create(purchaseData) {
        const db = getDatabase();
        try {
            const { user_id, account_id } = purchaseData;

            const result = await db.run(
                'INSERT INTO purchases (user_id, account_id) VALUES (?, ?)',
                [user_id, account_id]
            );

            return new Purchase({
                id: result.id,
                user_id,
                account_id,
                delivery_status: 'pending'
            });
        } catch (error) {
            console.error('Error creating purchase:', error);
            throw error;
        }
    }

    // Get purchase by ID
    static async getById(id) {
        const db = getDatabase();
        try {
            const purchaseData = await db.get(
                'SELECT * FROM purchases WHERE id = ?',
                [id]
            );
            return purchaseData ? new Purchase(purchaseData) : null;
        } catch (error) {
            console.error('Error getting purchase by ID:', error);
            throw error;
        }
    }

    // Get user purchases with account details
    static async getByUserId(userId, limit = 20, offset = 0) {
        const db = getDatabase();
        try {
            const purchases = await db.query(
                `SELECT p.*, a.title, a.game_type, a.price, a.custom_fields 
                 FROM purchases p 
                 JOIN accounts a ON p.account_id = a.id 
                 WHERE p.user_id = ? 
                 ORDER BY p.purchase_date DESC LIMIT ? OFFSET ?`,
                [userId, limit, offset]
            );
            return purchases.map(purchaseData => new Purchase(purchaseData));
        } catch (error) {
            console.error('Error getting user purchases:', error);
            throw error;
        }
    }

    // Get purchases by account ID (for admin)
    static async getByAccountId(accountId) {
        const db = getDatabase();
        try {
            const purchases = await db.query(
                `SELECT p.*, u.username, u.first_name, u.last_name, u.telegram_id
                 FROM purchases p
                 LEFT JOIN users u ON p.user_id = u.telegram_id
                 WHERE p.account_id = ?
                 ORDER BY p.purchase_date DESC`,
                [accountId]
            );
            return purchases.map(purchaseData => new Purchase(purchaseData));
        } catch (error) {
            console.error('Error getting purchases by account ID:', error);
            throw error;
        }
    }

    // Get all purchases (for admin)
    static async getAll(limit = 50, offset = 0) {
        const db = getDatabase();
        try {
            const purchases = await db.query(
                `SELECT p.*, u.username, u.first_name, u.last_name, a.title, a.game_type, a.price 
                 FROM purchases p 
                 LEFT JOIN users u ON p.user_id = u.telegram_id 
                 LEFT JOIN accounts a ON p.account_id = a.id 
                 ORDER BY p.purchase_date DESC LIMIT ? OFFSET ?`,
                [limit, offset]
            );
            return purchases.map(purchaseData => new Purchase(purchaseData));
        } catch (error) {
            console.error('Error getting all purchases:', error);
            throw error;
        }
    }

    // Get pending deliveries
    static async getPendingDeliveries() {
        const db = getDatabase();
        try {
            const purchases = await db.query(
                `SELECT p.*, u.telegram_id, u.username, a.title, a.custom_fields 
                 FROM purchases p 
                 JOIN users u ON p.user_id = u.telegram_id 
                 JOIN accounts a ON p.account_id = a.id 
                 WHERE p.delivery_status = "pending" 
                 ORDER BY p.purchase_date ASC`
            );
            return purchases.map(purchaseData => new Purchase(purchaseData));
        } catch (error) {
            console.error('Error getting pending deliveries:', error);
            throw error;
        }
    }

    // Mark purchase as delivered
    async markDelivered() {
        const db = getDatabase();
        try {
            await db.run(
                'UPDATE purchases SET delivery_status = "delivered", delivery_date = CURRENT_TIMESTAMP WHERE id = ?',
                [this.id]
            );
            this.delivery_status = 'delivered';
            this.delivery_date = new Date().toISOString();
        } catch (error) {
            console.error('Error marking purchase as delivered:', error);
            throw error;
        }
    }

    // Update delivery status
    static async updateDeliveryStatus(id, status) {
        const db = getDatabase();
        try {
            const updateData = { delivery_status: status };
            if (status === 'delivered') {
                updateData.delivery_date = new Date().toISOString();
                await db.run(
                    'UPDATE purchases SET delivery_status = ?, delivery_date = CURRENT_TIMESTAMP WHERE id = ?',
                    [status, id]
                );
            } else {
                await db.run(
                    'UPDATE purchases SET delivery_status = ? WHERE id = ?',
                    [status, id]
                );
            }
        } catch (error) {
            console.error('Error updating delivery status:', error);
            throw error;
        }
    }

    // Get purchase statistics
    static async getStats() {
        const db = getDatabase();
        try {
            const totalPurchases = await db.get('SELECT COUNT(*) as count FROM purchases');
            const deliveredPurchases = await db.get('SELECT COUNT(*) as count FROM purchases WHERE delivery_status = "delivered"');
            const pendingPurchases = await db.get('SELECT COUNT(*) as count FROM purchases WHERE delivery_status = "pending"');
            const totalSales = await db.get(
                'SELECT SUM(a.price) as total FROM purchases p JOIN accounts a ON p.account_id = a.id WHERE p.delivery_status = "delivered"'
            );
            
            return {
                total: totalPurchases.count,
                delivered: deliveredPurchases.count,
                pending: pendingPurchases.count,
                totalSales: totalSales.total || 0
            };
        } catch (error) {
            console.error('Error getting purchase stats:', error);
            throw error;
        }
    }

    // Get sales by date range
    static async getSalesByDateRange(startDate, endDate) {
        const db = getDatabase();
        try {
            const sales = await db.get(
                `SELECT SUM(a.price) as total FROM purchases p 
                 JOIN accounts a ON p.account_id = a.id 
                 WHERE p.delivery_status = "delivered" AND date(p.purchase_date) BETWEEN ? AND ?`,
                [startDate, endDate]
            );
            return sales.total || 0;
        } catch (error) {
            console.error('Error getting sales by date range:', error);
            throw error;
        }
    }

    // Get purchase with full details
    static async getWithDetails(id) {
        const db = getDatabase();
        try {
            const purchaseData = await db.get(
                `SELECT p.*, u.username, u.first_name, u.last_name, u.telegram_id,
                        a.title, a.game_type, a.price, a.custom_fields, a.description
                 FROM purchases p 
                 LEFT JOIN users u ON p.user_id = u.telegram_id 
                 LEFT JOIN accounts a ON p.account_id = a.id 
                 WHERE p.id = ?`,
                [id]
            );
            return purchaseData ? new Purchase(purchaseData) : null;
        } catch (error) {
            console.error('Error getting purchase with details:', error);
            throw error;
        }
    }
}

module.exports = Purchase;
