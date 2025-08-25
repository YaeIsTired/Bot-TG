const { getDatabase } = require('./database');
const bcrypt = require('bcrypt');

class AdminUser {
    constructor(data = {}) {
        this.id = data.id;
        this.username = data.username;
        this.password = data.password;
        this.email = data.email;
        this.role = data.role || 'admin';
        this.is_active = data.is_active !== undefined ? data.is_active : 1;
        this.is_banned = data.is_banned !== undefined ? data.is_banned : 0;
        this.ban_reason = data.ban_reason;
        this.banned_date = data.banned_date;
        this.created_date = data.created_date;
        this.last_login = data.last_login;
        this.created_by = data.created_by;
    }

    // Authenticate admin user
    static async authenticate(username, password) {
        const db = getDatabase();
        try {
            const admin = await db.query(
                'SELECT * FROM admin_users WHERE username = ? AND is_active = 1 AND is_banned = 0',
                [username]
            );

            if (admin.length === 0) {
                return null;
            }

            const adminUser = new AdminUser(admin[0]);
            const isValidPassword = await bcrypt.compare(password, adminUser.password);

            if (isValidPassword) {
                // Update last login
                await db.run(
                    'UPDATE admin_users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                    [adminUser.id]
                );
                return adminUser;
            }

            return null;
        } catch (error) {
            console.error('Error authenticating admin user:', error);
            throw error;
        }
    }

    // Get admin user by ID
    static async getById(id) {
        const db = getDatabase();
        try {
            const admin = await db.query('SELECT * FROM admin_users WHERE id = ?', [id]);
            return admin.length > 0 ? new AdminUser(admin[0]) : null;
        } catch (error) {
            console.error('Error getting admin user by ID:', error);
            throw error;
        }
    }

    // Get admin user by username
    static async getByUsername(username) {
        const db = getDatabase();
        try {
            const admin = await db.query('SELECT * FROM admin_users WHERE username = ?', [username]);
            return admin.length > 0 ? new AdminUser(admin[0]) : null;
        } catch (error) {
            console.error('Error getting admin user by username:', error);
            throw error;
        }
    }

    // Get all admin users
    static async getAll(limit = 50, offset = 0) {
        const db = getDatabase();
        try {
            const admins = await db.query(
                'SELECT * FROM admin_users ORDER BY created_date DESC LIMIT ? OFFSET ?',
                [limit, offset]
            );
            return admins.map(adminData => new AdminUser(adminData));
        } catch (error) {
            console.error('Error getting all admin users:', error);
            throw error;
        }
    }

    // Create new admin user
    static async create(adminData, createdBy = null) {
        const db = getDatabase();
        try {
            const { username, password, email, role = 'admin' } = adminData;

            // Check if username already exists
            const existingAdmin = await this.getByUsername(username);
            if (existingAdmin) {
                throw new Error('Username already exists');
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10);

            const result = await db.run(
                'INSERT INTO admin_users (username, password, email, role, created_by) VALUES (?, ?, ?, ?, ?)',
                [username, hashedPassword, email, role, createdBy]
            );

            return new AdminUser({
                id: result.lastID,
                username,
                password: hashedPassword,
                email,
                role,
                is_active: 1,
                is_banned: 0,
                created_by: createdBy
            });
        } catch (error) {
            console.error('Error creating admin user:', error);
            throw error;
        }
    }

    // Update admin user
    static async update(id, updateData) {
        const db = getDatabase();
        try {
            const admin = await this.getById(id);
            if (!admin) {
                throw new Error('Admin user not found');
            }

            const { username, email, role, is_active } = updateData;
            let { password } = updateData;

            // Hash password if provided
            if (password) {
                password = await bcrypt.hash(password, 10);
            }

            const updateFields = [];
            const updateValues = [];

            if (username !== undefined) {
                // Check if new username already exists (excluding current user)
                const existingAdmin = await db.query(
                    'SELECT id FROM admin_users WHERE username = ? AND id != ?',
                    [username, id]
                );
                if (existingAdmin.length > 0) {
                    throw new Error('Username already exists');
                }
                updateFields.push('username = ?');
                updateValues.push(username);
            }

            if (password) {
                updateFields.push('password = ?');
                updateValues.push(password);
            }

            if (email !== undefined) {
                updateFields.push('email = ?');
                updateValues.push(email);
            }

            if (role !== undefined) {
                updateFields.push('role = ?');
                updateValues.push(role);
            }

            if (is_active !== undefined) {
                updateFields.push('is_active = ?');
                updateValues.push(is_active ? 1 : 0);
            }

            if (updateFields.length === 0) {
                throw new Error('No fields to update');
            }

            updateValues.push(id);

            await db.run(
                `UPDATE admin_users SET ${updateFields.join(', ')} WHERE id = ?`,
                updateValues
            );

            return await this.getById(id);
        } catch (error) {
            console.error('Error updating admin user:', error);
            throw error;
        }
    }

