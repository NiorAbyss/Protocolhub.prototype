# ProtocolHub

## Overview

ProtocolHub is a decentralized terminal application built for the Solana ecosystem, designed to provide institutional-grade analytics and tracking tools. The platform focuses on Real-World Asset (RWA) monitoring, whale intelligence, and liquidity flow analysis. It features a futuristic HUD-style interface with multiple panel views for exploring on-chain data, connecting wallets, and accessing protocol information.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite with custom configuration
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack Query for server state, React useState/useEffect for local state
- **Styling**: Tailwind CSS with custom design system based on shadcn/ui components
- **UI Components**: Radix UI primitives with custom styling (new-york shadcn variant)
- **Animations**: Framer Motion for transitions and micro-interactions
- **Design Theme**: Dark terminal/HUD aesthetic with cyan accent colors and monospace typography (Geist font family)

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ESM modules
- **API Style**: REST endpoints defined in shared route definitions
- **Build Process**: Custom esbuild script for production bundling with selective dependency bundling for cold start optimization

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: PostgreSQL (connection via DATABASE_URL environment variable)
- **Schema Location**: `shared/schema.ts` with Zod integration via drizzle-zod
- **Migrations**: Drizzle Kit with migrations output to `./migrations`

### Shared Code Architecture
- **Route Definitions**: Centralized API contracts in `shared/routes.ts` with Zod schemas for request/response validation
- **Schema Definitions**: Database tables and TypeScript types in `shared/schema.ts`
- **Path Aliases**: `@/` maps to client source, `@shared/` maps to shared directory

### Key Design Patterns
- **Storage Pattern**: Interface-based storage abstraction (`IStorage`) with `DatabaseStorage` implementation for easy testing/swapping
- **API Contract Pattern**: Shared route definitions ensure type safety between frontend and backend
- **Component Structure**: HUD panels as separate components (`AboutPanel`, `ConnectPanel`, `ExplorePanel`, etc.) wrapped by `PanelWrapper` for consistent modal behavior

### Development vs Production
- **Development**: Vite dev server with HMR, proxied through Express
- **Production**: Static file serving from `dist/public`, bundled server code

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connected via `pg` pool with Drizzle ORM
- **Session Storage**: `connect-pg-simple` for PostgreSQL-backed sessions

### External APIs (Referenced in Code)
- **Birdeye**: On-chain Solana analytics (referenced in components)
- **DexScreener**: DEX trading data
- **Helius**: Solana RPC and data services
- **CoinGecko**: Cryptocurrency market data

### Blockchain
- **Solana**: Target blockchain ecosystem (wallet connection placeholder in ConnectPanel)

### Third-Party UI Libraries
- **Radix UI**: Complete primitive component library for accessible UI elements
- **Embla Carousel**: Carousel functionality
- **cmdk**: Command palette component
- **Vaul**: Drawer component
- **react-day-picker**: Calendar/date picker
- **Recharts**: Charting library (via chart component)

### Build/Dev Tools
- **Replit Plugins**: `@replit/vite-plugin-runtime-error-modal`, `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner` for enhanced Replit development experience