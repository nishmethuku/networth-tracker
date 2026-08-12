#!/bin/bash
# Reset database to remove user_id column
echo "Resetting database..."
cd "$(dirname "$0")/backend"
rm -f data.db
echo "✓ Database deleted. It will be recreated when you start the backend server."
echo ""
echo "Now start the backend server:"
echo "  cd backend"
echo "  source venv/bin/activate"
echo "  export PYTHONPATH=$(dirname $(pwd))"
echo "  python -m backend.app"
