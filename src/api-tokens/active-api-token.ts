import { and, gte, isNull, or } from 'drizzle-orm';
import { apiTokens } from '../db/schema';

// Un jeton inutilisé depuis 90 jours expire (ex. extension oubliée sur une ancienne
// machine). Fenêtre glissante : un usage régulier de l'extension ne déconnecte jamais.
export const API_TOKEN_IDLE_DAYS = 90;

/** Jeton ni révoqué ni expiré par inactivité. */
export function activeApiToken() {
  const cutoff = new Date(
    Date.now() - API_TOKEN_IDLE_DAYS * 24 * 60 * 60 * 1000,
  );
  return and(
    isNull(apiTokens.revokedAt),
    or(
      gte(apiTokens.derniereUtilisation, cutoff),
      and(
        isNull(apiTokens.derniereUtilisation),
        gte(apiTokens.createdAt, cutoff),
      ),
    ),
  );
}
