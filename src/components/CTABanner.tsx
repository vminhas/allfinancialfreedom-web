'use client'

interface CTABannerProps {
  heading: string
  buttonText?: string
}

export default function CTABanner({ heading, buttonText = 'Book a Free Consultation' }: CTABannerProps) {
  const openBooking = () => window.dispatchEvent(new CustomEvent('open-booking'))
  return (
    <section className="flex flex-col md:flex-row items-center justify-between gap-6 px-16 py-16 bg-navy-grad">
      <h2 className="font-serif font-light text-3xl text-white text-center md:text-left">{heading}</h2>
      <button onClick={openBooking} className="whitespace-nowrap px-8 py-3 text-xs font-medium tracking-widest uppercase rounded-sm transition-all" style={{ background: 'white', color: '#1B3A5C' }}>
        {buttonText}
      </button>
    </section>
  )
}
