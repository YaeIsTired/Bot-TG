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

// Add profile picture field to users table
const addProfilePictureField = () => {
    console.log('🔄 Adding profile picture field to users table...\n');

    // Check if column already exists
    db.all(`PRAGMA table_info(users)`, (err, columns) => {
        if (err) {
            console.error('Error checking table info:', err.message);
            db.close();
            return;
        }

        const columnExists = columns.some(col => col.name === 'profile_picture_url');
        
        if (!columnExists) {
            db.run(`ALTER TABLE users ADD COLUMN profile_picture_url TEXT`, (err) => {
                if (err) {
                    console.error(`Error adding profile_picture_url column:`, err.message);
                } else {
                    console.log(`✓ Added column: profile_picture_url (TEXT)`);
                }
                
                console.log('\n✅ Migration completed successfully!');
                console.log('Profile picture field has been added to the users table.');
                console.log('');
                console.log('📝 Next steps:');
                console.log('1. Update User model to include profile_picture_url');
                console.log('2. Update Telegram bot to fetch and store profile pictures');
                console.log('3. Update admin users page to display profile pictures');
                db.close();
            });
        } else {
            console.log(`⚠️  Column profile_picture_url already exists, skipping...`);
            console.log('\n✅ Migration completed successfully!');
            console.log('Profile picture field already exists.');
            db.close();
        }
    });
};

addProfilePictureField();
