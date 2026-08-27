export interface TossApiConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

export function getTossApiConfig(): TossApiConfig {
  const baseUrl = process.env.TOSS_API_BASE_URL || 'https://openapi.tossinvest.com';
  const clientId = process.env.TOSS_CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('TOSS_CLIENT_ID / TOSS_CLIENT_SECRET가 설정되지 않았습니다. .env를 확인하세요.');
  }

  return { baseUrl, clientId, clientSecret };
}

export function hasTossApiCredentials(): boolean {
  return Boolean(process.env.TOSS_CLIENT_ID && process.env.TOSS_CLIENT_SECRET);
}

export function getTossWsUrl(): string {
  return process.env.TOSS_WS_URL || 'wss://openapi-ws.tossinvest.com/ws/v1';
}
