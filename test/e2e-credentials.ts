import { randomBytes, randomUUID } from 'node:crypto';

export interface E2eCredentials {
  email: string;
  password: string;
}

// Identifiants jetables générés à chaque exécution : aucun compte réel n'est
// versionné. Le domaine example.com est réservé (RFC 2606), aucun e-mail
// envoyé par l'API (vérification d'inscription) n'atteint une vraie boîte.
// E2E_TEST_EMAIL / E2E_TEST_PASSWORD permettent de réutiliser un compte de
// test existant sur une base locale persistante.
export function generateE2eCredentials(label: string): E2eCredentials {
  return {
    email: `e2e-${label}-${randomUUID()}@example.com`,
    password: randomBytes(18).toString('base64url'),
  };
}

export function e2eCredentialsFromEnv(label: string): E2eCredentials {
  const { E2E_TEST_EMAIL, E2E_TEST_PASSWORD } = process.env;
  return E2E_TEST_EMAIL && E2E_TEST_PASSWORD
    ? { email: E2E_TEST_EMAIL, password: E2E_TEST_PASSWORD }
    : generateE2eCredentials(label);
}