    // Delete admin user
    static async delete(id) {
        const db = getDatabase();
        try {
            const admin = await this.getById(id);
            if (!admin) {
                throw new Error('Admin user not found');
            }

            // Prevent deletion of super_admin if it's the last one
            if (admin.role === 'super_admin') {
                const superAdmins = await db.query(
                    'SELECT COUNT(*) as count FROM admin_users WHERE role = ? AND is_active = 1 AND is_banned = 0',
                    ['super_admin']
                );
                if (superAdmins[0].count <= 1) {
                    throw new Error('Cannot delete the last active super admin');
                }
            }

            const result = await db.run('DELETE FROM admin_users WHERE id = ?', [id]);
            
            if (result.changes === 0) {
                throw new Error('Admin user not found');
            }

            return true;
        } catch (error) {
            console.error('Error deleting admin user:', error);
            throw error;
        }
    }

    // Ban admin user
    static async ban(id, reason = 'No reason provided') {
        const db = getDatabase();
        try {
            const admin = await this.getById(id);
            if (!admin) {
                throw new Error('Admin user not found');
            }

            // Prevent banning super_admin if it's the last one
            if (admin.role === 'super_admin') {
                const activeSuperAdmins = await db.query(
                    'SELECT COUNT(*) as count FROM admin_users WHERE role = ? AND is_active = 1 AND is_banned = 0',
                    ['super_admin']
                );
                if (activeSuperAdmins[0].count <= 1) {
                    throw new Error('Cannot ban the last active super admin');
                }
            }

            await db.run(
                'UPDATE admin_users SET is_banned = 1, ban_reason = ?, banned_date = CURRENT_TIMESTAMP WHERE id = ?',
                [reason, id]
            );

            return true;
        } catch (error) {
            console.error('Error banning admin user:', error);
            throw error;
        }
    }

    // Unban admin user
    static async unban(id) {
        const db = getDatabase();
        try {
            const admin = await this.getById(id);
            if (!admin) {
                throw new Error('Admin user not found');
            }

            await db.run(
                'UPDATE admin_users SET is_banned = 0, ban_reason = NULL, banned_date = NULL WHERE id = ?',
                [id]
            );

            return true;
        } catch (error) {
            console.error('Error unbanning admin user:', error);
            throw error;
        }
    }

    // Get admin user statistics
    static async getStats() {
        const db = getDatabase();
        try {
            const stats = await db.query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN is_active = 1 AND is_banned = 0 THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN is_banned = 1 THEN 1 ELSE 0 END) as banned,
                    SUM(CASE WHEN role = 'super_admin' THEN 1 ELSE 0 END) as super_admins,
                    SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as regular_admins
                FROM admin_users
            `);

            return stats[0];
        } catch (error) {
            console.error('Error getting admin user stats:', error);
            throw error;
        }
    }

    // Save admin user instance
    async save() {
        const db = getDatabase();
        try {
            if (this.id) {
                await db.run(
                    'UPDATE admin_users SET username = ?, email = ?, role = ?, is_active = ?, is_banned = ?, ban_reason = ?, banned_date = ?, last_login = ? WHERE id = ?',
                    [this.username, this.email, this.role, this.is_active, this.is_banned, this.ban_reason, this.banned_date, this.last_login, this.id]
                );
            }
            return this;
        } catch (error) {
            console.error('Error saving admin user:', error);
            throw error;
        }
    }
}

module.exports = AdminUser;
