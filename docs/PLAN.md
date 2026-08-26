# 토스증권 매매 시그널 알림 프로그램 개발 기획서

> 작성일: 2026-08-26
> 프로젝트: toss-trader (Nextron: Electron + Next.js)

---

## 1. 목표 및 범위

토스증권 Open API(REST + WebSocket)를 이용해 데스크톱에서 동작하는 프로그램을 만든다.

### 1차 개발 범위 (지금 진행)

**실제 주문 실행 없이, 사용자가 수립한 전략 조건이 충족되는 시점을 감지해 알림으로 알려주는 것**이 목표.

1. 계좌/잔고/시세를 실시간으로 조회하는 대시보드 (참고용, 조회 전용)
2. 사용자가 정의한 전략(조건) 등록/관리 화면
3. 전략 엔진이 시세를 주기적으로 평가 → 조건 충족 시 **알림(데스크톱 알림/사운드/인앱 배너)** 발생
4. 발생한 신호(알림) 이력을 SQLite에 남기고 화면에서 조회

→ **실제로 API를 통해 매수/매도 주문을 넣는 기능은 이번 범위에 포함하지 않는다.** 사용자가 알림을 보고 직접 토스증권 앱/HTS에서 매매를 실행하는 구조.

### 2차 개발 범위 (추후)

1. 수동 주문 화면 (매수/매도/정정/취소를 프로그램 내에서 직접 실행)
2. 신호 발생 시 자동으로 주문까지 실행하는 자동매매 엔진 (Dry-run → Live 단계적 전환)
3. 조건주문(OCO/OTO) 연동, 주문/체결 이력 관리

> 이 문서는 1차 범위를 중심으로 상세히 기술하고, 2차 범위는 향후 확장을 고려한 설계(플러그인 구조, 모드 필드 등)로만 여지를 남겨둔다.

---

## 2. 기술 스택

| 영역               | 선택                                                                           | 비고                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 앱 프레임워크      | Nextron (Electron + Next.js)                                                   | 이미 설치됨                                                                                          |
| 언어               | TypeScript                                                                     | main/renderer 공통                                                                                   |
| DB                 | SQLite (`better-sqlite3`)                                                      | 로컬 파일 DB, main 프로세스에서만 접근                                                               |
| ORM/쿼리           | Drizzle ORM (또는 Kysely)                                                      | 타입 안전, 마이그레이션 지원                                                                         |
| 상태관리(renderer) | Zustand                                                                        | 가볍고 IPC 이벤트 반영에 적합                                                                        |
| UI                 | Ant Design (antd)                                                              | 데이터 테이블/폼이 많은 화면에 적합, 기본 컴포넌트 풍부                                              |
| 스타일링           | SCSS (CSS Modules, `sass`)                                                     | antd `ConfigProvider` 테마 토큰으로 전역 톤 설정 + 커스텀 레이아웃/컴포넌트는 `*.module.scss`로 작성 |
| 코드 품질          | ESLint (`typescript-eslint` + `eslint-config-next` + `react-hooks`) + Prettier | 포맷팅은 Prettier, 버그성 규칙(Hooks 의존성, 미사용 변수 등)은 ESLint로 역할 분리                    |
| 차트               | lightweight-charts (TradingView)                                               | 캔들차트 렌더링에 특화                                                                               |
| 알림               | Electron `Notification` (OS 네이티브) + 사운드(HTML5 Audio) + 트레이 아이콘    | 1차는 로컬 알림만, 2차에서 외부 채널 확장                                                            |
| 스케줄링/전략 루프 | main 프로세스 내 setInterval + 이벤트 기반                                     | 별도 워커 스레드 분리 고려                                                                           |
| 환경설정           | `.env` (dotenv) + Electron `safeStorage`                                       | 시크릿은 OS 자격증명함으로 암호화 저장                                                               |
| 로깅               | pino (파일 로테이션)                                                           | 콘솔+파일 동시 출력                                                                                  |

### 프로세스 분리 원칙

- **main 프로세스**: API 클라이언트, OAuth 토큰 관리, WebSocket 연결, SQLite 접근, 전략 엔진, 알림 발생 — 모두 여기서만 수행 (시크릿이 renderer/브라우저 컨텍스트에 노출되지 않도록)
- **renderer 프로세스**: 순수 UI. main과는 IPC(`ipcRenderer.invoke` / `ipcMain.handle`)로만 통신. `contextIsolation: true`, `nodeIntegration: false` 유지, `preload.ts`에 화이트리스트 API만 노출.

---

