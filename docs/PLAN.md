# 토스증권 매매 시그널 알림 프로그램 개발 기획서

> 작성일: 2026-08-27 (최종 갱신: 2026-08-31)
> 프로젝트: toss-trader (Nextron: Electron + Next.js)

---

## 1. 목표 및 범위

토스증권 Open API(REST + WebSocket)를 이용해 데스크톱에서 동작하는 프로그램을 만든다.

### 1차 개발 범위

**사용자가 수립한 전략 조건이 충족되는 시점을 감지해 알림으로 알려주는 것**이 핵심 목표.

1. 계좌/보유종목/시세를 조회하는 대시보드 (참고용, 조회 전용) — 지수(코스피/코스닥/환율) 배너,
   보유 종목 테이블, 종목 랭킹 카드
2. 관심종목(워치리스트) 관리 및 실시간 시세/캔들차트 조회
3. 사용자가 정의한 전략(조건) 등록/관리 화면
4. 전략 엔진이 시세를 주기적으로 평가 → 조건 충족 시 **알림(데스크톱 알림 + 인앱 알림)** 발생
5. 발생한 신호(알림) 이력을 SQLite에 남기고 화면에서 조회 (CSV 내보내기 포함)
6. 호가창 팝업의 매매지원 패널에서 **수동으로 매수/매도 주문을 직접 접수/정정/취소**(수량 지정,
   지정가/시장가) + 대기/완료 주문 목록 조회 + 계좌 단위 WebSocket(`personal:order`)으로 본인
   주문 체결(전량/부분) 알림

→ 위 6번을 제외하면 전략 엔진 자체는 여전히 알림 전용이며, 조건 충족 시 자동으로 주문까지 넣지는
않는다 — 신호를 보고 실제 매매를 실행할지는 여전히 사용자 판단(직접 매매지원 패널을 쓰든, 토스증권
앱/HTS를 쓰든)이다.

### 2차 개발 범위 (추후)

1. 신호 발생 시 자동으로 주문까지 실행하는 자동매매 엔진 (Dry-run → Live 단계적 전환)
2. 조건주문(OCO/OTO) 연동, 로컬 주문/체결 이력 관리(현재는 `system_logs`에만 남고 별도 테이블 없음)

> 이 문서는 1차 범위를 중심으로 상세히 기술하고, 2차 범위는 향후 확장을 고려한 설계(플러그인 구조, 모드 필드 등)로만 여지를 남겨둔다. 차트 화면 자체의 세부 기능 로드맵(이동평균선, 보조지표, 그리기 도구 등)은 `docs/CHART.md`에서 별도로 관리한다.

---

## 2. 기술 스택

| 영역               | 선택                                                                           | 비고                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 앱 프레임워크      | Nextron (Electron + Next.js)                                                   |                                                                                                                                                                     |
| 언어               | TypeScript                                                                     | main/renderer 공통                                                                                                                                                  |
| DB                 | SQLite, Node 내장 `node:sqlite`(`DatabaseSync`)                                | 별도 네이티브 바인딩(better-sqlite3 등) 없이 Node 표준 모듈만 사용 — 배포 시 네이티브 모듈 재빌드 이슈를 피함                                                       |
| 쿼리 빌더          | Kysely                                                                         | `node:sqlite` 위에 얹는 타입 안전 쿼리 빌더. `main/db/schema.ts`의 `Database` 인터페이스가 유일한 스키마 소스                                                       |
| 마이그레이션       | 자체 러너 (`main/db/migrations.ts` + `schema_migrations` 버전 테이블)          | 버전별 `{version, name, sql}` 배열을 트랜잭션으로 순서대로 적용. 이미 적용된 버전의 SQL은 수정하지 않고 새 버전을 추가                                              |
| 상태관리(renderer) | 컴포넌트 로컬 state + Zustand(`renderer/store/`)                              | 화면별 상태는 각 페이지 컴포넌트가 관리하고, main의 데이터는 `renderer/lib/ipc.ts`의 `api.*` 호출로 그때그때 가져온다. 여러 창/컴포넌트가 공유해야 하는 최소한의 상태(현재 선택된 종목 등)만 Zustand 스토어(`useSelectedStockStore`)로 뺐다 |
| UI                 | Ant Design (antd)                                                              | 데이터 테이블/폼이 많은 화면에 적합, 기본 컴포넌트 풍부                                                                                                             |
| 스타일링           | SCSS (`renderer/styles/globals.scss`) + antd `ConfigProvider` 테마 토큰        | 브랜드 톤(포인트 컬러 등)은 테마 토큰으로, 스크롤바 커스터마이징 등 앱 전역 룩은 전역 스타일시트 한 곳에서 관리                                                     |
| 코드 품질          | ESLint (`typescript-eslint` + `eslint-config-next` + `react-hooks`) + Prettier | 포맷팅은 Prettier, 버그성 규칙(Hooks 의존성, 미사용 변수 등)은 ESLint로 역할 분리                                                                                   |
| 차트               | lightweight-charts (TradingView)                                               | 캔들차트 렌더링에 특화. 세부 기능 확장 계획은 `docs/CHART.md`                                                                                                       |
| 알림               | Electron `Notification`(OS 네이티브) + 인앱 알림(IPC push → antd 토스트)       | 데스크톱 알림과 화면 내 토스트를 함께 띄운다. 신호별 알림 채널 on/off(`notify_desktop`/`notify_sound`)는 전략마다 설정 가능하도록 스키마/화면에 필드를 마련해둔다   |
| 실시간 시세        | WebSocket(`ws`) 클라이언트, main 프로세스에서 연결 관리                        | 수신한 체결가는 IPC(`market:tick`)로 renderer에 그대로 push                                                                                                         |
| 스케줄링/전략 루프 | main 프로세스 내 `setInterval`(30초 주기)                                      |                                                                                                                                                                     |
| 환경설정           | 설정 화면 저장(Electron `safeStorage`) + `.env` (dotenv) 폴백                  | `client_id`/`client_secret`은 설정 화면에서 등록해 `safeStorage`로 암호화 저장한다(§5). `.env`는 아직 저장된 값이 없을 때만 쓰이는 dev 전용 폴백                    |
| 로깅               | pino                                                                           | 콘솔 출력(dev에서는 `pino-pretty`로 보기 좋게)                                                                                                                      |
| 창 상태 저장       | `electron-store`                                                               | 창 크기/위치를 기억했다가 다음 실행 시 복원                                                                                                                         |

