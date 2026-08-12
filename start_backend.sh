#!/bin/bash
# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# Activate virtual environment
source backend/venv/bin/activate

# Set PYTHONPATH to project root so backend module can be imported
export PYTHONPATH="$PROJECT_ROOT"

# Load .env file if it exists (create one from .env.example with your own keys)
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(cat "$PROJECT_ROOT/.env" | grep -v '^#' | xargs)
fi

# Run the Flask app
python -m backend.app
