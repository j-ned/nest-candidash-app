import { toVisitSource } from './visit-source';

const FIREFOX =
  'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

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
    expect(toVisitSource('/', host, FIREFOX)).toBe(expected);
  });

  it('keeps an unknown host without its www prefix', () => {
    expect(toVisitSource('/', 'www.blog-dev.example', FIREFOX)).toBe(
      'blog-dev.example',
    );
  });

  it.each([
    ['/?utm_source=linkedin&utm_medium=social', 'LinkedIn'],
    ['/features?utm_source=Newsletter', 'newsletter'],
    ['/?ref=malt', 'Malt'],
    ['/?utm_source=whatsapp', 'WhatsApp'],
  ])('prefers the tag in %s over the referrer', (path, expected) => {
    expect(toVisitSource(path, 'www.google.com', FIREFOX)).toBe(expected);
  });

  it.each([
    ['/', null],
    ['/?utm_source=', null],
    [`/?utm_source=${'x'.repeat(80)}`, 'x'.repeat(40)],
  ])('handles %s without referrer', (path, expected) => {
    expect(toVisitSource(path, null, FIREFOX)).toBe(expected);
  });

  describe('without tag nor referrer', () => {
    it.each([
      ['LinkedIn', `${IPHONE} [LinkedInApp]/9.30.1`],
      [
        'Instagram',
        `${IPHONE} Instagram 352.0.0.25.92 (iPhone15,2; iOS 18_1; fr_FR)`,
      ],
      ['Facebook', `${IPHONE} [FBAN/FBIOS;FBAV/485.0.0.39.106;FBBV/1]`],
      [
        'Facebook',
        'Mozilla/5.0 (Linux; Android 15) Chrome/141.0 Mobile [FB_IAB/FB4A;FBAV/485.0.0.40.109;]',
      ],
      ['Messenger', `${IPHONE} [FBAN/MessengerForiOS;FBAV/485.0]`],
      ['TikTok', `${IPHONE} musical_ly_37.5.0 BytedanceWebview/d8a21c6`],
      [
        'Snapchat',
        `${IPHONE} Snapchat/13.20.0.39 (like Safari/8618.1.15.10.15)`,
      ],
      ['X (Twitter)', `${IPHONE} Twitter for iPhone/10.70`],
      ['Pinterest', `${IPHONE} [Pinterest/iOS]`],
      ['Google', `${IPHONE} GSA/350.0.698229112 Mobile/15E148 Safari/604.1`],
    ])('recognises the %s in-app browser', (expected, userAgent) => {
      expect(toVisitSource('/', null, userAgent)).toBe(expected);
    });

    it.each([
      ['/?fbclid=IwAR0abc', 'Facebook'],
      ['/?gclid=Cj0KCQ', 'Google Ads'],
      ['/?gbraid=0AAAA', 'Google Ads'],
      ['/?msclkid=7b1', 'Microsoft Ads'],
      ['/?ttclid=E.C.P', 'TikTok'],
      ['/?li_fat_id=a1b2', 'LinkedIn'],
      ['/?twclid=2-abc', 'X (Twitter)'],
    ])('recognises the click identifier in %s', (path, expected) => {
      expect(toVisitSource(path, null, FIREFOX)).toBe(expected);
    });

    it('trusts the in-app browser over a shared click identifier', () => {
      expect(
        toVisitSource(
          '/?fbclid=IwAR0abc',
          null,
          `${IPHONE} Instagram 352.0.0.25.92`,
        ),
      ).toBe('Instagram');
    });
  });

  it('keeps an explicit tag above every automatic signal', () => {
    expect(
      toVisitSource(
        '/?utm_source=cv&fbclid=x',
        'www.google.com',
        `${IPHONE} [LinkedInApp]`,
      ),
    ).toBe('cv');
  });

  it('keeps the referrer above the in-app browser', () => {
    expect(
      toVisitSource('/', 'www.google.com', `${IPHONE} [LinkedInApp]`),
    ).toBe('Google');
  });
});