### 프로세스 분리 원칙

- **main 프로세스**: API 클라이언트, OAuth 토큰 관리, WebSocket 연결, SQLite 접근, 전략 엔진, 알림 발생 — 모두 여기서만 수행 (시크릿이 renderer/브라우저 컨텍스트에 노출되지 않도록)
- **renderer 프로세스**: 순수 UI. main과는 IPC(`ipcRenderer.invoke` / `ipcMain.handle`)로만 통신. `contextIsolation: true`, `nodeIntegration: false` 유지, `preload.ts`에 화이트리스트 API만 노출.

---

## 3. 토스증권 Open API 연동 정리

> 1차 범위는 조회성 API(시세/종목/계좌/자산/랭킹)에 더해 **주문 생성/정정/취소**(`POST /orders`,
> `/orders/{id}/modify|cancel`, 수량 지정만) 와 **주문 이력 조회**(`GET /orders`, OPEN/CLOSED)도
> 사용한다. 조건주문(`/conditional-orders`)만 2차 개발을 위해 문서화해두고 지금은 호출하지 않는다
> (레이트리미터에도 등록하지 않음).
>
> 아래 절의 근거가 되는 원본 문서는 `docs/`에 로컬로 받아뒀다 — REST는 `docs/openapi.json`(OpenAPI
> 스펙), 웹소켓은 `docs/asyncapi.json`(AsyncAPI 스펙), 전체 카테고리 개요는 `docs/overview.md`.
> 이 섹션과 실제 스펙이 어긋나면 로컬 스펙 파일 쪽을 신뢰할 것. 단, 이 파일들은 2026-08-30 시점
> 스냅샷이라 토스 쪽에서 예고 없이 개정될 수 있다 — `https://developers.tossinvest.com/llms.txt`가
> 토스가 직접 관리하는 최신 문서 경로 인덱스이므로, 로컬 스냅샷과 실제 동작이 어긋나 보이면 이걸
> 먼저 다시 조회해서 최신 경로/버전으로 다시 받을 것.

### 3.1 인증 (OAuth 2.0 Client Credentials)

- 토스증권 WTS(웹 거래 시스템) 로그인 → 설정 > Open API 메뉴에서 `client_id`/`client_secret` 발급
- **설정 > Open API > 허용 IP 관리**에서 호출 IP를 사전 등록 필요 (미등록 시 403). 가정용 공인 IP가 유동적이면 매번 갱신 필요 — 초기 확인 필수 이슈로 기록.
- 토큰 발급: `POST https://openapi.tossinvest.com/oauth2/token` (`grant_type=client_credentials`, `client_id`, `client_secret`)
- 이후 모든 요청에 `Authorization: Bearer {access_token}` 헤더 필요
- 계좌·자산 API는 추가로 `X-Tossinvest-Account: {accountSeq}` 헤더 필요
- 토큰 만료 시 별도 refresh 메커니즘 없음 → 발급받은 토큰을 SQLite(`oauth_tokens`)에 캐시해두고, 만료 임박(안전 마진 적용) 또는 401 수신 시 즉시 재발급하는 토큰 매니저(`main/toss-api/token-manager.ts`)를 둔다

### 3.2 Rate Limit (클라이언트 × API 그룹 단위 TPS)

값의 출처는 개발자 문서의 **Rate Limits** 표(그룹별 초당 요청 수 + 일부 그룹의 피크시간 한도) —
"운영 상황에 따라 사전 공지 없이 조정될 수 있으며, 현재 허용 한도는 응답 헤더로 확인할 수 있다"고
문서에 명시돼 있다. 이 앱의 `rate-limiter.ts`는 시간대별 한도(피크시간 컬럼)는 구분하지 않고
평시 한도만 토큰버킷 용량으로 쓴다 — 피크시간대 초과분은 429 응답 + 백오프로 흡수한다.

| 그룹                   | 초당 한도 | 피크시간 한도(09:00~09:10 KST) | 등록 여부 / 비고 |
| ---------------------- | --------- | ------------------------------- | ---------------- |
| AUTH                   | 5         | —                                | 등록             |
| ACCOUNT                | 1         | —                                | 등록. 매우 낮음 → 캐싱 필수 |
| ASSET                  | 5         | —                                | 등록. 보유종목 조회 |
| STOCK                  | 5         | —                                | 등록. 개별 종목 상세 조회 |
| STOCK_ALL              | 1         | —                                | 등록. 전체 종목 마스터 목록(일 1회 배치 동기화 용도) |
| STOCK_TRADING_TREND    | 10        | —                                | 등록. 종목별 수급 동향(투자자별 매매동향 등) |
| MARKET_INFO            | 3         | —                                | 등록. 환율/장 운영 캘린더 |
| MARKET_DATA            | 15        | —                                | 등록. 시세(전략 평가의 핵심, 1차의 주 사용처) |
| MARKET_DATA_CHART      | 20        | —                                | 등록. 캔들 |
| RANKING                | 5         | —                                | 등록 |
| MARKET_INDICATOR_PRICE | 10        | —                                | 등록. 지수/국채 현재가(`getMarketIndicatorPrices`) |
| MARKET_INDICATOR       | 10        | —                                | **미등록** — 시장지표 투자자별 매매대금(`GET /market-indicators/{symbol}/investor-trading`) 엔드포인트 자체가 아직 미구현 |
| MARKET_INDICATOR_CHART | 5         | —                                | 등록. 지수/국채 캔들 |
| ORDER_INFO             | 6         | 3                                | 등록. 매수가능금액/매도가능수량 조회(매매지원 패널용) |
| ORDER                  | 10        | 10(=평시와 동일)                | 등록. 주문 생성/정정/취소 |
| ORDER_HISTORY          | 5         | —                                | 등록. 주문 목록 조회(매매지원 패널 "대기"/"완료" 탭용) |
| CONDITIONAL_ORDER      | 5         | —                                | 미등록 — 조건주문 자체가 2차 개발용(아직 미구현) |
| CONDITIONAL_ORDER_HISTORY | 10     | —                                | 미등록 — 위와 동일 이유 |

