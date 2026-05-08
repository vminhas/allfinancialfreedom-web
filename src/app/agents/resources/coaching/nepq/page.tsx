'use client'

import Link from 'next/link'

// In-portal distillation of the NEPQ playbook (Jeremy Lee Miner / 7th
// Level), the methodology AFF call reviews grade agents against. The
// page is structured around the 6 modal rubric dimensions so an agent
// can deep-link from the call review to the exact section they need
// to study (e.g. "Discovery & Needs" rubric chip → #engagement).
//
// Source material: NEPQ Black Book of Insurance Questions + NEPQ Book
// for Calling Leads. Both are linked at the bottom of this page for
// agents who want the full reference.
//
// Mobile-first scannable layout: short paragraphs, do/don't pairs,
// quoted example phrasings the AI also looks for in transcripts.

const SOURCE_PDFS = [
  {
    title: 'NEPQ Black Book of Insurance Questions',
    description: 'The full reference for every NEPQ stage with insurance-specific scripts. Read this when you want depth.',
    url: 'https://drive.google.com/file/d/189B6OMpSoPCPnvd1VaKRwycFvkN3s5iQ/view',
  },
  {
    title: 'NEPQ Book for Calling Leads',
    description: 'The cold-callback playbook with 12 industry-specific opening scripts including life insurance and senior benefits.',
    url: 'https://drive.google.com/file/d/1WS1A7A79snwHjs8f5SMOJNvkBJ5NmhW1/view',
  },
]

const STAGES = [
  { id: 'connection', num: 1, label: 'Connection', accent: '#60a5fa', tagline: 'The first 7-12 seconds' },
  { id: 'engagement', num: 2, label: 'Engagement', accent: '#4ade80', tagline: 'Where 85% of the sale is made' },
  { id: 'transition', num: 3, label: 'Transition', accent: '#C9A96E', tagline: 'Bridge to presentation' },
  { id: 'presentation', num: 4, label: 'Presentation', accent: '#a78bfa', tagline: 'Present without presenting' },
  { id: 'commitment', num: 5, label: 'Commitment', accent: '#f472b6', tagline: 'Close as a question' },
]

