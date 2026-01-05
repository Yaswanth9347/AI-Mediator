#!/bin/bash

# MediaAI Startup Script
# This script ensures the database and backend server are running before starting the frontend

echo "🚀 Starting MediaAI Application..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Start PostgreSQL database
echo "📦 Starting PostgreSQL database..."
cd "$(dirname "$0")"

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

# Start backend server
echo "🔧 Starting backend server..."
cd backend
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

# Start frontend
echo "🎨 Starting frontend..."
cd ../frontend
npm run dev

echo ""
echo "🎉 MediaAI is running!"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:5000"
echo "   Database: localhost:5432"
echo ""
echo "Press Ctrl+C to stop all services"
