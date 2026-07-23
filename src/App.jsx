import { useReducer, useState, useEffect, useRef } from "preact/hooks";
import { lazy, Suspense } from "preact/compat";
import { initialState, reducer } from "./lib/state.js";
import { parseMenus } from "./lib/jsonLoader.js";
import { validate } from "./lib/validate.js";
import { SETTINGS } from "./data/settings.js";
import {
  generateClipboardText,
  generateClipboardHtml,
} from "./lib/clipboard.js";
import MENUS_DATA from "./data/menus.json";
import { CONTACT } from "./data/contact.js";
import MenuTree from "./components/MenuTree.jsx";
import PermissionList from "./components/PermissionList.jsx";
import CartPanel from "./components/CartPanel.jsx";
import CopyModal from "./components/CopyModal.jsx";
import Toast from "./components/Toast.jsx";
import OnboardingTour, {
  useOnboardingTour,
} from "./components/OnboardingTour.jsx";
import {
  LayoutSideBySideIcon,
  LayoutStackedIcon,
  HelpIcon,
  ContactIcon,
  EditIcon,
} from "./components/icons.jsx";

let toastIdSeq = 0;

const INITIAL_MENUS = parseMenus(MENUS_DATA);

const EditApp = import.meta.env.DEV
  ? lazy(() => import("./EditApp.jsx"))
  : null;

const SampleModeSwitcher = import.meta.env.IS_SAMPLE_MODE
  ? lazy(() => import("./components/SampleModeSwitcher.jsx"))
  : null;

const LAYOUT_STACKED_KEY = "layout_stacked";
const LAYOUT_SPLIT_KEY = "layout_split_pct";
const SPLIT_MIN = 20;
const SPLIT_MAX = 80;
const MOBILE_QUERY = "(max-width: 767px)";
const SWIPE_INTENT_PX = 8;
const SWIPE_THRESHOLD_RATIO = 0.2;
const SWIPE_RESISTANCE = 0.35;
const COPY_PREVIEW_DURATION_MS = 6000;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof matchMedia === "function" && matchMedia(MOBILE_QUERY).matches,
  );
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mql = matchMedia(MOBILE_QUERY);
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

function ResizeHandle({ onDrag }) {
  function handlePointerDown(e) {
    e.preventDefault();
    const group = e.currentTarget.closest(".col-menu-perm-group");
    function handlePointerMove(ev) {
      const rect = group.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      onDrag(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct)));
    }
    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return <div class="layout-resize-handle" onPointerDown={handlePointerDown} />;
}

function CartFabIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M3 5h14M3 10h14M3 15h8" />
      <path d="M14 14l2 2 3-3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// 메뉴/상세권한 좌우 스와이프 캐러셀 (모바일 전용)
