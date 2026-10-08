// Standalone test for the downline traversal (no test framework in repo).
// Run: npx tsx scripts/test-team-tree.mts
import { visibleChildren } from '../src/lib/team-tree.ts'

interface A { agentCode: string; recruiterId: string | null; status: 'ACTIVE' | 'INACTIVE' }

let failures = 0
const check = (label: string, got: string[], want: string[]) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? '✅' : '❌'} ${label}\n     got  [${got}]\n     want [${want}]`)
}

const build = (rows: A[]) => {
  const m = new Map<string, A[]>()
  for (const a of rows) if (a.recruiterId) m.set(a.recruiterId, [...(m.get(a.recruiterId) ?? []), a])
  return m
}
const codes = (xs: A[]) => xs.map(x => x.agentCode)
const run = (rows: A[], root: string, includeInactive: boolean) =>
  codes(visibleChildren(root, build(rows), a => a.agentCode, a => includeInactive || a.status !== 'INACTIVE'))

// The reported scenario: Mercedes (D2161) -> Mya (INACTIVE) -> Kyra + others.
const reported: A[] = [
  { agentCode: 'MYA',   recruiterId: 'D2161', status: 'INACTIVE' },
  { agentCode: 'KAT',   recruiterId: 'D2161', status: 'INACTIVE' },
  { agentCode: 'KYRA',  recruiterId: 'MYA',   status: 'ACTIVE'   },
  { agentCode: 'BOB',   recruiterId: 'MYA',   status: 'ACTIVE'   },
  { agentCode: 'CARA',  recruiterId: 'KAT',   status: 'ACTIVE'   },
  { agentCode: 'DIRECT',recruiterId: 'D2161', status: 'ACTIVE'   },
]
check(
  'active agents under an INACTIVE recruiter are spliced up (the bug)',
  run(reported, 'D2161', false),
  ['KYRA', 'BOB', 'CARA', 'DIRECT'],
)
check(
  'full-team view still shows the inactive agents themselves',
  run(reported, 'D2161', true),
  ['MYA', 'KAT', 'DIRECT'],
)

// Two inactive levels stacked: must splice all the way through.
const nested: A[] = [
  { agentCode: 'L1', recruiterId: 'ROOT', status: 'INACTIVE' },
  { agentCode: 'L2', recruiterId: 'L1',   status: 'INACTIVE' },
  { agentCode: 'L3', recruiterId: 'L2',   status: 'ACTIVE'   },
]
check('splices through two stacked inactive levels', run(nested, 'ROOT', false), ['L3'])

// An inactive leaf contributes nothing.
check('inactive leaf with no children disappears cleanly',
  run([{ agentCode: 'X', recruiterId: 'ROOT', status: 'INACTIVE' }], 'ROOT', false), [])

// Malformed recruiterId cycle must terminate, not hang.
const cyclic: A[] = [
  { agentCode: 'A', recruiterId: 'B',    status: 'INACTIVE' },
  { agentCode: 'B', recruiterId: 'A',    status: 'INACTIVE' },
  { agentCode: 'C', recruiterId: 'ROOT', status: 'INACTIVE' },
  { agentCode: 'A2', recruiterId: 'C',   status: 'ACTIVE'   },
]
check('recruiter cycle terminates', run(cyclic, 'ROOT', false), ['A2'])

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