- 응답 헤더 `X-RateLimit-Limit/Remaining/Reset`, 429 시 `Retry-After` 확인
- **공통 API 클라이언트(`main/toss-api/http-client.ts`의 `tossRequest`)**가 모든 호출의 단일 진입점이다 —
  그룹별 토큰버킷 리미터(`rate-limiter.ts`) 획득, 베어러 토큰 첨부, 401 시 강제 재발급 후 1회 재시도,
  429 시 지수 백오프(1s→2s→4s + jitter, `Retry-After` 우선)까지 여기서 처리한다. 2xx가 아닌 응답은
  `system_logs`에 기록하고 `TossApiError`로 던진다.

### 3.3 주요 엔드포인트

**시세/종목 (1차 핵심 사용처)**

- `GET /api/v1/prices` 현재가, `/candles` 캔들(OHLCV)
- `GET /api/v1/stocks/all` 시장별 전체 종목 마스터(일 1회 동기화 → 로컬 `stocks` 캐시, 종목 검색/자동완성에 사용)
- `GET /api/v1/rankings` 거래대금/거래량/상승률/하락률 등 랭킹 (대시보드 랭킹 카드에서 사용)
- `GET /api/v1/orderbook` 호가 스냅샷 — 호가창 팝업이 뜰 때 REST로 1회 조회하고, 이후 갱신은 WS
  `orderbook` 채널 push로 받는다(§3.3 WebSocket 절 참고)
- → OAuth 토큰만 있으면 호출 가능 (계좌 불필요)

**지수/환율/장운영 (대시보드 상단 배너용, `MARKET_INDICATOR_PRICE`/`MARKET_INDICATOR_CHART`/`MARKET_INFO` 그룹)**

- `GET /market-indicators/prices` 코스피/코스닥 등 지수 현재가, `/market-indicators/{symbol}/candles`
  캔들(코스피/코스닥은 1분봉도 지원, 국채는 일봉만) — `MarketIndicatorBar.tsx`가 60초마다 자동
  재조회해 대시보드 최상단 배너(코스피/코스닥 스파크라인 + 원-달러 환율)를 그린다
- `GET /market-info/exchange-rates` 원-달러 환율(1분 주기 갱신, 참고용 표시 환율)
- `GET /market-info/kr-market-calendar` 국내 장 운영 시간(정규장 시작/종료 등) — 배너의 "실시간/
  장마감" 배지 판정에 사용. 지수/국채 8개 심볼만 지원하며, 미국 3대 지수(S&P 500·나스닥·다우존스)는
  Market Indicators 그룹 자체가 지원하지 않아 배너에 없다
- → OAuth 토큰만 있으면 호출 가능 (계좌 불필요)

**계좌/자산 (조회 전용, 대시보드용)**

- `GET /api/v1/accounts` 계좌 목록
- `GET /api/v1/holdings` 보유 주식 (종목별 현재가/평가손익 포함 — 대시보드 보유 종목 테이블의 실제 데이터 소스)

**주문 (1차에서 생성/정정/취소/이력조회 사용, 조건주문만 2차 개발용 — 아직 미사용)**

- `POST /api/v1/orders` — 매매지원 패널(`TradingPanel.tsx`)의 구매/판매 탭에서 사용 중. 수량 지정
  방식만 지원(금액 지정은 US 시장가 전용이라 UI에 없음), `timeInForce`는 항상 기본값(`DAY`)만 사용
- `GET /buying-power`, `/sellable-quantity` — 매매지원 패널의 수량 %/최대 계산에 이미 사용 중
- `GET /orders?status=CLOSED&symbol=...` — "완료" 탭에서 종목별 체결완료/취소/거부 내역을 최신순으로
  보여주는 데 사용 중(최대 50건, 페이지네이션 UI는 없음)
- `GET /orders?status=OPEN&symbol=...` — "대기" 탭에서 종목별 대기 중 주문(정정/취소 대상)을 보여주는
  데 사용 중
- `POST /orders/{id}/modify` — "대기" 탭 각 행의 **정정** 버튼 → 바텀시트(`Drawer` placement="bottom")
  에서 사용 중. 지정가(LIMIT) 주문만 정정 가능(시장가는 버튼 비활성화). KR/US 규칙 차이를 그대로
  반영: **KR은 가격+수량(수량 필수·정수)**, **US는 가격만**(수량 전달 시 거부) — 바텀시트가 통화에
  따라 수량 입력란 자체를 숨긴다. `confirmHighValueOrder`도 생성과 동일한 재확인 흐름
- `POST /orders/{id}/cancel` — "대기" 탭 각 행의 **취소** 버튼 → `Modal.confirm` 재확인 후 호출.
  스펙상 body는 optional이지만 빈 객체(`{}`)라도 명시적으로 보내야 한다 — body가 아예 없으면
  `tossRequest`가 `Content-Type` 헤더 자체를 안 붙여서 API가 "지원하지 않는 Content-Type" 오류로
  거부한다(한 번 실제로 겪은 버그, `orders.ts`의 `cancelOrder` 참고)
- `/commissions` — 아직 미사용
- `POST/GET/DELETE /api/v1/conditional-orders` (SINGLE/OCO/OTO) — 아직 미사용(2차)
- 1억원 이상 주문 시 `confirmHighValueOrder: true` 필수 — 생성/정정 모두 `confirm-high-value-required`
  거부를 받으면 사용자에게 재확인 모달을 띄운 뒤 그 값을 `true`로 재요청하는 흐름으로 구현했다
  (`orders.ts`의 `CreateOrderOutcome`/`OrderActionOutcome`). 장운영시간/상하한가/반대주문 등 나머지
  비즈니스 룰은 별도 클라이언트 검증 없이 API 응답 에러 메시지를 그대로 사용자에게 보여주는 수준까지만
  되어 있다 — 정정/취소는 이미 있는 상태별 에러(이미 체결/취소/정정됨, 처리 중 등)도 마찬가지로 API
  메시지 그대로 노출한다
- 정정/취소는 로컬에 반영하지 않고 항상 "대기" 목록을 다시 조회(`GET /orders?status=OPEN`)해
  최신 상태를 그린다 — 정정은 API 스펙상 새 `orderId`가 발급되고 원주문과 값이 달라, 로컬에서
  patch하는 대신 서버를 다시 신뢰하는 쪽을 택했다

