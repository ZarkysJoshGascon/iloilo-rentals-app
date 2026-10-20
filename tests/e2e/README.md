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
- `owner-portal.spec.ts`: the owner portal as an owner sees it: the share
  for the year and each unit, a unit's months and how each was worked out,
  receipts, upcoming stays, the Excel download, the archived notice, loading
  errors, and accessibility. Runs in an American time zone, so dates must
  come out as Manila dates for owners abroad.
- `housekeeper.spec.ts`: the housekeeping page: the task list, adding photos
  from the gallery (turned into JPEGs before upload), submitting a cleaning,
  refusing a file that isn't a photo, approved cleanings locked, accessibility.
- `crm-dropdowns.spec.ts`: the CRM's dropdowns as an admin (made up, on the
  fake backend): a long list opens fully on screen and on top of the form
  it's in, scrolls to its last item, fits above a phone's keyboard, and Esc
  closes it and not the form; select menus inside a filter open above it and
  show names, not ids. In every browser, iPhone Safari included.
- `crm-layout.spec.ts`: every CRM page as a person sees it, on a computer
  and on a phone, with a whole made-up business (`support/crmFixture.ts`:
  long names, real-length codes, enough rows to scroll). For each page, its
  form and the panel a row opens: nothing sticks out past the screen, no code
  is cut short, every list, menu and calendar opens fully on screen and on top
  with its options whole, Esc closes the list and not the form, no field small
  enough for iPhone Safari to zoom in on, and no serious accessibility
  problems (two known ones aside, listed in the spec). How each is measured:
  `support/layout.ts`.
- `photos.spec.ts`: photo preparation in each browser engine: large phone
  photos shrunk, sideways iPhone photos upright, see-through PNGs on white,
  a clear message for HEIC files the browser can't open.
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

- `crm.spec.ts`: the CRM against the real backend, read-only. Needs a saved
  sign-in (below), so it doesn't run on GitHub; `crm-layout` and
  `crm-dropdowns` cover the CRM there, on the fake backend.

## Signed-in pages without touching the live data

The owner portal, housekeeping and CRM layout and dropdown tests sign in as made-up people and answer
every request to Supabase from `support/` instead of the real backend:

- `support/fakeSupabase.ts`: `signInAs(page, user)` puts a session in the
  browser; `fakeBackend(page, user, handlers)` answers database calls,
  storage and Edge Functions, and records every request, so a test can check
  exactly what the page sent (a cleaning really is submitted, to nowhere).
- `support/ownerFixture.ts`, `support/housekeeperFixture.ts`: the made-up
  owner and housekeeper. The owner's figures add up by hand (see the comments
  there), so a test that expects ₱67,802 is checking the page's maths.
- `support/crmFixture.ts`: the made-up business for the CRM tests.
- `support/layout.ts`: what a person would see as broken, measured the way a
  tap lands (sticking out, cut off, under something, codes cut short).
- `support/a11y.ts`: the accessibility check every spec uses.

The clock is fixed in these tests (`page.clock.setFixedTime`), so "this
month" and "upcoming" never drift. Not in `crm-layout`, which opens every
calendar: a frozen clock stalls their fade, so they never finish closing.
Its checks hold on any day. Every browser runs in Manila time
(`playwright.config.ts`) unless a test says otherwise, here and on GitHub.

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
