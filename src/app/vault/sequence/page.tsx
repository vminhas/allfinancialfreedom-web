const FRESH_SEQUENCE = [
  {
    day: 0, type: 'email', icon: '✉',
    title: 'Intro Email',
    subject: '"Your license, a new chapter — [First Name]"',
    desc: 'Personal, license-type-specific intro. Briefly explains what AFF offers. Single CTA to schedule a 15-min discovery call.',
    compliance: ['CAN-SPAM ✓', 'Physical address ✓', 'Unsubscribe ✓'],
    tcpa: false,
  },
  {
    day: 3, type: 'email', icon: '✉',
    title: 'Follow-Up Email',
    subject: '"Just circling back — [First Name]"',
    desc: 'Different angle: income potential, schedule flexibility, mission-driven culture. Short, human, no pressure.',
    compliance: ['CAN-SPAM ✓', 'Physical address ✓', 'Unsubscribe ✓'],
    tcpa: false,
  },
  {
    day: 7, type: 'email', icon: '✉',
    title: 'Social Proof + CTA',
    subject: '"What agents like you are saying"',
    desc: 'Testimonial from a licensed agent who joined AFF. Emphasizes the "try it part-time first" option. Direct booking link.',
    compliance: ['CAN-SPAM ✓', 'Physical address ✓', 'Unsubscribe ✓'],
    tcpa: false,
  },
  {
    day: 10, type: 'sms', icon: '💬',
    title: 'SMS Touchpoint',
    subject: 'Short, friendly text from Vick',
    desc: '"Hey [First Name], Vick here from AFF. Did you get my emails? Would love to connect for 15 min. Want me to send a link?" — sent only after an email reply.',
    compliance: [],
    tcpa: true,
  },
  {
    day: 14, type: 'email', icon: '✉',
    title: 'Final Email or Task',
    subject: '"Last note from me — [First Name]"',
    desc: 'Respectful close. Leaves door open ("whenever you\'re ready"). If no reply, creates a manual follow-up task in GHL for the team.',
    compliance: ['CAN-SPAM ✓', 'Physical address ✓', 'Unsubscribe ✓'],
    tcpa: false,
  },
]

const SOFT_SEQUENCE = [
  {
    day: 0, type: 'email', icon: '✉',
    title: 'Value-Add Email (No Pitch)',
    subject: '"Something useful for licensed agents in [State]"',
    desc: 'Genuinely helpful content: a resource, insight, or question relevant to their license type. No recruitment mention. Builds trust first.',
    compliance: ['CAN-SPAM ✓', 'Physical address ✓', 'Unsubscribe ✓'],
    tcpa: false,
  },
  {
    day: 7, type: 'email', icon: '✉',
    title: 'Light Check-In',
    subject: '"Quick question, [First Name]"',
    desc: 'One question: "Are you still active in insurance or exploring other directions?" Soft, conversational — zero pressure.',
    compliance: ['CAN-SPAM ✓', 'Physical address ✓', 'Unsubscribe ✓'],
    tcpa: false,
  },
  {
    day: 14, type: 'sms', icon: '💬',
    title: 'SMS — Soft Ask',
    subject: 'Gentle text asking for a 15-min call',
    desc: '"Hey [First Name], Vick from AFF. I know you get a lot of calls — this one is different. 15 minutes, no pressure. Want to connect?" — sent only after an email reply.',
    compliance: [],
    tcpa: true,
  },
]

