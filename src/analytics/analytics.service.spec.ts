import { ConfigService } from '@nestjs/config';
import { AnalyticsService } from './analytics.service';
import type { DrizzleService } from '../db/drizzle.service';

describe('AnalyticsService.track', () => {
  const FIREFOX =
    'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0';

  function setup() {
    const values = jest.fn().mockResolvedValue(undefined);
    const insert = jest.fn().mockReturnValue({ values });
    const drizzle = { db: { insert } } as unknown as DrizzleService;
    const config = { getOrThrow: jest.fn().mockReturnValue('jwt-secret') };
    const service = new AnalyticsService(
      drizzle,
      config as unknown as ConfigService,
    );
    return { service, values };
  }

  it('records the page with an external referrer host and no IP', async () => {
    const { service, values } = setup();

    await service.track(
      { path: '/features?x=1', referrer: 'https://www.google.com/search?q=1' },
      {
        ip: '203.0.113.7',
        userAgent: FIREFOX,
        origin: 'https://candidash.example',
      },
    );

    const [[row]] = values.mock.calls as [[Record<string, string | null>]];
    expect(row.path).toBe('/features');
    expect(row.referrerHost).toBe('www.google.com');
    expect(row.source).toBe('Google');
    expect(row.visitorHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain('203.0.113.7');
  });

  it('names the source from the utm tag of the landing page', async () => {
    const { service, values } = setup();

    await service.track(
      { path: '/?utm_source=linkedin' },
      {
        ip: '203.0.113.7',
        userAgent: FIREFOX,
        origin: 'https://candidash.example',
      },
    );

    const [[row]] = values.mock.calls as [[Record<string, string | null>]];
    expect(row.source).toBe('LinkedIn');
    expect(row.path).toBe('/');
  });

  it.each([
    ['a bot', '/features', 'Googlebot/2.1'],
    ['an admin page', '/admin', FIREFOX],
    ['an external URL', 'https://evil.example/', FIREFOX],
  ])('ignores %s', async (_case, path, userAgent) => {
    const { service, values } = setup();

    await service.track(
      { path },
      { ip: '203.0.113.7', userAgent, origin: 'https://candidash.example' },
    );

    expect(values).not.toHaveBeenCalled();
  });

  it('never throws when the database fails', async () => {
    const { service, values } = setup();
    values.mockRejectedValue(new Error('db down'));

    await expect(
      service.track(
        { path: '/' },
        { ip: '203.0.113.7', userAgent: FIREFOX, origin: undefined },
      ),
    ).resolves.toBeUndefined();
  });
});
