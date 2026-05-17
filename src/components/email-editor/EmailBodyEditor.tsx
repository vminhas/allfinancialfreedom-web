'use client'

// WYSIWYG editor for email template bodies. TipTap with a curated
// toolbar (bold, italic, headings, lists, link, variable insert).
//
// We deliberately constrain the formatting choices — email-safe HTML
// is narrow and admins shouldn't be picking fonts or colors that won't
// render in Outlook. The brand styling (gold gradient, navy hero,
// footer) lives in lib/email-template.ts wrapInShell() and isn't
// authorable. Authors only edit the inner body.
//
// Output is HTML stored in EmailTemplate.bodyHtml.

import { useCallback, useEffect } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'

interface VariableHint { name: string; description: string }

export default function EmailBodyEditor({
  value, onChange, variables, disabled,
}: {
  value: string
  onChange: (html: string) => void
  variables: VariableHint[]
  disabled?: boolean
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Drop a few blocks email clients render poorly.
        codeBlock: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,  // SSR-safe; TipTap renders on mount
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // Reconcile when the parent swaps templates without unmounting the
  // editor (e.g. clicking a different row in the list).
  useEffect(() => {
    if (!editor) return
    if (editor.getHTML() !== value) editor.commands.setContent(value, { emitUpdate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    if (editor) editor.setEditable(!disabled)
  }, [editor, disabled])

  if (!editor) {
    return (
      <div style={{ minHeight: 240, padding: 16, color: '#6B8299', fontSize: 12 }}>
        Loading editor...
      </div>
    )
  }

  return (
    <div style={{
      border: '1px solid rgba(201,169,110,0.2)', borderRadius: 6,
      background: '#0F2440', overflow: 'hidden',
    }}>
      <Toolbar editor={editor} variables={variables} />
      <div style={{
        padding: '14px 16px',
        minHeight: 260, maxHeight: 480, overflowY: 'auto',
        color: '#E5EBF2', fontSize: 14, lineHeight: 1.6,
      }}>
        <EditorContent editor={editor} />
      </div>
      <style jsx global>{`
        .ProseMirror {
          outline: none;
          min-height: 240px;
        }
        .ProseMirror p { margin: 0 0 12px; }
        .ProseMirror p:last-child { margin-bottom: 0; }
        .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 {
          color: #ffffff;
          margin: 18px 0 8px;
          line-height: 1.25;
        }
        .ProseMirror h1 { font-size: 22px; font-weight: 600; }
        .ProseMirror h2 { font-size: 18px; font-weight: 600; }
        .ProseMirror h3 { font-size: 15px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #C9A96E; }
        .ProseMirror a { color: #C9A96E; text-decoration: underline; }
        .ProseMirror ul, .ProseMirror ol { margin: 0 0 12px; padding-left: 22px; }
        .ProseMirror li { margin-bottom: 4px; }
        .ProseMirror blockquote {
          border-left: 3px solid #C9A96E;
          padding-left: 12px;
          color: #9BB0C4;
          font-style: italic;
          margin: 12px 0;
        }
        .ProseMirror strong { color: #ffffff; }
      `}</style>
    </div>
  )
}

function Toolbar({ editor, variables }: { editor: Editor; variables: VariableHint[] }) {
  const setLink = useCallback(() => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const insertVar = useCallback((name: string) => {
    editor.chain().focus().insertContent(`{{${name}}}`).run()
  }, [editor])

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 4,
      padding: '8px 10px',
      background: '#132238',
      borderBottom: '1px solid rgba(201,169,110,0.15)',
    }}>
      <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}>B</Btn>
      <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}><i>i</i></Btn>
      <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')}>S</Btn>
      <Sep />
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}>H2</Btn>
      <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}>H3</Btn>
      <Sep />
      <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}>• List</Btn>
      <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}>1. List</Btn>
      <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')}>&quot; Quote</Btn>
      <Sep />
      <Btn onClick={setLink} active={editor.isActive('link')}>🔗 Link</Btn>
      <Sep />
      <select
        onChange={e => {
          const name = e.target.value
          if (name) insertVar(name)
          e.target.value = ''
        }}
        defaultValue=""
        style={{
          background: 'rgba(201,169,110,0.10)', border: '1px solid rgba(201,169,110,0.3)',
          color: '#C9A96E', borderRadius: 3, padding: '4px 7px', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.05em', cursor: 'pointer',
        }}
      >
        <option value="">+ Variable</option>
        {variables.map(v => (
          <option key={v.name} value={v.name}>
            {`{{${v.name}}} — ${v.description}`}
          </option>
        ))}
      </select>
    </div>
  )
}

function Btn({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? 'rgba(201,169,110,0.20)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(201,169,110,0.45)' : 'rgba(255,255,255,0.08)'}`,
        color: active ? '#C9A96E' : '#9BB0C4',
        borderRadius: 3, padding: '4px 9px', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', lineHeight: 1.2,
      }}
    >
      {children}
    </button>
  )
}

function Sep() {
  return <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '0 4px' }} />
}
