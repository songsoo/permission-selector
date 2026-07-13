import { useState, useRef, useCallback, useEffect } from "preact/hooks";
import { isCoarsePointer } from "./pointer.js";

// 화면 전체에서 동시에 열려 있을 수 있는 툴팁은 하나뿐이어야 하므로,
// 새로 열리는 툴팁이 이전에 열려 있던 툴팁을 직접 닫아준다.
let activeHide = null;

const LONG_PRESS_MS = 500;

// 특정 엘리먼트를 거쳐가는 다음 click 한 번만 삼킨다. 반드시 el(그 click을 냈어야 할
// 바로 그 대상)에 스코프를 걸어야 한다 — document 전체에 걸면, 길게 눌렀을 때 브라우저가
// 아예 click을 합성해주지 않는 경우(흔함) 이 리스너가 지워지지 않고 남아있다가, 전혀 무관한
// 다음 클릭(예: 방금 열린 툴팁 버블 안의 버튼)을 대신 삼켜버리는 사고로 이어진다.
function suppressNextClick(el) {
  function handler(e) {
    e.preventDefault();
    e.stopPropagation();
    cleanup();
  }
  function cleanup() {
    el.removeEventListener("click", handler, true);
    clearTimeout(fallbackId);
  }
  el.addEventListener("click", handler, true);
  const fallbackId = setTimeout(cleanup, 1200);
}

// 마우스: hover로 열고 닫음.
// 터치: 꾹 누른 채 약 0.5초(LONG_PRESS_MS) 유지해야 열리고, 열리고 나서 손을 떼면
// 클릭 이벤트 없이 그냥 유지됨(바깥 탭하면 닫힘). 0.5초 전에 손을 떼면 그냥 탭으로 처리.
export function useTooltip() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const bubbleRef = useRef(null);
  const hideTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);

  const hide = useCallback((delay = 0) => {
    clearTimeout(hideTimerRef.current);
    if (delay > 0) {
      hideTimerRef.current = setTimeout(() => setOpen(false), delay);
    } else {
      setOpen(false);
    }
  }, []);

  const show = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    if (activeHide && activeHide !== hide) activeHide();
    activeHide = hide;
    setOpen(true);
  }, [hide]);

  const cancelLongPress = useCallback(() => {
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const startLongPress = useCallback(() => {
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      if (ref.current) suppressNextClick(ref.current);
      show();
    }, LONG_PRESS_MS);
  }, [show]);

  useEffect(() => cancelLongPress, [cancelLongPress]);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e) {
      const insideTrigger = ref.current && ref.current.contains(e.target);
      const insideBubble =
        bubbleRef.current && bubbleRef.current.contains(e.target);
      if (!insideTrigger && !insideBubble) {
        setOpen(false);
        // 터치에서는 바깥을 탭한 순간의 click이 그 아래 요소(체크박스, 필터 버튼 등)에
        // 그대로 전달되어 툴팁만 닫히고 동작까지 함께 실행돼버린다. 첫 탭은 툴팁을
        // 닫는 데만 쓰고, 실제 조작은 다시 한번 탭해야 하도록 그 click을 삼킨다.
        // e.target(실제로 탭한 그 엘리먼트)에만 스코프를 걸어, 다른 곳(예: 이 순간 새로
        // 열리는 다른 툴팁의 버블 내부 버튼)에서 발생하는 클릭까지 잘못 삼키지 않는다.
        if (isCoarsePointer() && e.target) suppressNextClick(e.target);
      }
    }
    // capture 단계로 등록: 다른 툴팁 트리거를 터치해도(각자 onPointerDown에서
    // stopPropagation을 호출해도) target에 도달하기 전에 먼저 실행되어 반드시 닫힌다.
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [open]);

  const handlers = isCoarsePointer()
    ? {
        onPointerDown: (e) => {
          e.stopPropagation();
          startLongPress();
        },
        onPointerUp: cancelLongPress,
        onPointerCancel: cancelLongPress,
        onPointerLeave: cancelLongPress,
      }
    : {
        onMouseEnter: show,
        onMouseLeave: () => hide(120),
      };

  // 버블(Portal 렌더링)로 마우스가 넘어가도 열림 유지 — 트리거와 DOM상 분리돼 있어
  // 트리거의 onMouseLeave만으로는 버블 위 체류를 감지할 수 없다. 터치 환경에서는
  // 기존 롱프레스/바깥 터치 로직을 그대로 쓰므로 빈 객체를 반환.
  const bubbleHandlers = isCoarsePointer()
    ? {}
    : {
        onMouseEnter: show,
        onMouseLeave: () => hide(120),
      };

  return {
    open,
    ref,
    bubbleRef,
    handlers,
    bubbleHandlers,
    show,
    hide,
    longPress: { start: startLongPress, cancel: cancelLongPress },
  };
}
