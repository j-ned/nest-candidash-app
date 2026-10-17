import { toVisitSource } from './visit-source';

describe('toVisitSource', () => {
  it.each([
    ['www.google.com', 'Google'],
    ['www.google.fr', 'Google'],
    ['mail.google.com', 'Gmail'],
    ['www.linkedin.com', 'LinkedIn'],
    ['lnkd.in', 'LinkedIn'],
    ['com.linkedin.android', 'LinkedIn'],
    ['t.co', 'X (Twitter)'],
    ['l.facebook.com', 'Facebook'],
    ['chatgpt.com', 'ChatGPT'],
    ['www.bing.com', 'Bing'],
    ['duckduckgo.com', 'DuckDuckGo'],
    ['github.com', 'GitHub'],
    ['nedellec-julien.fr', 'Portfolio'],
  ])('names the referrer host %s as %s', (host, expected) => {
    expect(toVisitSource('/', host)).toBe(expected);
  });

  it('keeps an unknown host without its www prefix', () => {
    expect(toVisitSource('/', 'www.blog-dev.example')).toBe('blog-dev.example');
  });

  it.each([
    ['/?utm_source=linkedin&utm_medium=social', 'LinkedIn'],
    ['/features?utm_source=Newsletter', 'newsletter'],
    ['/?ref=malt', 'Malt'],
    ['/?utm_source=whatsapp', 'WhatsApp'],
  ])('prefers the tag in %s over the referrer', (path, expected) => {
    expect(toVisitSource(path, 'www.google.com')).toBe(expected);
  });

  it.each([
    ['/', null],
    ['/?utm_source=', null],
    [`/?utm_source=${'x'.repeat(80)}`, 'x'.repeat(40)],
  ])('handles %s without referrer', (path, expected) => {
    expect(toVisitSource(path, null)).toBe(expected);
  });
});