function SequenceStep({ step, color }: { step: typeof FRESH_SEQUENCE[0]; color: string }) {
  return (
    <div style={{
      display: 'flex', gap: 0, position: 'relative',
    }}>
      {/* Timeline line + dot */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 48, flexShrink: 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: step.type === 'email' ? '#142D48' : '#1a1435',
          border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, flexShrink: 0, zIndex: 1,
        }}>
          {step.icon}
        </div>
        <div style={{ width: 2, flex: 1, background: 'rgba(201,169,110,0.1)', minHeight: 24 }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: 24, paddingLeft: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ background: `rgba(${color === '#C9A96E' ? '201,169,110' : '96,165,250'},0.1)`, color, fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 2 }}>
            Day {step.day}
          </span>
          <span style={{ color: '#ffffff', fontSize: 13, fontWeight: 500 }}>{step.title}</span>
          {step.type === 'sms' && (
            <span style={{ fontSize: 9, color: '#f59e0b', letterSpacing: '0.1em', textTransform: 'uppercase', border: '1px solid rgba(245,158,11,0.3)', padding: '1px 5px', borderRadius: 2 }}>SMS</span>
          )}
        </div>
        <p style={{ color: '#C9A96E', fontSize: 11, fontStyle: 'italic', margin: '0 0 6px' }}>{step.subject}</p>
        <p style={{ color: '#9BB0C4', fontSize: 12, lineHeight: 1.65, margin: '0 0 8px' }}>{step.desc}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {step.compliance.map(c => (
            <span key={c} style={{ fontSize: 9, color: '#4ade80', border: '1px solid rgba(74,222,128,0.2)', padding: '2px 6px', borderRadius: 2, letterSpacing: '0.05em' }}>{c}</span>
          ))}
          {step.tcpa && (
            <span style={{ fontSize: 9, color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)', padding: '2px 6px', borderRadius: 2 }}>
              TCPA-gated: only after email reply
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SequencePage() {
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <p style={{ color: '#C9A96E', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 6px' }}>GHL Workflows</p>
        <h1 style={{ color: '#ffffff', fontSize: 28, fontWeight: 300, margin: 0 }}>Outreach Sequences</h1>
      </div>

      <p style={{ color: '#6B8299', fontSize: 13, lineHeight: 1.7, margin: '0 0 32px', maxWidth: 600 }}>
        These sequences run automatically in GoHighLevel once contacts are imported and tagged. Configure them in GHL Workflows using the triggers below.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

        {/* Workflow A */}
        <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(201,169,110,0.15)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(201,169,110,0.1)', background: 'rgba(0,0,0,0.2)' }}>
            <p style={{ color: '#C9A96E', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 4px' }}>Workflow A</p>
            <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 500, margin: '0 0 4px' }}>Standard Drip — Fresh Leads</p>
            <p style={{ color: '#6B8299', fontSize: 11, margin: 0 }}>Trigger: Contact tagged <code style={{ color: '#C9A96E', background: 'rgba(201,169,110,0.1)', padding: '1px 5px', borderRadius: 2 }}>prophog-fresh</code></p>
          </div>
          <div style={{ padding: '24px' }}>
            {FRESH_SEQUENCE.map((step, i) => (
              <SequenceStep key={i} step={step} color="#C9A96E" />
            ))}
          </div>
        </div>

        {/* Workflow B */}
        <div style={{ background: '#142D48', borderRadius: 6, border: '1px solid rgba(245,158,11,0.15)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(245,158,11,0.1)', background: 'rgba(0,0,0,0.2)' }}>
            <p style={{ color: '#f59e0b', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 4px' }}>Workflow B</p>
            <p style={{ color: '#ffffff', fontSize: 15, fontWeight: 500, margin: '0 0 4px' }}>Soft Touch — Worn Out Leads</p>
            <p style={{ color: '#6B8299', fontSize: 11, margin: 0 }}>Trigger: Contact tagged <code style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.08)', padding: '1px 5px', borderRadius: 2 }}>prophog-worn-out</code></p>
          </div>
          <div style={{ padding: '24px' }}>
            {SOFT_SEQUENCE.map((step, i) => (
              <SequenceStep key={i} step={step} color="#f59e0b" />
            ))}
          </div>
        </div>

      </div>

      {/* Compliance note */}
      <div style={{ background: 'rgba(74,222,128,0.04)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 6, padding: '20px 24px', marginTop: 28 }}>
        <p style={{ color: '#4ade80', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 10px' }}>Compliance Summary</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            ['CAN-SPAM', 'Every email includes physical address + unsubscribe link in footer'],
            ['Subject lines', 'Claude is instructed to avoid deceptive or spam-trigger subject lines'],
            ['TCPA (SMS)', 'SMS steps are gated — only sent after a contact replies to email first'],
            ['Suppression list', 'Opt-outs are permanently stored and excluded from all future imports'],
            ['Deliverability', 'Personalized content, proper From name, plain text + HTML — reduces spam score'],
            ['Unsubscribe', 'Present in every email footer (low-profile, standard footer placement)'],
          ].map(([label, desc]) => (
            <div key={label} style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: '#4ade80', fontSize: 11, marginTop: 1 }}>✓</span>
              <div>
                <span style={{ color: '#ffffff', fontSize: 12, fontWeight: 500 }}>{label}: </span>
                <span style={{ color: '#9BB0C4', fontSize: 12 }}>{desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
