import { useState, useLayoutEffect, useRef } from "preact/hooks";

// 앵커 기준 위/아래 중 공간이 넉넉한 쪽에 배치하고, 좌우·상하 모두
// 뷰포트 밖으로 나가지 않도록 clamp한다. bubbleWidth/Height는 실제 렌더된
// 말풍선 크기(측정값)를 넘겨야 좁은 화면에서도 정확하게 들어맞는다.
export function computeTooltipRect({
  anchorRect,
  bubbleWidth,
  bubbleHeight,
  gap = 7,
  margin = 8,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
}) {
  const spaceAbove = anchorRect.top;
  const spaceBelow = viewportHeight - anchorRect.bottom;
  const below = spaceBelow >= bubbleHeight + gap || spaceBelow >= spaceAbove;

  let top = below
    ? anchorRect.bottom + gap
    : anchorRect.top - gap - bubbleHeight;
  top = Math.max(margin, Math.min(top, viewportHeight - bubbleHeight - margin));

  let left = anchorRect.left;
  left = Math.max(margin, Math.min(left, viewportWidth - bubbleWidth - margin));

  return { top, left, below };
}

// open된 직후엔 말풍선이 아직 DOM에 없어 실제 크기를 모르므로, 우선 숨긴 채
// fallback 크기로 마운트한 뒤 실측(offsetWidth/Height)해 재배치한다.
// useLayoutEffect라 두 번째 계산도 페인트 전에 끝나 깜빡임이 없다.
export function useTooltipPosition(open, anchorRef, bubbleRef, opts = {}) {
  const { fallbackWidth = 220, fallbackHeight = 60, ...rest } = opts;
  const [pos, setPos] = useState(null);
  const measuredRef = useRef({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null);
      measuredRef.current = { width: 0, height: 0 };
      return;
    }
    const anchorRect = anchorRef.current.getBoundingClientRect();
    const bubbleWidth = bubbleRef.current?.offsetWidth || fallbackWidth;
    const bubbleHeight = bubbleRef.current?.offsetHeight || fallbackHeight;
    measuredRef.current = { width: bubbleWidth, height: bubbleHeight };
    setPos(computeTooltipRect({ anchorRect, bubbleWidth, bubbleHeight, ...rest }));
  }, [open]);

  // 위 effect는 아직 말풍선이 DOM에 없어(pos===null이라 렌더 안 됨) fallback 크기로만
  // 계산한다. 말풍선이 실제로 마운트되면 내용(글로서리 노트 등)에 따라 실측 높이가
  // fallback과 달라질 수 있어, 여기서 실측값으로 한 번 더 보정한다. deps 없이 매
  // 렌더마다 확인하되 실측값이 이전과 같으면 setPos를 호출하지 않아 무한 루프를 막는다.
  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !bubbleRef.current) return;
    const actualWidth = bubbleRef.current.offsetWidth;
    const actualHeight = bubbleRef.current.offsetHeight;
    if (
      actualWidth === measuredRef.current.width &&
      actualHeight === measuredRef.current.height
    ) {
      return;
    }
    measuredRef.current = { width: actualWidth, height: actualHeight };
    const anchorRect = anchorRef.current.getBoundingClientRect();
    setPos(
      computeTooltipRect({
        anchorRect,
        bubbleWidth: actualWidth,
        bubbleHeight: actualHeight,
        ...rest,
      }),
    );
  });

  return pos;
}

// 앵커 오른쪽에 붙는(ShortcutChip 등) 패널형 툴팁: 오른쪽 공간이 부족하면
// 왼쪽으로 뒤집고, 상하좌우 모두 뷰포트 안으로 clamp한다.
export function computeSidePanelRect({
  anchorRect,
  panelWidth,
  panelHeight,
  gap = 6,
  margin = 8,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
}) {
  let left = anchorRect.right + gap;
  if (left + panelWidth > viewportWidth - margin) {
    left = anchorRect.left - panelWidth - gap;
  }
  left = Math.max(margin, Math.min(left, viewportWidth - panelWidth - margin));

  let top = anchorRect.bottom + gap;
  top = Math.max(margin, Math.min(top, viewportHeight - panelHeight - margin));

  return { top, left };
}

export function useSidePanelPosition(open, anchorRef, panelRef, opts = {}) {
  const { fallbackWidth = 220, fallbackHeight = 120, ...rest } = opts;
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null);
      return;
    }
    const anchorRect = anchorRef.current.getBoundingClientRect();
    const panelWidth = panelRef.current?.offsetWidth || fallbackWidth;
    const panelHeight = panelRef.current?.offsetHeight || fallbackHeight;
    setPos(computeSidePanelRect({ anchorRect, panelWidth, panelHeight, ...rest }));
  }, [open]);

  return pos;
}
