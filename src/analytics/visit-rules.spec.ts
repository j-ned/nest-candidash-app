import {
  isBot,
  toReferrerHost,
  toTrackedPath,
  toVisitorHash,
} from './visit-rules';

describe('visit rules', () => {
  describe('toVisitorHash', () => {
    const base = [
      'secret',
      '203.0.113.7',
      'Firefox/144',
      '2026-10-17',
    ] as const;

    it('is stable for the same visitor on the same day', () => {
      expect(toVisitorHash(...base)).toBe(toVisitorHash(...base));
    });

    it.each([
      ['another day', 'secret', '203.0.113.7', '2026-10-18'],
      ['another IP', 'secret', '203.0.113.8', '2026-10-17'],
      ['another secret', 'other', '203.0.113.7', '2026-10-17'],
    ])('changes with %s', (_case, secret, ip, day) => {
      expect(toVisitorHash(secret, ip, 'Firefox/144', day)).not.toBe(
        toVisitorHash(...base),
      );
    });

    it('never contains the IP in clear', () => {
      expect(toVisitorHash(...base)).not.toContain('203.0.113.7');
    });
  });

  describe('toTrackedPath', () => {
    it.each([
      ['/', '/'],
      ['/features?utm_source=x#top', '/features'],
      ['/dashboard/jobtrack/', '/dashboard/jobtrack'],
    ])('keeps %s as %s', (input, expected) => {
      expect(toTrackedPath(input)).toBe(expected);
    });

    it.each([
      '/admin',
      '/admin/users',
      'https://evil.example/',
      'javascript:1',
      '',
    ])('ignores %s', (input) => {
      expect(toTrackedPath(input)).toBeNull();
    });

    it('masks identifiers so personal pages do not leak', () => {
      expect(
        toTrackedPath(
          '/dashboard/jobtrack/0f8b6c1e-4a7d-4b6e-9b1a-2c3d4e5f6a7b',
        ),
      ).toBe('/dashboard/jobtrack/:id');
    });
  });

  describe('toReferrerHost', () => {
    it('keeps only the host of an external referrer', () => {
      expect(
        toReferrerHost(
          'https://www.google.com/search?q=candidash',
          'candidash.example',
        ),
      ).toBe('www.google.com');
    });

    it.each([
      ['an internal navigation', 'https://candidash.example/features'],
      ['an invalid URL', 'not a url'],
      ['no referrer', undefined],
    ])('returns null for %s', (_case, referrer) => {
      expect(toReferrerHost(referrer, 'candidash.example')).toBeNull();
    });
  });

  describe('isBot', () => {
    it.each([
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/141.0.0.0',
      'Mozilla/5.0 (compatible; bingbot/2.0)',
      '',
    ])('flags %s', (ua) => {
      expect(isBot(ua)).toBe(true);
    });

    it('lets a regular browser through', () => {
      expect(
        isBot(
          'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0',
        ),
      ).toBe(false);
    });
  });
});
