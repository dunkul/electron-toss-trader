import { TossApiError, type TossApiErrorPayload } from './errors';
import { TOSS_API_PATHS } from './paths';
import { API_GROUPS, rateLimiter } from './rate-limiter';

interface TokenResponse {
  access_token: string;
}

async function parseErrorPayload(res: Response): Promise<TossApiErrorPayload | undefined> {
  try {
    const body = (await res.json()) as { error?: TossApiErrorPayload };
    return body?.error;
  } catch {
    return undefined;
  }
}

// 저장하기 전에 사용자가 입력한 client_id/client_secret이 실제로 유효한지 확인한다. 여기서 받은
// 토큰은 저장하지 않고 버린다 — 실제 사용될 토큰은 저장 성공 후 token-manager가 다시 정식으로
// 발급받는다. tossRequest/getAccessToken을 쓰지 않는 이유는 그것들이 이미 저장된(캐시된)
// 자격증명을 전제로 동작하기 때문 — 여기서는 아직 저장 전인 값을 검증해야 한다.
export async function testTossCredentials(clientId: string, clientSecret: string): Promise<void> {
  const baseUrl = process.env.TOSS_API_BASE_URL || 'https://openapi.tossinvest.com';

  await rateLimiter.acquire(API_GROUPS.AUTH);
  const tokenRes = await fetch(`${baseUrl}${TOSS_API_PATHS.OAUTH_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!tokenRes.ok) {
    throw new TossApiError(tokenRes.status, await parseErrorPayload(tokenRes));
  }
  const { access_token: accessToken } = (await tokenRes.json()) as TokenResponse;

  await rateLimiter.acquire(API_GROUPS.ACCOUNT);
  const accountsRes = await fetch(`${baseUrl}${TOSS_API_PATHS.ACCOUNTS}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!accountsRes.ok) {
    throw new TossApiError(accountsRes.status, await parseErrorPayload(accountsRes));
  }
}