## 3. 토스증권 Open API 연동 정리

> 1차 범위에서는 **조회성 API(시세/종목/계좌/자산)만 사용**한다. 주문 계열 API(`/orders`, `/conditional-orders` 등)는 2차 개발을 위해 문서화만 해두고 지금은 호출하지 않는다.

### 3.1 인증 (OAuth 2.0 Client Credentials)

- 토스증권 WTS(웹 거래 시스템) 로그인 → 설정 > Open API 메뉴에서 `client_id`/`client_secret` 발급
- **설정 > Open API > 허용 IP 관리**에서 호출 IP를 사전 등록 필요 (미등록 시 403). 가정용 공인 IP가 유동적이면 매번 갱신 필요 — 초기 확인 필수 이슈로 기록.
- 토큰 발급: `POST https://openapi.tossinvest.com/oauth2/token` (`grant_type=client_credentials`, `client_id`, `client_secret`)
- 이후 모든 요청에 `Authorization: Bearer {access_token}` 헤더 필요
- 계좌·자산 API는 추가로 `X-Tossinvest-Account: {accountSeq}` 헤더 필요
- 토큰 만료 시 별도 refresh 메커니즘 없음 → **만료 임박 시 재발급하는 토큰 매니저**를 main에 구현 (401 수신 시 즉시 재발급 + 재시도)

### 3.2 Rate Limit (클라이언트 × API 그룹 단위 TPS)

| 그룹              | 초당 한도 | 비고                                     |
| ----------------- | --------- | ---------------------------------------- |
| AUTH              | 5         |                                          |
| ACCOUNT           | 1         | 매우 낮음 → 캐싱 필수                    |
| ASSET             | 5         | 보유종목 조회                            |
| STOCK             | 5         |                                          |
| MARKET_DATA       | 15        | 시세 (전략 평가의 핵심, 1차의 주 사용처) |
| MARKET_DATA_CHART | 20        | 캔들                                     |
| ORDER             | 10        | 2차 개발용, 1차 미사용                   |
| ORDER_INFO        | 6         | 2차 개발용, 1차 미사용                   |
| CONDITIONAL_ORDER | 5         | 2차 개발용, 1차 미사용                   |

- 응답 헤더 `X-RateLimit-Limit/Remaining/Reset`, 429 시 `Retry-After` 확인
- **공통 API 클라이언트**에 그룹별 토큰버킷 리미터 + 429 지수 백오프(1s→2s→4s, jitter) 내장 필요 (1차에서는 주로 MARKET_DATA/MARKET_DATA_CHART/ASSET/ACCOUNT 그룹만 실사용)

### 3.3 주요 엔드포인트

**시세/종목 (1차 핵심 사용처)**

- `GET /api/v1/prices` 현재가, `/candles` 캔들, `/orderbook` 호가, `/trades` 최근 체결, `/price-limits` 상하한가
- `GET /api/v1/stocks`, `/stocks/all`, `/stocks/{symbol}/investor-trading|credit-trades|program-trades|securities-lending|short-selling|warnings`
- `GET /api/v1/market-indicators/...`, `/market-calendar/KR|US`, `/exchange-rate`, `/rankings`
- → OAuth 토큰만 있으면 호출 가능 (계좌 불필요)

**계좌/자산 (조회 전용, 대시보드용)**

- `GET /api/v1/accounts` 계좌 목록
- `GET /api/v1/holdings` 보유 주식

**주문 / 조건주문 (2차 개발용 — 지금은 미사용)**

- `POST /api/v1/orders`, `GET/POST /orders/{id}/modify|cancel`, `GET /buying-power`, `/sellable-quantity`, `/commissions`
- `POST/GET/DELETE /api/v1/conditional-orders` (SINGLE/OCO/OTO)
- 1억원 이상 주문 시 `confirmHighValueOrder: true` 필수, 장운영시간/상하한가/반대주문 등 다수 비즈니스 룰 존재 — 2차 개발 착수 시 별도 검증 레이어 필요

**WebSocket** (`wss://openapi-ws.tossinvest.com/ws/v1`)

- 계정당 동시 연결 최대 2개, 연결당 구독 최대 100건, 구독 선언 5회/초 제한
- 구독은 **전체 교체(full-replace)** 방식 — 배열 전체를 매번 다시 보내야 함 → 클라이언트에 "현재 구독 상태" 캐시 두고 diff 계산 후 전체 배열 재전송
- 60초 간격 PING 필요(180초 무응답 시 서버가 끊음)
- 1차에서는 `trade`/`orderbook` 시세 구독만 사용 (LOSSY — 수신 밀림 시 중간 프레임 유실 가능, 알림 판단에는 캔들/현재가 폴링을 기준으로 삼고 WS는 대시보드 실시간 표시 용도로 사용 권장)

