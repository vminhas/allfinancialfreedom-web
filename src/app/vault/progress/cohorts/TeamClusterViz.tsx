'use client'

import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { BLOCKER_GROUPS, BLOCKER_META, type AgentProgress, type BlockerKey } from '@/lib/progression-cohorts'

// One dot per agent, clustered by the milestone they're blocked on. The force
// layout runs to completion once and then freezes (no continuous jiggle).
// Agents in highlightCodes (on a development track) get a gold ring so their
// designation is visible even though their dot sits at their real funnel stage.
export default function TeamClusterViz({ rows, onSelect, highlightCodes }: { rows: AgentProgress[]; onSelect: (k: BlockerKey) => void; highlightCodes?: Set<string> }) {
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const W = 900, H = 430, cols = 4
    const active = BLOCKER_GROUPS.filter(g => rows.some(r => r.blocker === g.key))
    const counts = Object.fromEntries(BLOCKER_GROUPS.map(g => [g.key, rows.filter(r => r.blocker === g.key).length])) as Record<BlockerKey, number>
    const centers = {} as Record<BlockerKey, { x: number; y: number }>
    active.forEach((g, i) => {
      const col = i % cols, row = Math.floor(i / cols)
      centers[g.key] = { x: 130 + col * (640 / (cols - 1)), y: active.length <= cols ? 200 : 150 + row * 195 }
    })

    // Deterministic seeded jitter so the layout is identical every render.
    let seed = 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5 }
    type Node = d3.SimulationNodeDatum & { r: AgentProgress }
    const nodes: Node[] = rows.map(r => ({ r, x: centers[r.blocker].x + rnd() * 30, y: centers[r.blocker].y + rnd() * 30 }))

    const sim = d3.forceSimulation(nodes)
      .force('x', d3.forceX<Node>(d => centers[d.r.blocker].x).strength(0.3))
      .force('y', d3.forceY<Node>(d => centers[d.r.blocker].y).strength(0.3))
      .force('collide', d3.forceCollide<Node>(8.6))
      .force('charge', d3.forceManyBody<Node>().strength(-2))
      .stop()
    for (let i = 0; i < 400; i++) sim.tick()

    const svg = d3.select(el)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${W} ${H}`)

    const labels = svg.append('g')
    active.forEach(g => {
      const c = centers[g.key]
      const mk = (y: number, size: number, weight: number, fill: string, text: string) =>
        labels.append('text').attr('x', c.x).attr('y', y).attr('text-anchor', 'middle')
          .attr('font-size', size).attr('font-weight', weight).attr('fill', fill)
          .style('cursor', 'pointer').text(text).on('click', () => onSelect(g.key))
      // Anchor the label block above the TOP-MOST dot with a clear gap so text
      // never overlaps the dots, no matter how small the cluster is.
      const topDot = Math.min(...nodes.filter(n => n.r.blocker === g.key).map(n => n.y ?? c.y))
      const countY = topDot - 18
      const parts = wrap2(g.label)
      if (parts.length === 2) { mk(countY - 30, 12, 700, '#0b192c', parts[0]); mk(countY - 16, 12, 700, '#0b192c', parts[1]) }
      else { mk(countY - 16, 12, 700, '#0b192c', parts[0]) }
      mk(countY, 11, 400, '#6b8299', `${counts[g.key]} agent${counts[g.key] === 1 ? '' : 's'}`)
    })

    const tracked = (d: Node) => !!highlightCodes?.has(d.r.agent.agentCode)
    const circ = svg.append('g').selectAll<SVGCircleElement, Node>('circle').data(nodes).join('circle')
      .attr('r', d => tracked(d) ? 7.2 : 6.6).attr('fill', d => BLOCKER_META[d.r.blocker].color)
      .attr('stroke', d => tracked(d) ? '#c9a96e' : '#fff').attr('stroke-width', d => tracked(d) ? 2.6 : 1.3)
      .attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0).style('cursor', 'pointer')
      .on('click', (_e, d) => onSelect(d.r.blocker))
    circ.append('title').text(d => `${d.r.agent.firstName} ${d.r.agent.lastName} · ${BLOCKER_META[d.r.blocker].label}${tracked(d) ? ' · on a development track' : ''}`)
  }, [rows, onSelect, highlightCodes])

  return <svg ref={ref} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }} />
}

function wrap2(s: string): string[] {
  if (s.length <= 22) return [s]
  const w = s.split(' ')
  const mid = Math.ceil(w.length / 2)
  return [w.slice(0, mid).join(' '), w.slice(mid).join(' ')]
}
