#!/bin/bash
# =============================================================================
# VoiceCommand - Production Deployment Script
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"

# Functions
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
check_env() {
    if [ ! -f "$ENV_FILE" ]; then
        print_error "Environment file $ENV_FILE not found!"
        print_status "Please copy .env.example to $ENV_FILE and configure your settings"
        exit 1
    fi
    print_success "Environment file found"
}

# Build images
build() {
    print_status "Building Docker images..."
    docker-compose -f $COMPOSE_FILE build --no-cache
    print_success "Build completed"
}

# Start services
start() {
    print_status "Starting services..."
    docker-compose -f $COMPOSE_FILE up -d
    print_success "Services started"
    
    print_status "Waiting for health checks..."
    sleep 10
    
    # Check service health
    docker-compose -f $COMPOSE_FILE ps
}

# Stop services
stop() {
    print_status "Stopping services..."
    docker-compose -f $COMPOSE_FILE down
    print_success "Services stopped"
}

# Restart services
restart() {
    print_status "Restarting services..."
    docker-compose -f $COMPOSE_FILE restart
    print_success "Services restarted"
}

# View logs
logs() {
    if [ -z "$1" ]; then
        docker-compose -f $COMPOSE_FILE logs -f
    else
        docker-compose -f $COMPOSE_FILE logs -f "$1"
    fi
}

# Update deployment
update() {
    print_status "Updating deployment..."
    docker-compose -f $COMPOSE_FILE pull
    docker-compose -f $COMPOSE_FILE build --no-cache
    docker-compose -f $COMPOSE_FILE up -d
    print_success "Update completed"
    
    # Cleanup old images
    print_status "Cleaning up old images..."
    docker image prune -f
}

# Backup data
backup() {
    BACKUP_DIR="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p $BACKUP_DIR
    
    print_status "Creating backup in $BACKUP_DIR..."
    
    # Backup MongoDB
    docker-compose -f $COMPOSE_FILE exec -T mongo mongodump --archive > $BACKUP_DIR/mongo.archive
    
    # Backup Redis
    docker-compose -f $COMPOSE_FILE exec -T redis redis-cli SAVE
    docker cp $(docker-compose -f $COMPOSE_FILE ps -q redis):/data/dump.rdb $BACKUP_DIR/redis.rdb
    
    # Backup uploads
    docker-compose -f $COMPOSE_FILE exec -T app tar -czf - /app/uploads > $BACKUP_DIR/uploads.tar.gz
    
    print_success "Backup completed: $BACKUP_DIR"
}

# Status check
status() {
    print_status "Service Status:"
    docker-compose -f $COMPOSE_FILE ps
    
    print_status "\nResource Usage:"
    docker stats --no-stream $(docker-compose -f $COMPOSE_FILE ps -q)
}

# Cleanup
cleanup() {
    print_warning "This will remove all stopped containers, unused networks, and dangling images"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker system prune -f
        docker volume prune -f
        print_success "Cleanup completed"
    else
        print_status "Cleanup cancelled"
    fi
}

# Show help
help() {
    echo "VoiceCommand Deployment Script"
    echo ""
    echo "Usage: $0 {command}"
    echo ""
    echo "Commands:"
    echo "  build     - Build Docker images"
    echo "  start     - Start all services"
    echo "  stop      - Stop all services"
    echo "  restart   - Restart all services"
    echo "  update    - Update and redeploy"
    echo "  logs      - View logs (optionally: logs {service})"
    echo "  status    - Check service status"
    echo "  backup    - Backup all data"
    echo "  cleanup   - Clean up unused Docker resources"
    echo "  help      - Show this help message"
    echo ""
    echo "Services: app, mongo, redis, nginx"
}

# Main
main() {
    case "${1:-help}" in
        build)
            check_env
            build
            ;;
        start)
            check_env
            start
            ;;
        stop)
            stop
            ;;
        restart)
            restart
            ;;
        update)
            check_env
            update
            ;;
        logs)
            logs "$2"
            ;;
        status)
            status
            ;;
        backup)
            backup
            ;;
        cleanup)
            cleanup
            ;;
        help|--help|-h)
            help
            ;;
        *)
            print_error "Unknown command: $1"
            help
            exit 1
            ;;
    esac
}

main "$@"
