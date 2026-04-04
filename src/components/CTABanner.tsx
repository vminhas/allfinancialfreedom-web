'use client'

interface CTABannerProps {
  heading: string
  buttonText?: string
}

export default function CTABanner({ heading, buttonText = 'Book a Free Consultation' }: CTABannerProps) {
  const openBooking = () => window.dispatchEvent(new CustomEvent('open-booking'))

  return (
    <section
      className="flex flex-col md:flex-row items-center justify-between gap-6 px-16 py-16"
      style={{ background: '#C9A96E' }}
    >
      <h2 className="font-serif font-light text-3xl text-dark text-center md:text-left">
        {heading}
      </h2>
      <button onClick={openBooking} className="btn-dark">
        {buttonText}
      </button>
    </section>
  )
}
