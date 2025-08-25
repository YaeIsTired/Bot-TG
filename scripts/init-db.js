const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite database.');
});

// Create tables
const createTables = () => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        balance REAL DEFAULT 0.0,
        registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1,
        is_banned INTEGER DEFAULT 0,
        ban_reason TEXT,
        banned_date DATETIME,
        profile_picture_url TEXT,
        last_active DATETIME
    )`, (err) => {
        if (err) console.error('Error creating users table:', err.message);
        else console.log('Users table created successfully.');
    });

    // Gaming accounts table
    db.run(`CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        custom_fields TEXT, -- JSON string for flexible fields
        is_available INTEGER DEFAULT 1,
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        sold_date DATETIME,
        image_url TEXT,
        images TEXT, -- JSON array of image URLs
        username TEXT,
        password TEXT,
        level INTEGER,
        rank TEXT,
        region TEXT,
        additional_info TEXT,
        is_featured INTEGER DEFAULT 0
    )`, (err) => {
        if (err) console.error('Error creating accounts table:', err.message);
        else console.log('Accounts table created successfully.');
    });

    // Transactions table
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL, -- 'topup' or 'purchase'
        amount REAL NOT NULL,
        status TEXT DEFAULT 'pending', -- 'pending', 'completed', 'expired', 'failed'
        md5_hash TEXT,
        message_id INTEGER,
        qr_url TEXT,
        transaction_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_date DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (telegram_id)
    )`, (err) => {
        if (err) console.error('Error creating transactions table:', err.message);
        else console.log('Transactions table created successfully.');
    });

    // Purchases table
    db.run(`CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        delivery_status TEXT DEFAULT 'pending', -- 'pending', 'delivered', 'failed'
        delivery_date DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (telegram_id),
        FOREIGN KEY (account_id) REFERENCES accounts (id)
    )`, (err) => {
        if (err) console.error('Error creating purchases table:', err.message);
        else console.log('Purchases table created successfully.');
    });

    // Admin settings table
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Error creating settings table:', err.message);
        else console.log('Settings table created successfully.');
    });

    // Admin users table
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
    )`, (err) => {
        if (err) console.error('Error creating admin_users table:', err.message);
        else console.log('Admin users table created successfully.');
    });
};

// Insert default settings
const insertDefaultSettings = () => {
    const defaultSettings = [
        ['bot_welcome_message', 'Welcome to Gaming Accounts Store! 🎮\n\nUse /browse to see available accounts or /topup to add funds to your balance.'],
        ['min_topup_amount', '0.01'],
        ['max_topup_amount', '1000'],
        ['payment_timeout_minutes', '3'],
        ['auto_delivery_enabled', '1']
    ];

    const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    defaultSettings.forEach(([key, value]) => {
        stmt.run(key, value);
    });
    stmt.finalize();
    console.log('Default settings inserted.');
};

// Initialize database
createTables();
setTimeout(() => {
    insertDefaultSettings();
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database initialization completed.');
        }
    });
}, 1000);
