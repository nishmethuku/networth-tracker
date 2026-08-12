#!/usr/bin/env python3
"""
Fix database schema by removing user_id column and users table
"""
import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "data.db")

if not os.path.exists(db_path):
    print("Database doesn't exist yet. It will be created when you start the app.")
    exit(0)

print(f"Connecting to database: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # Check if user_id column exists
    cursor.execute("PRAGMA table_info(assets)")
    columns = [col[1] for col in cursor.fetchall()]
    
    if 'user_id' in columns:
        print("Found user_id column. Removing it...")
        
        # SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
        # First, get all data
        cursor.execute("SELECT * FROM assets")
        rows = cursor.fetchall()
        
        # Get column names (excluding user_id)
        cursor.execute("PRAGMA table_info(assets)")
        all_columns = cursor.fetchall()
        column_names = [col[1] for col in all_columns if col[1] != 'user_id']
        column_indices = [i for i, col in enumerate(all_columns) if col[1] != 'user_id']
        
        # Create new table without user_id
        cursor.execute("""
            CREATE TABLE assets_new (
                id INTEGER PRIMARY KEY,
                asset_type VARCHAR(32) NOT NULL,
                country VARCHAR(64) NOT NULL,
                account VARCHAR(64) NOT NULL,
                purchase_date DATE NOT NULL,
                created_at DATETIME,
                updated_at DATETIME,
                symbol VARCHAR(16),
                units FLOAT,
                buy_price FLOAT,
                name VARCHAR(128),
                buy_value FLOAT,
                current_value FLOAT,
                institution VARCHAR(128),
                value FLOAT,
                notes TEXT,
                tags VARCHAR(512)
            )
        """)
        
        # Copy data (excluding user_id column)
        if rows:
            placeholders = ','.join(['?' for _ in column_indices])
            column_list = ','.join(column_names)
            for row in rows:
                new_row = [row[i] for i in column_indices]
                cursor.execute(f"INSERT INTO assets_new ({column_list}) VALUES ({placeholders})", new_row)
        
        # Drop old table and rename new one
        cursor.execute("DROP TABLE assets")
        cursor.execute("ALTER TABLE assets_new RENAME TO assets")
        
        print("✓ Removed user_id column successfully")
    else:
        print("✓ No user_id column found - database is already correct")
    
    # Check if users table exists and remove it
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    if cursor.fetchone():
        print("Found users table. Removing it...")
        cursor.execute("DROP TABLE users")
        print("✓ Removed users table successfully")
    else:
        print("✓ No users table found")
    
    conn.commit()
    print("\n✓ Database schema fixed successfully!")
    
except Exception as e:
    conn.rollback()
    print(f"\n✗ Error: {e}")
    print("\nIf this fails, you can delete the database file and start fresh:")
    print(f"  rm {db_path}")
    exit(1)
finally:
    conn.close()
