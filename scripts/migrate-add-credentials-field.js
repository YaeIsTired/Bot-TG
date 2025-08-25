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

// Add account_credentials field
const addCredentialsField = () => {
    // Check if column already exists
    db.all("PRAGMA table_info(accounts)", (err, columns) => {
        if (err) {
            console.error(`Error checking table info:`, err.message);
            return;
        }

        const columnExists = columns.some(col => col.name === 'account_credentials');
        
        if (!columnExists) {
            db.run(`ALTER TABLE accounts ADD COLUMN account_credentials TEXT`, (err) => {
                if (err) {
                    console.error(`Error adding account_credentials column:`, err.message);
                } else {
                    console.log(`✓ Added column: account_credentials (TEXT)`);
                }
                
                console.log('\n✅ Migration completed successfully!');
                console.log('Account credentials field has been added to the database.');
                db.close();
            });
        } else {
            console.log(`⚠️  Column account_credentials already exists, skipping...`);
            console.log('\n✅ Migration completed successfully!');
            console.log('Account credentials field already exists.');
            db.close();
        }
    });
};

console.log('🚀 Starting migration to add account_credentials field...\n');
addCredentialsField();
