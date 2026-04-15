import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

// Pricing per million tokens
const HAIKU_INPUT_PER_M  = 0.80
const HAIKU_OUTPUT_PER_M = 4.00
const SONNET_INPUT_PER_M  = 3.00
const SONNET_OUTPUT_PER_M = 15.00
// Prompt cache reads are 10% of input cost, cache writes are 125% of input cost
const CACHE_READ_MULT  = 0.10
const CACHE_WRITE_MULT = 1.25

function calcHaiku(inputTokens: number, outputTokens: number) {
  return (inputTokens / 1_000_000) * HAIKU_INPUT_PER_M + (outputTokens / 1_000_000) * HAIKU_OUTPUT_PER_M
}
function calcSonnet(inputTokens: number, outputTokens: number, cacheRead = 0, cacheWrite = 0) {
  return (
    (inputTokens / 1_000_000) * SONNET_INPUT_PER_M +
    (outputTokens / 1_000_000) * SONNET_OUTPUT_PER_M +
    (cacheRead / 1_000_000) * SONNET_INPUT_PER_M * CACHE_READ_MULT +
    (cacheWrite / 1_000_000) * SONNET_INPUT_PER_M * CACHE_WRITE_MULT
  )
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  // ── Outreach (Haiku) ──────────────────────────────────────────────────────
  const [outAllTime, outMonth, outToday, outCount] = await Promise.all([
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

  // ── Call reviews (Sonnet) ─────────────────────────────────────────────────
  const [rvAllTime, rvMonth, rvToday, rvCount] = await Promise.all([
    db.callReview.aggregate({
      _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheCreateTokens: true },
    }),
    db.callReview.aggregate({
      where: { reviewedAt: { gte: startOfMonth } },
      _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheCreateTokens: true },
    }),
    db.callReview.aggregate({
      where: { reviewedAt: { gte: startOfToday } },
      _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheCreateTokens: true },
    }),
    db.callReview.count(),
  ])

  // ── Training events (Sonnet vision) ────────────────────────────────────────
  const [trAllTime, trMonth, trToday, trCount] = await Promise.all([
    db.trainingEvent.aggregate({ _sum: { inputTokens: true, outputTokens: true } }),
    db.trainingEvent.aggregate({
      where: { parsedAt: { gte: startOfMonth } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    db.trainingEvent.aggregate({
      where: { parsedAt: { gte: startOfToday } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
    db.trainingEvent.count(),
  ])

  const outreach = {
    allTime: {
      inputTokens: outAllTime._sum.inputTokens ?? 0,
      outputTokens: outAllTime._sum.outputTokens ?? 0,
      cost: calcHaiku(outAllTime._sum.inputTokens ?? 0, outAllTime._sum.outputTokens ?? 0),
    },
    thisMonth: {
      inputTokens: outMonth._sum.inputTokens ?? 0,
      outputTokens: outMonth._sum.outputTokens ?? 0,
      cost: calcHaiku(outMonth._sum.inputTokens ?? 0, outMonth._sum.outputTokens ?? 0),
    },
    today: {
      inputTokens: outToday._sum.inputTokens ?? 0,
      outputTokens: outToday._sum.outputTokens ?? 0,
      cost: calcHaiku(outToday._sum.inputTokens ?? 0, outToday._sum.outputTokens ?? 0),
    },
    count: outCount,
    model: 'claude-haiku-4-5',
  }

  const callReviews = {
    allTime: {
      inputTokens: rvAllTime._sum.inputTokens ?? 0,
      outputTokens: rvAllTime._sum.outputTokens ?? 0,
      cacheReadTokens: rvAllTime._sum.cacheReadTokens ?? 0,
      cacheCreateTokens: rvAllTime._sum.cacheCreateTokens ?? 0,
      cost: calcSonnet(
        rvAllTime._sum.inputTokens ?? 0,
        rvAllTime._sum.outputTokens ?? 0,
        rvAllTime._sum.cacheReadTokens ?? 0,
        rvAllTime._sum.cacheCreateTokens ?? 0,
      ),
    },
    thisMonth: {
      inputTokens: rvMonth._sum.inputTokens ?? 0,
      outputTokens: rvMonth._sum.outputTokens ?? 0,
      cacheReadTokens: rvMonth._sum.cacheReadTokens ?? 0,
      cacheCreateTokens: rvMonth._sum.cacheCreateTokens ?? 0,
      cost: calcSonnet(
        rvMonth._sum.inputTokens ?? 0,
        rvMonth._sum.outputTokens ?? 0,
        rvMonth._sum.cacheReadTokens ?? 0,
        rvMonth._sum.cacheCreateTokens ?? 0,
      ),
    },
    today: {
      inputTokens: rvToday._sum.inputTokens ?? 0,
      outputTokens: rvToday._sum.outputTokens ?? 0,
      cacheReadTokens: rvToday._sum.cacheReadTokens ?? 0,
      cacheCreateTokens: rvToday._sum.cacheCreateTokens ?? 0,
      cost: calcSonnet(
        rvToday._sum.inputTokens ?? 0,
        rvToday._sum.outputTokens ?? 0,
        rvToday._sum.cacheReadTokens ?? 0,
        rvToday._sum.cacheCreateTokens ?? 0,
      ),
    },
    count: rvCount,
    model: 'claude-sonnet-4-5',
  }

  const trainings = {
    allTime: {
      inputTokens: trAllTime._sum.inputTokens ?? 0,
      outputTokens: trAllTime._sum.outputTokens ?? 0,
      cost: calcSonnet(trAllTime._sum.inputTokens ?? 0, trAllTime._sum.outputTokens ?? 0),
    },
    thisMonth: {
      inputTokens: trMonth._sum.inputTokens ?? 0,
      outputTokens: trMonth._sum.outputTokens ?? 0,
      cost: calcSonnet(trMonth._sum.inputTokens ?? 0, trMonth._sum.outputTokens ?? 0),
    },
    today: {
      inputTokens: trToday._sum.inputTokens ?? 0,
      outputTokens: trToday._sum.outputTokens ?? 0,
      cost: calcSonnet(trToday._sum.inputTokens ?? 0, trToday._sum.outputTokens ?? 0),
    },
    count: trCount,
    model: 'claude-sonnet-4-5 (vision)',
  }

  // Totals (sum of all three features)
  return NextResponse.json({
    outreach,
    callReviews,
    trainings,
    allTime: {
      inputTokens: outreach.allTime.inputTokens + callReviews.allTime.inputTokens + trainings.allTime.inputTokens,
      outputTokens: outreach.allTime.outputTokens + callReviews.allTime.outputTokens + trainings.allTime.outputTokens,
      cost: outreach.allTime.cost + callReviews.allTime.cost + trainings.allTime.cost,
    },
    thisMonth: {
      inputTokens: outreach.thisMonth.inputTokens + callReviews.thisMonth.inputTokens + trainings.thisMonth.inputTokens,
      outputTokens: outreach.thisMonth.outputTokens + callReviews.thisMonth.outputTokens + trainings.thisMonth.outputTokens,
      cost: outreach.thisMonth.cost + callReviews.thisMonth.cost + trainings.thisMonth.cost,
    },
    today: {
      inputTokens: outreach.today.inputTokens + callReviews.today.inputTokens + trainings.today.inputTokens,
      outputTokens: outreach.today.outputTokens + callReviews.today.outputTokens + trainings.today.outputTokens,
      cost: outreach.today.cost + callReviews.today.cost + trainings.today.cost,
    },
    totalMessages: outreach.count + callReviews.count + trainings.count,
  })
}
