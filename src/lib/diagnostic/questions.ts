// The AFF Success Diagnostic question bank.
//
// This is AFF's own behavioral assessment, structured as 10 modules of 12
// items each (120 scored items). Each module blends three item types so the
// score reflects behavior, not just self-image:
//   - scale:     7-point agreement (1 Strongly Disagree .. 7 Strongly Agree).
//                Some items are `reverse` scored (agreeing is the weak answer)
//                and double as the honesty / consistency check.
//   - choice:    "which describes you best" with a weight per option (0..1).
//   - frequency: "in the last 7 days, how many times did you ___" mapped to a
//                fixed 5-bucket scale (0 .. 7+ times) so recent action counts.
//
// The question wording, module names, weights, and reverse flags live here as
// the single source of truth so the taker UI, the scoring, and the stored
// record can never drift. House rule: no em-dashes in user-visible text.
//
// NOTE ON NAMING: the recruiting module is deliberately surfaced to users as
// "Building Capacity" (positive, growth framing), not "Recruiting". The key
// stays `building` everywhere.

export const DIAGNOSTIC_VERSION = 1

export type ModuleKey =
  | 'self_awareness'
  | 'resilience'
  | 'discipline'
  | 'identity'
  | 'building'
  | 'conversion'
  | 'network'
  | 'pressure'
  | 'mission'
  | 'leadership'

export interface ModuleMeta {
  key: ModuleKey
  order: number
  name: string        // user-facing module name
  blurb: string       // one-line description shown on the results page
  coachingTip: string // what a trainer should work on when this is the gap
}

// Order is the order questions are presented and modules are listed.
export const MODULES: ModuleMeta[] = [
  { key: 'self_awareness', order: 1, name: 'Self-Awareness & Integrity',
    blurb: 'How clearly you see your own behavior and own your mistakes.',
    coachingTip: 'Build a short daily self-review habit and normalize admitting misses out loud.' },
  { key: 'resilience', order: 2, name: 'Mental Toughness & Resilience',
    blurb: 'How well you keep taking action after rejection or a setback.',
    coachingTip: 'Reframe rejection as data and set an activity floor that holds regardless of results.' },
  { key: 'discipline', order: 3, name: 'Licensing Commitment & Discipline',
    blurb: 'Whether you follow through on the work when it is inconvenient.',
    coachingTip: 'Move to a daily plan and finish one hard task before noon, no urgency required.' },
  { key: 'identity', order: 4, name: 'Entrepreneurial Identity',
    blurb: 'How much you own your outcomes instead of waiting for structure.',
    coachingTip: 'Give ownership of one metric fully to them and remove the safety net gradually.' },
  { key: 'building', order: 5, name: 'Building Capacity',
    blurb: 'How naturally you start new conversations and open opportunities.',
    coachingTip: 'Set a daily new-conversation rep and script the first line so hesitation drops.' },
  { key: 'conversion', order: 6, name: 'Conversion Capacity',
    blurb: 'How comfortably you guide a conversation toward a decision.',
    coachingTip: 'Practice asking the direct question and staying in the pause after it.' },
  { key: 'network', order: 7, name: 'Warm Market & Referral Reach',
    blurb: 'How intentionally you expand your circle and reconnect.',
    coachingTip: 'Reconnect with two dormant contacts a day and ask for one introduction.' },
  { key: 'pressure', order: 8, name: 'Criticism & Pressure Resilience',
    blurb: 'How much outside opinion moves you off your plan.',
    coachingTip: 'Separate opinion from fact in writing and pre-decide the action before feedback lands.' },
  { key: 'mission', order: 9, name: 'Mission Alignment & Conviction',
    blurb: 'How connected your daily work is to a long-term purpose.',
    coachingTip: 'Tie the weekly plan back to their stated why and track progress on slow-burn goals.' },
  { key: 'leadership', order: 10, name: 'Leadership & Coaching',
    blurb: 'How readily you help, guide, and develop other people.',
    coachingTip: 'Give them one person to develop and a simple weekly check-in to run.' },
]

export const MODULE_BY_KEY: Record<ModuleKey, ModuleMeta> =
  Object.fromEntries(MODULES.map(m => [m.key, m])) as Record<ModuleKey, ModuleMeta>

export type QuestionType = 'scale' | 'choice' | 'frequency'

export interface ChoiceOption { label: string; weight: number } // weight 0..1

interface BaseQuestion { key: string; module: ModuleKey; type: QuestionType; text: string }
export interface ScaleQuestion extends BaseQuestion { type: 'scale'; reverse: boolean }
export interface ChoiceQuestion extends BaseQuestion { type: 'choice'; options: ChoiceOption[] }
export interface FrequencyQuestion extends BaseQuestion { type: 'frequency' }
export type Question = ScaleQuestion | ChoiceQuestion | FrequencyQuestion

