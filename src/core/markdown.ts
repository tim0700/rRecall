import { marked } from 'marked';
import DOMPurify from 'dompurify';
export function renderMarkdown(md: string): string {
  // A DOM is required by DOMPurify. Fail closed during SSR / Node tests.
  if (typeof DOMPurify.sanitize !== 'function') return '';
  return DOMPurify.sanitize(marked.parse(md, { async: false }), { USE_PROFILES: { html: true } });
}
