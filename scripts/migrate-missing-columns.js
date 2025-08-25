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

// Add missing columns from the original schema
const addMissingColumns = () => {
    const fieldsToAdd = [
        { name: 'username', type: 'TEXT' },
        { name: 'password', type: 'TEXT' },
        { name: 'level', type: 'INTEGER' },
        { name: 'rank', type: 'TEXT' },
        { name: 'region', type: 'TEXT' },
        { name: 'additional_info', type: 'TEXT' },
        { name: 'is_featured', type: 'INTEGER DEFAULT 0' }
    ];

    let completedFields = 0;
    const totalFields = fieldsToAdd.length;

    fieldsToAdd.forEach(field => {
        // Check if column already exists
        db.all("PRAGMA table_info(accounts)", (err, columns) => {
            if (err) {
                console.error(`Error checking table info:`, err.message);
                return;
            }

            const columnExists = columns.some(col => col.name === field.name);
            
            if (!columnExists) {
                db.run(`ALTER TABLE accounts ADD COLUMN ${field.name} ${field.type}`, (err) => {
                    if (err) {
                        console.error(`Error adding column ${field.name}:`, err.message);
                    } else {
                        console.log(`✓ Added column: ${field.name} (${field.type})`);
                    }
                    
                    completedFields++;
                    if (completedFields === totalFields) {
                        console.log('\n✅ Migration completed successfully!');
                        console.log('All missing columns have been added to the database.');
                        db.close();
                    }
                });
            } else {
                console.log(`⚠️  Column ${field.name} already exists, skipping...`);
                completedFields++;
                if (completedFields === totalFields) {
                    console.log('\n✅ Migration completed successfully!');
                    console.log('All fields already exist or have been added.');
                    db.close();
                }
            }
        });
    });
};

console.log('🚀 Starting migration to add missing columns...\n');
addMissingColumns();
