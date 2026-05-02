# SalonSeal

No-show deposit and booking system for Nairobi salons/barbershops.

## Stack

- **Monorepo**: pnpm workspaces, TypeScript 5.9, Node.js 24
- **Frontend**: React 18 + Vite + Tailwind v4 + Wouter + TanStack Query
- **Backend**: Express 5 + Drizzle ORM + PostgreSQL
- **Validation**: Zod v4 + Orval codegen from OpenAPI spec
- **Build**: esbuild (API server)
- **Theme**: Terracotta/amber warm palette

## Artifacts

| Artifact | Path | Description |
|----------|------|-------------|
| `salon-seal` | `/` | Main dashboard + public booking wizard |
| `api-server` | `/api` | REST API server |

## Key Commands

```bash
# Codegen (after editing lib/api-spec/openapi.yaml)
pnpm --filter @workspace/api-spec run codegen

# Seed database
pnpm --filter @workspace/scripts run seed

# DB schema push (dev)
pnpm --filter @workspace/db run push

# Full typecheck
pnpm run typecheck
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — stats, upcoming appointments, recent activity |
| `/bookings` | All bookings with status filter |
| `/clients` | Client CRM — visits, no-shows, spend |
| `/services` | Service catalogue |
| `/staff` | Staff roster |
| `/analytics` | Charts — weekly revenue, peak days, staff performance, popular services |
| `/settings` | Salon settings |
| `/book/:slug` | Public booking wizard (client-facing) |
| `/salons/new` | New salon onboarding |

## API Routes

All routes prefixed `/api`:

- `GET /healthz`
- `GET/POST /salons`
- `GET/PATCH /salons/:id`
- `GET /salons/by-slug/:slug`
- `GET/POST /salons/:salonId/services`
- `GET/POST /salons/:salonId/staff`
- `GET /salons/:salonId/clients`
- `GET /salons/:salonId/clients/:id`
- `GET /salons/:salonId/dashboard`
- `GET /salons/:salonId/analytics`
- `GET /salons/:salonId/recent-activity`
- `GET/POST /bookings`
- `GET /bookings/:id`
- `PATCH /bookings/:id/status`
- `POST /bookings/:id/cancel`
- `POST /bookings/:id/simulate-payment` ← M-Pesa simulation

## Architecture Notes

- `lib/api-spec/openapi.yaml` is the single source of truth for API contracts
- `lib/api-client-react` — Orval-generated React Query hooks (do not edit manually)
- `lib/api-zod` — Orval-generated Zod schemas (do not edit manually)
- `lib/db` — Drizzle schema + DB instance
- salonId=1 is hardcoded throughout frontend (Lavish Beauty Studio seed)
- Tailwind v4: CSS custom properties must be inside `@layer base` to survive compilation
- Wouter router must NOT use a `base` prop — causes silent route matching failure

## Known Issues / Gotchas

- Tailwind v4 strips `:root {}` blocks outside `@layer base` — always put CSS vars inside `@layer base`
- Wouter `base` prop: leaving it empty string causes all routes to silently fail to match
- `lastVisitAt` in Client schema needs `format: date-time` in OpenAPI spec so Orval generates `coerce.date()` instead of `string()`
- API server timestamp columns return JS `Date` objects from Drizzle; Zod schemas use `coerce.date()` to handle this

## GitHub

Repo: https://github.com/JBlizzard-sketch/salon-seal
Push via GitHub Contents API (git push is blocked in main agent):
```bash
node --input-type=module scripts/src/push-to-github.sh  # won't work — use GitHub API
```
