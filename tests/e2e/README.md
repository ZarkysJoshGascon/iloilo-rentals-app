# Browser tests (Playwright)

Run with `npm run test:e2e`. They use the Chrome installed on this computer,
in a desktop window and a phone-sized one, against the dev server
(started automatically if it isn't running). To test the live site instead:

    E2E_BASE_URL=https://www.iloilorental.com npm run test:e2e

`public-site.spec.ts` needs nothing else.

## What each file checks

- `public-site.spec.ts`: public pages load without errors, navigation, phone
  layout, workspaces closed when signed out. Also runs in Firefox and in
  WebKit (Safari's engine) on an iPhone-sized screen. Install those once with
  `npx playwright install firefox webkit`.
- `accessibility.spec.ts`: every public page scanned for serious WCAG 2.1
  problems (contrast, labels, names for buttons and links).
- `smoke.spec.ts`: the quick check to run after every deploy: every page opens
  directly with a title, no broken files, the database answers, robots.txt and
  the sitemap. On the live site it also checks the www redirect, security
  headers and long-term caching of built files:

      E2E_BASE_URL=https://www.iloilorental.com npx playwright test smoke

- `performance.spec.ts`: download size and time until each page shows, on a
  phone over a slow mobile connection. Only meaningful on a production build
  or the live site, so it skips otherwise:

      npx vite build && npx vite preview --port 4173
      E2E_BASE_URL=http://localhost:4173 npx playwright test performance --project=phone

- `crm.spec.ts`: the CRM, read-only. Needs a saved sign-in (below).

## Signing in for the CRM tests

`crm.spec.ts` needs a signed-in admin. Sign-in is Google only, so you sign in
once by hand and Playwright keeps the session:

    npx playwright open --channel=chrome --save-storage=tests/e2e/.auth/admin.json http://localhost:5173/login

Sign in with Google in the window that opens, wait for the CRM to load, then
close the window. The session is saved to `tests/e2e/.auth/admin.json`, which
git ignores — it is a login, keep it private. Use a test account if you can,
not your everyday one. Delete the file to sign the tests out.

The CRM tests are read-only: they open pages, menus and the campaign preview,
and never save, send or delete anything.
