const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database.sqlite');
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                throw err;
            }
            console.log('Connected to SQLite database.');
        });

        // Enable foreign keys
        this.db.run('PRAGMA foreign_keys = ON');
    }

    // Generic query method with promise support
    query(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('Database query error:', err.message);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Generic run method for INSERT, UPDATE, DELETE
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error('Database run error:', err.message);
                    reject(err);
                } else {
                    resolve({ id: this.lastID, changes: this.changes });
                }
            });
        });
    }

    // Get single row
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    console.error('Database get error:', err.message);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Close database connection
    close() {
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                    reject(err);
                } else {
                    console.log('Database connection closed.');
                    resolve();
                }
            });
        });
    }

    // Begin transaction
    beginTransaction() {
        return this.run('BEGIN TRANSACTION');
    }

    // Commit transaction
    commit() {
        return this.run('COMMIT');
    }

    // Rollback transaction
    rollback() {
        return this.run('ROLLBACK');
    }
}

// Singleton instance
let dbInstance = null;

const getDatabase = () => {
    if (!dbInstance) {
        dbInstance = new Database();
    }
    return dbInstance;
};

module.exports = { Database, getDatabase };
