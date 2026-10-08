// Downline tree traversal shared by the team views.
//
// An agent's downline is a parent -> children map keyed by the recruiter's
// agentCode (AgentProfile.recruiterId stores the recruiter's agentCode, per
// CLAUDE.md). Some nodes are hidden from a given view (e.g. INACTIVE agents in
// the default team view).
//
// The rule that matters: hiding a node must NEVER hide the visible agents
// beneath it. Previously the roster was filtered before the map was built, so
// a hidden agent was absent from the tree entirely, the walk never reached
// their node, and their whole subtree silently disappeared from the upline's
// view. Marking two mid-chain agents inactive removed every active agent under
// them from their upline's team list.
//
// Instead, build the map from the FULL roster and descend through hidden
// nodes, lifting their visible descendants up to the nearest visible ancestor.
export function visibleChildren<T>(
  code: string,
  childrenOf: Map<string, T[]>,
  codeOf: (node: T) => string,
  isVisible: (node: T) => boolean,
  seen: Set<string> = new Set(),
): T[] {
  // Cycle guard: a malformed recruiterId loop would otherwise recurse forever.
  if (seen.has(code)) return []
  seen.add(code)

  const out: T[] = []
  for (const child of childrenOf.get(code) ?? []) {
    if (isVisible(child)) out.push(child)
    else out.push(...visibleChildren(codeOf(child), childrenOf, codeOf, isVisible, seen))
  }
  return out
}
