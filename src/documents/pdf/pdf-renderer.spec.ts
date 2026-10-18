import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PdfRenderer } from './pdf-renderer';

function renderer(
  url: string | undefined,
  credentials: {
    GOTENBERG_USERNAME?: string;
    GOTENBERG_PASSWORD?: string;
  } = {},
): PdfRenderer {
  const env: Record<string, string | undefined> = {
    GOTENBERG_URL: url,
    ...credentials,
  };
  return new PdfRenderer({
    get: (key: string) => env[key],
  } as unknown as ConfigService);
}

describe('PdfRenderer', () => {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('sends the HTML page to Gotenberg and returns the PDF', async () => {
    fetchMock.mockResolvedValue(new Response(Buffer.from('%PDF-1.7')));

    const pdf = await renderer('http://gotenberg:3000/').render('<p>CV</p>');

    expect(pdf.toString()).toBe('%PDF-1.7');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://gotenberg:3000/forms/chromium/convert/html');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    const file = form.get('files') as File;
    expect(file.name).toBe('index.html');
    expect(await file.text()).toBe('<p>CV</p>');
    expect(form.get('preferCssPageSize')).toBe('true');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('authenticates when Gotenberg is protected by basic auth', async () => {
    fetchMock.mockResolvedValue(new Response(Buffer.from('%PDF-1.7')));

    await renderer('http://gotenberg:3000', {
      GOTENBERG_USERNAME: 'candidash',
      GOTENBERG_PASSWORD: 's3cret:é',
    }).render('<p>CV</p>');

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).get('Authorization')).toBe(
      `Basic ${Buffer.from('candidash:s3cret:é').toString('base64')}`,
    );
  });

  it('sends no credentials when none are configured', async () => {
    fetchMock.mockResolvedValue(new Response(Buffer.from('%PDF-1.7')));

    await renderer('http://gotenberg:3000').render('<p>CV</p>');

    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
  });

  it('is unavailable when Gotenberg is not configured', async () => {
    await expect(renderer(undefined).render('<p>CV</p>')).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an error status',
      () => Promise.resolve(new Response('boom', { status: 500 })),
    ],
    ['a network failure', () => Promise.reject(new TypeError('fetch failed'))],
  ])('reports a bad gateway on %s', async (_case, answer) => {
    fetchMock.mockImplementation(answer);

    await expect(
      renderer('http://gotenberg:3000').render('<p>CV</p>'),
    ).rejects.toThrow(BadGatewayException);
  });
});
