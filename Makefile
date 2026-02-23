# ============================================================================
# Mimir — Fleet Management Control Plane
# ============================================================================

.PHONY: install build dev test test-coverage lint typecheck \
	fmt fmt-check audit \
	infra-up infra-down infra-reset infra-logs infra-status \
	stack-build stack-up stack-down stack-nuke stack-logs stack-status stack-rebuild \
	db-migrate db-migrate-deploy db-generate db-seed db-reset db-studio \
	clean ci

# ── Color codes ──────────────────────────────────────────────────────────────
BLUE    := \033[0;34m
GREEN   := \033[0;32m
YELLOW  := \033[1;33m
RED     := \033[0;31m
BOLD    := \033[1m
RESET   := \033[0m

# ============================================================================
# Install & Build
# ============================================================================

install:
	@echo "$(BLUE)Installing dependencies...$(RESET)"
	pnpm install
	@echo "$(GREEN)✓ Dependencies installed$(RESET)"

build:
	@echo "$(BLUE)Building (API + Web)...$(RESET)"
	pnpm build
	@echo "$(GREEN)✓ Build complete$(RESET)"

dev:
	@echo "$(BLUE)Starting development mode (API + Web, parallel)...$(RESET)"
	pnpm dev

dev-full: infra-up
	@echo "$(BLUE)Starting dev servers (infra already up)...$(RESET)"
	pnpm dev

# ============================================================================
# Test
# ============================================================================

test:
	@echo "$(BLUE)Running test suite...$(RESET)"
	pnpm test
	@echo "$(GREEN)✓ Tests passed$(RESET)"

test-coverage:
	@echo "$(BLUE)Running tests with coverage...$(RESET)"
	pnpm test:coverage
	@echo "$(GREEN)✓ Test coverage report generated$(RESET)"

# ============================================================================
# Lint & Format
# ============================================================================

lint:
	@echo "$(BLUE)Linting TypeScript code (ESLint)...$(RESET)"
	pnpm lint
	@echo "$(GREEN)✓ Lint passed$(RESET)"

fmt:
	@echo "$(BLUE)Formatting code (Prettier)...$(RESET)"
	pnpm format
	@echo "$(GREEN)✓ Code formatted$(RESET)"

fmt-check:
	@echo "$(BLUE)Checking code formatting (Prettier)...$(RESET)"
	pnpm format:check
	@echo "$(GREEN)✓ Format check passed$(RESET)"

typecheck:
	@echo "$(BLUE)Running TypeScript type checks...$(RESET)"
	pnpm db:generate
	pnpm typecheck
	@echo "$(GREEN)✓ Type checks passed$(RESET)"

audit:
	@echo "$(BLUE)Running pnpm security audit...$(RESET)"
	pnpm audit
	@echo "$(GREEN)✓ Security audit complete$(RESET)"

# ============================================================================
# Infrastructure (postgres + redis only)
# ============================================================================

infra-up:
	@echo "$(BLUE)Starting infrastructure (postgres + redis)...$(RESET)"
	pnpm infra:up
	@echo "$(GREEN)✓ Infrastructure up: postgres + redis$(RESET)"

infra-down:
	@echo "$(BLUE)Stopping infrastructure...$(RESET)"
	pnpm infra:down
	@echo "$(GREEN)✓ Infrastructure stopped$(RESET)"

infra-reset:
	@echo "$(YELLOW)Resetting infrastructure (volumes will be destroyed)...$(RESET)"
	pnpm infra:reset
	@echo "$(GREEN)✓ Infrastructure reset$(RESET)"

infra-logs:
	@echo "$(BLUE)Following infrastructure logs (Ctrl-C to stop)...$(RESET)"
	pnpm infra:logs

infra-status:
	@echo "$(BOLD)$(BLUE)Infrastructure Status:$(RESET)"
	docker compose ps postgres redis

# ============================================================================
# Full-Stack (all 4 services via Docker Compose)
# ============================================================================

stack-build:
	@echo "$(BLUE)Building Docker images (api + web)...$(RESET)"
	docker compose build
	@echo "$(GREEN)✓ Docker images built$(RESET)"

stack-up:
	@echo "$(BLUE)Starting full stack (postgres + redis + api + web)...$(RESET)"
	docker compose up -d
	@echo "$(GREEN)✓ Stack up$(RESET)"
	@echo "  Web:  http://localhost:$${WEB_PORT:-5173}"
	@echo "  API:  http://localhost:$${API_PORT:-3001}"

stack-down:
	@echo "$(BLUE)Stopping full stack...$(RESET)"
	docker compose down
	@echo "$(GREEN)✓ Stack stopped$(RESET)"

stack-nuke:
	@echo "$(RED)Nuking stack — all volume data will be destroyed...$(RESET)"
	docker compose down -v
	@echo "$(GREEN)✓ Stack stopped and volumes removed$(RESET)"

stack-logs:
	@echo "$(BLUE)Following full stack logs (Ctrl-C to stop)...$(RESET)"
	docker compose logs -f

stack-status:
	@echo "$(BOLD)$(BLUE)Stack Status:$(RESET)"
	docker compose ps

stack-rebuild:
	@echo "$(YELLOW)Rebuilding Docker images (no cache) and restarting...$(RESET)"
	docker compose down && docker compose build --no-cache && docker compose up -d
	@echo "$(GREEN)✓ Stack rebuilt and restarted$(RESET)"

# ============================================================================
# Database
# ============================================================================

db-migrate:
	@echo "$(BLUE)Running database migrations (dev)...$(RESET)"
	pnpm db:migrate
	@echo "$(GREEN)✓ Database migrations applied$(RESET)"

db-migrate-deploy:
	@echo "$(BLUE)Deploying database migrations (production-style)...$(RESET)"
	pnpm db:migrate:deploy
	@echo "$(GREEN)✓ Database migrations deployed$(RESET)"

db-generate:
	@echo "$(BLUE)Generating Prisma client...$(RESET)"
	pnpm db:generate
	@echo "$(GREEN)✓ Prisma client generated$(RESET)"

db-seed:
	@echo "$(BLUE)Seeding database...$(RESET)"
	pnpm db:seed
	@echo "$(GREEN)✓ Database seeded$(RESET)"

db-reset:
	@echo "$(YELLOW)Resetting database (all data will be lost)...$(RESET)"
	pnpm db:reset
	@echo "$(GREEN)✓ Database reset complete$(RESET)"

db-studio:
	@echo "$(BLUE)Opening Prisma Studio...$(RESET)"
	pnpm db:studio

# ============================================================================
# Clean & CI
# ============================================================================

clean:
	@echo "$(BLUE)Cleaning build artifacts...$(RESET)"
	@rm -rf apps/api/dist apps/web/dist 2>/dev/null || true
	@echo "$(GREEN)✓ Artifacts cleaned$(RESET)"

ci: fmt-check lint typecheck test build
	@echo "$(GREEN)$(BOLD)✓ CI pipeline passed$(RESET)"
