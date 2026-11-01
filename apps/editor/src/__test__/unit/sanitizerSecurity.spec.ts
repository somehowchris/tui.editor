import { sanitizeHTML } from '@/sanitizer/htmlSanitizer';
import DOMPurify from 'dompurify';

describe('sanitizer boundary after HTML reparsing', () => {
  it('rejects unsupported browsers instead of returning raw markup', () => {
    const supported = DOMPurify.isSupported;

    try {
      DOMPurify.isSupported = false;
      expect(() => sanitizeHTML('<img src=x onerror=alert(1)>')).toThrow(
        'Safe HTML sanitization is unavailable'
      );
    } finally {
      DOMPurify.isSupported = supported;
    }
  });

  const hostile = [
    '<img src="x" onerror="alert(1)"><script>alert(1)</script>',
    '<a href="javascript:alert(1)">link</a>',
    '<svg></p><style><a id="</style><img src=1 onerror=alert(1)>"></svg>',
    '<math><mtext><table><mglyph><style><img src onerror=alert(1)>',
    `${'<div>'.repeat(600)}<img src=x onerror=alert(1)>${'</div>'.repeat(600)}`,
  ];

  it.each(hostile)('removes executable markup from %s', (html) => {
    const container = document.createElement('div');
    container.innerHTML = sanitizeHTML(html);
    expect(container.querySelector('script,object,embed,iframe')).toBeNull();
    container.querySelectorAll('*').forEach((node) => {
      Array.from(node.attributes).forEach(({ name, value }) => {
        expect(name.toLowerCase().startsWith('on')).toBe(false);
        if (['href', 'src', 'xlink:href'].includes(name.toLowerCase())) {
          expect(value.replace(/[\u0000-\u0020]/g, '').toLowerCase()).not.toMatch(
            /^(javascript|vbscript):/
          );
        }
      });
    });
  });

  it('preserves the fragment return contract used by link and image nodes', () => {
    const fragment = sanitizeHTML<DocumentFragment>(
      '<a href="https://example.test/" target="_blank">safe</a>',
      { RETURN_DOM_FRAGMENT: true }
    );
    expect(fragment instanceof DocumentFragment).toBe(true);
    expect(fragment.querySelector('a')?.getAttribute('href')).toBe('https://example.test/');
    expect(fragment.textContent).toBe('safe');
  });
});
