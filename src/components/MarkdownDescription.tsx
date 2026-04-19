'use client'

import ReactMarkdown from 'react-markdown'

export default function MarkdownDescription({ text, style }: { text: string; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p style={{ margin: '0 0 6px', lineHeight: 1.6 }}>{children}</p>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: '#C9A96E', textDecoration: 'underline', cursor: 'pointer' }}
            >{children}</a>
          ),
          strong: ({ children }) => <strong style={{ color: '#ffffff', fontWeight: 600 }}>{children}</strong>,
          em: ({ children }) => <em style={{ color: '#9BB0C4' }}>{children}</em>,
          ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ol>,
          li: ({ children }) => <li style={{ marginBottom: 2, lineHeight: 1.5 }}>{children}</li>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
