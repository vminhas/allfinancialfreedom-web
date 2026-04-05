import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Financial Services | All Financial Freedom',
  description: 'Comprehensive financial services including life insurance, wealth building, retirement planning, asset protection, legacy planning, and more. Serving families and businesses across the US.',
  keywords: 'life insurance, wealth building, retirement planning, asset protection, legacy planning, mortgage protection, family banking, financial planning, indexed universal life, IUL, term life insurance, financial advisor',
  openGraph: {
    title: 'Financial Services | All Financial Freedom',
    description: 'Comprehensive financial planning, insurance, and wealth-building services for individuals, families, and business owners.',
    url: 'https://allfinancialfreedom.com/services',
    siteName: 'All Financial Freedom',
    type: 'website',
  },
}

export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children
}
