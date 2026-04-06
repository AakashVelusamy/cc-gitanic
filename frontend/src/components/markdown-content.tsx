import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
}

/**
 * Renders Markdown to React elements.
 *
 * SECURITY: rehype-raw is intentionally NOT used here.
 * Raw HTML passthrough from arbitrary repo content (README.md written by repo
 * owners) would be an XSS vector (S5247). ReactMarkdown's default behaviour
 * escapes raw HTML nodes, which is the safe default for untrusted input.
 */
export function MarkdownContent({ content }: Props) {
  return (
    <div className="md-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
