import sanitize from 'sanitize-html';
import { bad } from './domain';

export function richText(input: string | null | undefined, max = 5000) {
  const html = sanitize(input ?? '', {
    allowedTags: ['p', 'br', 'ul', 'ol', 'li', 'strong', 'em'],
    allowedAttributes: {},
  }).trim();
  // Decode entities via the parser, retaining separation between blocks.
  let text = '';
  sanitize(html, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: (value) => {
      text += value;
      return value;
    },
    exclusiveFilter: (frame) => {
      if (['p', 'li', 'br'].includes(frame.tag)) text += '\n';
      return false;
    },
  });
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
  if (text.length > max) bad(`Text must contain at most ${max} characters.`);
  return text ? { html, text } : { html: null, text: null };
}
