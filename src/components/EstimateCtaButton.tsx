'use client'

// The video says "click below for a free estimate." The form sits below on
// mobile and to the RIGHT on desktop, so scrolling alone isn't an obvious cue.
// On click we scroll to the form AND run a 3-pulse scale+glow animation on the
// card (see .estimate-attention in globals.css) so it's unmistakable where the
// estimate is. The arrow points down on mobile / right on desktop, toward the
// form.
export default function EstimateCtaButton() {
  const jump = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    e.currentTarget.blur() // drop the focus ring; attention belongs on the form now
    const el = document.getElementById('estimate-form')
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Restart the animation cleanly on every click.
    el.classList.remove('estimate-attention')
    void el.offsetWidth // force reflow so the animation re-triggers
    el.classList.add('estimate-attention')
    const clear = () => {
      el.classList.remove('estimate-attention')
      el.removeEventListener('animationend', clear)
    }
    el.addEventListener('animationend', clear)
  }
  return (
    <a
      href="#estimate-form"
      onClick={jump}
      className="btn-gold"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14 }}
    >
      Get your free estimate
      {/* mobile: form is below → down arrow */}
      <svg className="lg:hidden" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14m0 0l-6-6m6 6l6-6" /></svg>
      {/* desktop: form is to the right → right arrow */}
      <svg className="hidden lg:inline" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m0 0l-6-6m6 6l-6 6" /></svg>
    </a>
  )
}
