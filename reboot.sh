#!/bin/bash

# MCP Outline Remote Server - Reboot Script
# Stops, rebuilds, and restarts all containers

set -e  # Exit on any error

echo "🔄 MCP Outline Remote Server - Reboot Script"
echo "============================================="

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo "❌ Error: Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Function to stop containers
stop_containers() {
    echo "🛑 Stopping containers..."
    docker compose down || {
        echo "⚠️  Warning: Failed to stop containers (they may not be running)"
    }
    echo "✅ Containers stopped"
}

# Function to rebuild containers
rebuild_containers() {
    echo "🔨 Rebuilding containers (no cache)..."
    docker compose build --no-cache
    echo "✅ Containers rebuilt"
}

# Function to start containers
start_containers() {
    echo "🚀 Starting containers..."
    docker compose up -d
    echo "✅ Containers started"
}

# Function to show status
show_status() {
    echo ""
    echo "📊 Container Status:"
    echo "==================="
    docker compose ps
    
    echo ""
    echo "🔍 Health Check:"
    echo "================"
    
    # Wait a moment for services to start
    sleep 3
    
    # Check health endpoint
    if curl -s http://localhost:3131/health > /dev/null; then
        echo "✅ MCP Server: Running (http://localhost:3131)"
        echo "✅ Health endpoint: Responding"
        
        # Check OAuth discovery
        if curl -s http://localhost:3131/.well-known/oauth-authorization-server | grep -q "refresh_token"; then
            echo "✅ OAuth: Refresh token support enabled"
        else
            echo "⚠️  OAuth: Refresh token support not detected"
        fi
    else
        echo "❌ MCP Server: Not responding"
    fi
    
    echo ""
    echo "🌐 Available endpoints:"
    echo "  • Health: http://localhost:3131/health"
    echo "  • Login:  http://localhost:3131/login"
    echo "  • MCP:    http://localhost:3131/v1/mcp"
    echo "  • OAuth:  http://localhost:3131/.well-known/oauth-authorization-server"
}

# Main execution
main() {
    echo "Starting reboot process..."
    
    check_docker
    stop_containers
    rebuild_containers
    start_containers
    show_status
    
    echo ""
    echo "🎉 Reboot complete!"
    echo "📝 Check logs with: docker compose logs -f"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Stops, rebuilds, and restarts all MCP server containers"
        echo ""
        echo "Options:"
        echo "  --help, -h     Show this help message"
        echo "  --status, -s   Show current container status only"
        echo ""
        echo "Examples:"
        echo "  $0              # Full reboot"
        echo "  $0 --status     # Check status only"
        exit 0
        ;;
    --status|-s)
        echo "📊 Current Status Check"
        echo "======================"
        check_docker
        show_status
        exit 0
        ;;
    "")
        main
        ;;
    *)
        echo "❌ Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
esac