**WebSocket** (`wss://openapi-ws.tossinvest.com/ws/v1`)

- 계정당 동시 연결 최대 2개, 연결당 구독 최대 100건, 구독 선언 5회/초 제한
- 구독은 **전체 교체(full-replace)** 방식 — 현재 구독하고 싶은 심볼 전체 배열을 매번 다시 선언한다.
  클라이언트(`main/toss-api/ws-client.ts`)는 관심종목/보유종목/선택종목이 바뀔 때마다 "원하는 구독
  목록"을 다시 계산해 재선언하되, 짧은 시간에 연속으로 바뀌어도 선언 자체는 300ms 디바운스해서 한 번만
  보낸다(5회/초 제한 대비)
- 60초 간격 PING 필요(180초 무응답 시 서버가 끊음)
- 연결이 끊기면 지수 백오프(최대 30초) + jitter로 재연결하고, 재연결 시 원하는 구독 목록을 처음부터
  다시 선언한다
- **`trade`(체결가) 채널**은 관심종목/보유종목/선택종목 등 여러 창이 폭넓게 구독한다. 알림 판단
  기준은 어디까지나 전략 엔진의 폴링(캔들/현재가)이고, 이 채널은 대시보드/차트의 실시간 표시 용도로만 쓴다
- **`orderbook`(호가) 채널**도 AsyncAPI 스펙에 존재하며, 호가창 팝업이 떠 있는 동안 그 종목 하나만
  구독한다(REST `GET /api/v1/orderbook`으로 최초 스냅샷을 받은 뒤, 이후 갱신은 이 채널 push로 받는다 —
  구독 직후에는 스냅샷이 오지 않고 다음 갱신부터 push되는 스펙이라 REST 선조회가 필요하다)
- **`personal:order`(주문 이벤트) 채널**은 종목이 아니라 계좌 `accountSeq` 단위로 구독한다. 이 앱이
  직접 주문을 내지 않아도(토스증권 앱/HTS 등 다른 채널에서 낸 주문 포함) 그 계좌의 모든 주문
  이벤트를 받으므로, 매매지원 설정과 무관하게 계좌 정보를 안 시점부터 항상 구독한다. 이벤트는
  `PENDING`/`PARTIAL_FILL`/`FILL`/`CANCELING`/`CANCELED`/`REPLACING`/`REPLACED`/`REJECTED`/
  `CANCEL_REJECTED`/`REPLACE_REJECTED`가 있으나, 알림(데스크톱+인앱)은 `FILL`/`PARTIAL_FILL`일 때만
  띄운다 — 나머지까지 알림으로 띄우면 너무 잦을 수 있어 의도적으로 제외했다(`main/notify/notifier.ts`
  의 `notifyOrderFill`)

### 3.4 에러 처리

- 모든 에러는 `{ error: { requestId, code, message, data } }` 형태 → `TossApiError`(`main/toss-api/errors.ts`)로 통일해서 던지고, 호출부는 이 하나의 타입만 잡으면 된다

---

## 4. 데이터베이스 설계 (SQLite)

파일 위치: Electron `app.getPath('userData')/toss-trader.db` (프로젝트 폴더에 두지 않음 — 실수로 git에 커밋되는 것 방지). 개발 모드에서는 `userData` 경로 자체를 `(development)` 접미사가 붙은 별도 디렉터리로 분리해, 개발 중 DB가 패키징된 빌드의 DB와 섞이지 않게 한다.

```sql
-- 계좌 (API에서 조회한 계좌 캐시, 조회 전용)
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  account_seq TEXT UNIQUE NOT NULL,
  alias TEXT,
  account_type TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- OAuth 토큰 (액세스 토큰 캐시)
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
  strategy_type TEXT NOT NULL,       -- 'PRICE_TARGET' | 'MA_CROSS' | 'RSI' | 'GRID'
  params_json TEXT NOT NULL,         -- 전략 파라미터 JSON (예: PRICE_TARGET → { direction, targetPrice })
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
  reason TEXT,                -- 조건 충족 근거 (예: "목표가 70,000원 이상 도달")
  price REAL,
  notified INTEGER NOT NULL DEFAULT 0,  -- 실제 알림 발송 여부(쿨다운으로 스킵되면 0으로 기록만 됨)
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

-- 앱 설정 (마지막 종목 캐시 동기화 시각 등 key-value)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 전체 종목 마스터 캐시 (일 1회 동기화, 종목 검색/자동완성용)
CREATE TABLE stocks (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  market TEXT NOT NULL,           -- KOSPI/KOSDAQ/NYSE/NASDAQ/AMEX/KR_ETC/US_ETC
  security_type TEXT NOT NULL,
  is_common_share INTEGER NOT NULL DEFAULT 1,
  isin_code TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 관심종목 탭(그룹) — "내 보유종목" 탭은 여기 저장하지 않는 고정 탭으로, 화면에서 보유종목 API로 구성한다
CREATE TABLE watchlist_groups (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 관심종목 (그룹별로 종목을 담고, 그룹 안에서 드래그로 순서 변경 가능)
CREATE TABLE watchlist (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  market TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (group_id, symbol)
);

-- [2차 개발 예약] 주문/체결 테이블 — 지금은 생성하지 않는다. 주문 생성/정정/취소/체결 이벤트는
-- system_logs에 감사 로그로만 남고(레벨 INFO/WARN, source='api'|'ws'), 대기/완료 목록은 로컬 캐시
-- 없이 매번 GET /orders를 그대로 다시 조회한다. 오프라인 조회나 더 풍부한 이력 화면이 필요해지면
-- orders/executions 테이블을 추가한다.
```

마이그레이션은 자체 러너로 관리한다: `main/db/migrations.ts`에 버전별 `{version, name, sql}`을
순서대로 나열해두면, 앱 시작 시 `schema_migrations` 테이블을 확인해 아직 적용 안 된 버전만
트랜잭션으로 순서대로 실행한다. **스키마를 바꿀 때는 이미 적용된 버전의 SQL을 고치지 않고 새
버전을 추가한다.** `main/db/schema.ts`의 Kysely `Database` 인터페이스가 타입상 유일한 스키마
소스이며, 각 테이블의 Row 타입(`StrategyRow`, `WatchlistRow` 등)은 전부 여기서 파생된다.