export default function NepqPlaybookPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', color: '#fff' }}>
      {/* Header */}
      <div style={{
        borderBottom: '1px solid rgba(201,169,110,0.1)',
        padding: '14px clamp(16px, 4vw, 32px)',
        paddingTop: 'calc(14px + env(safe-area-inset-top))',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 10,
        background: '#0A1628',
      }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#C9A96E' }}>
            All Financial Freedom
          </span>
          <span style={{ marginLeft: 12, fontSize: 11, color: '#4B5563' }}>NEPQ Playbook</span>
        </div>
        <Link
          href="/agents/resources"
          style={{ color: '#9BB0C4', fontSize: 12, textDecoration: 'none', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 }}
        >
          ← Resources
        </Link>
      </div>

      <div style={{ maxWidth: 820, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px) clamp(16px, 4vw, 32px)' }}>
        {/* Hero */}
        <div style={{ marginBottom: 32 }}>
          <p style={kicker}>Coaching Methodology</p>
          <h1 style={{ fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 300, margin: 0, fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '-0.01em', lineHeight: 1.1 }}>
            The NEPQ Playbook
          </h1>
          <p style={{ fontSize: 14, color: '#9BB0C4', marginTop: 10, lineHeight: 1.55 }}>
            What we grade your calls on, and how to do better next time. The NEPQ method (<em>Neuro-Emotional Persuasion Questioning</em>) was developed by Jeremy Lee Miner and 7th Level. AFF&apos;s AI call review uses it as the standard for every dimension below.
          </p>
        </div>

        {/* TOC: deep-linked sections */}
        <div style={{ marginBottom: 36, padding: 20, background: '#132238', border: '1px solid rgba(201,169,110,0.12)', borderRadius: 8 }}>
          <p style={{ ...kicker, marginBottom: 14 }}>The 5 stages of every NEPQ call</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
            {STAGES.map(s => (
              <a key={s.id} href={`#${s.id}`} style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${s.accent}33`,
                borderLeft: `3px solid ${s.accent}`,
                borderRadius: 5,
                color: 'inherit', textDecoration: 'none',
                transition: 'background 0.15s',
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: s.accent }}>
                  Stage {s.num}
                </span>
                <span style={{ fontSize: 14, fontWeight: 500, color: '#ffffff' }}>{s.label}</span>
                <span style={{ fontSize: 11, color: '#6B8299' }}>{s.tagline}</span>
              </a>
            ))}
          </div>
        </div>

        {/* The Mindset */}
        <Section id="mindset" label="Before the Stages">
          <h2 style={h2}>The Mindset Shift</h2>
          <p style={p}>
            Most agents are trained in <strong>Era 1 selling</strong> (presenting, telling your story, applying pressure) or <strong>Era 2 selling</strong> (consultative, surface-level needs questions). Both trigger sales resistance because both use external pressure.
          </p>
          <p style={p}>
            NEPQ is <strong>Era 3 selling: dialogue</strong>. The goal isn&apos;t to convince. It&apos;s to ask the right questions in the right order with the right tone, so the prospect <strong>persuades themselves</strong>. They pull you in. You stop chasing.
          </p>
          <Quote>
            &ldquo;Your goal is to make a sale on every call, but you have to keep that to yourself. The moment they feel like they&apos;re being sold is the moment they emotionally shut down.&rdquo;
          </Quote>
        </Section>

        {/* Stage 1: Connection */}
        <Section id="connection" label="Stage 1" accent={STAGES[0].accent}>
          <h2 style={h2}>Connection</h2>
          <p style={subhead}>The first 7-12 seconds determine whether the prospect engages or shuts down.</p>
          <p style={p}>
            Your job here is to <strong>disarm</strong>: come across as calm, curious, and detached from the outcome. Connection Questions take focus off you and put it on them.
          </p>

          <h3 style={h3}>Connection Questions to use</h3>
          <ExampleList items={[
            '"Hey [name], this is [agent]. I just had time to get back to you about [reason]. Have you found what you\'re looking for, or are you still looking?"',
            '"What was it about the ad that attracted your attention?"',
            '"Was there anything else that attracted you?"',
            '"Were you looking for anything specific, or just wanting to look over options?"',
            '"Would you be opposed to a brief conversation to see if we could get something for you more affordable?"',
          ]} />

          <h3 style={h3}>The disarming phrase (high skill)</h3>
          <Quote>
            &ldquo;I&apos;m not quite sure we can even help you yet. I&apos;d have to know a little more about your situation to see if we could in the first place.&rdquo;
          </Quote>
          <p style={p}>
            Why this works: it signals you aren&apos;t desperate to sell, which immediately drops the prospect&apos;s guard. Almost no one expects a salesperson to say this.
          </p>

          <DontDo
            dont={[
              'Pitching, presenting, or "who we are" inside the first minute',
              'Steamrolling: "Hi, do you have 2 minutes? Great, I\'m calling from..."',
              'Assumptive openers: "I noticed you filled out a form online" (most prospects don\'t remember)',
              '"We\'re the best", "#1 rated", award-mentions',
              'Eager / needy / aggressive tone in the first sentence',
            ]}
            doInstead={[
              'Calm, curious, slow-paced opener',
              'A connection question that gets them talking about themselves',
              'Ask permission: "Is this an appropriate time?"',
            ]}
          />
        </Section>

        {/* Stage 2: Engagement */}
        <Section id="engagement" label="Stage 2" accent={STAGES[1].accent}>
          <h2 style={h2}>Engagement</h2>
          <p style={subhead}>Five question layers, in order. This is where 85% of the sale is made.</p>

          <p style={p}>
            <strong>Skipping a layer is the most common reason a deal collapses.</strong> The prospect needs to articulate their situation, surface their pain, see the future, feel the consequences, and confirm urgency, in that exact order, before any product talk.
          </p>

          <Layer
            num="2a"
            label="Situation Questions"
            tagline="Fact-finding about current state."
            examples={[
              '"What type of policy do you have now?"',
              '"How long have you had it?"',
              '"What got you involved with that policy?"',
              '"Just so I understand your financial dynamic, are you the main provider, or split equally with your spouse?"',
              'For IUL: "What do you have for retirement strategies — 401k, 403b, anything similar?" / "Are you actively contributing?" / "What\'s your typical percentage return last couple of years, ballpark?"',
            ]}
          />

          <Layer
            num="2b"
            label="Problem-Awareness Questions"
            tagline="Get the prospect to articulate pain in their own words."
            examples={[
              '"Having [their current coverage], what makes you feel like that isn\'t enough?"',
              '"Why is that so important to you?" — asked slowly, with concern. This is the prospect\'s self-persuasion moment.',
              'For mortgage protection: "How many months would [spouse] be able to pay the house payment without your income?"',
              'For health: "What about for big things — cancer, heart attack, stroke — what do you have in place that would pay all that?"',
            ]}
          />

          <CalloutBox label="Identity Frame (advanced technique)">
            <p style={{ ...p, margin: 0 }}>
              <Quote inline>
                &ldquo;We do see that a lot — they&apos;re lucky to have a [parent/partner] selfless enough to take that burden off them. Some people really don&apos;t mind putting that stress on family. You know what I mean?&rdquo;
              </Quote>
              {' '}This triggers the prospect to defend their position emotionally — they don&apos;t want to be the &ldquo;some people&rdquo; in your sentence.
            </p>
          </CalloutBox>

          <CalloutBox label='"Forced" framing (advanced technique)'>
            <p style={{ ...p, margin: 0 }}>
              <Quote inline>
                &ldquo;Would they have to get a loan and pay all that interest, or would they be forced to pay out-of-pocket?&rdquo;
              </Quote>
              {' '}The word &ldquo;forced&rdquo; positions the current situation as the bad guy without you ever criticizing the prospect or their existing provider.
            </p>
          </CalloutBox>

          <Layer
            num="2c"
            label="Solution-Awareness Questions"
            tagline="What does the future look like once the pain is gone?"
            examples={[
              '"If we were able to help you find coverage so [their stated goal], how do you see that helping [beneficiary] the most?"',
              '"Knowing [beneficiary] wouldn\'t have to [pain they mentioned] — as a [parent/partner], what would that do for you personally?"',
              '"Were you out there looking for [solution category], or what have you been doing?"',
            ]}
          />

          <Layer
            num="2d"
            label="Consequence Questions"
            tagline="Surface the cost of inaction."
            examples={[
              '"What if you don\'t do anything and pass earlier than expected — how would [beneficiary] pay the mortgage?"',
              '"Are you willing to settle for that?"',
              '"Whose choice is it though, if you settle or not?"',
            ]}
          />

          <Layer
            num="2e"
            label="Qualifying Questions"
            tagline="Confirm commitment to change."
            examples={[
              '"How important is it for you to have that financial protection in place?"',
              '"Okay, so it\'s important for you to do something then?"',
            ]}
          />
        </Section>

        {/* Stage 3: Transition */}
        <Section id="transition" label="Stage 3" accent={STAGES[2].accent}>
          <h2 style={h2}>Transition</h2>
          <p style={subhead}>A scripted bridge from discovery to presentation. Use the prospect&apos;s own words.</p>

          <h3 style={h3}>The NEPQ Transition Formula</h3>
          <Quote>
            <strong>&ldquo;Based on what you told me, what we&apos;re doing would actually work for you. Because you know how you said</strong> [their want] + [their problem]<strong>. And because of that, it&apos;s making you feel</strong> [emotion they expressed]<strong>.&rdquo;</strong>
          </Quote>
          <p style={p}>
            Echo their exact words. The transition is what makes the presentation feel earned instead of pitched.
          </p>
        </Section>

        {/* Stage 4: Presentation */}
        <Section id="presentation" label="Stage 4" accent={STAGES[3].accent}>
          <h2 style={h2}>Presentation</h2>
          <p style={subhead}>&ldquo;Present without presenting.&rdquo; Tie every feature to a specific problem the prospect raised.</p>
          <p style={p}>
            Presentation should be <strong>under 10% of the entire call</strong>. Every claim should reference something the prospect said in Engagement. The format:
          </p>
          <Quote>
            &ldquo;Now remember how you mentioned [their problem]? The way we solve that for clients in your situation is [specific feature], so [outcome they said they wanted]. How do you see that helping you the most?&rdquo;
          </Quote>

          <DontDo
            dont={[
              'Feature-dumping ("we\'ve been in business 30 years...")',
              'Generic talking points unrelated to anything the prospect said',
              'Premature numbers (price before pain is built)',
              'Talking badly about competitors (signals insecurity)',
            ]}
            doInstead={[
              'Tie every feature to a specific problem they articulated',
              'End each section with a question ("how do you see that helping you?")',
              'If you don\'t know a number, say so',
            ]}
          />
        </Section>

        {/* Stage 5: Commitment */}
        <Section id="commitment" label="Stage 5" accent={STAGES[4].accent}>
          <h2 style={h2}>Commitment</h2>
          <p style={subhead}>The close is a question, not a statement.</p>

          <h3 style={h3}>NEPQ Commitment Questions</h3>
          <ExampleList items={[
            '"Which one of those would you possibly lean towards?"',
            '"How come that one, just so I understand?"',
            '"That makes sense. Well, the first step is to make sure we can even get you eligible for the plan."',
          ]} />

          <DontDo
            dont={[
              'Trial closes early in the call ("Are you ready to move forward?")',
              'Pressure or scarcity ("This rate won\'t be here tomorrow")',
              'Assumptive close before discovery is complete ("So what\'s your social security number?")',
              'Two-option close before pain is built ("Would you want $40k or $20k coverage?")',
            ]}
            doInstead={[
              'Ask which option they lean towards, then "how come?"',
              'Walk them through eligibility as the next step',
              'Let them choose. They\'ll defend their own choice.',
            ]}
          />
        </Section>

        {/* Tonality */}
        <Section id="objections" label="Throughout" accent="#9B6DFF">
          <h2 style={h2}>Objection Handling</h2>
          <p style={subhead}>Never reframe. Never rebut. Get behind the concern with a question.</p>
          <p style={p}>
            An objection means the prospect has an unresolved concern. Your job is to understand it, not argue with it. NEPQ handles concerns with clarifying questions that get the prospect to talk themselves through it.
          </p>
          <ExampleList items={[
            '"What makes you feel that way?"',
            '"Help me understand — what\'s holding you back?"',
            '"Just so I\'m clear, is it [concern A] or more [concern B]?"',
          ]} />
        </Section>

        <Section id="tone" label="Throughout" accent="#f59e0b">
          <h2 style={h2}>Tonality &amp; Verbal Cues</h2>
          <p style={subhead}>The texture that makes NEPQ work — even in transcript form.</p>

          <DontDo
            dont={[
              'Certainty statements: "You need...", "What you should do is..."',
              'Pushy phrases: "real quick", "let me just show you", "you should"',
              'Clinical language: "per our conversation", "as I mentioned"',
              'Rushing past objections without a pause',
            ]}
            doInstead={[
              'Curious-frame: "I\'m just curious...", "Just so I understand..."',
              'Echo their exact words back when responding',
              'Bridging cues: "aww, ok", "got it", "that makes sense" between questions so the conversation feels natural',
              'Slow down on heavy questions. In a transcript, this shows up as ellipsis: "Why...is THAT so important to you?"',
            ]}
          />
        </Section>

        {/* Source PDFs */}
        <Section id="sources" label="Read More">
          <h2 style={h2}>The Source Material</h2>
          <p style={subhead}>Want to go deeper? These are the books AFF&apos;s coaching is built on.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            {SOURCE_PDFS.map(pdf => (
              <a key={pdf.url} href={pdf.url} target="_blank" rel="noopener noreferrer" style={{
                display: 'flex', gap: 14, padding: '14px 18px',
                background: '#132238', border: '1px solid rgba(201,169,110,0.18)',
                borderRadius: 6, textDecoration: 'none', color: 'inherit',
                alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                }}>PDF</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#ffffff', marginBottom: 4 }}>
                    {pdf.title} <span style={{ color: '#6B8299', fontSize: 10, marginLeft: 6 }}>↗ Open</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.5 }}>
                    {pdf.description}
                  </div>
                </div>
              </a>
            ))}
          </div>
          <p style={{ ...p, fontSize: 11, color: '#6B8299', marginTop: 16 }}>
            <em>Source attribution:</em> NEPQ and 7th Level are trademarks of 7th Level Inc. Books authored by Jeremy Lee Miner. AFF agents have access via the link above for educational use.
          </p>
        </Section>
      </div>
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────

function Section({ id, label, accent, children }: { id: string; label: string; accent?: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 36, scrollMarginTop: 70 }}>
      <p style={{ ...kicker, color: accent ?? '#C9A96E', marginBottom: 12 }}>{label}</p>
      {children}
    </section>
  )
}

function ExampleList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '12px 0 16px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it, i) => (
        <li key={i} style={{
          padding: '10px 14px',
          background: 'rgba(201,169,110,0.06)',
          borderLeft: '2px solid rgba(201,169,110,0.5)',
          borderRadius: '0 4px 4px 0',
          fontSize: 13, lineHeight: 1.55, color: '#d1d9e2',
          fontStyle: 'italic',
        }}>{it}</li>
      ))}
    </ul>
  )
}

function Quote({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  if (inline) {
    return <em style={{ color: '#E0C485' }}>{children}</em>
  }
  return (
    <blockquote style={{
      margin: '14px 0',
      padding: '14px 18px',
      background: 'rgba(201,169,110,0.08)',
      borderLeft: '3px solid #C9A96E',
      borderRadius: '0 6px 6px 0',
      fontSize: 14, lineHeight: 1.6, color: '#E0C485',
      fontFamily: "'Cormorant Garamond', Georgia, serif",
      fontStyle: 'italic',
    }}>{children}</blockquote>
  )
}

function CalloutBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      margin: '14px 0',
      padding: '14px 18px',
      background: '#142D48',
      border: '1px solid rgba(155,109,255,0.3)',
      borderLeft: '3px solid #9B6DFF',
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#9B6DFF', marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Layer({ num, label, tagline, examples }: { num: string; label: string; tagline: string; examples: string[] }) {
  return (
    <div style={{
      margin: '20px 0',
      padding: '16px 18px',
      background: 'rgba(74,222,128,0.04)',
      border: '1px solid rgba(74,222,128,0.18)',
      borderRadius: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: '#4ade80' }}>{num}</span>
        <h4 style={{ fontSize: 16, fontWeight: 500, color: '#ffffff', margin: 0 }}>{label}</h4>
      </div>
      <p style={{ fontSize: 12, color: '#9BB0C4', margin: '0 0 10px', lineHeight: 1.5 }}>{tagline}</p>
      <ExampleList items={examples} />
    </div>
  )
}

function DontDo({ dont, doInstead }: { dont: string[]; doInstead: string[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, margin: '14px 0' }}>
      <div style={{ padding: '12px 14px', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#fca5a5', marginBottom: 8 }}>
          ✕ Avoid
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dont.map((d, i) => <li key={i} style={{ fontSize: 12, color: '#d1d9e2', lineHeight: 1.5 }}>{d}</li>)}
        </ul>
      </div>
      <div style={{ padding: '12px 14px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#86efac', marginBottom: 8 }}>
          ✓ Do instead
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {doInstead.map((d, i) => <li key={i} style={{ fontSize: 12, color: '#d1d9e2', lineHeight: 1.5 }}>{d}</li>)}
        </ul>
      </div>
    </div>
  )
}

// ─── Style constants ──────────────────────────────────────────────────

const kicker: React.CSSProperties = {
  color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em',
  textTransform: 'uppercase', fontWeight: 700, margin: '0 0 6px',
}

const h2: React.CSSProperties = {
  fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 300, margin: 0,
  fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '-0.01em', color: '#ffffff',
}

const h3: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, margin: '20px 0 8px',
  color: '#C9A96E', letterSpacing: '0.02em',
}

const subhead: React.CSSProperties = {
  fontSize: 13, color: '#9BB0C4', margin: '6px 0 16px',
  lineHeight: 1.55, fontStyle: 'italic',
}

const p: React.CSSProperties = {
  fontSize: 14, color: '#d1d9e2', margin: '0 0 14px',
  lineHeight: 1.6,
}
