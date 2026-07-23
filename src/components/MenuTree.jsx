import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "preact/hooks";
import { forwardRef } from "preact/compat";
import { isLeaf, buildTree, getAncestorPath } from "../lib/tree.js";
import SearchInput from "./SearchInput.jsx";
import HelpTooltip from "./HelpTooltip.jsx";
import { useTooltip } from "../lib/useTooltip.js";
import {
  useTooltipPosition,
  useSidePanelPosition,
} from "../lib/tooltipPosition.js";
import {
  getEffectiveTargets,
  getExplicitCascades,
  isShortcutFullySelected,
} from "../lib/shortcuts.js";
import { normalize, highlight } from "../lib/text.jsx";
import {
  parseGlossaryText,
  stripGlossaryMarkers,
  GlossaryNotes,
} from "../lib/glossary.jsx";
import { ChevronIcon } from "./icons.jsx";
import Portal from "../lib/Portal.jsx";

function EyeOffIcon({ class: cls }) {
  return (
    <svg
      class={cls}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M9.88 9.88a3 3 0 104.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0112 5c7 0 10 7 10 7a13.16 13.16 0 01-1.67 2.68" />
      <path d="M6.61 6.61A13.53 13.53 0 002 12s3 7 10 7a9.74 9.74 0 005.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

function HiddenMenuIcon() {
  const { open, ref, bubbleRef, handlers, bubbleHandlers } = useTooltip();
  const pos = useTooltipPosition(open, ref, bubbleRef);

  return (
    <span class="tree-node-hidden-icon" ref={ref} {...handlers}>
      <EyeOffIcon />
      {open && (
        <Portal>
          <span
            ref={bubbleRef}
            {...bubbleHandlers}
            class={`tree-node-hidden-tooltip${pos?.below ? " is-below" : ""}`}
            style={
              pos
                ? { top: pos.top + "px", left: pos.left + "px" }
                : { top: "-9999px", left: "-9999px", visibility: "hidden" }
            }
          >
            관리자 센터 좌측 메뉴에 표시되지 않는 페이지에요
          </span>
        </Portal>
      )}
    </span>
  );
}

function AdminSidebarDiagram() {
  const menuRows = [0, 11, 22, 33, 44, 55, 66, 77, 88];
  const menuWidths = [62, 50, 56, 44, 58, 48, 52, 42, 54];
  return (
    <svg
      viewBox="0 0 300 120"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", width: "100%" }}
    >
      <rect width="300" height="120" fill="#e8e8e8" />
      <rect width="300" height="18" fill="#1a1a1a" />
      <circle cx="12" cy="9" r="5" fill="#3a3a3a" />
      <text
        x="54"
        y="13"
        font-size="8"
        font-weight="700"
        fill="#ff3c78"
        font-family="sans-serif"
      >
        Grip
      </text>
      <rect x="190" y="6" width="24" height="4" rx="2" fill="#4a4a4a" />
      <rect x="220" y="6" width="24" height="4" rx="2" fill="#4a4a4a" />
      <rect x="250" y="6" width="24" height="4" rx="2" fill="#4a4a4a" />
      <rect x="280" y="6" width="16" height="4" rx="2" fill="#4a4a4a" />
      <rect x="0" y="18" width="62" height="102" fill="#1e1e1e" />
      {menuRows.map((y, i) => (
        <rect
          key={i}
          x="6"
          y={23 + y}
          width={menuWidths[i]}
          height="5"
          rx="2"
          fill={i === 0 ? "#6a6a6a" : "#3a3a3a"}
        />
      ))}
      <rect
        x="2"
        y="20"
        width="58"
        height="98"
        rx="3"
        fill="none"
        stroke="#ff3c78"
        stroke-width="2"
      />
      <rect x="62" y="18" width="238" height="102" fill="#f0f0f0" />
      <rect x="70" y="25" width="52" height="5" rx="2" fill="#c8c8c8" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect
            x={70 + i * 78}
            y={36}
            width="72"
            height="32"
            rx="3"
            fill="white"
          />
          <rect
            x={77 + i * 78}
            y={42}
            width="36"
            height="4"
            rx="2"
            fill="#d4d4d4"
          />
          <rect
            x={77 + i * 78}
            y={49}
            width="24"
            height="3"
            rx="2"
            fill="#e0e0e0"
          />
          <rect
            x={112 + i * 78}
            y={48}
            width="16"
            height="5"
            rx="2"
            fill="#ffd0de"
          />
          <rect
            x={77 + i * 78}
            y={55}
            width="20"
            height="3"
            rx="2"
            fill="#e0e0e0"
          />
          <rect
            x={112 + i * 78}
            y={54}
            width="12"
            height="5"
            rx="2"
            fill="#ffd0de"
          />
        </g>
      ))}
      <rect x="70" y="74" width="44" height="4" rx="2" fill="#c8c8c8" />
      <rect x="70" y="83" width="228" height="26" rx="3" fill="white" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect
            x={78 + i * 57}
            y={88}
            width="36"
            height="4"
            rx="2"
            fill="#d4d4d4"
          />
          <rect
            x={78 + i * 57}
            y={95}
            width="24"
            height="4"
            rx="2"
            fill="#e0e0e0"
          />
          <rect
            x={78 + i * 57}
            y={101}
            width="18"
            height="5"
            rx="3"
            fill="#ffd0de"
          />
        </g>
      ))}
    </svg>
  );
}

