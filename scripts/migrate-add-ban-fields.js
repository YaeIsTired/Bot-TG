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

// Add ban-related fields to users table
const addBanFields = () => {
    const fieldsToAdd = [
        { name: 'is_banned', type: 'INTEGER DEFAULT 0' },
        { name: 'ban_reason', type: 'TEXT' },
        { name: 'banned_date', type: 'DATETIME' }
    ];

    let completedFields = 0;
    const totalFields = fieldsToAdd.length;

    console.log('🔄 Adding ban-related fields to users table...\n');

    fieldsToAdd.forEach(field => {
        // Check if column already exists
        db.all(`PRAGMA table_info(users)`, (err, columns) => {
            if (err) {
                console.error('Error checking table info:', err.message);
                return;
            }

            const columnExists = columns.some(col => col.name === field.name);
            
            if (!columnExists) {
                db.run(`ALTER TABLE users ADD COLUMN ${field.name} ${field.type}`, (err) => {
                    if (err) {
                        console.error(`Error adding column ${field.name}:`, err.message);
                    } else {
                        console.log(`✓ Added column: ${field.name} (${field.type})`);
                    }
                    
                    completedFields++;
                    if (completedFields === totalFields) {
                        console.log('\n✅ Migration completed successfully!');
                        console.log('Ban-related fields have been added to the users table.');
                        console.log('');
                        console.log('📝 Next steps:');
                        console.log('1. Update User model to include ban fields');
                        console.log('2. Update admin panel to support ban/unban functionality');
                        console.log('3. Update Telegram bot to check ban status');
                        console.log('');
                        console.log('🎯 Usage:');
                        console.log('- is_banned: 0 = not banned, 1 = banned');
                        console.log('- ban_reason: Text explaining why user was banned');
                        console.log('- banned_date: When the ban was applied');
                        db.close();
                    }
                });
            } else {
                console.log(`⚠️  Column ${field.name} already exists, skipping...`);
                completedFields++;
                if (completedFields === totalFields) {
                    console.log('\n✅ Migration completed successfully!');
                    console.log('All ban fields already exist or have been added.');
                    db.close();
                }
            }
        });
    });
};

// Run migration
addBanFields();
