# Browser tests (Playwright)

Run with `npm run test:e2e`. They use the Chrome installed on this computer,
in a desktop window and a phone-sized one, against the dev server
(started automatically if it isn't running). To test the live site instead:

    E2E_BASE_URL=https://www.iloilorental.com npm run test:e2e

`public-site.spec.ts` needs nothing else.

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
