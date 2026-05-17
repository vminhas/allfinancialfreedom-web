// Resolve an agent's display name. If the agent has set a preferredName
// ("Karmvir" goes by "Vick", "Chancey" goes by "Chris"), every
// user-facing render should substitute it for the legal first name.
// Last name is always legal.
//
// Use displayFirstName() when only the first name is rendered (Discord
// embed subline, welcome-email greeting). Use displayFullName() for
// "First Last" renders (leaderboards, trading cards, team directory).
//
// Keep these pure — the input shape is just the two fields. Don't pass
// the whole AgentProfile so callers can use it on the lightweight
// `select` shapes that already flow through the API layer.

export interface NameSource {
  firstName: string
  lastName: string
  preferredName?: string | null
}

export function displayFirstName(a: NameSource): string {
  const trimmed = a.preferredName?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : a.firstName
}

export function displayFullName(a: NameSource): string {
  return `${displayFirstName(a)} ${a.lastName}`
}