function MobileSwipe({ page, onPageChange, children, disabled }) {
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const dragRef = useRef(null);

  function setTrackTransform(pct, withTransition) {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = withTransition ? "transform 0.25s ease" : "none";
    el.style.transform = `translateX(${pct}%)`;
  }

  useEffect(() => {
    setTrackTransform(-page * 50, true);
  }, [page]);

  function handlePointerDown(e) {
    if (disabled) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      horizontal: null,
      basePct: -page * 50,
      lastDx: 0,
      pointerId: e.pointerId,
    };
  }

  function handlePointerMove(e) {
    const d = dragRef.current;
    if (!d || disabled) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (d.horizontal === null) {
      if (Math.abs(dx) < SWIPE_INTENT_PX && Math.abs(dy) < SWIPE_INTENT_PX)
        return;
      d.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!d.horizontal) {
        dragRef.current = null; // 세로 스크롤 의도 — 네이티브 스크롤에 맡김
        return;
      }
      // 가로 스와이프로 확정된 시점에만 포인터를 캡처한다.
      // pointerdown 즉시 캡처하면 단순 탭(클릭)까지 뷰포트로 리다이렉트되어
      // 하위 트리/권한 카드 클릭이 전혀 먹히지 않는다.
      try {
        e.currentTarget.setPointerCapture(d.pointerId);
      } catch {}
    }
    if (!d.horizontal) return;

    const viewportW = viewportRef.current?.clientWidth || 1;
    let nextPct = d.basePct + (dx / viewportW) * 50;
    if (nextPct > 0) nextPct *= SWIPE_RESISTANCE;
    if (nextPct < -50) nextPct = -50 + (nextPct + 50) * SWIPE_RESISTANCE;
    setTrackTransform(nextPct, false);
    d.lastDx = dx;
  }

  function handlePointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || !d.horizontal) return;
    const viewportW = viewportRef.current?.clientWidth || 1;
    const threshold = viewportW * SWIPE_THRESHOLD_RATIO;
    let next = page;
    if (d.lastDx < -threshold && page === 0) next = 1;
    else if (d.lastDx > threshold && page === 1) next = 0;
    if (next !== page) onPageChange(next);
    else setTrackTransform(-page * 50, true);
  }

  return (
    <div
      class="mobile-swipe-viewport"
      ref={viewportRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div class="mobile-swipe-track" ref={trackRef}>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [editing, setEditing] = useState(false);
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    menus: INITIAL_MENUS,
  });
  const [showModal, setShowModal] = useState(false);
  const [modalResult, setModalResult] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [showFallback, setShowFallback] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [fallbackText, setFallbackText] = useState("");
  const [copiedPreview, setCopiedPreview] = useState(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [layoutStacked, setLayoutStacked] = useState(
    () => localStorage.getItem(LAYOUT_STACKED_KEY) !== "0",
  );
  const [menuHeightPct, setMenuHeightPct] = useState(
    () => Number(localStorage.getItem(LAYOUT_SPLIT_KEY)) || 62,
  );
  const [chipsEnabled, setChipsEnabled] = useState(SETTINGS.chipsEnabled);
  const isMobile = useIsMobile();
  const [mobilePage, setMobilePage] = useState(0); // 0: 메뉴, 1: 상세권한
  const [cartOpen, setCartOpen] = useState(false);
  const {
    open: tourOpen,
    start: startTour,
    close: closeTour,
  } = useOnboardingTour();

  useEffect(() => {
    localStorage.setItem(LAYOUT_STACKED_KEY, layoutStacked ? "1" : "0");
  }, [layoutStacked]);

  useEffect(() => {
    localStorage.setItem(LAYOUT_SPLIT_KEY, String(menuHeightPct));
  }, [menuHeightPct]);

  const previewTimerRef = useRef(null);
  const previewRef = useRef(null);

  useEffect(() => {
    if (!copiedPreview) return;
    const info = {
      remaining: COPY_PREVIEW_DURATION_MS,
      startedAt: Date.now(),
      timer: null,
    };
    // 창이 뜨는 순간 커서가 이미 그 위에 있으면 mouseenter가 발생하지 않아
    // pausePreviewTimer가 호출되지 않으므로, 마운트 시점에 직접 :hover 여부를
    // 확인해 이미 hover 중이면 타이머를 걸지 않는다
    const alreadyHovered = previewRef.current?.matches(":hover");
    if (!alreadyHovered) {
      info.timer = setTimeout(() => setCopiedPreview(null), info.remaining);
    }
    previewTimerRef.current = info;
    return () => {
      clearTimeout(info.timer);
      previewTimerRef.current = null;
    };
  }, [copiedPreview, previewKey]);

  function pausePreviewTimer() {
    const info = previewTimerRef.current;
    if (!info || !info.timer) return;
    clearTimeout(info.timer);
    info.remaining = Math.max(
      0,
      info.remaining - (Date.now() - info.startedAt),
    );
    info.timer = null;
  }

  function resumePreviewTimer() {
    const info = previewTimerRef.current;
    if (!info || info.timer) return;
    info.startedAt = Date.now();
    info.timer = setTimeout(() => setCopiedPreview(null), info.remaining);
  }

  function handleTourStepChange(stepId) {
    if (!isMobile) return;
    if (stepId === "menu") setMobilePage(0);
    else if (stepId === "perm") setMobilePage(1);
    // "copy" 단계는 카트를 자동으로 열어주지 않고, 사용자가 직접 선택 현황 버튼을
    // 눌러서 열게 한다 (OnboardingTour의 mobileGateSelector 참고)
    if (stepId !== "copy") setCartOpen(false);
  }

  function addToast(type, message) {
    setToasts((prev) => {
      if (prev.some((t) => t.message === message)) return prev;
      const id = ++toastIdSeq;
      return [...prev, { id, type, message }];
    });
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  function handleCopyClick() {
    const result = validate(state);
    if (result.errors.length > 0 || result.warnings.length > 0) {
      setModalResult(result);
      setShowModal(true);
    } else {
      doCopy();
    }
  }

  function doCopy() {
    const html = generateClipboardHtml(state);
    const plain = generateClipboardText(state);

    const onSuccess = () => {
      document.dispatchEvent(new CustomEvent("copy-done"));
      setCopiedPreview(plain);
      setPreviewKey((k) => k + 1);
    };
    const showFallbackModal = () => {
      setFallbackText(plain);
      setShowFallback(true);
    };

    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        navigator.clipboard
          .write([
            new ClipboardItem({
              "text/html": new Blob([html], { type: "text/html" }),
              "text/plain": new Blob([plain], { type: "text/plain" }),
            }),
          ])
          .then(onSuccess)
          .catch(() => {
            // 서식 복사가 막힌 환경(권한 거부 등)이면 평문 복사로 한 번 더 시도
            navigator.clipboard
              ?.writeText(plain)
              .then(onSuccess)
              .catch(showFallbackModal);
          });
      } else if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(plain)
          .then(onSuccess)
          .catch(showFallbackModal);
      } else {
        // navigator.clipboard 자체가 없는 환경 (예: file:// 더블클릭 실행, 구형 브라우저)
        showFallbackModal();
      }
    } catch {
      // ClipboardItem/clipboard 접근이 동기적으로 throw하는 환경 대비
      showFallbackModal();
    } finally {
      setShowModal(false);
    }
  }

  if (import.meta.env.DEV && editing && EditApp) {
    return (
      <Suspense
        fallback={
          <div style={{ padding: "40px", color: "var(--text-muted)" }}>
            로딩 중…
          </div>
        }
      >
        <EditApp
          onExit={() => {
            dispatch({ type: "SET_MENUS", menus: parseMenus(MENUS_DATA) });
            setChipsEnabled(SETTINGS.chipsEnabled);
            setEditing(false);
          }}
        />
      </Suspense>
    );
  }

  return (
    <div id="app">
      <header class="app-header">
        <img
          class="header-logo"
          src="https://daoift3qrrnil.cloudfront.net/company_groups/images/000/015/189/original/grip_app_logo%282021ver%29.png?1691709895"
          alt="Grip"
        />
        <span class="header-divider" />
        <span class="header-title">권한 선택 도구</span>
        <div class="header-actions">
          {!isMobile && (
            <button
              class={`app-action-btn layout-toggle-btn${layoutStacked ? " is-active" : ""}`}
              onClick={() => setLayoutStacked((v) => !v)}
              title={layoutStacked ? "나란히 보기" : "위아래로 보기"}
              aria-label={
                layoutStacked ? "나란히 보기로 전환" : "위아래로 보기로 전환"
              }
            >
              <span class="layout-toggle-label">레이아웃 변경</span>
              {layoutStacked ? <LayoutSideBySideIcon /> : <LayoutStackedIcon />}
            </button>
          )}
          <button
            class="app-action-btn"
            onClick={startTour}
            aria-label="이용 가이드"
            title="이용 가이드"
          >
            <HelpIcon />
            <span class="app-action-label">이용 가이드</span>
          </button>
          <button
            class="app-action-btn"
            onClick={() => setShowContact(true)}
            aria-label="문의사항"
            title="문의사항"
          >
            <ContactIcon />
            <span class="app-action-label">문의사항</span>
          </button>
          {import.meta.env.IS_SAMPLE_MODE && SampleModeSwitcher && (
            <Suspense fallback={null}>
              <SampleModeSwitcher dispatch={dispatch} />
            </Suspense>
          )}
          {import.meta.env.DEV && (
            <button
              class="app-action-btn"
              onClick={() => setEditing(true)}
              aria-label="편집"
              title="편집"
            >
              <EditIcon />
              <span class="app-action-label">편집</span>
            </button>
          )}
        </div>
      </header>

      {isMobile && (
        <div class="mobile-swipe-dots">
          {[0, 1].map((i) => (
            <button
              key={i}
              class={`mobile-swipe-dot${mobilePage === i ? " is-active" : ""}`}
              aria-label={i === 0 ? "메뉴" : "상세권한"}
              onClick={() => !tourOpen && setMobilePage(i)}
              disabled={tourOpen}
            />
          ))}
        </div>
      )}

      <div class="app-body">
        {isMobile ? (
          <MobileSwipe
            page={mobilePage}
            onPageChange={setMobilePage}
            disabled={tourOpen}
          >
            <div class="mobile-swipe-page">
              <div class="col-menu">
                <MenuTree
                  state={state}
                  dispatch={dispatch}
                  onLeafSelected={() => setMobilePage(1)}
                  chipsEnabled={chipsEnabled}
                />
              </div>
            </div>
            <div class="mobile-swipe-page">
              <div class="col-perm">
                <PermissionList state={state} dispatch={dispatch} />
              </div>
            </div>
          </MobileSwipe>
        ) : (
          <>
            <div
              class={`col-menu-perm-group${layoutStacked ? " is-stacked" : ""}`}
            >
              <div
                key="menu"
                class="col-menu"
                style={
                  layoutStacked ? { flexBasis: `${menuHeightPct}%` } : undefined
                }
              >
                <MenuTree
                  state={state}
                  dispatch={dispatch}
                  chipsEnabled={chipsEnabled}
                />
              </div>
              {layoutStacked && (
                <ResizeHandle key="resize-handle" onDrag={setMenuHeightPct} />
              )}
              <div key="perm" class="col-perm">
                <PermissionList state={state} dispatch={dispatch} />
              </div>
            </div>
            <div class="col-cart">
              <CartPanel
                state={state}
                dispatch={dispatch}
                onCopyClick={handleCopyClick}
                addToast={addToast}
              />
            </div>
          </>
        )}
      </div>

      {isMobile && (
        <button
          class="mobile-cart-fab"
          onClick={() => setCartOpen(true)}
          aria-label="선택 현황 열기"
        >
          <CartFabIcon />
          {(state.selectedMenuSeqs.size > 0 ||
            state.selectedPermCodes.size > 0) && (
            <span class="mobile-cart-fab-badge">
              {state.selectedMenuSeqs.size}·{state.selectedPermCodes.size}
            </span>
          )}
        </button>
      )}

      {isMobile && cartOpen && (
        <div class="mobile-cart-overlay">
          <div class="mobile-cart-overlay-header">
            <span class="mobile-cart-overlay-title">선택 현황</span>
            <button
              class="mobile-cart-overlay-close"
              onClick={() => setCartOpen(false)}
              aria-label="선택 현황 닫기"
            >
              <CloseIcon />
            </button>
          </div>
          <div class="mobile-cart-overlay-body">
            <CartPanel
              state={state}
              dispatch={dispatch}
              onCopyClick={handleCopyClick}
            />
          </div>
        </div>
      )}

      {showModal && modalResult && (
        <CopyModal
          result={modalResult}
          onConfirm={doCopy}
          onClose={() => setShowModal(false)}
        />
      )}

      {tourOpen && (
        <OnboardingTour
          state={state}
          onClose={closeTour}
          onStepChange={handleTourStepChange}
          remeasureSignal={`${mobilePage}-${cartOpen}`}
          mobileCartOpen={cartOpen}
        />
      )}
      {showContact && (
        <div class="modal-backdrop" onClick={() => setShowContact(false)}>
          <div
            class="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 400 }}
          >
            <div class="modal-header">
              <h2 class="modal-title">문의사항</h2>{" "}
              <p class="modal-subtitle">{CONTACT.subtitle}</p>
            </div>
            <div class="modal-footer">
              <button
                class="btn btn-ghost"
                onClick={() => setShowContact(false)}
              >
                닫기
              </button>
              <a
                class="btn btn-primary"
                href={CONTACT.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowContact(false)}
              >
                바로가기
              </a>
            </div>
          </div>
        </div>
      )}
      {showFallback && (
        <div class="modal-backdrop" onClick={() => setShowFallback(false)}>
          <div
            class="modal"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520 }}
          >
            <div class="modal-header">
              <h2 class="modal-title">수동 복사</h2>
              <p class="modal-subtitle">
                클립보드 접근이 차단됐어요. 아래 텍스트를 직접 선택해
                복사해주세요.
              </p>
            </div>
            <div class="modal-body">
              <textarea
                class="fallback-textarea"
                readOnly
                autoFocus
                value={fallbackText}
                onFocus={(e) => e.target.select()}
                ref={(el) => el?.select()}
                rows={12}
              />
            </div>
            <div class="modal-footer">
              <button
                class="btn btn-primary"
                onClick={() => setShowFallback(false)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      {copiedPreview && (
        <div
          class="copy-preview"
          key={previewKey}
          ref={previewRef}
          onClick={() => setCopiedPreview(null)}
          onMouseEnter={pausePreviewTimer}
          onMouseLeave={resumePreviewTimer}
        >
          <div class="copy-preview-header">
            <span class="copy-preview-label">복사된 텍스트</span>
            <span class="copy-preview-hint">클릭하여 닫기...</span>
          </div>
          <pre class="copy-preview-text">{copiedPreview}</pre>
          <div class="copy-preview-bar">
            <div
              class="copy-preview-bar-fill"
              style={{
                "--copy-preview-duration": `${COPY_PREVIEW_DURATION_MS}ms`,
              }}
            ></div>
          </div>
        </div>
      )}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
