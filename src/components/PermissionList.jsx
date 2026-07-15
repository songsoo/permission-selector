import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import SearchInput from "./SearchInput.jsx";
import HelpTooltip from "./HelpTooltip.jsx";
import { useTooltip } from "../lib/useTooltip.js";
import { useTooltipPosition } from "../lib/tooltipPosition.js";
import { isCoarsePointer } from "../lib/pointer.js";
import Portal from "../lib/Portal.jsx";
import { normalize, highlight } from "../lib/text.jsx";
import {
  parseGlossaryText,
  mergeGlossaryTerms,
  stripGlossaryMarkers,
  GlossaryNotes,
} from "../lib/glossary.jsx";
import { computeOrphanPerms } from "../lib/tree.js";

function PermFilterIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    >
      <path d="M4 3v9M4 7h7M4 12h7" />
      <circle cx="4" cy="3" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

let textMeasureCtx = null;
function getTextWidth(text, font) {
  if (!textMeasureCtx) {
    textMeasureCtx = document.createElement("canvas").getContext("2d");
  }
  textMeasureCtx.font = font;
  return textMeasureCtx.measureText(text).width;
}

function PermCard({
  p,
  checked,
  query,
  dispatch,
  showMenuHelpText,
  menuName,
  isFiltered,
  onFilter,
  isOrphan,
}) {
  const { open, ref, bubbleRef, bubbleHandlers, show, hide, longPress } =
    useTooltip();
  const [previewing, setPreviewing] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const descRef = useRef(null);
  const staticRef = useRef(null);

  const nameTerms = useMemo(() => parseGlossaryText(p.label).terms, [p.label]);
  const descNodes = useMemo(
    () => parseGlossaryText(p.label, query).nodes,
    [p.label, query],
  );
  const hasContent =
    p.helpText || (showMenuHelpText && p.menuHelpText) || nameTerms.length > 0;

  const MARQUEE_GAP = 32; // .perm-desc-copy의 padding-right와 일치해야 함
  const MARQUEE_SPEED = 60; // px/s

  // 텍스트가 카드 폭을 넘칠 때만: 평소엔 ellipsis, hover 시 한쪽 방향으로 무한히 흘러가는 애니메이션 적용
  function measureOverflow() {
    const el = descRef.current;
    const staticEl = staticRef.current;
    if (!el || !staticEl) return;
    // scrollWidth/clientWidth(정수 반올림)나 Range 경계 측정은 하이라이트 마크업 등에
    // 흔들릴 수 있어, 실제 렌더 폰트로 canvas에 직접 측정한 텍스트 폭을 기준으로 판정한다.
    const cs = getComputedStyle(staticEl);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const contentWidth = getTextWidth(stripGlossaryMarkers(p.label), font);
    const boxWidth = staticEl.getBoundingClientRect().width;
    const overflow = contentWidth - boxWidth;
    if (overflow > 0.5) {
      const loop = Math.ceil(contentWidth) + MARQUEE_GAP;
      el.style.setProperty("--marquee-loop", `${loop}px`);
      el.style.setProperty(
        "--marquee-duration",
        `${(loop / MARQUEE_SPEED).toFixed(2)}s`,
      );
      setHasOverflow(true);
    } else {
      el.style.removeProperty("--marquee-loop");
      el.style.removeProperty("--marquee-duration");
      setHasOverflow(false);
      setPreviewing(false);
    }
  }

  // 뱃지 유무·체크 상태(폰트 굵기 변화)로 카드 폭이 늦게 확정되거나
  // 웹폰트가 뒤늦게 로드되는 경우를 대비해 재측정
  useEffect(() => {
    measureOverflow();
    if (document.fonts?.ready) {
      document.fonts.ready.then(measureOverflow);
    }
  }, [p.label, query, checked]);

  // 카드가 좌우로 붙는 옆 배치는 좁은 모바일 화면에서 화면 밖으로 나가버리므로,
  // 다른 툴팁과 동일하게 앵커 위/아래 중 공간이 넉넉한 쪽에 배치하고 clamp한다.
  const pos = useTooltipPosition(open && hasContent, ref, bubbleRef, {
    fallbackWidth: 260,
  });

  function doToggle() {
    dispatch({ type: "TOGGLE_PERM", permCode: p.permissionCode });
    // hover가 없는 환경(터치)에서도 탭한 순간 넘치는 텍스트를 한 번 흘려 보여준다
    if (hasOverflow) setPreviewing(true);
  }

  return (
    <li
      ref={ref}
      key={p.permissionCode}
      class={`perm-card${checked ? " is-checked" : ""}${isFiltered ? " is-filtered" : ""}`}
      onClick={doToggle}
      // 터치에서는 tap 종료 후 브라우저가 호환용 mouseenter를 합성 발생시켜
      // 롱프레스 판정과 무관하게 show()가 불려버리므로, hover는 non-coarse에서만 연결한다.
      onMouseEnter={isCoarsePointer() ? undefined : show}
      onMouseLeave={isCoarsePointer() ? undefined : () => hide(150)}
      onPointerDown={() => {
        // 터치에서는 hover가 없으므로 약 0.5초 꾹 누르면 도움말을 열어준다 (짧은 탭은 그대로 토글)
        if (isCoarsePointer() && hasContent) longPress.start();
      }}
      onPointerUp={longPress.cancel}
      onPointerCancel={longPress.cancel}
      onPointerLeave={longPress.cancel}
      role="checkbox"
      aria-checked={checked}
      aria-label={stripGlossaryMarkers(p.label)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          doToggle();
        }
      }}
    >
      <span
        class={`perm-desc${hasOverflow ? " has-overflow" : ""}${previewing ? " is-previewing" : ""}`}
        ref={descRef}
      >
        <span class="perm-desc-static" ref={staticRef}>
          {descNodes}
        </span>
        <span
          class="perm-desc-track"
          onAnimationEnd={(e) => {
            if (e.animationName === "perm-marquee") setPreviewing(false);
          }}
        >
          <span class="perm-desc-copy">{descNodes}</span>
          <span class="perm-desc-copy" aria-hidden="true">
            {descNodes}
          </span>
        </span>
      </span>
      {hasContent && <span class="perm-info-dot" aria-hidden="true" />}
      {checked && isOrphan && onFilter && (
        <span
          class="badge badge-orphan"
          data-tooltip="이 권한을 가진 메뉴가 선택되지 않았어요 · 클릭해서 메뉴 찾기"
          onClick={(e) => {
            e.stopPropagation();
            onFilter();
          }}
        >
          메뉴
        </span>
      )}
      {p.requiresApproval && (
        <span class="badge badge-warn" data-tooltip="보안담당자 결재 필요">
          보안
        </span>
      )}
      {onFilter && (
        <button
          class={`perm-filter-btn${isFiltered ? " is-active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onFilter();
          }}
          data-tooltip={isFiltered ? "필터 해제" : "이 권한을 가진 메뉴만 필터"}
          aria-label={isFiltered ? "필터 해제" : "이 권한을 가진 메뉴만 보기"}
        >
          <PermFilterIcon />
        </button>
      )}
      {pos &&
        (() => {
          const helpParsed = parseGlossaryText(p.helpText);
          const menuHelpParsed = parseGlossaryText(
            showMenuHelpText ? p.menuHelpText : null,
          );
          const glossaryTerms = mergeGlossaryTerms(
            nameTerms,
            helpParsed.terms,
            menuHelpParsed.terms,
          );
          return (
            <Portal>
              <span
                ref={bubbleRef}
                {...bubbleHandlers}
                class={`perm-helptext-bubble${pos.below ? " is-below" : ""}`}
                style={{ top: pos.top + "px", left: pos.left + "px" }}
              >
                {p.helpText && <span>{helpParsed.nodes}</span>}
                {showMenuHelpText && p.menuHelpText && (
                  <>
                    {p.helpText && <hr class="perm-helptext-divider" />}
                    <span class="perm-helptext-context-label">
                      "{menuName}" 페이지에서는
                    </span>
                    <span class="perm-helptext-context-body">
                      {menuHelpParsed.nodes}
                    </span>
                  </>
                )}
                <GlossaryNotes
                  terms={glossaryTerms}
                  withDivider={Boolean(
                    p.helpText || (showMenuHelpText && p.menuHelpText),
                  )}
                />
              </span>
            </Portal>
          );
        })()}
    </li>
  );
}

export default function PermissionList({ state, dispatch }) {
  const {
    menus,
    selectedMenuSeqs,
    selectedPermCodes,
    focusedMenuSeq,
    permSearch,
    permFilter,
  } = state;

  // 표시할 permissions 계산 (permissionCode 기준 중복 제거)
  const permsToShow = useMemo(() => {
    if (focusedMenuSeq != null) {
      const menu = menus.find((m) => m.nodeId === focusedMenuSeq);
      return menu ? menu.permissions : [];
    }
    const seen = new Set();
    const result = [];
    for (const menu of menus) {
      for (const p of menu.permissions) {
        if (!seen.has(p.permissionCode)) {
          seen.add(p.permissionCode);
          result.push(p);
        }
      }
    }
    return result;
  }, [menus, focusedMenuSeq]);

  // 선택된 메뉴 어디에도 속하지 않은 선택된 권한 (전체보기/특정 메뉴 필터 모두에서 인라인 경고용)
  const orphanCodes = useMemo(
    () =>
      new Set(
        computeOrphanPerms(menus, selectedMenuSeqs, selectedPermCodes).map(
          (p) => p.permissionCode,
        ),
      ),
    [menus, selectedMenuSeqs, selectedPermCodes],
  );

  const query = permSearch;
  const filtered = useMemo(
    () =>
      query
        ? permsToShow.filter((p) =>
            normalize(p.label).includes(normalize(query)),
          )
        : permsToShow,
    [permsToShow, query],
  );

  const handleSearch = useCallback(
    (v) => dispatch({ type: "SET_PERM_SEARCH", value: v }),
    [dispatch],
  );

  const focusedMenu =
    focusedMenuSeq != null
      ? menus.find((m) => m.nodeId === focusedMenuSeq)
      : null;
  const subtitle = focusedMenu ? focusedMenu.title : "전체";

  return (
    <>
      <div class="col-header">
        <div class="col-header-row">
          <div class="col-header-title-wrap">
            <h2>상세 권한</h2>
            <HelpTooltip text="각 페이지에서 사용할 수 있는 기능에 대한 권한이에요." />
          </div>
          <SearchInput
            value={permSearch}
            onChange={handleSearch}
            placeholder="권한 검색"
          />
        </div>
        <div class="col-header-filter-row">
          {focusedMenuSeq != null ? (
            <span
              class="col-header-context is-clearable"
              onClick={() =>
                dispatch({
                  type: "SET_FOCUSED_MENU",
                  menuSeq: focusedMenuSeq,
                })
              }
              data-tooltip="필터 해제"
            >
              <svg
                class="col-header-context-icon"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M2 4h12M4.5 8h7M7 12h2" />
              </svg>
              <span class="col-header-context-label">{subtitle}</span>
              <span class="col-header-context-close">×</span>
            </span>
          ) : (
            <span class="col-header-context is-static">
              <svg
                class="col-header-context-icon"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M2 4h12M4.5 8h7M7 12h2" />
              </svg>
              <span class="col-header-context-label">{subtitle}</span>
            </span>
          )}
        </div>
      </div>
      <div class="col-scroll">
        {filtered.length === 0 ? (
          <div class="perm-empty">
            {permsToShow.length === 0 && focusedMenuSeq != null ? (
              <>
                이 메뉴는 상세 권한 없이 선택할 수 있어요
                <div class="perm-empty-sub">
                  왼쪽 체크박스를 클릭하면 선택 현황에 추가돼요
                </div>
              </>
            ) : permsToShow.length === 0 ? (
              "표시할 권한이 없습니다"
            ) : (
              "검색 결과 없음"
            )}
          </div>
        ) : (
          <ul class="perm-grid">
            {filtered.map((p) => (
              <PermCard
                key={p.permissionCode}
                p={p}
                checked={selectedPermCodes.has(p.permissionCode)}
                query={query}
                dispatch={dispatch}
                showMenuHelpText={focusedMenuSeq != null}
                menuName={focusedMenu ? focusedMenu.title : ""}
                isFiltered={permFilter === p.permissionCode}
                isOrphan={orphanCodes.has(p.permissionCode)}
                onFilter={() =>
                  dispatch({
                    type: "SET_PERM_FILTER",
                    permCode: p.permissionCode,
                  })
                }
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
