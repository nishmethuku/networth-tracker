# Database Migration Guide

## Adding Notes and Tags to Existing Database

If you have an existing database with assets, you need to add the new `notes` and `tags` columns.

### Option 1: Using Flask-Migrate (Recommended for Production)

1. Install Flask-Migrate:
```bash
pip install Flask-Migrate
```

2. Initialize migrations:
```bash
flask db init
```

3. Create migration:
```bash
flask db migrate -m "Add notes and tags to assets"
```

4. Apply migration:
```bash
flask db upgrade
```

### Option 2: Manual SQL (Quick Fix)

For SQLite databases, you can run:

```sql
ALTER TABLE assets ADD COLUMN notes TEXT;
ALTER TABLE assets ADD COLUMN tags VARCHAR(512);
```

### Option 3: Recreate Database (Development Only)

⚠️ **WARNING: This deletes all data!**

```bash
# Delete existing database
rm backend/data.db

# Run the app - it will create tables with new schema
python -m backend.app
```

### Verify Migration

After migration, verify the columns exist:

```python
from backend.models import Asset
asset = Asset.query.first()
print(hasattr(asset, 'notes'))  # Should print True
print(hasattr(asset, 'tags'))   # Should print True
```
