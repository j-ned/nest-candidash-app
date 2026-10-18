import { normalizeJobUrl } from './normalize-job-url';

describe('normalizeJobUrl', () => {
  it.each([
    [
      'https://www.welcometothejungle.com/fr/companies/acme/jobs/dev?utm_source=newsletter#apply',
      'https://welcometothejungle.com/fr/companies/acme/jobs/dev',
    ],
    ['https://WWW.Example.com/jobs/42/', 'https://example.com/jobs/42'],
    [
      'https://fr.indeed.com/viewjob?jk=abc123&from=serp&vjs=3',
      'https://fr.indeed.com/viewjob?jk=abc123',
    ],
    [
      'https://www.linkedin.com/jobs/view/4012345678/?trackingId=xyz&refId=abc&trk=public',
      'https://linkedin.com/jobs/view/4012345678',
    ],
    [
      'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678&utm_campaign=x',
      'https://linkedin.com/jobs/collections/recommended?currentJobId=4012345678',
    ],
    [
      'https://example.com/job?b=2&a=1&fbclid=x&gclid=y',
      'https://example.com/job?a=1&b=2',
    ],
  ])('normalises %s', (input, expected) => {
    expect(normalizeJobUrl(input)).toBe(expected);
  });

  it('treats two variants of the same offer as equal', () => {
    expect(
      normalizeJobUrl(
        'http://www.hellowork.com/fr-fr/emplois/123.html?utm_medium=email',
      ),
    ).toBe(normalizeJobUrl('https://hellowork.com/fr-fr/emplois/123.html'));
  });

  it.each(['', 'pas une url', 'javascript:alert(1)'])(
    'returns null for %p',
    (input) => {
      expect(normalizeJobUrl(input)).toBeNull();
    },
  );
});
