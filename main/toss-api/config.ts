import { safeStorage } from 'electron';
import type { Kysely } from 'kysely';
import type { Database } from '../db/schema';
import { getSetting, setSetting } from '../db/repositories/settings';

export interface TossApiConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

const SETTINGS_KEY_CLIENT_ID = 'toss_client_id_enc';
const SETTINGS_KEY_CLIENT_SECRET = 'toss_client_secret_enc';

// http-client/token-manager는 API 호출마다 동기적으로 자격증명을 읽어야 하므로, DB에 암호화되어
// 저장된 값을 앱 시작 시(loadTossApiCredentials) 한 번 복호화해 메모리에 캐싱해두고 쓴다.
let cachedClientId: string | undefined;
let cachedClientSecret: string | undefined;

function decrypt(base64: string | null): string | undefined {
  if (!base64) return undefined;
  try {
    return safeStorage.decryptString(Buffer.from(base64, 'base64'));
  } catch {
    return undefined;
  }
}

// 앱 시작 시 한 번 호출해 DB에 저장된 암호문을 복호화해 메모리에 올려둔다. 설정 탭에서 아직
// 등록하지 않은 개발 환경을 위해, DB에 값이 없으면 .env의 TOSS_CLIENT_ID/SECRET로 폴백한다.
export async function loadTossApiCredentials(db: Kysely<Database>): Promise<void> {
  const [encId, encSecret] = await Promise.all([
    getSetting(db, SETTINGS_KEY_CLIENT_ID),
    getSetting(db, SETTINGS_KEY_CLIENT_SECRET),
  ]);
  cachedClientId = decrypt(encId) ?? process.env.TOSS_CLIENT_ID;
  cachedClientSecret = decrypt(encSecret) ?? process.env.TOSS_CLIENT_SECRET;
}

// 설정 탭에서 연결 테스트에 성공한 값을 저장한다. OS 자격증명 저장소(safeStorage, Windows에서는
// DPAPI)로 암호화해 settings 테이블에 base64 문자열로 넣는다 — 평문은 DB에 남기지 않는다.
export async function saveTossApiCredentials(
  db: Kysely<Database>,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('이 환경에서는 안전한 자격증명 저장소(safeStorage)를 사용할 수 없습니다.');
  }
  await setSetting(db, SETTINGS_KEY_CLIENT_ID, safeStorage.encryptString(clientId).toString('base64'));
  await setSetting(
    db,
    SETTINGS_KEY_CLIENT_SECRET,
    safeStorage.encryptString(clientSecret).toString('base64'),
  );
  cachedClientId = clientId;
  cachedClientSecret = clientSecret;
}

export function getTossApiConfig(): TossApiConfig {
  const baseUrl = process.env.TOSS_API_BASE_URL || 'https://openapi.tossinvest.com';

  if (!cachedClientId || !cachedClientSecret) {
    throw new Error('Toss API client_id / client_secret이 설정되지 않았습니다. 설정 탭에서 등록하세요.');
  }

  return { baseUrl, clientId: cachedClientId, clientSecret: cachedClientSecret };
}

export function hasTossApiCredentials(): boolean {
  return Boolean(cachedClientId && cachedClientSecret);
}

export function getTossWsUrl(): string {
  return process.env.TOSS_WS_URL || 'wss://openapi-ws.tossinvest.com/ws/v1';
}
