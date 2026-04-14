// Markdown rendering service component
// Converts raw markdown strings into React elements
// Implements GitHub Flavored Markdown (GFM) support
// Enforces XSS prevention by escaping raw HTML nodes
// Provides sanitized output for untrusted repository content
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = Readonly<{
  content: string;
}>;

export function MarkdownContent({ content }: Props) {
  return (
    <div className="md-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
