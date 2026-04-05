'use client'

export default function BookingCTA() {
  return (
    <div className="mt-12 p-8" style={{
      background: 'linear-gradient(135deg, #142D48, #1B3A5C)',
      borderRadius: 4,
      border: '1px solid rgba(201,169,110,0.2)',
    }}>
      <div style={{ display: 'block', width: 32, height: 2, background: '#C9A96E', marginBottom: '1.25rem' }} />
      <h3 className="font-serif font-light text-white mb-3" style={{ fontSize: '1.6rem', lineHeight: 1.2 }}>
        Ready to put this into action?
      </h3>
      <p style={{ color: 'rgba(235,244,255,0.68)', fontSize: '0.95rem', lineHeight: 1.8, marginBottom: '1.5rem', maxWidth: '480px' }}>
        Understanding the strategy is step one. Step two is building your personal plan. Connect with a member of our team, no pressure, no jargon, just a clear path forward for you and your family.
      </p>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('open-booking'))}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
          background: '#C9A96E', color: '#142D48',
          padding: '0.75rem 2rem',
          fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
          borderRadius: 2, border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(201,169,110,0.3)',
        }}
      >
        Schedule Your Free Strategy Call
      </button>
    </div>
  )
}
