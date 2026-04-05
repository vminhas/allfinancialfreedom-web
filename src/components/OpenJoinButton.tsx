'use client'

interface Props {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export default function OpenJoinButton({ children, className, style }: Props) {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('open-join'))}
      className={className}
      style={style}
    >
      {children}
    </button>
  )
}