function HiddenToggleButton({ showHidden, onToggle }) {
  const { open, ref, bubbleRef, handlers, bubbleHandlers } = useTooltip();
  const pos = useTooltipPosition(open, ref, bubbleRef, {
    fallbackWidth: 300,
    fallbackHeight: 260,
  });

  return (
    <span ref={ref} {...handlers}>
      <button
        class={`btn btn-ghost tree-hidden-toggle${showHidden ? " is-active" : ""}`}
        onClick={onToggle}
        aria-label={showHidden ? "숨김 메뉴 표시 해제" : "숨김 메뉴만 보기"}
      >
        {showHidden ? <EyeIcon /> : <EyeOffIcon />}
      </button>
      {open && (
        <Portal>
          <span
            ref={bubbleRef}
            {...bubbleHandlers}
            class={`tree-hidden-toggle-tooltip${pos?.below ? " is-below" : ""}`}
            style={
              pos
                ? { top: pos.top + "px", left: pos.left + "px" }
                : { top: "-9999px", left: "-9999px", visibility: "hidden" }
            }
          >
            {
              "hidden 또는 서브메뉴라고 불리는 기능입니다.\n관리자 센터 좌측 메뉴에 표시되지 않는 페이지를 의미해요.\n이 버튼으로 아래 목록에 나타내거나 숨길 수 있어요."
            }
            <span class="tree-hidden-toggle-diagram">
              <AdminSidebarDiagram />
            </span>
          </span>
        </Portal>
      )}
    </span>
  );
}

function InfoIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
    >
      <circle cx="8" cy="8" r="6.5" />
      <line x1="8" y1="7" x2="8" y2="11" stroke-linecap="round" />
      <circle cx="8" cy="5" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MenuDescIcon({ text }) {
  const { open, ref, bubbleRef, handlers, bubbleHandlers } = useTooltip();
  const pos = useTooltipPosition(open, ref, bubbleRef, { fallbackWidth: 240 });
  const { nodes, terms } = parseGlossaryText(text);

  return (
    <span class="tree-node-desc-icon" ref={ref} {...handlers}>
      <InfoIcon />
      {open && (
        <Portal>
          <span
            ref={bubbleRef}
            {...bubbleHandlers}
            class={`tree-node-desc-tooltip${pos?.below ? " is-below" : ""}`}
            style={
              pos
                ? { top: pos.top + "px", left: pos.left + "px" }
                : { top: "-9999px", left: "-9999px", visibility: "hidden" }
            }
          >
            {nodes}
            <GlossaryNotes terms={terms} />
          </span>
        </Portal>
      )}
    </span>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M2 4h12M4.5 8h7M7 12h2" />
    </svg>
  );
}

