#!/bin/bash

# MediaAI Startup Script
# This script ensures the database and backend server are running before starting the frontend

# Set the project root directory (parent of scripts folder)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 Starting MediaAI Application..."
echo "   Project root: $PROJECT_ROOT"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Start OCR Service
echo "📄 Starting OCR Service..."
OCR_DIR="$PROJECT_ROOT/services/ocr-service"
if [ -d "$OCR_DIR" ]; then
    cd "$OCR_DIR"
    # Check if OCR container already exists
    if docker ps -a --format '{{.Names}}' | grep -q "^ocr_service$"; then
        if docker ps --format '{{.Names}}' | grep -q "^ocr_service$"; then
            echo "✅ OCR Service is already running"
        else
            echo "🔄 Starting existing OCR Service..."
            docker start ocr_service
        fi
    else
        docker compose up -d
    fi
else
    echo "⚠️  OCR Service directory not found at $OCR_DIR"
fi

# Go back to project root
cd "$PROJECT_ROOT"

# Start PostgreSQL database
echo "📦 Starting PostgreSQL database..."

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^dispute-postgres$"; then
    # Container exists, try to start it
    if docker ps --format '{{.Names}}' | grep -q "^dispute-postgres$"; then
        echo "✅ PostgreSQL container is already running"
    else
        echo "🔄 Starting existing PostgreSQL container..."
        docker start dispute-postgres
    fi
else
    # Container doesn't exist, create it
    docker compose up -d
fi

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 3

# Check if database is running
if ! docker ps | grep -q "dispute-postgres"; then
    echo "❌ Error: PostgreSQL container failed to start"
    exit 1
fi

echo "✅ Database is running"

# Start backend server (guard against port already in use)
echo "🔧 Starting backend server..."

# Check if port 5000 is already in use
if lsof -i :5000 -sTCP:LISTEN -t > /dev/null 2>&1; then
    echo "⚠️  Port 5000 already in use — skipping backend start"
    echo "✅ Backend server appears to be running on http://localhost:5000"
else
    cd "$PROJECT_ROOT/backend"
    npm run dev &
    BACKEND_PID=$!

    # Wait for backend to start
    echo "⏳ Waiting for backend to initialize..."
    sleep 5

    # Check if backend is running
    if ! curl -s http://localhost:5000 > /dev/null 2>&1; then
        # Backend might still be starting, check the process
        if ! ps -p $BACKEND_PID > /dev/null; then
            echo "❌ Error: Backend server failed to start"
            echo "   Check backend/src/server.js for errors"
            exit 1
        fi
    fi

    echo "✅ Backend server is running on http://localhost:5000"
fi

# Go back to project root
cd "$PROJECT_ROOT"

# Start frontend
echo "🎨 Starting frontend..."
cd "$PROJECT_ROOT/frontend"
npm run dev

echo ""
echo "🎉 MediaAI is running!"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:5000"
echo "   OCR Service: http://localhost:8000"
echo "   Database: localhost:5432"
echo ""
echo "Press Ctrl+C to stop all services"
