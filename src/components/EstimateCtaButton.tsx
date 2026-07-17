'use client'

// The video says "click below for a free estimate." On mobile the form is
// below, so this scrolls to it; on desktop the form sits to the RIGHT of the
// video, so a plain scroll does nothing visible, this also flashes the form
// card gold so it's obvious that's where the estimate is.
export default function EstimateCtaButton() {
  const jump = (e: React.MouseEvent) => {
    e.preventDefault()
    const el = document.getElementById('estimate-form')
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const prev = el.style.boxShadow
    el.style.transition = 'box-shadow 0.35s ease'
    el.style.boxShadow = '0 0 0 3px rgba(201,169,110,0.95), 0 20px 50px rgba(11,25,44,0.28)'
    window.setTimeout(() => { el.style.boxShadow = prev }, 1600)
  }
  return (
    <a
      href="#estimate-form"
      onClick={jump}
      className="btn-gold"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14 }}
    >
      Get your free estimate
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14m0 0l-6-6m6 6l6-6" /></svg>
    </a>
  )
}
