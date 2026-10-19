// Shared by the integration tests: the live project's address and public
// key (from .env, as the app uses them), and a scan of the app's source for
// every table, database function and server function it calls.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL
export const ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error('Integration tests need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
}

export const anonHeaders = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sourceFiles(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !p.includes(`${join('src', 'test')}`)) out.push(p)
  }
  return out
}

export type Rpc = { name: string; params: string[]; files: string[] }

// The keys of an object literal that starts just before `from`, skipping
// anything nested inside it: `{ p_a: f(x), p_b: y ? {} : z }` → [p_a, p_b].
function topLevelKeys(src: string, from: number): string[] {
  const keys: string[] = []
  let depth = 0
  let token = ''
  let expectingKey = true
  for (let i = from; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === '}') {
      if (depth === 0) break
      depth--
    } else if (depth === 0 && ch === ':' && expectingKey) {
      keys.push(token.trim())
      expectingKey = false
    } else if (depth === 0 && ch === ',') {
      if (expectingKey && /^[a-z_][a-z0-9_]*$/.test(token.trim())) keys.push(token.trim()) // shorthand { p_x }
      token = ''
      expectingKey = true
      continue
    }
    if (depth === 0 && expectingKey) token += ch
  }
  if (expectingKey && /^[a-z_][a-z0-9_]*$/.test(token.trim())) keys.push(token.trim())
  return keys.filter((k) => /^[a-z_][a-z0-9_]*$/.test(k))
}

/** Every table, database function (with the parameter names passed) and server function the app calls. */
export function appBackendRefs(root = 'src') {
  const tables = new Map<string, Set<string>>()
  const rpcs = new Map<string, Rpc>()
  const functions = new Map<string, Set<string>>()

  for (const file of sourceFiles(root)) {
    // Comments out first (a `// …` line would swallow the rest once the file
    // is flattened); `https://` in strings has no space before its slashes.
    const src = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|\s)\/\/.*$/gm, '$1')
    const flat = src.replace(/\s+/g, ' ')

    for (const m of flat.matchAll(/(?<!storage\s?)\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/g)) {
      if (!tables.has(m[1])) tables.set(m[1], new Set())
      tables.get(m[1])!.add(file)
    }
    for (const m of flat.matchAll(/\.rpc\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*(,\s*\{)?/g)) {
      const params = m[2] ? topLevelKeys(flat, m.index! + m[0].length) : []
      const r = rpcs.get(m[1]) || { name: m[1], params, files: [] }
      if (params.length > r.params.length) r.params = params
      r.files.push(file)
      rpcs.set(m[1], r)
    }
    for (const m of flat.matchAll(/functions\/v1\/([a-z0-9-]+)|functions\.invoke\(\s*['"]([a-z0-9-]+)['"]/g)) {
      const name = m[1] || m[2]
      if (!functions.has(name)) functions.set(name, new Set())
      functions.get(name)!.add(file)
    }
  }
  return { tables, rpcs, functions }
}
