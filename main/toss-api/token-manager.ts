import type { DatabaseSync } from 'node:sqlite';
import { getValidToken, saveToken } from '../db/repositories/oauth-tokens';
import { logger } from '../logger';
import { getTossApiConfig } from './config';
import { TossApiError, type TossApiErrorPayload } from './errors';
import { TOSS_API_PATHS } from './paths';

// 실제 만료 시점보다 여유를 두어, 만료 직전 요청이 401로 실패하는 것을 방지한다.
const TOKEN_SAFETY_MARGIN_MS = 30_000;

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export async function getAccessToken(db: DatabaseSync, forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const cached = getValidToken(db);
    if (cached) return cached.access_token;
  }

  const { baseUrl, clientId, clientSecret } = getTossApiConfig();

  logger.info('requesting new Toss OAuth token');

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

  saveToken(db, { accessToken: data.access_token, tokenType: data.token_type, expiresAt });

  return data.access_token;
}
