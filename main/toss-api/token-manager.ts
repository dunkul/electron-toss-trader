import type { Kysely } from 'kysely';
import type { Database } from '../db/schema';
import { getValidToken, saveToken } from '../db/repositories/oauth-tokens';
import { logger } from '../logger';
import { getTossApiConfig } from './config';
import { TossApiError, type TossApiErrorPayload } from './errors';
import { TOSS_API_PATHS } from './paths';
import { API_GROUPS, rateLimiter } from './rate-limiter';

// 실제 만료 시점보다 여유를 두어, 만료 직전 요청이 401로 실패하는 것을 방지한다.
const TOKEN_SAFETY_MARGIN_MS = 30_000;

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// 여러 호출자가 동시에 토큰 만료/부재를 발견하면(앱 시작 직후 등) 각자 재발급을 요청할 수 있다 —
// 이미 진행 중인 요청이 있으면 그 결과를 재사용해서 한 번만 나가도록 한다.
let inFlightRefresh: Promise<string> | null = null;

async function requestNewToken(db: Kysely<Database>): Promise<string> {
  const { baseUrl, clientId, clientSecret } = getTossApiConfig();

  logger.info('requesting new Toss OAuth token');

  // tossRequest와 마찬가지로 AUTH 그룹의 rate limit을 지킨다(이 호출은 tossRequest를 거치지
  // 않는 유일한 API 호출이라 여기서 직접 acquire한다).
  await rateLimiter.acquire(API_GROUPS.AUTH);
  const res = await fetch(`${baseUrl}${TOSS_API_PATHS.OAUTH_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const payload = await res
      .json()
      .then((body) => (body as { error?: TossApiErrorPayload })?.error)
      .catch(() => undefined);
    throw new TossApiError(res.status, payload);
  }

  const data = (await res.json()) as TokenResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000 - TOKEN_SAFETY_MARGIN_MS).toISOString();

  await saveToken(db, { accessToken: data.access_token, tokenType: data.token_type, expiresAt });

  return data.access_token;
}

export async function getAccessToken(db: Kysely<Database>, forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const cached = await getValidToken(db);
    if (cached) return cached.access_token;
  }

  if (!inFlightRefresh) {
    inFlightRefresh = requestNewToken(db).finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}
