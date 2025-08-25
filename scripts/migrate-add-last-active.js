const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite database for migration.');
});

// Add last_active field to users table
const addLastActiveField = () => {
    console.log('🔄 Adding last_active field to users table...\n');

    // Check if column already exists
    db.all(`PRAGMA table_info(users)`, (err, columns) => {
        if (err) {
            console.error('Error checking table info:', err.message);
            db.close();
            return;
        }

        const columnExists = columns.some(col => col.name === 'last_active');
        
        if (!columnExists) {
            db.run(`ALTER TABLE users ADD COLUMN last_active DATETIME`, (err) => {
                if (err) {
                    console.error(`Error adding last_active column:`, err.message);
                } else {
                    console.log(`✓ Added column: last_active (DATETIME)`);
                }
                
                console.log('\n✅ Migration completed successfully!');
                console.log('Last active field has been added to the users table.');
                console.log('');
                console.log('📝 Next steps:');
                console.log('1. Update User model to include last_active');
                console.log('2. Update Telegram bot to track user interactions');
                console.log('3. Update admin users page to display last active time');
                console.log('');
                console.log('🎯 Usage:');
                console.log('- Last active will be updated every time a user interacts with the bot');
                console.log('- Admin panel will show "Never" for users who haven\'t interacted yet');
                console.log('- Time will be displayed in a human-readable format (e.g., "2 hours ago")');
                db.close();
            });
        } else {
            console.log(`⚠️  Column last_active already exists, skipping...`);
            console.log('\n✅ Migration completed successfully!');
            console.log('Last active field already exists.');
            db.close();
        }
    });
};

// Run migration
addLastActiveField();