// The 5 frequency buckets, shown for every `frequency` question. Index 0..4
// normalizes to 0, 25, 50, 75, 100.
export const FREQUENCY_OPTIONS = ['0 times', '1-2 times', '3-4 times', '5-6 times', '7+ times'] as const
export const SCALE_LABELS = { left: 'Strongly disagree', center: 'Neutral', right: 'Strongly agree' } as const
export const SCALE_STEPS = 7

// ---- builders (keep the bank terse + consistent) --------------------------
let _seq = 0
const s = (module: ModuleKey, text: string, reverse = false): ScaleQuestion =>
  ({ key: `${module}_${++_seq}`, module, type: 'scale', text, reverse })
const c = (module: ModuleKey, text: string, options: [string, number][]): ChoiceQuestion =>
  ({ key: `${module}_${++_seq}`, module, type: 'choice', text, options: options.map(([label, weight]) => ({ label, weight })) })
const f = (module: ModuleKey, text: string): FrequencyQuestion =>
  ({ key: `${module}_${++_seq}`, module, type: 'frequency', text })

// ---- the bank: 10 modules x 12 items --------------------------------------
// Question wording is the source diagnostic's verbatim item text (functional
// assessment items). Module names are AFF's own framing (e.g. "Building
// Capacity" for the recruiting module). Reverse flags and choice weights are
// AFF's scoring metadata.
export const QUESTIONS: Question[] = [
  // 1. Self-Awareness & Integrity
  s('self_awareness', 'I fully understand why I react the way I do in different situations.'),
  s('self_awareness', 'I reflect on my actions without making excuses.'),
  s('self_awareness', 'I tend to justify my behavior rather than examine it.', true),
  c('self_awareness', 'Which statement describes you best?', [['I recognize when I’m avoiding accountability', 1], ['I only reflect when prompted', 0.2]]),
  s('self_awareness', 'I am often unaware of my own biases.', true),
  s('self_awareness', 'I can identify when I’m rationalizing a poor decision.'),
  f('self_awareness', 'In the last 7 days, how many times did you reflect on your behavior after a situation?'),
  s('self_awareness', 'I admit when I am wrong without hesitation.'),
  c('self_awareness', 'Which statement describes you best?', [['I actively seek feedback', 1], ['I rely on my own judgment', 0.35]]),
  s('self_awareness', 'I downplay my mistakes to protect my image.', true),
  f('self_awareness', 'In the last 7 days, how many times did you admit you were wrong or take responsibility?'),
  s('self_awareness', 'I avoid thinking deeply about my own behavior.', true),

  // 2. Mental Toughness & Resilience
  s('resilience', 'I continue taking action even after rejection or disappointment.'),
  s('resilience', 'Rejection affects my confidence more than it should.', true),
  f('resilience', 'In the last 7 days, how many times did you take action after experiencing discomfort or rejection?'),
  c('resilience', 'Which statement describes you best?', [['I act despite discouragement', 1], ['I wait until I feel emotionally ready', 0.25]]),
  s('resilience', 'My effort drops after repeated setbacks.', true),
  s('resilience', 'I view rejection as feedback instead of failure.'),
  c('resilience', 'Which statement describes you best?', [['Increase activity', 1], ['Maintain effort', 0.6], ['Pull back', 0.1]]),
  s('resilience', 'I avoid situations where rejection is likely.', true),
  s('resilience', 'I remain emotionally stable under pressure.'),
  c('resilience', 'Which statement describes you best?', [['I stay consistent regardless of results', 1], ['Results strongly affect my effort', 0.3]]),
  f('resilience', 'In the last 7 days, how many times did you recover quickly and continue after a setback?'),
  s('resilience', 'Repeated failure makes me question continuing.', true),

  // 3. Licensing Commitment & Discipline
  s('discipline', 'I follow through even when tasks are inconvenient.'),
  s('discipline', 'I delay important responsibilities without pressure.', true),
  f('discipline', 'In the last 7 days, how many days did you complete a task you didn’t feel like doing?'),
  c('discipline', 'Which statement describes you best?', [['I finish tasks early', 1], ['I usually wait until deadlines approach', 0.3]]),
  s('discipline', 'I rely on urgency to become productive.', true),
  s('discipline', 'I stay focused until tasks are complete.'),
  c('discipline', 'Which statement describes you best?', [['Daily structured plan', 1], ['Flexible structure', 0.55], ['Work in bursts', 0.2]]),
  s('discipline', 'I get distracted during detailed work.', true),
  s('discipline', 'I prioritize long-term results over short-term comfort.'),
  c('discipline', 'Which statement describes you best?', [['I act regardless of mood', 1], ['My mood strongly affects productivity', 0.3]]),
  f('discipline', 'In the last 7 days, how many days did you follow through on a planned task without delay?'),
  s('discipline', 'I leave tasks unfinished when difficult.', true),

  // 4. Entrepreneurial Identity
  s('identity', 'I see myself as responsible for my own outcomes.'),
  s('identity', 'I still think like an employee.', true),
  f('identity', 'In the last 7 days, how many times did you make a decision independently without needing approval?'),
  c('identity', 'Which statement describes you best?', [['I take ownership of outcomes', 1], ['I believe external factors mostly determine outcomes', 0.25]]),
  s('identity', 'I feel uncomfortable operating without structure or supervision.', true),
  s('identity', 'I accept responsibility for both success and failure.'),
  c('identity', 'Which statement describes you best?', [['Act quickly', 1], ['Gather more information', 0.55], ['Wait for certainty', 0.15]]),
  s('identity', 'I hesitate when outcomes are uncertain.', true),
  s('identity', 'I think long-term, instead of only short term.'),
  c('identity', 'Which statement describes you best?', [['I create structure for myself', 1], ['I perform best with external structure', 0.35]]),
  f('identity', 'In the last 7 days, how many times did you take full responsibility for an outcome?'),
  s('identity', 'I avoid responsibility when I feel uncertain.', true),

  // 5. Building Capacity
  s('building', 'I naturally start conversations with new people.'),
  s('building', 'I hesitate to talk to people because I worry about their reactions.', true),
  f('building', 'In the last 7 days, how many new conversations did you initiate with someone you didn’t normally talk to?'),
  c('building', 'Which statement describes you best?', [['I reach out even when uncertain', 1], ['I wait until I feel confident', 0.25]]),
  s('building', 'I avoid conversations where someone might disagree with me.', true),
  s('building', 'I feel comfortable sharing ideas or opportunities with others.'),
  c('building', 'Which statement describes you best?', [['Start the conversation', 1], ['Wait for engagement', 0.4], ['Avoid interaction', 0.1]]),
  s('building', 'I find it difficult to bring up important topics with people I know.', true),
  s('building', 'I recover quickly if someone reacts negatively to me.'),
  c('building', 'Which statement describes you best?', [['I create opportunities', 1], ['I wait for timing', 0.3]]),
  f('building', 'In the last 7 days, how many times did you reconnect or continue a conversation after an initial interaction?'),
  s('building', 'If someone seems uninterested, I usually stop trying too quickly.', true),

  // 6. Conversion Capacity
  s('conversion', 'I feel comfortable guiding conversations toward a decision.'),
  s('conversion', 'I avoid asking direct questions because I don’t want to make people uncomfortable.', true),
  f('conversion', 'In the last 7 days, how many times did you encourage someone to make a decision or take action?'),
  c('conversion', 'Which statement describes you best?', [['I naturally guide conversations', 1], ['I usually let others lead', 0.3]]),
  s('conversion', 'I become uncomfortable when someone disagrees with me.', true),
  s('conversion', 'I can explain ideas clearly and simply.'),
  c('conversion', 'Which statement describes you best?', [['Help them think through the decision', 1], ['Wait for them to decide', 0.4], ['Avoid involvement', 0.1]]),
  s('conversion', 'I lose confidence when someone questions my opinion.', true),
  s('conversion', 'I adjust my communication style depending on who I’m talking to.'),
  c('conversion', 'Which statement describes you best?', [['I’m comfortable influencing people', 1], ['I avoid influencing people', 0.2]]),
  f('conversion', 'In the last 7 days, how many times did you continue a conversation after someone seemed uncertain?'),
  s('conversion', 'If someone hesitates, I usually back away too quickly.', true),

  // 7. Warm Market & Referral Reach
  s('network', 'I actively look for ways to meet new people.'),
  s('network', 'I usually stay within the same social circle.', true),
  f('network', 'In the last 7 days, how many times did you introduce yourself to someone new?'),
  c('network', 'Which statement describes you best?', [['I intentionally expand my network', 1], ['I rely on existing relationships', 0.35]]),
  s('network', 'I avoid situations where I have to interact with unfamiliar people.', true),
  s('network', 'I enjoy building new relationships and connections.'),
  c('network', 'Which statement describes you best?', [['Start conversations easily', 1], ['Wait for engagement', 0.4], ['Keep interactions minimal', 0.1]]),
  s('network', 'I rarely take initiative in social situations.', true),
  s('network', 'I feel comfortable reconnecting with people I haven’t spoken to in a while.'),
  c('network', 'Which statement describes you best?', [['I intentionally create opportunities through people', 1], ['I wait for opportunities naturally', 0.3]]),
  f('network', 'In the last 7 days, how many times did you reconnect with someone or strengthen a relationship?'),
  s('network', 'I avoid reaching out because I worry about bothering people.', true),

  // 8. Criticism & Pressure Resilience
  s('pressure', 'Negative opinions from others rarely stop me from taking action.'),
  s('pressure', 'Criticism affects my confidence more than it should.', true),
  f('pressure', 'In the last 7 days, how many times did you continue taking action despite fear of criticism or judgment?'),
  c('pressure', 'Which statement describes you best?', [['I stay focused even when others disagree', 1], ['Other people’s opinions strongly affect me', 0.25]]),
  s('pressure', 'I avoid situations where I might be criticized.', true),
  s('pressure', 'I can separate opinions from reality.'),
  c('pressure', 'Which statement describes you best?', [['Stay calm and confident', 1], ['Question myself temporarily', 0.45], ['Withdraw', 0.1]]),
  s('pressure', 'I often second-guess myself after hearing negative opinions.', true),
  s('pressure', 'I stay focused on goals even when others don’t understand them.'),
  c('pressure', 'Which statement describes you best?', [['I form conclusions independently', 1], ['I rely heavily on outside opinions', 0.3]]),
  f('pressure', 'In the last 7 days, how many times did you handle an uncomfortable conversation calmly?'),
  s('pressure', 'I avoid action because I worry about how I’ll be perceived.', true),

  // 9. Mission Alignment & Conviction
  s('mission', 'I feel strongly connected to my long-term goals and purpose.'),
  s('mission', 'I mainly focus on short-term rewards rather than long-term meaning.', true),
  f('mission', 'In the last 7 days, how many times did you take action connected to an important personal goal?'),
  c('mission', 'Which statement describes you best?', [['Purpose strongly drives me', 1], ['Immediate results drive me more', 0.35]]),
  s('mission', 'If progress is slow, my motivation drops quickly.', true),
  s('mission', 'I believe my work and actions should positively impact others.'),
  c('mission', 'Which statement describes you best?', [['Purpose and growth', 1], ['Purpose and rewards equally', 0.6], ['Rewards and recognition', 0.25]]),
  s('mission', 'I sometimes question whether my goals are meaningful.', true),
  s('mission', 'I stay committed even when results are delayed.'),
  c('mission', 'Which statement describes you best?', [['I stay committed regardless of short-term results', 1], ['My commitment depends on progress', 0.35]]),
  f('mission', 'In the last 7 days, how many times did you continue working toward something important despite slow progress?'),
  s('mission', 'If something becomes difficult, I usually look for an easier alternative.', true),

  // 10. Leadership & Coaching
  s('leadership', 'I naturally help and guide other people.'),
  s('leadership', 'I usually focus more on myself than helping others improve.', true),
  f('leadership', 'In the last 7 days, how many times did you help, encourage, or guide another person?'),
  c('leadership', 'Which statement describes you best?', [['I naturally step into leadership roles', 1], ['I prefer others to lead', 0.3]]),
  s('leadership', 'I avoid giving feedback because I don’t want conflict.', true),
  s('leadership', 'People often come to me for advice or guidance.'),
  c('leadership', 'Which statement describes you best?', [['Help them work through it', 1], ['Offer limited support', 0.45], ['Stay out of it', 0.1]]),
  s('leadership', 'I hesitate to speak up or take leadership in group situations.', true),
  s('leadership', 'I enjoy helping people improve and grow.'),
  c('leadership', 'Which statement describes you best?', [['I like developing people', 1], ['I prefer focusing only on my own goals', 0.3]]),
  f('leadership', 'In the last 7 days, how many times did you recognize, encourage, or support another person?'),
  s('leadership', 'I prefer to avoid responsibility for guiding or leading others.', true),
]

export const QUESTIONS_BY_MODULE: Record<ModuleKey, Question[]> =
  MODULES.reduce((acc, m) => {
    acc[m.key] = QUESTIONS.filter(q => q.module === m.key)
    return acc
  }, {} as Record<ModuleKey, Question[]>)

export const QUESTION_BY_KEY: Record<string, Question> =
  Object.fromEntries(QUESTIONS.map(q => [q.key, q]))

export const TOTAL_QUESTIONS = QUESTIONS.length
