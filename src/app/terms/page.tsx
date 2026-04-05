import type { Metadata } from 'next'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Terms of Service — All Financial Freedom',
  description: 'Terms of use for the All Financial Freedom website and services.',
}

const lastUpdated = 'April 1, 2026'

export default function TermsPage() {
  return (
    <main className="pt-20">
      <section style={{ background: 'linear-gradient(135deg, #142D48, #1B3A5C)', padding: '4rem 5rem 3rem' }}>
        <div className="max-w-3xl">
          <span className="section-label">Legal</span>
          <h1 className="section-title-light mb-3">Terms of Service</h1>
          <p style={{ color: 'rgba(235,244,255,0.5)', fontSize: '0.8rem', letterSpacing: '0.1em' }}>
            Last updated: {lastUpdated}
          </p>
        </div>
      </section>

      <section style={{ padding: '4rem 5rem', background: '#ffffff' }}>
        <div className="max-w-3xl mx-auto" style={{ fontSize: '0.95rem', lineHeight: 1.85, color: '#374151' }}>

          <p className="mb-6">
            Welcome to All Financial Freedom. By accessing or using our website at allfinancialfreedom.com (the &quot;Site&quot;), you agree to be bound by these Terms of Service. Please read them carefully.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">1. Use of the Site</h2>
          <p className="mb-6">
            You may use this Site for lawful purposes only. You agree not to use the Site in any way that may damage, disable, or impair the Site, or interfere with any other party&apos;s use. You must not attempt to gain unauthorized access to any part of the Site or its related systems.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">2. Not Financial Advice</h2>
          <p className="mb-6">
            The content on this Site — including articles, guides, and educational materials — is provided for informational purposes only and does not constitute personalized financial, investment, insurance, tax, or legal advice. Always consult with a qualified licensed professional before making financial decisions. Past performance does not guarantee future results.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">3. Insurance Services</h2>
          <p className="mb-6">
            All Financial Freedom is a licensed insurance team. Insurance products are subject to state availability, carrier approval, and individual underwriting. Not all products are available in all states. Licensing information available upon request.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">4. Intellectual Property</h2>
          <p className="mb-6">
            All content on this Site — including text, graphics, logos, and design — is the property of All Financial Freedom or its licensors and is protected by applicable intellectual property laws. You may not reproduce, distribute, or create derivative works without express written permission.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">5. Third-Party Links</h2>
          <p className="mb-6">
            The Site may contain links to third-party websites. These links are provided for convenience only. We do not endorse or assume responsibility for the content, privacy practices, or accuracy of any third-party sites.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">6. Disclaimer of Warranties</h2>
          <p className="mb-6">
            This Site is provided &quot;as is&quot; without warranties of any kind, either express or implied, including but not limited to merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Site will be uninterrupted, error-free, or free of viruses.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">7. Limitation of Liability</h2>
          <p className="mb-6">
            To the fullest extent permitted by law, All Financial Freedom shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of, or inability to use, the Site or its content.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">8. Governing Law</h2>
          <p className="mb-6">
            These Terms shall be governed by and construed in accordance with the laws of the United States and the state in which All Financial Freedom is domiciled, without regard to conflict of law principles.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">9. Changes to These Terms</h2>
          <p className="mb-6">
            We reserve the right to modify these Terms at any time. Changes will be posted on this page with an updated &quot;Last Updated&quot; date. Continued use of the Site following any changes constitutes acceptance of the revised Terms.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">10. Contact</h2>
          <p className="mb-6">
            Questions about these Terms? Contact us at:<br />
            <strong>All Financial Freedom</strong><br />
            Email: <a href="mailto:contact@allfinancialfreedom.com" style={{ color: '#3B7EC8' }}>contact@allfinancialfreedom.com</a>
          </p>

          <div className="divider-gold mt-10 mb-6" />
          <p className="text-xs" style={{ color: '#6B8299' }}>
            All Financial Freedom is a licensed insurance team. Insurance products are subject to state availability and regulatory approval. Licensed agents available upon request.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  )
}