### 3.4 에러 처리

- 모든 에러는 `{ error: { requestId, code, message, data } }` 형태 → 공통 에러 파서 + 사용자 친화적 메시지 매핑 테이블 작성

---

## 4. 데이터베이스 설계 (SQLite)

파일 위치: Electron `app.getPath('userData')/toss-trader.db` (프로젝트 폴더에 두지 않음 — 실수로 git에 커밋되는 것 방지)

```sql
-- 계좌 (API에서 조회한 계좌 캐시, 조회 전용)
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  account_seq TEXT UNIQUE NOT NULL,
  alias TEXT,
  account_type TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- OAuth 토큰 (액세스 토큰 캐시, secret은 별도 safeStorage)
CREATE TABLE oauth_tokens (
  id INTEGER PRIMARY KEY,
  access_token TEXT NOT NULL,
  token_type TEXT,
  expires_at TEXT NOT NULL,
  issued_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 전략(알림 조건) 정의
CREATE TABLE strategies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  market TEXT NOT NULL,              -- KR/US
  strategy_type TEXT NOT NULL,       -- e.g. 'MA_CROSS', 'RSI', 'PRICE_TARGET', 'GRID'
  params_json TEXT NOT NULL,         -- 전략 파라미터 JSON
  is_active INTEGER NOT NULL DEFAULT 1,
  cooldown_sec INTEGER DEFAULT 300,  -- 동일 신호 중복 알림 방지 최소 간격
  notify_desktop INTEGER NOT NULL DEFAULT 1,
  notify_sound INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 전략 평가 결과 / 발생한 신호(알림) 이력 — 1차의 핵심 테이블
CREATE TABLE strategy_signals (
  id INTEGER PRIMARY KEY,
  strategy_id INTEGER REFERENCES strategies(id),
  signal TEXT NOT NULL,       -- BUY | SELL | HOLD
  reason TEXT,                -- 조건 충족 근거 (예: "5일선이 20일선 상향 돌파")
  price REAL,
  notified INTEGER NOT NULL DEFAULT 0,  -- 실제 알림 발송 여부(쿨다운으로 스킵될 수 있음)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 시스템/에러 로그
CREATE TABLE system_logs (
  id INTEGER PRIMARY KEY,
  level TEXT NOT NULL,          -- INFO | WARN | ERROR
  source TEXT NOT NULL,         -- 'api' | 'ws' | 'engine' | 'ui'
  message TEXT NOT NULL,
  context_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 앱 설정 (기본 계좌, 알림 설정 등 key-value)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- [2차 개발 예약] 주문/체결 테이블 — 지금은 생성하지 않으며,
-- 자동/수동 매매 기능 착수 시 orders/executions 테이블을 추가한다.
```

마이그레이션은 Drizzle Kit(or 자체 `migrations/*.sql` + 버전 테이블)으로 관리.

---

## 5. `.env` 설계

```dotenv
# .env (git에 반드시 커밋 금지 — .gitignore에 추가 필요)

# Toss Securities Open API
TOSS_CLIENT_ID=
TOSS_CLIENT_SECRET=
TOSS_API_BASE_URL=https://openapi.tossinvest.com
TOSS_WS_URL=wss://openapi-ws.tossinvest.com/ws/v1

# 로깅
LOG_LEVEL=info

# DB (미지정시 Electron userData 경로 사용)
DB_PATH=
```

- `client_secret`은 `.env`에는 최초 세팅용으로만 두고, 실제로는 앱 최초 실행 시 **Electron `safeStorage`(OS 자격증명 저장소)로 암호화 이전**하여 이후 `.env`를 지워도 동작하도록 설계 (탈취 리스크 최소화)
- `.env`, `*.db`를 `.gitignore`에 반드시 추가 (현재 `.gitignore`에 없음 — 작업 시 추가 필요)
- `.env.example`을 별도로 커밋해 필요한 키 목록만 공유

---

## 6. 화면 구성 (Renderer)

Nextron의 `renderer/pages` 기준, 사이드바 + 콘텐츠 레이아웃.

```
[사이드바]
 ├─ 대시보드
 ├─ 시세/차트
 ├─ 전략(알림 조건)
 ├─ 알림 내역
 ├─ 로그
 └─ 설정
```

### 6.1 대시보드 (`/`)