function chipIntensityStyle(selectedCount, totalCount) {
  if (totalCount === 0 || selectedCount === 0) return {};
  const isAll = selectedCount === totalCount;
  const ratio = selectedCount / totalCount;
  // sqrt 커브: 첫 변화 크고 이후 완만
  const intensity = Math.sqrt(ratio);
  const borderRaw = Math.min(intensity * 1.6, 1);
  const borderPct = (borderRaw * 100).toFixed(1);
  const borderRemain = ((1 - borderRaw) * 100).toFixed(1);
  // 텍스트: brand 색에서 시작, 전체 선택 시 흰색
  return {
    background: isAll ? "var(--brand)" : "#fff",
    borderColor: `color-mix(in srgb, var(--brand) ${borderPct}%, var(--border-strong) ${borderRemain}%)`,
    color: isAll
      ? "#fff"
      : `color-mix(in srgb, var(--brand) ${(intensity * 100).toFixed(1)}%, var(--text-muted))`,
  };
}

function ShortcutChip({
  sc,
  chipKey,
  state,
  dispatch,
  menuMap,
  permMap,
  hiddenSet,
  onJumpToMenu,
}) {
  const {
    open: tipOpen,
    ref: wrapRef,
    bubbleRef: tipPanelRef,
    handlers: tipHandlers,
    bubbleHandlers: tipBubbleHandlers,
  } = useTooltip();
  const tipPos = useSidePanelPosition(tipOpen, wrapRef, tipPanelRef, {
    fallbackWidth: 220,
    fallbackHeight: 160,
  });

  const parentSeq = chipKey.split(":")[0];

  // 이 칩이 영향을 주는 모든 타겟 (own + cascade 재귀)
  const eff = useMemo(
    () => getEffectiveTargets(sc, parentSeq),
    [sc, parentSeq],
  );

  const { nodes: descNodes, terms: descTerms } = parseGlossaryText(sc.desc);

  const totalCount = eff.menus.length + eff.perms.length;
  const selectedCount =
    eff.menus.filter((s) => state.selectedMenuSeqs.has(s)).length +
    eff.perms.filter((c) => state.selectedPermCodes.has(c)).length;

  const isActive = isShortcutFullySelected(
    eff,
    state.selectedMenuSeqs,
    state.selectedPermCodes,
  );
  const isPartial = !isActive && selectedCount > 0;

  function handleClick(e) {
    e.stopPropagation();
    if (isActive) {
      dispatch({ type: "DEACTIVATE_SHORTCUT", shortcut: eff });
    } else {
      // off 또는 partial → 누락분 모두 채워서 full activate
      dispatch({ type: "ACTIVATE_SHORTCUT", shortcut: eff });
    }
  }

  const ariaPressed = isActive ? true : isPartial ? "mixed" : false;

  // 직접 own targets (tooltip 메뉴 섹션용, parentSeq 포함)
  const ownMenus = sc.menus.includes(parentSeq)
    ? sc.menus
    : [parentSeq, ...sc.menus];
  const ownPerms = sc.perms;
  const cascades = getExplicitCascades(sc);

  const intensityStyle = chipIntensityStyle(selectedCount, totalCount);

  return (
    <span class="tree-node-chip-wrap" ref={wrapRef} {...tipHandlers}>
      <button
        class={`tree-node-chip${isActive ? " is-active" : isPartial ? " is-partial" : ""}`}
        style={intensityStyle}
        onClick={handleClick}
        aria-pressed={ariaPressed}
      >
        {sc.label}
      </button>
      {tipOpen && (
        <Portal>
        <span
          ref={tipPanelRef}
          {...tipBubbleHandlers}
          class="tree-node-chip-tooltip"
          style={
            tipPos
              ? { top: tipPos.top + "px", left: tipPos.left + "px" }
              : { top: "-9999px", left: "-9999px", visibility: "hidden" }
          }
        >
          {sc.desc && <span class="chip-tip-desc">{descNodes}</span>}
          {totalCount > 0 && (
            <span class="chip-tip-summary">
              {totalCount}개 중 {selectedCount}개 적용 중
            </span>
          )}
          {ownMenus.length > 0 && (
            <span class="chip-tip-section">
              <span class="chip-tip-label">메뉴</span>
              {ownMenus.map((seq) => {
                const on = state.selectedMenuSeqs.has(seq);
                return (
                  <button
                    key={seq}
                    class={`chip-tip-cascade-row${on ? " is-on" : " is-off"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "TOGGLE_MENU", menuSeq: seq });
                    }}
                  >
                    <span class="chip-tip-cascade-name">
                      {menuMap[seq] ?? String(seq)}
                      {hiddenSet?.has(seq) && (
                        <EyeOffIcon class="chip-tip-hidden-icon" />
                      )}
                    </span>
                    <span class="chip-tip-item-toggle">{on ? "✓" : "+"}</span>
                  </button>
                );
              })}
            </span>
          )}
          {ownPerms.length > 0 && (
            <span class="chip-tip-section">
              <span class="chip-tip-label">권한</span>
              {ownPerms.map((code) => {
                const on = state.selectedPermCodes.has(code);
                return (
                  <button
                    key={code}
                    class={`chip-tip-cascade-row${on ? " is-on" : " is-off"}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "TOGGLE_PERM", permCode: code });
                    }}
                  >
                    <span class="chip-tip-cascade-name">
                      {permMap[code] ?? code}
                    </span>
                    <span class="chip-tip-item-toggle">{on ? "✓" : "+"}</span>
                  </button>
                );
              })}
            </span>
          )}
          {cascades.length > 0 && (
            <span class="chip-tip-section">
              <hr class="chip-tip-divider" />
              <span class="chip-tip-label">연쇄 활성</span>
              {cascades.map(({ chipKey: cKey, shortcut: cSc }) => {
                const cSeq = cKey.split(":")[0];
                const cEff = getEffectiveTargets(cSc, cSeq);
                const cTotal = cEff.menus.length + cEff.perms.length;
                const cSelected =
                  cEff.menus.filter((s) => state.selectedMenuSeqs.has(s))
                    .length +
                  cEff.perms.filter((c) => state.selectedPermCodes.has(c))
                    .length;
                const cIsActive = cTotal > 0 && cSelected === cTotal;
                const cIsPartial = !cIsActive && cSelected > 0;
                const statusClass = cIsActive
                  ? " is-on"
                  : cIsPartial
                    ? " is-partial"
                    : " is-off";
                return (
                  <button
                    key={cKey}
                    class={`chip-tip-cascade-row${statusClass}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (cIsActive) {
                        dispatch({
                          type: "DEACTIVATE_SHORTCUT",
                          shortcut: cEff,
                        });
                      } else {
                        dispatch({ type: "ACTIVATE_SHORTCUT", shortcut: cEff });
                      }
                      onJumpToMenu?.(cSeq);
                    }}
                  >
                    <span class="chip-tip-cascade-name">
                      ↳ {menuMap[cSeq] ?? String(cSeq)}
                      {hiddenSet?.has(cSeq) && (
                        <EyeOffIcon class="chip-tip-hidden-icon" />
                      )}
                      {cSc.label && (
                        <span class="chip-tip-cascade-keyword">
                          · {cSc.label}
                        </span>
                      )}
                    </span>
                    {cTotal > 0 && (
                      <span class="chip-tip-cascade-count">
                        {cSelected}/{cTotal}
                      </span>
                    )}
                  </button>
                );
              })}
            </span>
          )}
          <GlossaryNotes terms={descTerms} />
        </span>
        </Portal>
      )}
    </span>
  );
}

function hasPerm(node, permCode) {
  if (isLeaf(node))
    return node.permissions.some((p) => p.permissionCode === permCode);
  return (node.nodes || []).some((c) => hasPerm(c, permCode));
}

function TreeNode({
  node,
  depth,
  state,
  dispatch,
  openMap,
  setOpenMap,
  menuMap,
  permMap,
  hiddenSet,
  showHidden,
  onJumpToMenu,
  onLeafSelected,
  chipsEnabled,
}) {
  const leaf = isLeaf(node);
  const isSelected = state.selectedMenuSeqs.has(node.nodeId);
  const isFocused = state.focusedMenuSeq === node.nodeId;
  const query = state.menuSearch;
  const { permFilter } = state;
  const isOpen = permFilter ? true : openMap[node.nodeId] !== false;

  const visible = (node.nodes || []).filter(
    (c) =>
      (showHidden || !c.restricted) &&
      (!permFilter || hasPerm(c, permFilter)),
  );

  function handleRowClick() {
    if (!leaf) {
      setOpenMap((prev) => ({ ...prev, [node.nodeId]: !isOpen }));
    } else {
      dispatch({ type: "SET_FOCUSED_MENU", menuSeq: node.nodeId });
    }
  }

  function handleCheck(e) {
    e.stopPropagation();
    dispatch({ type: "TOGGLE_MENU", menuSeq: node.nodeId });
    if (!isSelected && !isFocused) {
      dispatch({ type: "SET_FOCUSED_MENU", menuSeq: node.nodeId });
    }
    // 선택(해제 아님) 시에만 상세 권한 화면으로 안내 (모바일 자동 전환용)
    if (!isSelected) onLeafSelected?.(node.nodeId);
  }

  const indent = Math.min(depth * 16, 64);
  const chips = chipsEnabled
    ? (node.shortcuts ?? []).filter((sc) => sc.label.trim())
    : [];

  return (
    <>
      <li
        data-node-id={node.nodeId}
        class={`tree-node${isFocused ? " is-focused" : ""}${isSelected ? " is-selected" : ""}`}
        onClick={handleRowClick}
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        {node.restricted ? (
          <HiddenMenuIcon />
        ) : (
          <span class="tree-node-hidden-placeholder" />
        )}

        {!leaf ? (
          <span class={`tree-node-toggle${isOpen ? " is-open" : ""}`}>
            <ChevronIcon />
          </span>
        ) : (
          <button
            class={`perm-filter-btn${isFocused ? " is-active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: "SET_FOCUSED_MENU", menuSeq: node.nodeId });
            }}
            data-tooltip={
              isFocused ? "필터 해제" : "이 메뉴의 상세 권한만 필터"
            }
            aria-label={
              isFocused ? "필터 해제" : "이 메뉴의 상세 권한만 보기"
            }
          >
            <FilterIcon />
          </button>
        )}

        {leaf && (
          <span
            class={`tree-node-check${isSelected ? " is-checked" : ""}`}
            onClick={handleCheck}
            role="checkbox"
            aria-checked={isSelected}
            aria-label={node.title}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleCheck(e);
              }
            }}
          />
        )}

        <span class="tree-node-name-wrap">
          <span class={`tree-node-name${!leaf ? " is-middle" : ""}`}>
            {highlight(node.title, query)}
          </span>
          {node.label && <MenuDescIcon text={node.label} />}
        </span>

        {chips.length > 0 && (
          <span class="tree-node-chips">
            {chips.map((sc, i) => (
              <ShortcutChip
                key={i}
                sc={sc}
                chipKey={`${node.nodeId}:${sc.label}`}
                state={state}
                dispatch={dispatch}
                menuMap={menuMap}
                permMap={permMap}
                hiddenSet={hiddenSet}
                onJumpToMenu={onJumpToMenu}
              />
            ))}
          </span>
        )}

        {leaf && node.permissions.length > 0 && (
          <span class="tree-node-perm-count">
            {
              node.permissions.filter((p) =>
                state.selectedPermCodes.has(p.permissionCode),
              ).length
            }
            /{node.permissions.length}
          </span>
        )}
      </li>

      {!leaf &&
        isOpen &&
        visible.map((child) => (
          <TreeNode
            key={child.nodeId}
            node={child}
            depth={depth + 1}
            state={state}
            dispatch={dispatch}
            openMap={openMap}
            setOpenMap={setOpenMap}
            menuMap={menuMap}
            permMap={permMap}
            hiddenSet={hiddenSet}
            showHidden={showHidden}
            onJumpToMenu={onJumpToMenu}
            onLeafSelected={onLeafSelected}
            chipsEnabled={chipsEnabled}
          />
        ))}
    </>
  );
}

