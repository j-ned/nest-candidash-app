import type { CookieOptions, Response } from 'express';

const ACCESS_MAX_AGE = 24 * 60 * 60 * 1000; // 24 heures, comme le JWT d'accès
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 jours

// Cookie-only : les jetons ne transitent jamais par le body ni par le JS.
// Lu à l'appel (et non à l'import) pour suivre NODE_ENV chargé par la config.
function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

export function setAuthCookies(
  response: Response,
  tokens: { access_token: string; refresh_token: string },
): void {
  response.cookie('refresh_token', tokens.refresh_token, {
    ...cookieOptions(),
    maxAge: REFRESH_MAX_AGE,
  });
  response.cookie('access_token', tokens.access_token, {
    ...cookieOptions(),
    maxAge: ACCESS_MAX_AGE,
  });
}

export function clearAuthCookies(response: Response): void {
  response.clearCookie('refresh_token', cookieOptions());
  response.clearCookie('access_token', cookieOptions());
}
