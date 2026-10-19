// npm run test:db — runs every database test in tests/database against the
// linked Supabase project (each file rolls itself back, so no data changes)
// and prints PASS/FAIL per check. Needs the Supabase CLI, logged in and linked.
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'tests/database'
let passed = 0
let failed = 0

for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  let out
  try {
    out = execFileSync('supabase', ['db', 'query', '--linked', '-f', join(dir, file)], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    console.log(`✗ ${file}: could not run (${String(err.stderr || err.message).split('\n')[0]})`)
    failed++
    continue
  }
  let rows = []
  try {
    rows = JSON.parse(out.slice(out.indexOf('{'))).rows || []
  } catch {
    console.log(`✗ ${file}: unexpected output`)
    failed++
    continue
  }
  const results = rows.map((r) => ({ ok: r.result === 'PASS' || r.ok === true, test: r.test, detail: r.detail }))
  const bad = results.filter((r) => !r.ok)
  passed += results.length - bad.length
  failed += bad.length
  console.log(`${bad.length ? '✗' : '✓'} ${file}: ${results.length - bad.length}/${results.length}`)
  for (const r of bad) console.log(`    FAIL ${r.test} — ${r.detail}`)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