function MenuTree({ state, dispatch, onLeafSelected, chipsEnabled = true }, ref) {
  const [openMap, setOpenMap] = useState({});
  const [showHidden, setShowHidden] = useState(false);
  const query = state.menuSearch;
  const { permFilter } = state;
  const tree = useMemo(() => buildTree(state.menus), [state.menus]);
  const visible = useMemo(
    () =>
      tree.filter(
        (n) =>
          (showHidden || !n.restricted) && (!permFilter || hasPerm(n, permFilter)),
      ),
    [tree, showHidden, permFilter],
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = normalize(query);
    const matched = [];
    function walk(nodes) {
      for (const n of nodes) {
        // restricted 노드는 렌더링 트리에서 가지 전체가 잘리므로, 검색도 그 자식까지 내려가지 않는다
        if (!showHidden && n.restricted) continue;
        if (normalize(n.title).includes(q)) {
          matched.push(n);
        }
        walk(n.nodes || []);
      }
    }
    walk(tree);
    // 조상-자손이 같은 검색어에 동시 매칭되면 조상 행은 생략하고
    // 가장 구체적인(하위) 매칭만 남긴다 — breadcrumb에 조상 이름이 이미 표시되므로 정보 손실 없음
    const matchedSeqs = new Set(matched.map((n) => n.nodeId));
    function hasMatchedDescendant(node) {
      return (node.nodes || []).some(
        (c) => matchedSeqs.has(c.nodeId) || hasMatchedDescendant(c),
      );
    }
    return matched.filter((n) => !hasMatchedDescendant(n));
  }, [tree, query, showHidden]);

  const permFilterDesc = useMemo(() => {
    if (!permFilter) return null;
    for (const menu of state.menus) {
      for (const p of menu.permissions) {
        if (p.permissionCode === permFilter) return stripGlossaryMarkers(p.label);
      }
    }
    return permFilter;
  }, [state.menus, permFilter]);

  const menuMap = useMemo(() => {
    const m = {};
    for (const menu of state.menus) m[menu.nodeId] = menu.title;
    return m;
  }, [state.menus]);

  const permMap = useMemo(() => {
    const m = {};
    for (const menu of state.menus) {
      for (const p of menu.permissions) {
        if (!m[p.permissionCode]) m[p.permissionCode] = stripGlossaryMarkers(p.label);
      }
    }
    return m;
  }, [state.menus]);

  const hiddenSet = useMemo(() => {
    const s = new Set();
    for (const menu of state.menus) if (menu.restricted) s.add(menu.nodeId);
    return s;
  }, [state.menus]);

  const handleSearch = useCallback(
    (v) => dispatch({ type: "SET_MENU_SEARCH", value: v }),
    [dispatch],
  );

  // 조상 펼치기 + 스크롤 이동 + 잠깐 강조 (cascade 칩, 검색 결과 클릭에서 공용)
  // smooth: false면 애니메이션 없이 즉시 위치로 이동
  const jumpToMenu = useCallback(
    (seq, { smooth = true, flashes = 4 } = {}) => {
      const path = getAncestorPath(state.menus, seq);
      setOpenMap((prev) => {
        const next = { ...prev };
        for (const { nodeId } of path) next[nodeId] = true;
        return next;
      });
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-node-id="${seq}"]`);
        if (!el) return;
        const container = el.closest(".col-scroll");
        const alreadyVisible =
          container &&
          (() => {
            const c = container.getBoundingClientRect();
            const r = el.getBoundingClientRect();
            return r.top >= c.top && r.bottom <= c.bottom;
          })();

        function startBlink() {
          if (flashes <= 0) return;
          el.style.setProperty("--tree-jump-flashes", flashes);
          el.classList.add("tree-node-jumped");
          setTimeout(
            () => {
              el.classList.remove("tree-node-jumped");
              el.style.removeProperty("--tree-jump-flashes");
            },
            flashes * 500 + 500,
          );
        }

        if (alreadyVisible) {
          // 이미 화면에 보이면 굳이 스크롤하지 않고 바로 깜빡임
          startBlink();
        } else {
          el.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
          // smooth 스크롤일 때만 애니메이션이 끝날 때까지 기다렸다가 깜빡임 시작
          if (smooth) setTimeout(startBlink, 400);
          else startBlink();
        }
      });
    },
    [state.menus],
  );

  // 권한 필터 해제 시, 그 필터의 기준이었던(상세 권한을 필터링해놓은) 메뉴로 되돌아가 위치를 잃지 않게 한다
  const prevPermFilterRef = useRef(permFilter);
  useEffect(() => {
    const prevPermFilter = prevPermFilterRef.current;
    prevPermFilterRef.current = permFilter;
    if (prevPermFilter && !permFilter && state.focusedMenuSeq != null) {
      jumpToMenu(state.focusedMenuSeq, { smooth: false, flashes: 0 });
    }
  }, [permFilter, state.focusedMenuSeq, jumpToMenu]);

  // 툴팁 cascade row 클릭 시 해당 메뉴로 스크롤·펼침·포커스
  // SET_FOCUSED_MENU는 토글이라 이미 포커스된 메뉴면 dispatch를 생략해야 포커스가 풀리지 않는다
  const handleJumpToMenu = useCallback(
    (seq) => {
      if (state.focusedMenuSeq !== seq) {
        dispatch({ type: "SET_FOCUSED_MENU", menuSeq: seq });
      }
      jumpToMenu(seq, { flashes: 0 });
    },
    [dispatch, jumpToMenu, state.focusedMenuSeq],
  );

  // 검색 결과 클릭 시: leaf면 포커스도 함께, 검색어는 비워서 결과 목록을 닫음
  const handleSearchResultClick = useCallback(
    (node) => {
      dispatch({ type: "SET_MENU_SEARCH", value: "" });
      jumpToMenu(node.nodeId);
    },
    [dispatch, jumpToMenu],
  );

  // permFilter가 걸리면 openMap과 무관하게 모든 가지가 강제로 펼쳐져 보이므로
  // (위 isOpen 계산 참고) 라벨도 그 상태에 맞춰 "모두 접기"로 표시한다.
  const allOpen = Boolean(permFilter) || Object.values(openMap).every((v) => v !== false);

  function handleToggleAll() {
    const nextVal = !allOpen;
    const nextMap = {};
    for (const m of state.menus) nextMap[m.nodeId] = nextVal;
    setOpenMap(nextMap);
  }

  return (
    <>
      <div key="header" class="col-header">
        <div class="col-header-row">
          <h2>권한 메뉴</h2>
          <HelpTooltip text="각 페이지에 접속할 수 있는 권한이에요." />
          <button
            class="btn btn-ghost tree-toggle-all-btn"
            onClick={handleToggleAll}
          >
            {allOpen ? "모두 접기" : "모두 펼치기"}
          </button>
          <HiddenToggleButton
            showHidden={showHidden}
            onToggle={() => setShowHidden((v) => !v)}
          />
          <SearchInput
            ref={ref}
            value={query}
            onChange={handleSearch}
            placeholder="메뉴 검색"
          />
        </div>
        <div class="col-header-filter-row">
          {permFilter ? (
            <span
              class="col-header-context is-clearable"
              onClick={() =>
                dispatch({ type: "SET_PERM_FILTER", permCode: permFilter })
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
              >
                <path d="M4 3v9M4 7h7M4 12h7" />
                <circle cx="4" cy="3" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
              </svg>
              <span class="col-header-context-label">{permFilterDesc}</span>
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
              >
                <path d="M4 3v9M4 7h7M4 12h7" />
                <circle cx="4" cy="3" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
              </svg>
              <span class="col-header-context-label">전체</span>
            </span>
          )}
        </div>
      </div>
      {query.trim() && (
        <div key="search-results" class="tree-search-results">
          {searchResults.length === 0 ? (
            <div class="tree-search-empty">검색 결과 없음</div>
          ) : (
            searchResults.map((node) => {
              const path = getAncestorPath(state.menus, node.nodeId);
              const ancestorNames = path
                .slice(0, -1)
                .map((p) => p.title)
                .join(" > ");
              return (
                <button
                  key={node.nodeId}
                  class={`tree-search-result-row${isLeaf(node) ? " is-leaf" : " is-branch"}`}
                  onClick={() => handleSearchResultClick(node)}
                >
                  {ancestorNames && (
                    <span class="tree-search-result-path">
                      {ancestorNames} &gt;
                    </span>
                  )}
                  <span class="tree-search-result-name">
                    {highlight(node.title, query)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
      <div key="scroll" class="col-scroll">
        {visible.length === 0 ? (
          <div class="tree-empty">표시할 메뉴가 없음</div>
        ) : (
          <ul class="tree-list">
            {visible.map((node) => (
              <TreeNode
                key={node.nodeId}
                node={node}
                depth={0}
                state={state}
                dispatch={dispatch}
                openMap={openMap}
                setOpenMap={setOpenMap}
                menuMap={menuMap}
                permMap={permMap}
                hiddenSet={hiddenSet}
                showHidden={showHidden}
                onJumpToMenu={handleJumpToMenu}
                onLeafSelected={onLeafSelected}
                chipsEnabled={chipsEnabled}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default forwardRef(MenuTree);
