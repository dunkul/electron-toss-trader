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
  // delete+insert를 한 트랜잭션으로 묶는다 — 따로 실행하면 동시에 두 갱신이 겹칠 때
  // 그 사이 잠깐 토큰이 비어있는 상태가 생길 수 있다.
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('oauth_tokens').execute();
    await trx
      .insertInto('oauth_tokens')
      .values({ access_token: input.accessToken, token_type: input.tokenType, expires_at: input.expiresAt })
      .execute();
  });
}
