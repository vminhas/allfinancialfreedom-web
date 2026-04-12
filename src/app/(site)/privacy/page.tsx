import type { Metadata } from 'next'
import Footer from '@/components/Footer'

export const metadata: Metadata = {
  title: 'Privacy Policy | All Financial Freedom',
  description: 'How All Financial Freedom collects, uses, and protects your personal information.',
}

const lastUpdated = 'April 12, 2026'

export default function PrivacyPage() {
  return (
    <main className="pt-20">
      <section style={{ background: 'linear-gradient(135deg, #142D48, #1B3A5C)', padding: '4rem 5rem 3rem' }}>
        <div className="max-w-3xl">
          <span className="section-label">Legal</span>
          <h1 className="section-title-light mb-3">Privacy Policy</h1>
          <p style={{ color: 'rgba(235,244,255,0.5)', fontSize: '0.8rem', letterSpacing: '0.1em' }}>
            Last updated: {lastUpdated}
          </p>
        </div>
      </section>

      <section style={{ padding: '4rem 5rem', background: '#ffffff' }}>
        <div className="max-w-3xl mx-auto" style={{ fontSize: '0.95rem', lineHeight: 1.85, color: '#374151' }}>

          <p className="mb-6">
            All Financial Freedom (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is committed to protecting your personal information. This Privacy Policy explains what information we collect, how we use it, and your rights regarding that information when you use our website at allfinancialfreedom.com (the &quot;Site&quot;).
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">1. Information We Collect</h2>
          <p className="mb-3">We may collect the following types of information:</p>
          <ul className="space-y-2 mb-6 ml-4">
            <li className="flex gap-2"><span style={{ color: '#C9A96E', flexShrink: 0 }}>→</span><span><strong>Contact information</strong>, name, email address, phone number when you submit a form or book a call</span></li>
            <li className="flex gap-2"><span style={{ color: '#C9A96E', flexShrink: 0 }}>→</span><span><strong>Usage data</strong>, pages visited, time spent, browser type, IP address (collected automatically via analytics)</span></li>
            <li className="flex gap-2"><span style={{ color: '#C9A96E', flexShrink: 0 }}>→</span><span><strong>Communications</strong>, any information you provide when contacting us by email or phone</span></li>
          </ul>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">2. How We Use Your Information</h2>
          <p className="mb-3">We use collected information to:</p>
          <ul className="space-y-2 mb-6 ml-4">
            <li className="flex gap-2"><span style={{ color: '#C9A96E', flexShrink: 0 }}>→</span><span>Respond to inquiries and schedule consultations</span></li>
            <li className="flex gap-2"><span style={{ color: '#C9A96E', flexShrink: 0 }}>→</span><span>Send relevant financial education content and updates (with your consent)</span></li>
            <li className="flex gap-2"><span style={{ color: '#C9A96E', flexShrink: 0 }}>→</span><span>Improve the Site and our services</span></li>
            <li className="flex gap-2"><span style={{ color: '#C9A96E', flexShrink: 0 }}>→</span><span>Comply with legal and regulatory obligations</span></li>
          </ul>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">3. Text Messaging</h2>
          <p className="mb-4">
            If you provide your mobile phone number through our website chat widget, you consent to receive text messages from All Financial Freedom related to your inquiry or service request. Message frequency varies. Message and data rates may apply. Text <strong>STOP</strong> to opt out at any time. Text <strong>HELP</strong> for assistance.
          </p>
          <p className="mb-6">
            We do not share your mobile phone number with third parties for their marketing purposes.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">4. Third-Party Services</h2>
          <p className="mb-6">
            We use GoHighLevel (GHL) to manage appointments and communications. GHL may process your contact information in accordance with its own privacy policy. We also use Vercel Analytics to understand site usage. No personally identifiable information is shared with analytics providers.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">5. Data Security</h2>
          <p className="mb-6">
            We implement reasonable security measures to protect your information. However, no method of transmission over the Internet is 100% secure. We cannot guarantee absolute security but are committed to protecting your data.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">6. Your Rights</h2>
          <p className="mb-3">Depending on your location, you may have the right to:</p>
          <ul className="space-y-2 mb-6 ml-4">
            <li className="flex gap-2"><span style={{ color: '#C9A96E', flexShrink: 0 }}>→</span><span>Access the personal information we hold about you</span></li>
            <li className="flex gap-2"><span style={{ color: '#C9A96E', flexShrink: 0 }}>→</span><span>Request correction or deletion of your data</span></li>
            <li className="flex gap-2"><span style={{ color: '#C9A96E', flexShrink: 0 }}>→</span><span>Opt out of marketing communications at any time</span></li>
          </ul>
          <p className="mb-6">To exercise these rights, contact us at <a href="mailto:contact@allfinancialfreedom.com" style={{ color: '#3B7EC8' }}>contact@allfinancialfreedom.com</a>.</p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">7. Cookies</h2>
          <p className="mb-6">
            Our Site may use cookies to improve your browsing experience and gather analytics data. You can disable cookies through your browser settings, though some features of the Site may not function as intended.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">8. Children&apos;s Privacy</h2>
          <p className="mb-6">
            Our Site is not directed at children under the age of 13. We do not knowingly collect personal information from minors. If you believe a child has provided us with personal information, contact us immediately.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">9. Changes to This Policy</h2>
          <p className="mb-6">
            We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated &quot;Last Updated&quot; date. Continued use of the Site after changes constitutes acceptance of the updated policy.
          </p>

          <h2 className="font-serif text-xl text-navy mb-3 mt-8">10. Contact Us</h2>
          <p className="mb-6">
            If you have questions about this Privacy Policy, contact us at:<br />
            <strong>All Financial Freedom</strong><br />
            Email: <a href="mailto:contact@allfinancialfreedom.com" style={{ color: '#3B7EC8' }}>contact@allfinancialfreedom.com</a>
          </p>

          <div className="divider-gold mt-10 mb-6" />
          <p className="text-xs" style={{ color: '#6B8299' }}>
            All Financial Freedom is a licensed insurance team. Insurance products are subject to state availability and regulatory approval.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  )
}
