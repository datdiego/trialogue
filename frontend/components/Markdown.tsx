'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  content: string;
  className?: string;
}

export default function Markdown({ content, className = '' }: MarkdownProps) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className}`}>
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
          <pre className="bg-gray-800 dark:bg-gray-900 text-gray-100 rounded p-2 overflow-x-auto text-xs">
            {children}
          </pre>
        ),
        code: ({ children, className }) => {
          const isInline = !className;
          return isInline ? (
            <code className="bg-gray-200 dark:bg-gray-600 rounded px-1 py-0.5 text-xs">
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
          <table className="border-collapse border border-gray-300 dark:border-gray-600 text-xs my-2">
            {children}
          </table>
        ),
        th: ({ children }) => (
          <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 bg-gray-100 dark:bg-gray-700">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
