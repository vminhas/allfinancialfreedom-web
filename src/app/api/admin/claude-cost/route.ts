import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// Haiku 4.5 pricing (per million tokens)
const HAIKU_INPUT_PER_M = 0.80
const HAIKU_OUTPUT_PER_M = 4.00

function calcCost(inputTokens: number, outputTokens: number) {
  return (inputTokens / 1_000_000) * HAIKU_INPUT_PER_M + (outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_M
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [allTime, thisMonth, today, totalMessages] = await Promise.all([
    db.outreachMessage.aggregate({ _sum: { inputTokens: true, outputTokens: true } }),
    db.outreachMessage.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    db.outreachMessage.aggregate({
      where: { createdAt: { gte: startOfToday } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    db.outreachMessage.count(),
  ])

  const allTimeInput = allTime._sum.inputTokens ?? 0
  const allTimeOutput = allTime._sum.outputTokens ?? 0
  const monthInput = thisMonth._sum.inputTokens ?? 0
  const monthOutput = thisMonth._sum.outputTokens ?? 0
  const todayInput = today._sum.inputTokens ?? 0
  const todayOutput = today._sum.outputTokens ?? 0

  return NextResponse.json({
    allTime: {
      inputTokens: allTimeInput,
      outputTokens: allTimeOutput,
      cost: calcCost(allTimeInput, allTimeOutput),
    },
    thisMonth: {
      inputTokens: monthInput,
      outputTokens: monthOutput,
      cost: calcCost(monthInput, monthOutput),
    },
    today: {
      inputTokens: todayInput,
      outputTokens: todayOutput,
      cost: calcCost(todayInput, todayOutput),
    },
    totalMessages,
    model: 'claude-haiku-4-5',
    pricing: { inputPerM: HAIKU_INPUT_PER_M, outputPerM: HAIKU_OUTPUT_PER_M },
  })
}