---

## 5. `.env` 설계

```dotenv
# .env (git에 반드시 커밋 금지 — .gitignore에 등록되어 있음)

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

- `client_id`/`client_secret`은 설정(`/settings`) 화면에서 직접 등록한다 — 연결 테스트를 통과하면
  `safeStorage`(OS 자격증명 저장소)로 암호화해 `settings` 테이블에 저장하고, 저장 성공 시 앱을
  자동 재시작해 전략엔진/WS 클라이언트가 새 값으로 다시 뜬다. `.env`는 아직 저장된 값이 없을 때만
  쓰이는 dev 전용 폴백이다.
- `.env`, `*.db`는 `.gitignore`에 이미 등록되어 있다. `.env.example`을 별도로 커밋해 필요한 키
  목록만 공유한다.

---

## 6. 화면 구성 (Renderer)

Nextron의 `renderer/pages` 기준, 사이드바(LNB) + 콘텐츠 레이아웃. 각 화면은 사이드바에 이미
현재 위치가 표시되므로, 콘텐츠 영역 상단에 별도 헤더 바(제목 표시줄)는 두지 않는다.

```
[사이드바]
 ├─ 대시보드
 ├─ 시세/차트
 ├─ 전략(알림 조건)
 ├─ 알림 내역
 ├─ 로그
 └─ 설정
