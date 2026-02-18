'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  content: string;
  className?: string;
}

export default function Markdown({ content, className = '' }: MarkdownProps) {
  return (
    <div className={`prose prose-sm max-w-none ${className}`} style={{ color: 'var(--foreground)' }}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      skipHtml={true}
      allowedElements={[
        'p', 'strong', 'em', 'del', 'a', 'code', 'pre', 'blockquote',
        'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      ]}
      components={{
        a: ({ href, children }) => (
          <a
            href={href}
            target={href?.startsWith('http') ? '_blank' : undefined}
            rel={href?.startsWith('http') ? 'noopener noreferrer nofollow' : undefined}
          >
            {children}
          </a>
        ),
        // Keep code blocks compact
        pre: ({ children }) => (
          <pre
            className="rounded p-2 overflow-x-auto text-xs"
            style={{
              background: 'color-mix(in srgb, var(--foreground) 8%, var(--background))',
              color: 'var(--foreground)',
            }}
          >
            {children}
          </pre>
        ),
        code: ({ children, className }) => {
          const isInline = !className;
          return isInline ? (
            <code
              className="rounded px-1 py-0.5 text-xs"
              style={{
                background: 'color-mix(in srgb, var(--accent) 12%, var(--background))',
                color: 'var(--foreground)',
              }}
            >
              {children}
            </code>
          ) : (
            <code>{children}</code>
          );
        },
        // Compact lists
        ul: ({ children }) => <ul className="list-disc pl-4 my-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 my-1">{children}</ol>,
        li: ({ children }) => <li className="my-0.5">{children}</li>,
        // Compact paragraphs
        p: ({ children }) => <p className="my-1">{children}</p>,
        // Headers
        h1: ({ children }) => <h1 className="text-base font-bold my-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold my-1.5">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold my-1">{children}</h3>,
        // Tables
        table: ({ children }) => (
          <table className="border-collapse border text-xs my-2" style={{ borderColor: 'var(--border)' }}>
            {children}
          </table>
        ),
        th: ({ children }) => (
          <th
            className="border px-2 py-1"
            style={{
              borderColor: 'var(--border)',
              background: 'var(--muted)',
            }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border px-2 py-1" style={{ borderColor: 'var(--border)' }}>{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
