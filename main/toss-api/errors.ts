export interface TossApiErrorPayload {
  requestId?: string;
  code?: string;
  message?: string;
  data?: unknown;
}

export class TossApiError extends Error {
  readonly status: number;
  readonly requestId?: string;
  readonly code?: string;
  readonly data?: unknown;

  constructor(status: number, payload?: TossApiErrorPayload) {
    super(payload?.message ?? `Toss API request failed with status ${status}`);
    this.name = 'TossApiError';
    this.status = status;
    this.requestId = payload?.requestId;
    this.code = payload?.code;
    this.data = payload?.data;
  }
}
