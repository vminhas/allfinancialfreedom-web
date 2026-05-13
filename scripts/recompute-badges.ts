// One-shot script: recomputes CFT badges for all active agents.
// Run: npx tsx scripts/recompute-badges.ts
import 'dotenv/config'
import { db } from '../src/lib/db'
import { recomputeBadges } from '../src/lib/agent-badges'

async function main() {
  const agents = await db.agentProfile.findMany({
    where: { status: 'ACTIVE', isTest: false },
    select: { id: true, firstName: true, lastName: true, agentCode: true },
  })
  console.log(`Recomputing badges for ${agents.length} agents...`)
  let updated = 0
  let errors = 0
  for (const agent of agents) {
    try {
      const badges = await recomputeBadges(agent.id)
      if (badges.length > 0) {
        console.log(`  ${agent.firstName} ${agent.lastName} (${agent.agentCode}): [${badges.join(', ')}]`)
        updated++
      }
    } catch (err) {
      console.error(`  ERROR for ${agent.agentCode}:`, err)
      errors++
    }
  }
  console.log(`Done. ${updated} agents have badges. ${errors} errors.`)
  await db.$disconnect()
}

main()
