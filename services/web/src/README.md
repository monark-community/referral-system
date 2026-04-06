# /services/web/src

> Main source tree for the web frontend.

- **Scope**: Pages, UI components, providers, hooks, and API clients.
- **Purpose**: Organizes frontend code so new engineers can quickly trace UI -> state -> API calls.

## Key Paths

- [app/](app/) - Route pages and route-specific wrappers.
  - [app/referrals/welcome/page.tsx](app/referrals/welcome/page.tsx) - Landing + auth entry.
  - [app/referrals/terms/page.tsx](app/referrals/terms/page.tsx) - Terms flow for authenticated/unauthenticated users.
  - [app/referrals/profile/page.tsx](app/referrals/profile/page.tsx) - Profile editing and verification status.
  - [app/referrals/rewards/page.tsx](app/referrals/rewards/page.tsx) - Milestone rewards view.
- [components/](components/) - Reusable UI grouped by feature.
  - [components/layout/responsive-shell.tsx](components/layout/responsive-shell.tsx)
  - [components/referral/referral-link-card.tsx](components/referral/referral-link-card.tsx)
  - [components/onboarding/steps/wallet-connect-step.tsx](components/onboarding/steps/wallet-connect-step.tsx)
- [contexts/auth-context.tsx](contexts/auth-context.tsx) - Global user/token context.
- [hooks/use-onboarding.ts](hooks/use-onboarding.ts) - Onboarding state machine.
- [lib/api/client.ts](lib/api/client.ts) - Base API transport and error handling.
- [lib/api/user.ts](lib/api/user.ts) - User/referral API methods.
- [providers/query-provider.tsx](providers/query-provider.tsx) - React Query provider.
- [providers/wagmi-provider.tsx](providers/wagmi-provider.tsx) - Wallet/chain provider.