- 선택 계좌 요약: 예수금, 평가금액, 손익률 (조회 전용)
- 보유 종목 테이블 (실시간 현재가 반영, WebSocket 구독)
- 활성 전략 카드 목록 (상태: 감시중/중지, 최근 신호, 마지막 평가 시각)
- 최근 알림/에러 피드

### 6.2 시세/차트 (`/market`)

- 종목 검색 (심볼/이름)
- lightweight-charts 캔들 차트 + 이동평균/RSI 등 보조지표 오버레이(클라이언트 계산)
- 호가창(orderbook), 최근 체결(trades) 실시간 스트림
- 차트 위에서 바로 "이 조건으로 전략 만들기" 버튼 (예: 특정 가격 라인 클릭 → 목표가 알림 생성)

### 6.3 전략(알림 조건) (`/strategies`)

- 전략 목록 (이름, 종목, 유형, 상태 토글[감시중/중지], 최근 신호 시각)
- 전략 생성/편집 폼: 종목, 전략 타입 선택(이동평균 교차, RSI, 목표가, 그리드 등), 파라미터, 재평가 주기, 중복알림 방지 쿨다운, 알림 채널(데스크톱/사운드 on-off)
- 전략별 상세 페이지: 신호 이력 차트(가격 위에 신호 발생 지점 마킹), 알림 발송 이력

### 6.4 알림 내역 (`/history`)

- `strategy_signals` 기반, 필터(기간/종목/전략/신호타입)가 있는 테이블
- 신호 발생 시점의 가격/근거(reason) 표시
- CSV 내보내기

### 6.5 로그 (`/logs`)

- system_logs 테이블 뷰, 레벨/소스 필터
- API 에러(rate limit 초과, 인증 실패 등) 하이라이트

### 6.6 설정 (`/settings`)

- API Key 등록/검증 (허용 IP 확인 안내 포함)
- 기본 계좌 선택 (대시보드 표시용)
- 알림(데스크톱 알림/사운드) on/off, 방해금지 시간대 설정
- DB 백업/초기화

> 2차 개발 시 "주문(수동매매)" 메뉴와 전략 화면의 "자동실행 모드(Dry-run/Live)" 토글이 추가될 예정.

---

## 7. 전략(알림) 엔진 설계 (main 프로세스)

```
┌─────────────────────────────────────────────┐
│              Strategy Alert Engine            │
│                                               │
│  Scheduler (전략별 재평가 주기, 예: 10~60초)     │
│        │                                     │
│        ▼                                     │
│  ① 시세/지표 데이터 로드 (캐시 우선, MARKET_DATA │
│     TPS 한도 고려하여 폴링 or WS 구독 재사용)     │
│        │                                     │
│        ▼                                     │
│  ② 전략 모듈 평가 (Strategy.evaluate())        │
│     → BUY / SELL / HOLD + reason              │
│        │                                     │
│        ▼                                     │
│  ③ 쿨다운/중복 체크 (동일 조건 반복 알림 방지)    │
│        │                                     │
│        ▼                                     │
│  ④ signal이 BUY/SELL이면:                     │
│     - strategy_signals에 기록                 │
│     - Electron Notification 발송 + 사운드 재생  │
│     - IPC로 renderer에 push (대시보드/토스트)   │
└─────────────────────────────────────────────┘
```

- 전략은 `evaluate(context): Signal` 인터페이스로 플러그인화 (이동평균교차, RSI, 목표가, 그리드 등 각각 별도 클래스) → 2차 개발에서 동일 인터페이스에 "주문 실행" 단계만 추가하면 되도록 설계
- 반복 실행 주기는 전략별 설정 가능하나, ACCOUNT(1 TPS) 등 낮은 한도 그룹은 반드시 중앙 레이트리미터를 공유해 여러 전략이 동시에 폭주 호출하지 않도록 함
- 중복 실행 방지: 동일 전략의 이전 tick이 아직 처리 중이면 skip (mutex/lock)
- `cooldown_sec` 동안은 동일 전략의 같은 신호를 재알림하지 않음 (단, `strategy_signals`에는 기록해 이력 확인 가능하게 하고 `notified=0`으로 표시)
- WebSocket 재연결 시 구독 재선언 로직 필요 (전체 교체 방식이므로 재연결마다 현재 구독 목록 재전송)

---

## 8. IPC 설계 (main ↔ renderer)

`preload.ts`에 노출할 채널 예시:

