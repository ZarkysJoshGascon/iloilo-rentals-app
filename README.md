# Iloilo Rentals

The public site (iloilorental.com), the CRM for staff, the owner portal and the
housekeepers' task list, in one React + Vite app on Supabase.

```
npm run dev        # local site at http://localhost:5173
npm run build      # production build
npm run typecheck
npm run lint
```

## Where things go

```
src/
  main.tsx, App.tsx, index.css   entry point, routes, global styles
  pages/          one file per route: public/, admin/, owner/, housekeeper/
  features/       everything that belongs to one part of the app
    admin/
      shell/      around every CRM page: sidebar, sign-in guard, alerts
      <area>/     one folder per CRM page: accounting, bookings, contracts, …
    owner/        owner portal
    housekeeper/  housekeepers' sign-in guard
    public/       public site pieces: walkthroughs, interior stories
  components/     used across the app
    ui/           shadcn building blocks (button, input, select, …)
    crm/          CRM-style blocks the admin, owner and housekeeper portals
                  share: Panel, StatStrip, StatusTabs, DatePicker, list tools
    common/       small shared pieces: Code, toasts, error boundary
    layout/       public site navbar and footer
  lib/
    supabase.ts, utils.ts, …   app-wide basics
    api/          talks to the database, storage or edge functions
    domain/       business rules: accounting, commissions, stays, contracts
  context/  hooks/  styles/  types/
supabase/
  migrations/     applied one file at a time (supabase db query --linked -f …)
  functions/      edge functions
  tests/          SQL checks that run inside a transaction and roll back
```

Rules of thumb:
- Used by one part of the app only: it goes in that part's folder under `features/`.
- Used by several parts: `components/` (screens) or `lib/` (logic).
- Calls Supabase: `lib/api/`. Pure rules with no network: `lib/domain/`.
- Import with the `@/` alias (`@/lib/api/staff`); `./file` only within the same folder.
