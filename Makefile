# Makefile for version bumping and dependency installation

.PHONY: bump-patch bump-minor bump-major install help tag-release dev-backend dev-frontend dev-web build-web build start

# Default target
help:
	@echo "Available targets:"
	@echo "  bump-patch  - Bump patch version (x.x.X) for both backend and frontend"
	@echo "  bump-minor  - Bump minor version (x.X.x) for both backend and frontend"
	@echo "  bump-major  - Bump major version (X.x.x) for both backend and frontend"
	@echo "  install     - Run npm install in both backend and frontend directories"
	@echo "  build-web   - Build frontend into backend/dev_frontend (for full dev on :3010)"
	@echo "  dev-backend - Run backend in watch mode (NestJS, port 3010, serves dev_frontend + REAL data)"
	@echo "  dev-frontend- Run frontend with hot-reload (Vite, port 3334, mock data)"
	@echo "  build       - Build frontend and backend for production"
	@echo "  start       - Run backend in production mode (requires build first)"
	@echo "  bump-and-install-patch  - Bump patch version and install dependencies"
	@echo "  bump-and-install-minor  - Bump minor version and install dependencies"
	@echo "  bump-and-install-major  - Bump major version and install dependencies"
	@echo "  tag-release - Create and push git tag for current version"

# Bump patch version (x.x.X)
bump-patch:
	@echo "Bumping patch version..."
	@cd backend && npm version patch --no-git-tag-version
	@cd frontend && npm version patch --no-git-tag-version
	@echo "✅ Patch version bumped successfully!"

# Bump minor version (x.X.x)
bump-minor:
	@echo "Bumping minor version..."
	@cd backend && npm version minor --no-git-tag-version
	@cd frontend && npm version minor --no-git-tag-version
	@echo "✅ Minor version bumped successfully!"

# Bump major version (X.x.x)
bump-major:
	@echo "Bumping major version..."
	@cd backend && npm version major --no-git-tag-version
	@cd frontend && npm version major --no-git-tag-version
	@echo "✅ Major version bumped successfully!"

# Install dependencies
install:
	@echo "Installing dependencies..."
	@echo "📦 Installing backend dependencies..."
	@cd backend && npm install
	@echo "📦 Installing frontend dependencies..."
	@cd frontend && npm install
	@echo "✅ Dependencies installed successfully!"

# Build frontend into backend/dev_frontend (dev backend serves views from there)
build-web:
	@echo "📦 Building frontend into backend/dev_frontend..."
	@cd frontend && npm run cb
	@rm -rf backend/dev_frontend
	@ln -s ../frontend/dist backend/dev_frontend
	@echo "✅ dev_frontend is ready (symlink -> frontend/dist)."

# Run backend in watch mode (NestJS, port 3010) — serves dev_frontend + real panel data
dev-backend: | backend/dev_frontend
	@echo "🚀 Starting backend in watch mode on port 3010..."
	@echo "   Open http://localhost:3010/<shortUuid>"
	@cd backend && npm run start:dev

# Ensure dev_frontend exists before dev-backend (order-only prerequisite)
backend/dev_frontend:
	@echo "⚠️  backend/dev_frontend missing — building frontend first..."
	@$(MAKE) build-web

# Run frontend with hot-reload (Vite, port 3334)
dev-frontend:
	@echo "🚀 Starting frontend with hot-reload on port 3334..."
	@cd frontend && npm run start:dev

# Build frontend and backend for production
build:
	@echo "📦 Building frontend..."
	@cd frontend && npm run cb
	@echo "📦 Building backend..."
	@cd backend && npm run build
	@echo "✅ Build completed successfully!"

# Run backend in production mode (requires build first)
start:
	@echo "🚀 Starting backend in production mode on port 3010..."
	@cd backend && npm run start:prod

# Combined targets
bump-and-install-patch: bump-patch install
	@echo "🎉 Patch version bumped and dependencies installed!"

bump-and-install-minor: bump-minor install
	@echo "🎉 Minor version bumped and dependencies installed!"

bump-and-install-major: bump-major install
	@echo "🎉 Major version bumped and dependencies installed!"

# Show current versions
show-versions:
	@echo "Current versions:"
	@echo "Backend: $(shell cd backend && node -p "require('./package.json').version")"
	@echo "Frontend: $(shell cd frontend && node -p "require('./package.json').version")"


tag-release:
	@VERSION=$$(cd backend && node -p "require('./package.json').version") && \
	echo "Creating signed tag for version $$VERSION..." && \
	git tag -s "$$VERSION" -m "Release $$VERSION" && \
	git push origin --follow-tags && \
	echo "Signed tag $$VERSION created and pushed"