import { redirect } from 'next/navigation'

// Default landing for the Vault is the AFF Tracker (everyone's first
// stop on every login). The legacy outreach/dashboard view moved to
// /vault/dashboard and is still linked from the sidebar.
export default function VaultIndex() {
  redirect('/vault/tracker')
}
