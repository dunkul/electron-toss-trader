import { BrowserWindow, type Rectangle } from 'electron';

// 메인 윈도우(anchor)에 서브 윈도우(follower, 예: 차트 팝업)가 자석처럼 붙는 도킹.
// - 방향은 한 방향뿐: follower가 anchor에 붙는다. anchor는 follower 근처에 있어도 절대
//   스스로 위치를 바꾸지 않는다(registerSnapAnchor는 스냅 계산에서 자기 자신을 옮기지 않음).
// - 한 번 붙으면(도킹되면) anchor를 옮기거나 크기를 조절할 때 그 도킹 관계(어느 변에 붙었는지)
//   그대로 follower가 실시간으로 같이 따라 움직이거나 크기 변화만큼 밀려난다(진짜 자석처럼) —
//   anchor의 move/resize 이벤트마다 즉시 재계산해서 setPosition.
// - follower 자신을 드래그할 때는 반대로, 계속 setPosition하면 OS 네이티브 드래그 루프(커서
//   위치 기준으로 창 위치를 계속 재계산함)와 충돌해 떨림이 생기므로, follower의 move 이벤트가
//   일정 시간(SNAP_IDLE_MS) 끊겼을 때(드래그를 멈췄거나 놓았을 때)만 도킹 여부를 다시 계산한다.
const SNAP_DISTANCE_PX = 20;
const SNAP_IDLE_MS = 120;

// Windows 10/11에서 일반 프레임 창은 DWM이 리사이즈/그림자용 보이지 않는 여백을 창 바깥쪽에
// 덧붙인다(위쪽은 타이틀바에 흡수되어 여백이 없고, 좌/우/아래쪽에만 붙는다 — 100% 배율 기준
// 약 7px, Electron의 getBounds()는 DIP 단위라 배율이 달라져도 이 값은 거의 그대로 유지된다).
// 그래서 두 창의 겉보기 사각형끼리 정확히 맞닿게(A.right === B.left) 배치해도 실제 보이는
// 테두리 사이에는 그 여백만큼 틈이 남는다 — 좌우로 붙일 때는 양쪽 다 여백이 있어 2배,
// 위/아래로 붙일 때는 위쪽 여백이 없는 쪽 한 번만큼만 겹쳐서 보정한다.
const WIN32_INVISIBLE_MARGIN_PX = process.platform === 'win32' ? 7 : 0;
const HORIZONTAL_TOUCH_OVERLAP_PX = WIN32_INVISIBLE_MARGIN_PX * 2;
const VERTICAL_TOUCH_OVERLAP_PX = WIN32_INVISIBLE_MARGIN_PX;

// follower가 anchor의 어느 변에 어떤 식으로 붙었는지를 나타낸다. 오프셋(픽셀차)이 아니라 이
// "관계"를 저장해둬야 anchor가 리사이즈될 때도(오프셋이 아니라 관계에 맞는 공식으로) follower를
// 올바른 위치로 다시 계산할 수 있다 — 예를 들어 오른쪽에 붙은 채로 anchor 폭이 줄어들면
// follower도 그만큼 왼쪽으로 따라와야 하는데, 고정 오프셋만 저장해두면 그걸 표현할 수 없다.
type XDock = 'touchRight' | 'touchLeft' | 'alignLeft' | 'alignRight';
type YDock = 'touchBottom' | 'touchTop' | 'alignTop' | 'alignBottom';

interface DockRelation {
  x: XDock | null;
  y: YDock | null;
}

function resolveX(mode: XDock | null, anchor: Rectangle, followerWidth: number): number | null {
  switch (mode) {
    case 'touchRight':
      return anchor.x + anchor.width - HORIZONTAL_TOUCH_OVERLAP_PX;
    case 'touchLeft':
      return anchor.x - followerWidth + HORIZONTAL_TOUCH_OVERLAP_PX;
    case 'alignLeft':
      return anchor.x;
    case 'alignRight':
      return anchor.x + anchor.width - followerWidth;
    default:
      return null;
  }
}

function resolveY(mode: YDock | null, anchor: Rectangle, followerHeight: number): number | null {
  switch (mode) {
    case 'touchBottom':
      return anchor.y + anchor.height - VERTICAL_TOUCH_OVERLAP_PX;
    case 'touchTop':
      return anchor.y - followerHeight + VERTICAL_TOUCH_OVERLAP_PX;
    case 'alignTop':
      return anchor.y;
    case 'alignBottom':
      return anchor.y + anchor.height - followerHeight;
    default:
      return null;
  }
}

