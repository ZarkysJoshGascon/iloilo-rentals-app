# Tests

Every test lives here, one folder per kind:

| Folder | What it checks | Run |
|---|---|---|
| `unit/` | Logic and screen pieces, in a simulated browser. Laid out like `src/` (e.g. `unit/lib/domain/accounting.test.ts` tests `src/lib/domain/accounting.ts`); `unit/functions/` holds the Edge Functions' plain-JS parts. Supabase is faked, nothing leaves the machine. | `npm test` |
| `integration/` | The live backend as a signed-out visitor: every table, function and Edge Function the app calls exists, and what visitors can't see. Read-only. | `npm run test:integration` |
| `e2e/` | The real site in Chrome, Firefox and iPhone Safari: pages, accessibility, speed, photos, and the CRM once signed in. See `e2e/README.md`. | `npm run test:e2e` |
| `database/` | Database rules, money adding up, access by role, storage, close-out. Each file runs in a transaction that is rolled back, so it changes nothing. | `npm run test:db` |

`unit/setup.ts` runs before every unit test; `unit/supabaseMock.ts` is the fake
Supabase client (`vi.mock('@/lib/supabase', () => import('<path>/supabaseMock'))`).

New tests go in the matching folder here, never next to the code in `src/`.

## Other checks

    npm run test:coverage   unit tests, plus how much of the code they run
    npm run typecheck       the app and these tests (tests/tsconfig.json)
    npm run lint

Coverage covers the rules, the data layer, the hooks and the Edge Functions'
plain-JS parts; pages are covered by the browser tests. The report opens from
`coverage/index.html`. The minimums are set in `vitest.config.ts`: raise
them as coverage grows, never lower them to get a change through.

On GitHub, `.github/workflows/tests.yml` runs lint, types, unit tests with
coverage, the build, the integration tests and the browser tests on every push
to `main` and every pull request. The database tests stay on this computer:
they need the Supabase access token.

## How the tests are written

- **One behaviour per test, named for what a person sees**: "an approved
  cleaning can't be changed", not "test submit 3".
- **Same answer on every computer.** Unit tests run in Manila time
  (`vitest.config.ts`); a test about time uses fake timers or
  `page.clock`. Browser tests never sleep to wait for the page: they wait for
  what should appear, or retry a check with `expect.poll` until it passes or
  time runs out. (The one pause is a long-press, where holding is the gesture.)
- **Made-up data from factories** (`unit/factories.ts`, `e2e/support/*Fixture.ts`),
  with figures you can check by hand. Never the live data.
- **Exact expectations.** An access test expects Postgres's "permission
  denied" (`42501`), not just "some error", so a typo in a table name can't
  pass for a locked door.
- **Fakes at the edge only.** Unit tests fake Supabase; browser tests fake its
  network replies. Everything in between is the real code.
- **A test must be able to fail.** When adding one, break the code it guards
  for a moment and watch it fail.
