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

function matchesHost(host: string, pattern: string): boolean {
  if (pattern.endsWith('.')) {
    return host.startsWith(pattern) || host.includes(`.${pattern}`);
  }
  return host === pattern || host.endsWith(`.${pattern}`);
}

function tagOf(rawPath: string): string | null {
  const query = rawPath.split('#')[0].split('?')[1];
  if (!query) return null;
  const params = new URLSearchParams(query);
  const tag = (params.get('utm_source') ?? params.get('ref') ?? '')
    .trim()
    .toLowerCase();
  return tag ? tag.slice(0, MAX_TAG_LENGTH) : null;
}

/**
 * Origine lisible d'une visite. Un tag explicite (utm_source, ref) l'emporte sur le referrer :
 * les applis mobiles et les messageries ne transmettent pas de referrer, seul le tag les identifie.
 * null = accès direct ou origine masquée.
 */
export function toVisitSource(
  rawPath: string,
  referrerHost: string | null,
): string | null {
  const tag = tagOf(rawPath);
  if (tag) {
    return (
      KNOWN_SOURCES.find((source) => source.tags.includes(tag))?.label ?? tag
    );
  }
  if (!referrerHost) return null;
  const host = referrerHost.toLowerCase();
  return (
    KNOWN_SOURCES.find((source) =>
      source.hosts.some((pattern) => matchesHost(host, pattern)),
    )?.label ?? host.replace(/^www\./, '')
  );
}