/** moving이 target 가장자리 중 어디에 자석처럼 붙는지 판정한다. 붙는 변이 하나도 없으면 null. */
function detectDock(moving: Rectangle, target: Rectangle): DockRelation | null {
  // 세로 범위가 겹치는(비슷한 높이의) 창끼리만 좌우로 붙이고, 가로 범위가 겹치는 창끼리만
  // 위아래로 붙인다 — 그렇지 않으면 화면 반대편 가장자리에도 엉뚱하게 스냅될 수 있다.
  const yBand =
    moving.y + moving.height > target.y - SNAP_DISTANCE_PX &&
    moving.y < target.y + target.height + SNAP_DISTANCE_PX;
  const xBand =
    moving.x + moving.width > target.x - SNAP_DISTANCE_PX &&
    moving.x < target.x + target.width + SNAP_DISTANCE_PX;

  let x: XDock | null = null;
  let y: YDock | null = null;

  if (yBand) {
    if (Math.abs(moving.x - (target.x + target.width)) <= SNAP_DISTANCE_PX) x = 'touchRight';
    else if (Math.abs(moving.x + moving.width - target.x) <= SNAP_DISTANCE_PX) x = 'touchLeft';
  }
  if (xBand) {
    if (Math.abs(moving.y - (target.y + target.height)) <= SNAP_DISTANCE_PX) y = 'touchBottom';
    else if (Math.abs(moving.y + moving.height - target.y) <= SNAP_DISTANCE_PX) y = 'touchTop';
  }

  if (!x && !y) return null;

  // 모서리가 맞아떨어지도록 반대 축도 가까우면 나란히 맞춘다(옆으로 붙었으면 위/아래를,
  // 위아래로 붙었으면 좌/우를).
  if (x && !y) {
    if (Math.abs(moving.y - target.y) <= SNAP_DISTANCE_PX) y = 'alignTop';
    else if (Math.abs(moving.y + moving.height - (target.y + target.height)) <= SNAP_DISTANCE_PX)
      y = 'alignBottom';
  } else if (y && !x) {
    if (Math.abs(moving.x - target.x) <= SNAP_DISTANCE_PX) x = 'alignLeft';
    else if (Math.abs(moving.x + moving.width - (target.x + target.width)) <= SNAP_DISTANCE_PX)
      x = 'alignRight';
  }

  return { x, y };
}

interface FollowerState {
  win: BrowserWindow;
  dockedTo: BrowserWindow | null;
  dock: DockRelation | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
}

const anchors = new Set<BrowserWindow>();
const followers = new Map<BrowserWindow, FollowerState>();

/** dock 관계에 따라 follower를 anchor의 현재 위치/크기 기준으로 다시 배치한다(비도킹 축은 그대로 둔다). */
function applyDock(anchorBounds: Rectangle, state: FollowerState): void {
  if (!state.dock || state.win.isDestroyed()) return;
  const followerBounds = state.win.getBounds();
  const x = resolveX(state.dock.x, anchorBounds, followerBounds.width) ?? followerBounds.x;
  const y = resolveY(state.dock.y, anchorBounds, followerBounds.height) ?? followerBounds.y;
  if (x !== followerBounds.x || y !== followerBounds.y) state.win.setPosition(x, y);
}

/** 이 창을 스냅 앵커로 등록한다 — 다른(follower) 창이 이 창 가장자리에 자석처럼 붙을 수 있게
 * 되고, 이 창을 옮기거나 크기를 조절하면 붙어있던 follower들이 도킹 관계를 유지한 채 함께
 * 움직이거나 밀려난다. anchor 자신은 follower와 가깝다고 해서 위치가 바뀌지 않는다. */
export function registerSnapAnchor(win: BrowserWindow): void {
  anchors.add(win);

  const followAnchor = () => {
    if (win.isDestroyed()) return;
    const anchorBounds = win.getBounds();
    for (const state of followers.values()) {
      if (state.dockedTo === win) applyDock(anchorBounds, state);
    }
  };

  win.on('move', followAnchor);
  win.on('resize', followAnchor);

  win.on('closed', () => {
    anchors.delete(win);
    for (const state of followers.values()) {
      if (state.dockedTo === win) {
        state.dockedTo = null;
        state.dock = null;
      }
    }
  });
}

/** 이 창을 스냅 follower로 등록한다 — 등록된 anchor 창 가장자리에 가까워지면 자석처럼 붙는다. */
export function registerSnapFollower(win: BrowserWindow): void {
  const state: FollowerState = { win, dockedTo: null, dock: null, idleTimer: null };
  followers.set(win, state);

  const reevaluateDock = () => {
    state.idleTimer = null;
    if (win.isDestroyed()) return;
    const moving = win.getBounds();

    for (const anchor of anchors) {
      if (anchor.isDestroyed() || !anchor.isVisible()) continue;
      const anchorBounds = anchor.getBounds();
      const dock = detectDock(moving, anchorBounds);
      if (dock) {
        state.dockedTo = anchor;
        state.dock = dock;
        applyDock(anchorBounds, state);
        return;
      }
    }
    state.dockedTo = null;
    state.dock = null;
  };

  win.on('move', () => {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    state.idleTimer = setTimeout(reevaluateDock, SNAP_IDLE_MS);
  });

  win.on('closed', () => {
    if (state.idleTimer) clearTimeout(state.idleTimer);
    followers.delete(win);
  });
}
