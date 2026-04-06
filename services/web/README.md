# /services/web

> Next.js frontend for the referral program.

- **Scope**: User-facing pages, onboarding flow, wallet interactions, and dashboard UI.
- **Purpose**: Lets users join/login with wallet auth, complete onboarding, and manage referrals/rewards.

## Notes

- Uses App Router (Next.js) with route groups under [src/app/](src/app/).
- Uses wallet + chain tooling through Wagmi in [src/lib/wagmi/config.ts](src/lib/wagmi/config.ts).
- API calls are centralized in [src/lib/api/](src/lib/api/).

## Content

- [package.json](package.json) - Web app scripts and dependencies.
- [next.config.ts](next.config.ts) - Build aliases and standalone output settings.
- [tailwind.config.ts](tailwind.config.ts) - Design tokens/theme mapping.
- [src/README.md](src/README.md) - Detailed source navigation.
- [src/app/layout.tsx](src/app/layout.tsx) - Root layout and global providers.
- [src/app/referrals/welcome/page.tsx](src/app/referrals/welcome/page.tsx) - Entry landing page.
- [src/app/referrals/page.tsx](src/app/referrals/page.tsx) - Main referral dashboard.
- [src/components/onboarding/onboarding-modal.tsx](src/components/onboarding/onboarding-modal.tsx) - Multi-step onboarding flow.
- [src/contexts/auth-context.tsx](src/contexts/auth-context.tsx) - Auth state and JWT session handling.
