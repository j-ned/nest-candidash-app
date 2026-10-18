// Paramètres ajoutés par les plateformes ou les campagnes : ils ne désignent pas l'offre.
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'ttclid',
  'twclid',
  'li_fat_id',
  'trk',
  'trackingid',
  'refid',
  'ref',
  'from',
  'vjs',
  'tk',
  'src',
  'source',
]);

function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return key.startsWith('utm_') || TRACKING_PARAMS.has(key);
}

/**
 * Forme canonique d'une URL d'offre pour repérer un doublon : https, hôte sans « www. »,
 * sans fragment ni slash final, paramètres de suivi retirés et paramètres restants triés
 * (ceux qui identifient l'offre, comme `jk` chez Indeed ou `currentJobId` chez LinkedIn, sont gardés).
 */
export function normalizeJobUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname.replace(/\/+$/, '');
  const params = [...url.searchParams.entries()]
    .filter(([name]) => !isTrackingParam(name))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length
    ? `?${new URLSearchParams(params).toString()}`
    : '';
  return `https://${host}${path}${query}`;
}