| 채널                                   | 방향              | 설명                                |
| -------------------------------------- | ----------------- | ----------------------------------- |
| `auth:setCredentials`                  | invoke            | client_id/secret 저장(safeStorage)  |
| `accounts:list`                        | invoke            | 계좌 목록 조회                      |
| `market:subscribe`                     | send              | WS 구독 갱신 요청(symbols)          |
| `market:tick`                          | on(main→renderer) | 실시간 시세 push                    |
| `strategy:create/update/toggle/delete` | invoke            | 전략 CRUD                           |
| `strategy:signal`                      | on                | 신호 발생 push (토스트/알림 트리거) |
| `notifications:test`                   | invoke            | 알림 테스트 발송(설정 화면용)       |
| `logs:stream`                          | on                | 실시간 로그 push                    |

---

## 9. 개발 마일스톤

### 1차 (알림 프로그램 — 지금 진행)

| 단계 | 내용                  | 산출물                                                               |
| ---- | --------------------- | -------------------------------------------------------------------- |
| 0    | 프로젝트 셋업         | DB(better-sqlite3+drizzle), .env, 로거, antd 설치, IPC 스캐폴딩      |
| 1    | API 클라이언트 & 인증 | OAuth 토큰 매니저, 레이트리미터, 공통 에러 파서, 시세/계좌 조회 확인 |
| 2    | 대시보드 & 시세 화면  | 계좌/보유종목 조회, 캔들차트, WebSocket 실시간 반영                  |
| 3    | 전략 엔진 & 알림      | 전략 CRUD, 평가 루프, 데스크톱 알림 + 사운드 발송, 쿨다운 처리       |
| 4    | 알림 내역/로그 화면   | strategy_signals/system_logs 화면화, CSV 내보내기                    |
| 5    | 안정화                | WS 재연결/재구독, 429 백오프 검증, 장시간 구동(상시 실행) 테스트     |

### 2차 (수동/자동매매 — 추후)

| 단계 | 내용                                                                     |
| ---- | ------------------------------------------------------------------------ |
| 6    | 수동 주문 화면 (생성/조회/정정/취소, 매수가능금액/매도가능수량 연동)     |
| 7    | 조건주문(OCO/OTO) 연동으로 손절/익절 자동화                              |
| 8    | 자동매매 엔진 (Dry-run 모드로 전략→주문 매핑 검증)                       |
| 9    | Live 전환 & 리스크 관리 (일일 손실 한도, 고액주문 확인, 2단계 확인 모달) |

---

## 10. 리스크 및 유의사항

- **1차 범위는 조회 전용이라 실계좌에 영향을 주지 않음** — 다만 API 인증 정보(client_secret, access_token)는 여전히 민감정보이므로 안전하게 보관해야 함
- **허용 IP 등록**: 가정 네트워크 IP 변경 시마다 토스 WTS에서 재등록 필요 — 고정 IP/VPN 사용 검토
- **ACCOUNT API 1 TPS**: 계좌 정보는 반드시 캐싱하고 폴링 주기를 넉넉히(예: 30초~1분) 둘 것
- **비밀정보 관리**: client_secret, access_token을 로그에 절대 남기지 않도록 로거 마스킹 처리
- **알림 신뢰성**: 알림이 지연되거나 누락되면 매매 타이밍을 놓칠 수 있으므로, 엔진 루프의 예외 처리와 "마지막 평가 성공 시각" 모니터링(대시보드에 헬스체크 표시)이 중요
- **2차 개발 전환 시**: 토스증권 Open API는 Sandbox/모의투자 환경이 없어 모든 주문 API 호출이 실계좌에 즉시 반영됨 — 자동매매 착수 시 Dry-run 모드를 앱 차원에서 충분히 검증한 뒤 Live로 전환해야 함

---

## 11. 다음 액션 아이템

1. ~~`.gitignore`에 `.env`, `*.db` 추가~~ (완료)
2. ~~git 저장소 초기화(`main` 브랜치), Prettier/ESLint 설정~~ (완료)
3. `better-sqlite3`, `drizzle-orm`, `dotenv`, `pino`, `antd`, `sass`, `lightweight-charts`, `zustand` 설치
4. `main/lib/toss-api/` 아래 OAuth 클라이언트 + 레이트리미터 스켈레톤 작성 (조회 API만 우선 구현)
5. `main/db/schema.ts` + 초기 마이그레이션 작성 (1차 범위 테이블만)
6. 전략 평가 엔진 + Electron Notification 연동 스켈레톤 작성
7. 토스 WTS에서 client_id/secret 발급 및 허용 IP 등록 (사용자 액션)
