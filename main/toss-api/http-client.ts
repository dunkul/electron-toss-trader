import type { Kysely } from 'kysely';
import type { Database } from '../db/schema';
import { insertSystemLog } from '../db/repositories/logs';
import { logger } from '../logger';
import { getTossApiConfig } from './config';
import { TossApiError, type TossApiErrorPayload } from './errors';
import { rateLimiter, type ApiGroup } from './rate-limiter';
import { getAccessToken } from './token-manager';

const MAX_RETRIES = 3;

export interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | undefined>;
  /** 계좌·자산 API 호출 시 X-Tossinvest-Account 헤더로 전달한다. */
  accountSeq?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseErrorPayload(res: Response): Promise<TossApiErrorPayload | undefined> {
  try {
    const body = (await res.json()) as { error?: TossApiErrorPayload };
    return body?.error;
  } catch {
    return undefined;
  }
}

export async function tossRequest<T>(
  db: Kysely<Database>,
  group: ApiGroup,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { baseUrl } = getTossApiConfig();

  const url = new URL(path, baseUrl);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  let accessToken = await getAccessToken(db);
  let attempt = 0;
  let refreshedOnce = false;

  for (;;) {
    await rateLimiter.acquire(group);

    const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
    if (options.accountSeq) headers['X-Tossinvest-Account'] = options.accountSeq;

    const res = await fetch(url, { method: options.method ?? 'GET', headers });

    if (res.status === 401 && !refreshedOnce) {
      refreshedOnce = true;
      accessToken = await getAccessToken(db, true);
      continue;
    }

    if (res.status === 429) {
      if (attempt >= MAX_RETRIES) {
        throw new TossApiError(429, await parseErrorPayload(res));
      }
      const retryAfterHeader = res.headers.get('Retry-After');
      const backoffMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 2 ** attempt * 1000;
      logger.warn({ group, path, attempt }, 'rate limited by Toss API, backing off');
      await sleep(backoffMs + Math.random() * 250);
      attempt += 1;
      continue;
    }

    if (!res.ok) {
      const payload = await parseErrorPayload(res);
      await insertSystemLog(db, {
        level: 'ERROR',
        source: 'api',
        message: `${group} ${path} failed: ${payload?.message ?? res.status}`,
        context: { status: res.status, payload },
      });
      throw new TossApiError(res.status, payload);
    }

    return (await res.json()) as T;
  }
}
