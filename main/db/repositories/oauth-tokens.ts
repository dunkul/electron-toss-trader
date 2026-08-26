import type { DatabaseSync } from 'node:sqlite';
import type { OAuthTokenRow } from '../schema';

export function getValidToken(db: DatabaseSync): OAuthTokenRow | undefined {
  return db
    .prepare('SELECT * FROM oauth_tokens WHERE expires_at > ? ORDER BY issued_at DESC LIMIT 1')
    .get(new Date().toISOString()) as OAuthTokenRow | undefined;
}

export function saveToken(
  db: DatabaseSync,
  input: { accessToken: string; tokenType: string; expiresAt: string },
): void {
  db.exec('DELETE FROM oauth_tokens');
  db.prepare('INSERT INTO oauth_tokens (access_token, token_type, expires_at) VALUES (?, ?, ?)').run(
    input.accessToken,
    input.tokenType,
    input.expiresAt,
  );
}
