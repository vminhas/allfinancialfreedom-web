'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface GuideSectionProps {
  title: string
  icon: LucideIcon
  children: React.ReactNode
  defaultOpen?: boolean
}

export function GuideSection({ title, icon: Icon, children, defaultOpen = false }: GuideSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{
      background: '#132238',
      border: '1px solid rgba(201,169,110,0.1)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '18px 24px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <Icon size={18} color="#C9A96E" />
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#ffffff', letterSpacing: '0.02em' }}>
          {title}
        </span>
        <ChevronDown size={16} color="#6B8299" style={{
          transition: 'transform 0.2s',
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
        }} />
      </button>
      {open && (
        <div style={{
          padding: '0 24px 20px 54px',
          fontSize: 13, color: '#9BB0C4', lineHeight: 1.7,
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

export function GuideStep({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, color: '#C9A96E',
      }}>{number}</div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#ffffff', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#9BB0C4', lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}

export function GuideTip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      margin: '12px 0', padding: '10px 14px',
      background: 'rgba(201,169,110,0.06)',
      border: '1px solid rgba(201,169,110,0.15)',
      borderRadius: 6, fontSize: 12, color: '#C9A96E', lineHeight: 1.5,
    }}>
      {children}
    </div>
  )
}
