'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

export default function BlogSearch({
  initialValue,
  category,
}: {
  initialValue: string
  category: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState(initialValue)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  const push = (term: string) => {
    const params = new URLSearchParams()
    if (term) params.set('search', term)
    if (category && category !== 'All') params.set('category', category)
    // page resets to 1 on new search
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleChange = (term: string) => {
    setValue(term)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => push(term), 350)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      clearTimeout(timerRef.current)
      push(value)
    }
    if (e.key === 'Escape') {
      clearTimeout(timerRef.current)
      setValue('')
      push('')
    }
  }

  return (
    <div style={{ position: 'relative', minWidth: 220 }}>
      {/* Search icon */}
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        style={{
          position: 'absolute',
          left: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 14,
          height: 14,
          color: '#9BB0C4',
          pointerEvents: 'none',
        }}
      >
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M15 15l-3-3" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search articles..."
        style={{
          paddingLeft: 32,
          paddingRight: 12,
          paddingTop: '0.38rem',
          paddingBottom: '0.38rem',
          fontSize: '0.72rem',
          letterSpacing: '0.04em',
          border: '1px solid rgba(27,58,92,0.15)',
          borderRadius: 2,
          background: 'white',
          color: '#1B3A5C',
          outline: 'none',
          width: '100%',
        }}
      />
    </div>
  )
}
