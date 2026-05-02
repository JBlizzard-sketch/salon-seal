# SalonSeal

> The operating system for Nairobi's beauty industry — no-show prevention, deposit collection, and salon management in one platform.

---

## Problem

Nairobi salons book 20+ appointments on a Saturday. Six don't show. The stylist sits idle, the slot is lost, revenue is gone. The current "solution" is an angry WhatsApp message that achieves nothing. Salons have no leverage because they took no deposit, have no system, and can't enforce anything.

**SalonSeal** fixes this with a small Mpesa deposit at booking time, forfeited on no-show.

---

## What It Does

- **Personalised booking link** — every salon gets `salonlink.co.ke/<salon-slug>`. Clients open it, pick a service and time, pay a Ksh 200–500 deposit via Mpesa STK push, get a WhatsApp confirmation.
- **Auto-reminders** — WhatsApp reminder 2 hours before every appointment.
- **Smart cancellation** — configurable refund window per salon. Cancel in time → auto Mpesa refund. No-show → deposit stays with the salon.
- **Salon dashboard** — mobile-first view of all bookings, deposit status, and daily earnings.
- **Built-in CRM** — repeat clients, visit history, spending patterns, no-show rate — all automatic.
- **Analytics** — peak booking days, most popular services, staff performance, weekly revenue trend.
- **Platform revenue** — 2.5% platform fee on every deposit transaction.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| UI Components | shadcn/ui + Tailwind CSS |
| State & Data | TanStack React Query |
| Routing | Wouter |
| Backend API | Express 5 + Node.js 24 |
| Database | PostgreSQL (Drizzle ORM) |
| Validation | Zod v4 |
| API Contract | OpenAPI 3.1 (Orval codegen) |
| Logging | Pino + pino-http |
| Build | esbuild (server), Vite (client) |
| Package Manager | pnpm workspaces (monorepo) |
| Payments | Mpesa Daraja API (STK Push + B2C) |
| Messaging | WhatsApp Business API |

---

## Project Structure

```
salon-seal/
├── artifacts/
│   ├── api-server/          # Express 5 REST API
│   │   └── src/
│   │       ├── routes/      # Route handlers by domain
│   │       └── lib/         # Shared server utilities
│   └── salon-seal/          # React + Vite frontend
│       └── src/
│           ├── pages/       # Route-level page components
│           └── components/  # Shared UI components
├── lib/
│   ├── api-spec/            # OpenAPI spec (source of truth)
│   │   └── openapi.yaml
│   ├── api-client-react/    # Generated React Query hooks
│   ├── api-zod/             # Generated Zod validation schemas
│   └── db/                  # Drizzle ORM schema + client
│       └── src/schema/
└── scripts/                 # Utility scripts
```

---

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm 9+
- PostgreSQL (or use Replit's built-in DB)

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Express session secret (min 32 chars) |
| `MPESA_CONSUMER_KEY` | Safaricom Daraja API consumer key |
| `MPESA_CONSUMER_SECRET` | Safaricom Daraja API consumer secret |
| `MPESA_SHORTCODE` | Mpesa till/paybill number |
| `MPESA_PASSKEY` | Mpesa STK push passkey |
| `MPESA_CALLBACK_URL` | Public URL for Mpesa payment callbacks |
| `WHATSAPP_API_TOKEN` | WhatsApp Business API token |
| `WHATSAPP_PHONE_ID` | WhatsApp Business phone number ID |

### Install & Run

```bash
# Install all dependencies
pnpm install

# Push database schema
pnpm --filter @workspace/db run push

# Run API server (dev)
pnpm --filter @workspace/api-server run dev

# Run frontend (dev)
pnpm --filter @workspace/salon-seal run dev
```

### Regenerate API types after spec changes

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## API Overview

Base URL: `/api`

| Method | Path | Description |
|---|---|---|
| `GET` | `/salons` | List all salons |
| `POST` | `/salons` | Create a salon |
| `GET` | `/salons/:id` | Get salon by ID |
| `PATCH` | `/salons/:id` | Update salon settings |
| `GET` | `/salons/by-slug/:slug` | Public booking page data |
| `GET` | `/salons/:id/services` | List services |
| `POST` | `/salons/:id/services` | Add a service |
| `GET` | `/salons/:id/staff` | List staff members |
| `POST` | `/salons/:id/staff` | Add a staff member |
| `GET` | `/bookings` | List bookings (filterable) |
| `POST` | `/bookings` | Create booking (client-facing) |
| `PATCH` | `/bookings/:id/status` | Mark arrived / no-show / completed |
| `POST` | `/bookings/:id/cancel` | Cancel + auto-refund check |
| `GET` | `/salons/:id/clients` | CRM client list |
| `GET` | `/salons/:id/dashboard` | Dashboard summary |
| `GET` | `/salons/:id/analytics` | Analytics data |
| `GET` | `/salons/:id/recent-activity` | Activity feed |

Full spec: [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml)

---

## Roadmap

| Phase | Feature | Status |
|---|---|---|
| 1 | Salon onboarding & profile | ✅ Built |
| 2 | Client booking flow | ✅ Built |
| 3 | Mpesa STK push integration | 🔧 In progress |
| 4 | Salon dashboard (core) | ✅ Built |
| 5 | Automated WhatsApp reminders | 📋 Planned |
| 6 | Cancellation & refund engine | 📋 Planned |
| 7 | No-show & payout flow | 📋 Planned |
| 8 | Client CRM | ✅ Built |
| 9 | Staff scheduling view | 📋 Planned |
| 10 | Analytics dashboard | ✅ Built |
| 11 | Waitlist feature | 📋 Planned |
| 12 | Post-visit review requests | 📋 Planned |
| 13 | Loyalty points system | 📋 Planned |
| 14 | Bulk SMS/WhatsApp marketing | 📋 Planned |
| 15 | Referral network feature | 📋 Planned |
| 16 | WhatsApp-native salon management | 📋 Planned |
| 17 | Multi-branch & chain support | 📋 Planned |
| 18 | Salon discovery marketplace | 📋 Planned |
| 19 | Monetisation tiers | 📋 Planned |
| 20 | Platform operations & admin | 📋 Planned |

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes following conventional commits
4. Open a pull request against `main`

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

*Built for the Nairobi beauty market. Every salon deserves a system.*