```

> 차트/일별시세/호가창 팝업(`chart-window.tsx`/`daily-prices-window.tsx`/`orderbook-window.tsx`)은
> 메인 창에 가까이 끌어다 놓으면 자석처럼 달라붙어(도킹) 메인 창을 움직이거나 크기를 바꿀 때 같이
> 따라온다(`main/helpers/window-snap.ts`). 도킹은 팝업 → 메인 방향 한쪽으로만 걸리고, 메인 창은
> 팝업이 붙어 있어도 스스로 위치를 바꾸지 않는다.

### 6.1 대시보드 (`/home`)

- 상단 지수 배너(`MarketIndicatorBar.tsx`): 코스피/코스닥(스파크라인 포함)·원-달러 환율 카드 3개.
  자체적으로 60초마다 자동 재조회하고, 국내 정규장 운영 중이면 "실시간", 아니면 "장마감" 배지를
  표시한다(`GET /market-info/kr-market-calendar` 기준)
- 보유 종목 카드: 국내/해외 세그먼트 전환, 종목별 수량·현재가(당일 등락 포함)·평가손익을 색상과
  함께 표시. `GET /api/v1/holdings` 응답을 그대로 사용한다
- 종목 랭킹 카드: 거래대금/거래량/상승률/하락률 등 여러 랭킹 타입과 기간을 선택해서 볼 수 있다
- 새로고침 버튼(보유 종목 카드 쪽)을 누르면 보유 종목·랭킹·지수 배너 셋 다 함께 다시 조회한다.
  국내장이 열려 있을 평일 08:00~20:00(KST, 사용자 OS 타임존과 무관하게 고정 오프셋으로 판정)
  동안은 이 새로고침 버튼과 동일한 동작을 30초마다 자동으로도 수행한다(`home.tsx`의
  `isDashboardAutoRefreshWindow`) — 장 시간 외에는 어차피 시세가 안 움직이니 폴링하지 않는다
- 전략 신호가 발생하면(`strategy:signal` IPC push) 화면 어디에 있든 인앱 토스트 알림을 띄우고,
  대시보드 데이터를 다시 불러온다

### 6.2 시세/차트 (`/market`)

- 관심종목 카드(좌측, 전체 폭의 1/3)와 차트 카드(우측, 2/3)를 나란히 배치, 카드 높이는 뷰포트에
  맞추고 넘치는 목록만 카드 내부에서 스크롤된다
- 관심종목은 탭(그룹) 단위로 관리한다 — "내 보유종목"은 DB에 저장되지 않는 고정 탭이고, 그 외
  탭은 사용자가 이름을 지어 자유롭게 추가/이름변경/삭제할 수 있다. 각 탭 안에서는 종목을
  드래그해서 순서를 바꿀 수 있다
- 종목 검색(심볼/이름 자동완성) → 선택하면 해당 탭에 저장되고 차트가 열림
- 종목 행의 현재가는 실시간 틱마다 상승/하락/보합에 따라 배경이 잠깐 반짝였다가 사라지는
  이펙트로 변화를 표시하고, 거래소는 종목 코드 옆에 `거래소(코드)` 형태로 함께 표기한다
- lightweight-charts 캔들 차트: 일봉 기준, 최대 200개씩 커서 페이지네이션으로 과거 데이터를
  이어서 불러오고(왼쪽 끝까지 스크롤하면 자동 로드), 거래량 히스토그램을 캔들 아래 별도
  서브패널로 함께 그린다. 크로스헤어로 가리킨 시점의 날짜는 한국식(연-월-일) 순서로 표시한다.
  실시간 틱은 당일 봉의 고가/저가/종가/거래량을 갱신한다. 이동평균선/보조지표/그리기 도구 등 추가
  기능은 `docs/CHART.md`의 로드맵을 따라 순서대로 확장한다

### 6.3 전략(알림 조건) (`/strategies`)

- 전략 목록 테이블: 이름, 종목, 마켓, 유형, 쿨다운(초), 감시 상태(on/off 스위치), 삭제
- "새 전략 만들기"는 현재 **목표가 도달 알림(PRICE_TARGET)** 조건 폼을 제공한다 — 종목 검색,
  마켓, 조건(목표가 이상 상승 / 이하 하락), 목표가, 중복 알림 방지 쿨다운, 알림 채널
  (데스크톱/사운드) on-off
- 이동평균 교차(MA_CROSS)/RSI/그리드(GRID) 전략 유형은 DB 스키마와 엔진 인터페이스에 자리가
  마련되어 있어 새 평가 로직만 등록하면 바로 스케줄러에 편입되지만, 아직 평가 모듈과 생성 폼은
  목표가 알림 하나만 구현되어 있다 — 다음 전략 유형을 추가할 때는 이 구조를 그대로 재사용한다

### 6.4 알림 내역 (`/history`)

- `strategy_signals` 기반 테이블, 신호 타입(전체/BUY/SELL) 필터
- 신호 발생 시각, 전략명, 신호, 가격, 알림 발송 여부(발송됨/쿨다운으로 스킵), 근거(reason) 표시
- 현재 필터링된 목록을 CSV로 내보내기

### 6.5 로그 (`/logs`)

- `system_logs` 테이블 뷰, 레벨(전체/ERROR/WARN/INFO) 필터
- 시각/레벨/소스/메시지 컬럼

### 6.6 설정 (`/settings`)

- `client_id`/`client_secret` 등록 + Open API 연결 테스트(현재 계좌 목록을 조회해보고 성공/실패를
  바로 보여줌) — 통과하면 `safeStorage`로 암호화 저장 후 앱 자동 재시작(§5 참고)
- **매매지원** on/off 스위치 — 켜면 6.7절의 호가창 팝업에 매매 패널이 붙어 실제 주문을 접수할 수
  있게 된다(기본값 꺼짐)
- 종목 캐시 상태(캐시된 종목 수, 마지막 동기화 시각) 조회 + 수동 재동기화 버튼
- 테스트 알림 발송 버튼 (데스크톱 알림이 정상 동작하는지 바로 확인)

> 2차 개발 시 전략 화면에 "자동실행 모드(Dry-run/Live)" 토글이 추가될 예정. (애초 계획했던 별도
> "주문(수동매매)" 사이드바 메뉴는 만들지 않았다 — 아래 6.7절 그대로 호가창 팝업 안에 매매지원
> 패널로 통합했다.)

### 6.7 호가창 팝업 & 매매지원 (`orderbook-window.tsx`)

- 대시보드/시세 화면의 종목에서 우클릭 → "호가창으로 보기"로 여는 별도 창(차트/일별시세 팝업과
  같은 구조). 매도/매수 잔량과 호가를 실시간(WebSocket `orderbook` 채널)으로 보여준다.
- 설정(`/settings`)에서 **매매지원**을 켜면 호가창 오른쪽에 매매 패널(`TradingPanel.tsx`)이 붙는다
  (창 최소 폭을 이 상태에서만 680px로 강제 — 그 아래로는 레이아웃이 깨진다). 구매/판매/대기/완료
  4개 탭이 있다.
- **대기 탭**은 `GET /orders?status=OPEN`으로 이 종목의 대기 중 주문을 보여주고, 행마다 **정정**/
  **취소** 버튼이 붙는다. 취소는 `Modal.confirm` 재확인 후 `POST /orders/{id}/cancel`을 호출한다.
  정정은 화면 아래에서 올라오는 바텀시트(`Drawer` placement="bottom")를 띄우고, KR은 가격+수량,
  US는 가격만 입력받아(시장별 규칙 차이, §3.3 참고) `POST /orders/{id}/modify`를 호출한다 — 시장가
  주문은 정정 버튼이 비활성화된다. 정정/취소 성공 시 목록을 다시 조회해 최신 상태로 갱신한다.
- **완료 탭**은 `GET /orders?status=CLOSED`로 이 종목의 체결완료/취소/거부 내역을 연도 헤더 +
  최신순 목록으로 보여주고(취소·거부는 흐리게+취소선), 없으면 "매매기록이 없습니다"를 보여준다.
- 매매 패널은 지정가/시장가·수량(%,최대 버튼)·주문가능금액(또는 판매가능수량)·내 주식평균·
  구매 후 예상평균(구매 탭)·예상 판매 수익(판매 탭)을 보여주고, 보유 수량이 없는 종목은 판매 탭
  자체가 비활성화된다.
- "구매예약하기/판매예약하기"를 누르면 `Modal.confirm`으로 종목·가격·수량·총액을 한 번 더 보여준
  뒤에만 실제로 `POST /orders`를 호출한다 — 토스증권 API는 모의투자가 없어 확인 즉시 실계좌 주문이
  나간다. 1억원 이상 주문이라 `confirm-high-value-required`로 거부되면 재확인 모달을 한 번 더 띄운
  뒤 재요청한다.
- 주문 접수 후의 체결 알림은 이 창이 아니라 `personal:order` WS 채널(§3.3) → 전역 알림
  (`notifyOrderFill`)로 온다 — 이 창을 닫아도 체결 알림은 계속 온다.

---

## 7. 전략(알림) 엔진 설계 (main 프로세스)

```
┌─────────────────────────────────────────────┐
│              Strategy Alert Engine            │
│                                               │
│  Scheduler (setInterval, 30초 주기)             │
│        │                                     │
│        ▼                                     │
│  ① 활성 전략 전체 로드 → 대상 심볼들의 현재가를    │
│     getPrices 한 번 호출로 배치 조회             │
│        │                                     │
│        ▼                                     │
│  ② strategy_type으로 STRATEGY_REGISTRY에서     │
│     찾은 전략 모듈 평가(evaluate) → BUY/SELL/    │
│     HOLD + reason                             │
│        │                                     │
│        ▼                                     │
│  ③ 쿨다운/중복 체크 (동일 조건 반복 알림 방지)    │
│        │                                     │
│        ▼                                     │
│  ④ signal이 BUY/SELL이면:                     │
│     - strategy_signals에 기록                 │
│     - Electron Notification 발송 + 인앱 토스트  │
│     - IPC(strategy:signal)로 renderer에 push   │
└─────────────────────────────────────────────┘
```

- 전략 모듈은 `StrategyModule.evaluate(context): { signal, reason? }` 인터페이스로 플러그인화
  되어 있다(`main/engine/types.ts`). `strategy_type` 값으로 `STRATEGY_REGISTRY`
  (`main/engine/strategies/index.ts`)에서 모듈을 찾아 평가하므로, 새 전략 유형은 모듈을 구현해
  레지스트리에 등록하기만 하면 스케줄러 변경 없이 바로 동작한다. 현재는 `PRICE_TARGET`
  (`strategies/price-target.ts`) 하나만 구현되어 있고, 참조되지 않은 유형(`MA_CROSS`/`RSI`/
  `GRID`)은 스케줄러가 경고 로그만 남기고 건너뛴다 — 2차 개발에서 동일 인터페이스에 "주문 실행"
  단계만 추가하면 되도록 설계해둔 구조다
- 이미 평가 중인 전략은 다음 tick에서 건너뛴다(`runningStrategyIds` 가드) — 대기열에 쌓지 않고
  그냥 스킵
- `cooldown_sec` 동안은 동일 전략의 신호를 재알림하지 않는다(단, `strategy_signals`에는 항상
  기록해 이력은 남기고 `notified=0`으로 표시)
- ACCOUNT(1 TPS) 등 낮은 한도 그룹은 중앙 레이트리미터를 공유해 여러 전략이 동시에 폭주 호출하지
  않도록 한다
- WebSocket 재연결 시 구독 재선언 로직 필요 (전체 교체 방식이므로 재연결마다 현재 구독 목록
  재전송)

---

## 8. IPC 설계 (main ↔ renderer)

`main/ipc/channels.ts`(`IPC_CHANNELS`)와 `renderer/lib/ipc.ts`(`CHANNELS`)가 같은 채널 이름
문자열을 각자 독립적으로 선언한다 — renderer는 다른 빌드 타깃이라 main 코드를 런타임에 import할
수 없어서(`import type` 재수출만 가능), 채널을 추가/변경할 때는 두 파일을 손으로 같이 고쳐야
한다. `main/ipc/register.ts`가 각 채널을 `ipcMain.handle`로 연결하고, 대부분 `main/db/
repositories/*.ts` 함수나 `main/toss-api/endpoints/*.ts` 호출로 그대로 위임한다.

| 채널 그룹                         | 방향              | 설명                                                        |
| ---------------------------------- | ----------------- | ----------------------------------------------------------- |
| `accounts:*`                      | invoke            | 계좌 목록, 보유종목 조회                                    |
| `strategy:*`                      | invoke            | 전략 목록/생성/수정/토글/삭제                               |
| `signals:list`                    | invoke            | 신호(알림) 이력 조회                                        |
| `logs:list`                       | invoke            | 시스템 로그 조회                                            |
| `stocks:search`/`status`/`refresh`/`getBySymbols` | invoke | 종목 검색, 캐시 상태 조회, 수동 재동기화, 심볼로 일괄 조회  |
| `stocks:investorTrading`          | invoke            | 종목별 투자자별 매매동향(수급) 조회                         |
| `market:prices`                   | invoke            | 현재가 조회                                                 |
| `market:candles`                  | invoke            | 캔들(OHLCV) 조회                                            |
| `market:indicatorPrices`/`indicatorCandles` | invoke   | 지수(코스피/코스닥)·국채 현재가/캔들 조회(대시보드 지수 배너용) |
| `market:exchangeRate`             | invoke            | 원-달러 환율 조회(대시보드 지수 배너용)                     |
| `market:calendarKr`               | invoke            | 국내 장 운영 시간(정규장 시작/종료 등) 조회                 |
| `market:orderbook`                | invoke            | 호가 스냅샷 최초 1회 조회(호가창 팝업이 뜰 때)              |
| `watchlist*`                      | invoke            | 관심종목/관심종목 그룹 CRUD·순서변경                        |
| `ranking:list`                    | invoke            | 랭킹 조회                                                   |
| `notifications:test`              | invoke            | 테스트 알림 발송(설정 화면용)                               |
| `orderInfo:buyingPower`/`sellableQuantity` | invoke   | 매수가능금액/매도가능수량 조회(매매지원 패널용)             |
| `orders:create`                   | invoke            | 주문 생성(`POST /orders`) — 고액주문 재확인은 예외로 던지지 않고 결과값(`{ok:false,...}`)으로 반환 |
| `orders:listHistory`              | invoke            | 주문 이력 조회(`GET /orders`) — 매매지원 패널 "대기"(OPEN)/"완료"(CLOSED) 탭용 |
| `orders:modify`                   | invoke            | 주문 정정(`POST /orders/{id}/modify`) — 고액주문 재확인은 생성과 동일하게 결과값으로 반환 |
| `orders:cancel`                   | invoke            | 주문 취소(`POST /orders/{id}/cancel`)                       |
| `settings:credentialsStatus`/`saveCredentials` | invoke | Open API 자격증명 등록 상태 조회 / 연결 테스트 후 암호화 저장 |
| `settings:tradingSupportStatus`/`setTradingSupport` | invoke | 매매지원 on/off 상태 조회/변경                        |
| `market:subscribe`                | send(응답 없음)   | 실시간 시세 구독할 심볼 전체 목록을 매번 새로 선언(full-replace) |
| `market:subscribeOrderbook`       | send(응답 없음)   | 호가창 팝업이 실시간 호가를 구독할 종목을 선언(full-replace) |
| `window:openChart`/`openDailyPrices`/`openOrderbook` | send(응답 없음) | 종목 차트/일별시세/호가창을 별도 팝업 창으로 띄운다 |
| `app:relaunch`                    | send(응답 없음)   | 자격증명 저장 후 전략엔진/WS 클라이언트를 새 값으로 다시 띄우기 위해 앱 재시작 |
| `market:tick`                     | on(main→renderer) | 실시간 시세 push                                            |
| `market:orderbookTick`            | on(main→renderer) | 실시간 호가 push(호가창 팝업 구독 중인 종목만)              |
| `strategy:signal`                 | on(main→renderer) | 신호 발생 push (토스트/알림 트리거)                         |
| `order:fill`                      | on(main→renderer) | 본인 계좌 주문 체결(전량/부분) push (토스트/알림 트리거)    |
| `window:chartUpdate`/`dailyPricesUpdate`/`orderbookUpdate` | on(main→renderer) | 이미 떠 있는 팝업 창에 다른 종목을 새로 보여주라는 push |

---

## 9. 개발 마일스톤

### 1차 (알림 프로그램)

| 단계 | 내용                  | 산출물                                                                        |
| ---- | --------------------- | ----------------------------------------------------------------------------- |
| 0    | 프로젝트 셋업         | DB(`node:sqlite`+Kysely), `.env`, 로거, antd 설치, IPC 스캐폴딩               |
| 1    | API 클라이언트 & 인증 | OAuth 토큰 매니저, 레이트리미터, 공통 에러 파서, 시세/계좌 조회 확인          |
| 2    | 대시보드 & 시세 화면  | 계좌/보유종목/랭킹 조회, 관심종목 탭, 캔들+거래량 차트, WebSocket 실시간 반영 |
| 3    | 전략 엔진 & 알림      | 전략 CRUD(목표가 알림), 평가 루프, 데스크톱+인앱 알림 발송, 쿨다운 처리       |
| 4    | 알림 내역/로그 화면   | strategy_signals/system_logs 화면화, CSV 내보내기                             |
| 5    | 안정화                | WS 재연결/재구독, 429 백오프 검증, 장시간 구동(상시 실행) 테스트              |
| 6    | 호가창 & 수동 주문 생성/정정/취소/이력 | 호가창 팝업(실시간 호가), 매매지원 패널에서 주문 생성/정정/취소(`POST /orders`, `/orders/{id}/modify\|cancel`) + 대기/완료 목록(`GET /orders`), `personal:order` 체결 알림 — 원래 2차 계획이었으나 일정을 당겨 1차에서 구현함 |

### 2차 (조건주문·자동매매 — 추후)

| 단계 | 내용                                                                     |
| ---- | ------------------------------------------------------------------------ |
| 8    | 조건주문(OCO/OTO) 연동으로 손절/익절 자동화                              |
| 9    | 자동매매 엔진 (Dry-run 모드로 전략→주문 매핑 검증)                       |
| 10   | Live 전환 & 리스크 관리 (일일 손실 한도, 2단계 확인 모달 — 수동 주문의 고액주문 확인은 1차에서 이미 구현됨) |

---

## 10. 리스크 및 유의사항

- **매매지원을 켜면 실계좌에 영향을 준다** — 토스증권 Open API는 Sandbox/모의투자 환경이 없어
  매매지원 패널에서 주문을 접수하면 클릭 즉시(제출 전 확인 모달만 거치고) 실계좌에 반영된다.
  매매지원이 꺼져 있으면(기본값) 이 앱은 여전히 조회/알림 전용이다.
- API 인증 정보(client_secret, access_token)는 여전히 민감정보이므로 안전하게 보관해야 함
- **허용 IP 등록**: 가정 네트워크 IP 변경 시마다 토스 WTS에서 재등록 필요 — 고정 IP/VPN 사용 검토
- **ACCOUNT API 1 TPS**: 계좌 정보는 반드시 캐싱하고 폴링 주기를 넉넉히(예: 30초~1분) 둘 것
- **비밀정보 관리**: client_secret, access_token을 로그에 절대 남기지 않도록 로거 마스킹 처리
- **알림 신뢰성**: 알림이 지연되거나 누락되면 매매 타이밍을 놓칠 수 있으므로, 엔진 루프의 예외 처리와 "마지막 평가 성공 시각" 모니터링(대시보드에 헬스체크 표시)이 중요
- **수동 주문의 한계**: 로컬에 주문/체결 이력 테이블이 없어(§4) 대기/완료 목록은 매번 `GET /orders`를
  다시 조회한다 — API가 느리거나 실패하면 그 시점의 목록을 볼 수 없다(과거 이력은 `system_logs`의
  감사 로그로만 남는다). 조건주문(OCO/OTO)으로 걸어둔 손절/익절은 아직 이 앱에서 걸 수 없다.
- **2차 개발(조건주문·자동매매) 착수 시**: 자동매매(조건 충족 시 자동 주문)는 Dry-run 모드를 앱
  차원에서 충분히 검증한 뒤 Live로 전환해야 함 — 수동 주문 생성/정정/취소와 달리 사람이 매 건을
  확인하지 않는다는 점에서 리스크 성격이 다르다

---

## 11. 다음 액션 아이템

1. ~~`client_secret`을 Electron `safeStorage`로 암호화 이전~~ — 완료(설정 화면에서 직접 등록,
   저장 후 앱 재시작으로 반영). `.env`는 아직 저장된 값이 없을 때의 dev 전용 폴백으로 남아 있음
2. 대시보드에 "마지막 전략 평가 성공 시각" 헬스체크 표시 추가 (10장의 알림 신뢰성 리스크 대응)
3. 목표가 알림(PRICE_TARGET) 외 전략 유형(이동평균 교차/RSI/그리드) 중 하나를 골라 평가 모듈 + 생성 폼 구현 (7장/6.3절 구조 그대로 확장)
4. 차트 기능 확장은 `docs/CHART.md`의 우선순위(P0/P1/P2)를 따라 순서대로 진행
5. 장시간 구동 안정성 검증 (WS 재연결, 429 백오프, 스케줄러 예외 처리)
6. ~~대기 주문 목록 조회/정정/취소~~ — 완료(§6.7 참고). 조건주문/자동매매 등 나머지 2차 개발(§9)
   착수 여부를 결정
7. **[검증 필요 — 실거래로 확인 후 해결] 부분체결(PARTIAL_FILLED) 주문 정정 시 `quantity`의 의미**:
   `POST /orders/{id}/modify`의 `OrderModifyRequest.quantity`가 "새 총수량"인지 "남은 미체결수량"
   인지 API 문서만으로는 확정할 수 없다. `TradingPanel.tsx`의 `ModifyOrderSheet`는 지금 "새
   총수량"으로 가정하고 원주문의 `quantity`(총수량, 이미 체결분 포함)를 기본값으로 채워 보낸다 —
   코드에 `TODO(미검증 — 실거래로 확인 필요)` 주석으로 표시해뒀다.
   **확인 방법**: 소액으로 부분체결이 나는 지정가 주문을 만든 뒤(예: 호가 스프레드가 있는 종목에
   물량을 나눠 걸리게), 가격만 바꿔 정정 → `GET /orders/{id}` 또는 대기 목록에서 남은 수량이
   기대한 대로인지(원래 남은 미체결수량 그대로인지, 아니면 total로 재해석돼 의도보다 많이/적게
   남았는지) 확인한다.
   **결과에 따라**: "새 총수량"이 맞으면 지금 구현 그대로 두면 되고, "남은 수량"이 맞으면
   `ModifyOrderSheet`의 quantity 기본값을 `Number(order.quantity) - Number(order.execution.filledQuantity)`
   로 바꾸고 그 사실을 화면에도 표시해야 한다(예: 필드 라벨을 "정정할 남은 수량"으로).
