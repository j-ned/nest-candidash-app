import { createHmac } from 'node:crypto';

const MAX_PATH_LENGTH = 200;
const EXCLUDED_PREFIXES = ['/admin'];
const ID_SEGMENT =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;
const BOT_UA =
  /bot|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl|wget|python|axios|node-fetch/i;

/**
 * Identifiant de visite : HMAC(secret, ip|ua|jour). Il change chaque jour et ne peut pas être
 * recalculé depuis une IP sans le secret ; ni l'IP ni le user-agent ne sont stockés.
 */
export function toVisitorHash(
  secret: string,
  ip: string,
  userAgent: string,
  day: string,
): string {
  return createHmac('sha256', secret)
    .update(`${ip}|${userAgent}|${day}`)
    .digest('hex');
}

/** Chemin sans query ni fragment, identifiants masqués ; null si la page ne se mesure pas. */
export function toTrackedPath(raw: string): string | null {
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  const pathname = raw.split(/[?#]/)[0];
  const trimmed = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (
    EXCLUDED_PREFIXES.some(
      (prefix) => trimmed === prefix || trimmed.startsWith(`${prefix}/`),
    )
  ) {
    return null;
  }
  const masked = trimmed
    .split('/')
    .map((segment) => (ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/');
  return masked.slice(0, MAX_PATH_LENGTH);
}

/** Hôte d'un referrer externe ; null pour une navigation interne ou une valeur invalide. */
export function toReferrerHost(
  referrer: string | undefined,
  ownHost: string,
): string | null {
  if (!referrer) return null;
  try {
    const { hostname } = new URL(referrer);
    return hostname && hostname !== ownHost ? hostname : null;
  } catch {
    return null;
  }
}

export function isBot(userAgent: string): boolean {
  return userAgent.trim() === '' || BOT_UA.test(userAgent);
}
