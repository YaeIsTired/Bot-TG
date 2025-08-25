const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, '..', 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite database for migration.');
});

// Create admin_users table
const createAdminUsersTable = () => {
    console.log('🔄 Creating admin_users table...\n');

    db.run(`CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT,
        role TEXT DEFAULT 'admin',
        is_active INTEGER DEFAULT 1,
        is_banned INTEGER DEFAULT 0,
        ban_reason TEXT,
        banned_date DATETIME,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        created_by INTEGER,
        FOREIGN KEY (created_by) REFERENCES admin_users (id)
    )`, async (err) => {
        if (err) {
            console.error('Error creating admin_users table:', err.message);
            db.close();
            return;
        }

        console.log('✓ Admin users table created successfully');

        // Create default admin user from environment variables
        try {
            const adminUsername = process.env.ADMIN_USERNAME || 'admin';
            const adminPassword = process.env.ADMIN_PASSWORD;

            if (adminPassword) {
                // Check if admin user already exists
                db.get('SELECT id FROM admin_users WHERE username = ?', [adminUsername], async (err, row) => {
                    if (err) {
                        console.error('Error checking existing admin:', err.message);
                        db.close();
                        return;
                    }

                    if (!row) {
                        // Hash password if not already hashed
                        let hashedPassword = adminPassword;
                        if (!adminPassword.startsWith('$2b$')) {
                            hashedPassword = await bcrypt.hash(adminPassword, 10);
                        }

                        // Create default admin user
                        db.run(
                            'INSERT INTO admin_users (username, password, role, email) VALUES (?, ?, ?, ?)',
                            [adminUsername, hashedPassword, 'super_admin', 'admin@example.com'],
                            function(err) {
                                if (err) {
                                    console.error('Error creating default admin user:', err.message);
                                } else {
                                    console.log(`✓ Created default admin user: ${adminUsername}`);
                                }

                                console.log('\n✅ Migration completed successfully!');
                                console.log('Admin users table has been created.');
                                console.log('');
                                console.log('📝 Next steps:');
                                console.log('1. Create AdminUser model');
                                console.log('2. Update admin authentication to use database');
                                console.log('3. Create admin user management interface');
                                console.log('');
                                console.log('🎯 Features:');
                                console.log('- Multiple admin users support');
                                console.log('- Role-based access (admin, super_admin)');
                                console.log('- Ban/unban functionality');
                                console.log('- User creation tracking');
                                db.close();
                            }
                        );
                    } else {
                        console.log('⚠️  Default admin user already exists, skipping creation...');
                        console.log('\n✅ Migration completed successfully!');
                        console.log('Admin users table already exists.');
                        db.close();
                    }
                });
            } else {
                console.log('⚠️  No ADMIN_PASSWORD found in environment variables');
                console.log('✅ Migration completed successfully!');
                console.log('Admin users table created. Please create admin users manually.');
                db.close();
            }
        } catch (error) {
            console.error('Error during migration:', error.message);
            db.close();
        }
    });
};

// Run migration
createAdminUsersTable();
