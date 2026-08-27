import type { Kysely } from 'kysely';
import type { Database, OAuthTokenRow } from '../schema';

export async function getValidToken(db: Kysely<Database>): Promise<OAuthTokenRow | undefined> {
  return db
    .selectFrom('oauth_tokens')
    .selectAll()
    .where('expires_at', '>', new Date().toISOString())
    .orderBy('issued_at', 'desc')
    .limit(1)
    .executeTakeFirst();
}

export async function saveToken(
  db: Kysely<Database>,
  input: { accessToken: string; tokenType: string; expiresAt: string },
): Promise<void> {
  await db.deleteFrom('oauth_tokens').execute();
  await db
    .insertInto('oauth_tokens')
    .values({ access_token: input.accessToken, token_type: input.tokenType, expires_at: input.expiresAt })
    .execute();
}
