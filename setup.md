# Reffinity Setup Guide

All commands run from the project root: `c:\Users\User\Documents\referral-system`

---

## Quick Start

```bash
# 1. Install all dependencies
npm install                  # Install root dependencies (concurrently)
npm run install:all          # Install API and Web dependencies

# 2. Setup database (requires PostgreSQL running)
npm run db:migrate           # Run Prisma migrations

# 3. Start development servers
npm run dev                  # Starts both API (3001) and Web (3000)
```

---

## Individual Commands

### Setup Smart Contracts 

| Command | Description |
|---------|-------------|
| `cd packages/common/contracts` | Navigate to the contracts directory |
| `npm install` | install dependencies |
| `npx hardhat compile` | compile hardhat contracts |
| `npx hardhat node` | spin up a local node |
| `npx hardhat run scripts/deploy.js` | deploy the smart contract to the local node |
| `npm build` | builds the ABI functions to be used |
| `cd packages/common/blockchain-connector` | Navigate to the blockchain-connector directory |
| `npm install` | install dependencies |
| `npm build` | builds the blockchain helper files to be used in the app |

### Installation

| Command | Description |
|---------|-------------|
| `npm install` | Install root package dependencies |
| `npm run install:all` | Install both API and Web dependencies |
| `cd services/api && npm install` | Install only API dependencies |
| `cd services/web && npm install` | Install only Web dependencies |

### Running Servers

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both API and Web servers |
| `npm run dev:api` | Start only the API server (port 3001) |
| `npm run dev:web` | Start only the Web server (port 3000) |

### Database

| Command | Description |
|---------|-------------|
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:generate` | Regenerate Prisma client |
| `cd services/api && npx prisma studio` | Open visual database browser (port 5555) |
| `cd services/api && npx prisma migrate dev` | Create new migration |
| `cd services/api && npx prisma db push` | Push schema changes without migration |

### Docker (Optional)

| Command | Description |
|---------|-------------|
| `docker-compose up -d` | Start PostgreSQL container |
| `docker-compose down` | Stop PostgreSQL container |
| `docker-compose logs postgres` | View PostgreSQL logs |

---

## Database Access

### Option 1: Prisma Studio (Recommended)
```bash
cd services/api
npx prisma studio
```
Opens at http://localhost:5555 - visual UI to browse/edit data.

### Option 2: psql Command Line
```bash
psql -U reffinity -d reffinity -h localhost
# Password: reffinity_dev
```

Common SQL queries:
```sql
SELECT * FROM users;                    -- View all users
SELECT * FROM users WHERE email IS NOT NULL;  -- Users with email
\dt                                     -- List all tables
\d users                                -- Describe users table
\q                                      -- Quit psql
```

---

## Environment Files

| File | Purpose |
|------|---------|
| `services/api/.env` | API environment variables |
| `services/web/.env.local` | Web environment variables |

### API Environment Variables
```env
PORT=3001
DATABASE_URL=postgresql://reffinity:reffinity_dev@localhost:5432/reffinity
JWT_SECRET=your-secret-key
FRONTEND_URL=http://localhost:3000
```

### Web Environment Variables
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## URLs

| Service | URL |
|---------|-----|
| Web App | http://localhost:3000 |
| API | http://localhost:3001 |
| API Health Check | http://localhost:3001/health |
| Prisma Studio | http://localhost:5555 |

---

## Testing the Flow

1. Go to http://localhost:3000/referrals/welcome
2. Click "Join the Program"
3. Accept terms, click "Continue"
4. Connect MetaMask wallet
5. Sign the authentication message
6. Fill in profile (name, email)
7. Check API terminal for email verification link
8. Complete flow -> Dashboard

---

## Troubleshooting

### "Connection refused" on localhost:3000
- Servers not running. Run `npm run dev`

### Database connection error
- Check PostgreSQL is running
- Verify `DATABASE_URL` in `services/api/.env`

### Prisma errors
- Run `npm run db:generate` to regenerate client
- Run `npm run db:migrate` to apply migrations

### MetaMask not connecting
- Make sure MetaMask extension is installed
- Check you're on the correct network (Sepolia for testnet)
