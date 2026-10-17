type KnownSource = {
  label: string;
  /** Hôtes exacts ou suffixes de domaine (« google. » couvre google.fr, google.com…). */
  hosts: readonly string[];
  /** Valeurs de utm_source / ref reconnues, en minuscules. */
  tags: readonly string[];
};

// L'ordre compte : Gmail avant Google.
const KNOWN_SOURCES: readonly KnownSource[] = [
  { label: 'Gmail', hosts: ['mail.google.com'], tags: ['gmail'] },
  { label: 'Google', hosts: ['google.'], tags: ['google'] },
  { label: 'Bing', hosts: ['bing.com'], tags: ['bing'] },
  { label: 'DuckDuckGo', hosts: ['duckduckgo.com'], tags: ['duckduckgo'] },
  { label: 'Qwant', hosts: ['qwant.com'], tags: ['qwant'] },
  { label: 'Ecosia', hosts: ['ecosia.org'], tags: ['ecosia'] },
  {
    label: 'LinkedIn',
    hosts: ['linkedin.com', 'lnkd.in', 'com.linkedin.android'],
    tags: ['linkedin'],
  },
  {
    label: 'X (Twitter)',
    hosts: ['t.co', 'x.com', 'twitter.com'],
    tags: ['x', 'twitter'],
  },
  {
    label: 'Facebook',
    hosts: ['facebook.com', 'fb.me'],
    tags: ['facebook', 'fb'],
  },
  { label: 'Instagram', hosts: ['instagram.com'], tags: ['instagram'] },
  { label: 'WhatsApp', hosts: ['whatsapp.com', 'wa.me'], tags: ['whatsapp'] },
  {
    label: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    tags: ['chatgpt'],
  },
  { label: 'Perplexity', hosts: ['perplexity.ai'], tags: ['perplexity'] },
  { label: 'Claude', hosts: ['claude.ai'], tags: ['claude'] },
  { label: 'GitHub', hosts: ['github.com'], tags: ['github'] },
  { label: 'Malt', hosts: ['malt.fr', 'malt.com'], tags: ['malt'] },
  {
    label: 'Outlook',
    hosts: ['outlook.live.com', 'outlook.office.com'],
    tags: ['outlook'],
  },
  { label: 'Portfolio', hosts: ['nedellec-julien.fr'], tags: ['portfolio'] },
];

const MAX_TAG_LENGTH = 40;

// Navigateurs intégrés aux applis : leur user-agent porte la signature de l'appli.
// L'ordre compte : Instagram et Messenger avant Facebook (leurs UA contiennent aussi FBAN/FBAV).
const IN_APP_BROWSERS: readonly { label: string; pattern: RegExp }[] = [
  { label: 'LinkedIn', pattern: /LinkedInApp/i },
  { label: 'Instagram', pattern: /Instagram/i },
  {
    label: 'Messenger',
    pattern: /MessengerForiOS|MessengerLite|Orca-Android/i,
  },
  { label: 'Facebook', pattern: /FBAN|FBAV|FB_IAB|FBIOS|FB4A/ },
  { label: 'TikTok', pattern: /musical_ly|BytedanceWebview|TikTok/i },
  { label: 'Snapchat', pattern: /Snapchat/i },
  { label: 'X (Twitter)', pattern: /Twitter for/i },
  { label: 'Pinterest', pattern: /Pinterest/i },
  { label: 'Google', pattern: /\bGSA\// },
];

// Identifiants de clic ajoutés d'office aux liens sortants par les plateformes.
const CLICK_IDS: readonly { label: string; params: readonly string[] }[] = [
  { label: 'Facebook', params: ['fbclid'] },
  { label: 'Google Ads', params: ['gclid', 'gbraid', 'wbraid'] },
  { label: 'Microsoft Ads', params: ['msclkid'] },
  { label: 'TikTok', params: ['ttclid'] },
  { label: 'LinkedIn', params: ['li_fat_id'] },
  { label: 'X (Twitter)', params: ['twclid'] },
];

function matchesHost(host: string, pattern: string): boolean {
  if (pattern.endsWith('.')) {
    return host.startsWith(pattern) || host.includes(`.${pattern}`);
  }
  return host === pattern || host.endsWith(`.${pattern}`);
}

function queryOf(rawPath: string): URLSearchParams {
  return new URLSearchParams(rawPath.split('#')[0].split('?')[1] ?? '');
}

function tagOf(params: URLSearchParams): string | null {
  const tag = (params.get('utm_source') ?? params.get('ref') ?? '')
    .trim()
    .toLowerCase();
  return tag ? tag.slice(0, MAX_TAG_LENGTH) : null;
}

function referrerSource(referrerHost: string): string {
  const host = referrerHost.toLowerCase();
  return (
    KNOWN_SOURCES.find((source) =>
      source.hosts.some((pattern) => matchesHost(host, pattern)),
    )?.label ?? host.replace(/^www\./, '')
  );
}

/**
 * Origine lisible d'une visite, du signal le plus explicite au plus indirect :
 * 1. tag posé sur le lien (utm_source, ref) ;
 * 2. referrer transmis par le navigateur ;
 * 3. navigateur intégré d'une appli (user-agent, jamais stocké) ;
 * 4. identifiant de clic ajouté par une plateforme (fbclid, gclid…).
 * null = accès direct ou origine masquée (mail, messageries, favoris, QR code).
 */
export function toVisitSource(
  rawPath: string,
  referrerHost: string | null,
  userAgent: string,
): string | null {
  const params = queryOf(rawPath);
  const tag = tagOf(params);
  if (tag) {
    return (
      KNOWN_SOURCES.find((source) => source.tags.includes(tag))?.label ?? tag
    );
  }
  if (referrerHost) return referrerSource(referrerHost);
  const inApp = IN_APP_BROWSERS.find(({ pattern }) => pattern.test(userAgent));
  if (inApp) return inApp.label;
  return (
    CLICK_IDS.find(({ params: names }) =>
      names.some((name) => params.has(name)),
    )?.label ?? null
  );
}
