// Standalone test for resolveTrainingStart (no test framework in repo).
// Run: npx tsx scripts/test-training-date.mts
import { resolveTrainingStart } from '../src/lib/training-date.ts'

let failures = 0
function check(label: string, got: string, want: string) {
  const ok = got === want
  if (!ok) failures++
  console.log(`${ok ? '✅' : '❌'} ${label}\n     got  ${got}\n     want ${want}`)
}

// Format an instant as its ET wall-clock for readable assertions.
function et(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(d)
}

// The reported bug: "EVERY TUESDAY 7:00 PM" parsed on Sat Aug 1 2026.
// Model wrongly returned Wed Aug 5; correct is Tue Aug 4.
const satAug1 = new Date('2026-08-01T15:08:00-04:00') // 11:08 AM ET Saturday
check(
  'weekday-only Tuesday from Sat Aug 1 → next Tue Aug 4 (not the model Aug 5)',
  et(resolveTrainingStart({
    startsAtET: '2026-08-05T19:00:00-04:00', // model's WRONG date, right time
    dayOfWeekET: 'Tuesday', hasExplicitDate: false, now: satAug1,
  })),
  'Tue, Aug 04, 2026, 07:00 PM',
)

// The Friday sibling the model got right — must stay Aug 7.
check(
  'weekday-only Friday from Sat Aug 1 → Fri Aug 7',
  et(resolveTrainingStart({
    startsAtET: '2026-08-07T15:00:00-04:00',
    dayOfWeekET: 'Friday', hasExplicitDate: false, now: satAug1,
  })),
  'Fri, Aug 07, 2026, 03:00 PM',
)

// Explicit printed date → trust the model verbatim, no recompute.
check(
  'explicit date is trusted as-is',
  et(resolveTrainingStart({
    startsAtET: '2026-04-13T20:00:00-04:00',
    dayOfWeekET: 'Monday', hasExplicitDate: true, now: satAug1,
  })),
  'Mon, Apr 13, 2026, 08:00 PM',
)

// No weekday given → fall back to model date.
check(
  'no dayOfWeekET → model date preserved',
  et(resolveTrainingStart({
    startsAtET: '2026-08-05T19:00:00-04:00', dayOfWeekET: null, now: satAug1,
  })),
  'Wed, Aug 05, 2026, 07:00 PM',
)

// "Today is the day, time not yet passed" → today, not +7.
const tueAug4Morning = new Date('2026-08-04T13:00:00-04:00') // 9 AM ET Tuesday
check(
  'today-is-target, time not passed → today',
  et(resolveTrainingStart({
    startsAtET: '2026-08-04T19:00:00-04:00',
    dayOfWeekET: 'Tuesday', hasExplicitDate: false, now: tueAug4Morning,
  })),
  'Tue, Aug 04, 2026, 07:00 PM',
)

// "Today is the day, time already passed" → next week.
const tueAug4Evening = new Date('2026-08-04T23:30:00-04:00') // 7:30 PM ET Tuesday
check(
  'today-is-target, time passed → next week',
  et(resolveTrainingStart({
    startsAtET: '2026-08-04T19:00:00-04:00',
    dayOfWeekET: 'Tuesday', hasExplicitDate: false, now: tueAug4Evening,
  })),
  'Tue, Aug 11, 2026, 07:00 PM',
)

// Standard time (EST, -05:00): a Monday in January.
const friJan2 = new Date('2026-01-02T17:00:00-05:00') // noon ET Friday
check(
  'EST winter: Monday keeps 7 PM wall-clock',
  et(resolveTrainingStart({
    startsAtET: '2026-01-06T19:00:00-05:00', // wrong-ish date, EST offset
    dayOfWeekET: 'Monday', hasExplicitDate: false, now: friJan2,
  })),
  'Mon, Jan 05, 2026, 07:00 PM',
)

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
