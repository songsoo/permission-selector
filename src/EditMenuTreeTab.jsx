import { useState, useMemo } from "preact/hooks";
import { HELP_TEXTS } from "./data/helpTexts.js";
import { SHORTCUTS } from "./data/shortcuts.js";
import { getDescendantIds, buildTree } from "./lib/tree.js";
import { HiddenBadge, flatPermissions, MultiSelect } from "./lib/editShared.jsx";
import { ChevronIcon, PlusIcon, TrashIcon, GripIcon } from "./components/icons.jsx";
import MentionField from "./components/MentionField.jsx";
import { stripGlossaryMarkers } from "./lib/glossary.jsx";

function genMenuId(existingIds) {
  let id;
  do {
    id = "m_" + Math.random().toString(16).slice(2, 10);
  } while (existingIds.has(id));
  return id;
}

function genMenuTitle(siblingTitles) {
  if (!siblingTitles.includes("새 메뉴")) return "새 메뉴";
  let n = 2;
  while (siblingTitles.includes(`새 메뉴(${n})`)) n++;
  return `새 메뉴(${n})`;
}

// 좌측 리스트 변경 표시 점: 현재 세션 변경(is-live) > 과거 저장 이력(is-history) > 변경 없음(회색) 순으로 표시
function ChangeDot({ isLive, isHistory }) {
  const cls = isLive ? " is-live" : isHistory ? " is-history" : "";
  const title = isLive
    ? "현재 변경한 내용이 있어요"
    : isHistory
      ? "이전에 저장된 변경 이력이 있어요"
      : undefined;
  return <span class={`edit-mt-dot${cls}`} title={title} />;
}

function MenuTreeRow({
  node, depth, openMap, setOpenMap, selectedMenuId, onSelect,
  onAddChild, onDelete, titleFor, changedMenuIds, historyMenuIds,
  draggedId, draggedDescendantIds, dragOver, onDragStartRow, onDragOverRow, onDropRow, onDragEndRow,
}) {
  const hasChildren = node.nodes.length > 0;
  const isOpen = openMap[node.nodeId] !== false;

  const isDropTarget = dragOver?.nodeId === node.nodeId;
  const canDropHere = draggedId != null && draggedId !== node.nodeId && !draggedDescendantIds.has(node.nodeId);

  return (
    <div>
      <div
        class={`edit-mt-node-row${selectedMenuId === node.nodeId ? " is-active" : ""}${isDropTarget ? ` is-drop-${dragOver.position}` : ""}${draggedId === node.nodeId ? " is-dragging" : ""}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        draggable
        onClick={() => onSelect(node.nodeId)}
        onDragStart={e => { e.stopPropagation(); onDragStartRow(node.nodeId); }}
        onDragOver={e => {
          if (!canDropHere) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientY - rect.top) / rect.height;
          const position = ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside";
          onDragOverRow(node.nodeId, position);
        }}
        onDrop={e => {
          if (!canDropHere) return;
          e.preventDefault();
          e.stopPropagation();
          onDropRow();
        }}
        onDragEnd={e => { e.stopPropagation(); onDragEndRow(); }}
      >
        <span class="edit-mt-node-grip" title="드래그해서 이동">
          <GripIcon />
        </span>

        <span
          class={`edit-mt-node-toggle${isOpen ? " is-open" : ""}${hasChildren ? "" : " is-empty"}`}
          onClick={e => {
            if (!hasChildren) return;
            e.stopPropagation();
            setOpenMap(prev => ({ ...prev, [node.nodeId]: !isOpen }));
          }}
        >
          {hasChildren && <ChevronIcon />}
        </span>

        <ChangeDot isLive={changedMenuIds.has(node.nodeId)} isHistory={historyMenuIds.has(node.nodeId)} />
        <span class="edit-mt-node-title">{titleFor(node.nodeId)}</span>

        {node.restricted && <HiddenBadge />}

        <span class="edit-mt-node-actions">
          <button
            type="button"
            class="edit-mt-node-icon-btn"
            title="하위 메뉴 추가"
            onClick={e => { e.stopPropagation(); onAddChild(node.nodeId); }}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            class="edit-mt-node-icon-btn"
            title={hasChildren ? "하위 메뉴가 있어 삭제할 수 없습니다" : "삭제"}
            disabled={hasChildren}
            onClick={e => { e.stopPropagation(); onDelete(node.nodeId); }}
          >
            <TrashIcon />
          </button>
        </span>
      </div>

      {hasChildren && isOpen && node.nodes.map(child => (
        <MenuTreeRow
          key={child.nodeId}
          node={child}
          depth={depth + 1}
          openMap={openMap}
          setOpenMap={setOpenMap}
          selectedMenuId={selectedMenuId}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onDelete={onDelete}
          titleFor={titleFor}
          changedMenuIds={changedMenuIds}
          historyMenuIds={historyMenuIds}
          draggedId={draggedId}
          draggedDescendantIds={draggedDescendantIds}
          dragOver={dragOver}
          onDragStartRow={onDragStartRow}
          onDragOverRow={onDragOverRow}
          onDropRow={onDropRow}
          onDragEndRow={onDragEndRow}
        />
      ))}
    </div>
  );
}

// 리프는 nodes가 비어있는 노드(flatPermissions와 동일 기준) — 실데이터에는 그룹
// 노드도 label(placeholder)을 갖는 경우가 있어 "label" 존재 여부로는 구분할 수 없다.
function isGroupNode(node) {
  return (node.nodes?.length ?? 0) > 0;
}

function updateLeafByCode(nodes, code, patch) {
  return nodes.map(node => {
    if (!isGroupNode(node)) return node.code === code ? { ...node, ...patch } : node;
    return { ...node, nodes: updateLeafByCode(node.nodes ?? [], code, patch) };
  });
}

function removeLeafByCode(nodes, code) {
  const result = [];
  for (const node of nodes) {
    if (node.code === code && !isGroupNode(node)) continue;
    if (isGroupNode(node)) {
      const filteredChildren = removeLeafByCode(node.nodes ?? [], code);
      if (filteredChildren.length === 0) continue; // 빈 그룹은 제거
      result.push({ ...node, nodes: filteredChildren });
    } else {
      result.push(node);
    }
  }
  return result;
}

function checkMenuExternalRefs(nodeId) {
  const refs = [];
  if (HELP_TEXTS.menuDescriptions?.[nodeId]) refs.push("메뉴 설명");
  if (HELP_TEXTS.menuOverrides?.[nodeId] && Object.keys(HELP_TEXTS.menuOverrides[nodeId]).length > 0) {
    refs.push("메뉴별 상세 권한 추가 설명");
  }
  if (SHORTCUTS[nodeId]?.length > 0) refs.push("단축 선택 키워드");
  return refs;
}

function checkPermExternalRefs(code) {
  const refs = [];
  if (HELP_TEXTS.permissions?.[code]) refs.push("기본 설명");
  const usedInShortcuts = Object.values(SHORTCUTS).some(scs => scs.some(sc => sc.perms?.includes(code)));
  if (usedInShortcuts) refs.push("단축 선택 키워드");
  return refs;
}

export default function EditMenuTreeTab({
  draftMenus, setDraftMenus, draftPerms, setDraftPerms, markDirty,
  currentBase, onBaseChange,
  currentMenuOverride, onMenuOverrideChange, currentMenuDesc, onMenuDescChange,
  currentMenuTitle, onMenuTitleChange, currentPermLabel, onPermLabelChange,
  glossaryTerms, onAddGlossaryTerm,
  changedMenuIds, changedPermCodes, historyMenuIds, historyPermCodes,
}) {
  const [subView, setSubView] = useState(
    () => sessionStorage.getItem("edit_mt_subview") || "menu",
  );
  const [selectedMenuId, setSelectedMenuId] = useState(
    () => sessionStorage.getItem("edit_mt_selectedMenu") || null,
  );
  const [selectedPermCode, setSelectedPermCode] = useState(
    () => sessionStorage.getItem("edit_mt_selectedPerm") || null,
  );
  const [openMap, setOpenMap] = useState({});
  const [draggedId, setDraggedId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [addingPerm, setAddingPerm] = useState(false);
  const [newPermCode, setNewPermCode] = useState("");
  const [newPermLabel, setNewPermLabel] = useState("");

  function selectSubView(v) {
    setSubView(v);
    sessionStorage.setItem("edit_mt_subview", v);
  }
  function selectMenu(id) {
    setSelectedMenuId(id);
    if (id) sessionStorage.setItem("edit_mt_selectedMenu", id);
    else sessionStorage.removeItem("edit_mt_selectedMenu");
  }
  function selectPerm(code) {
    setSelectedPermCode(code);
    if (code) sessionStorage.setItem("edit_mt_selectedPerm", code);
    else sessionStorage.removeItem("edit_mt_selectedPerm");
  }

  const menuTree = useMemo(() => buildTree(draftMenus), [draftMenus]);
  const draggedDescendantIds = useMemo(
    () => (draggedId ? new Set(getDescendantIds(draftMenus, draggedId)) : new Set()),
    [draggedId, draftMenus],
  );
  const allLeaves = useMemo(() => flatPermissions(draftPerms), [draftPerms]);
  const allCodes = useMemo(() => new Set(allLeaves.map(l => l.code)), [allLeaves]);

  const permItems = useMemo(
    () => allLeaves.map(l => ({
      value: l.code,
      label: currentPermLabel(l.code),
    })),
    [allLeaves, currentPermLabel],
  );

  const selectedMenu = selectedMenuId ? draftMenus.find(m => m.nodeId === selectedMenuId) : null;
  const selectedLeaf = selectedPermCode ? allLeaves.find(l => l.code === selectedPermCode) : null;
  const menusForSelectedPerm = useMemo(
    () => (selectedLeaf ? draftMenus.filter(m => m.scopeRefs?.includes(selectedLeaf.code)) : []),
    [draftMenus, selectedLeaf],
  );

  function hasChildren(nodeId) {
    return draftMenus.some(m => m.parentId === nodeId);
  }

  function updateMenu(nodeId, patch) {
    setDraftMenus(prev => prev.map(m => (m.nodeId === nodeId ? { ...m, ...patch } : m)));
    markDirty();
  }

  function addMenu(parentId) {
    const nodeId = genMenuId(new Set(draftMenus.map(m => m.nodeId)));
    const siblingTitles = draftMenus.filter(m => m.parentId === parentId).map(m => m.title);
    const title = genMenuTitle(siblingTitles);
    setDraftMenus(prev => [...prev, { nodeId, title, parentId, restricted: false, scopeRefs: [] }]);
    markDirty();
    if (parentId) setOpenMap(prev => ({ ...prev, [parentId]: true }));
    selectMenu(nodeId);
  }

  function deleteMenu(nodeId) {
    if (hasChildren(nodeId)) return;
    const refs = checkMenuExternalRefs(nodeId);
    const warn = refs.length
      ? `\n\n주의: ${refs.join(", ")}에 이 메뉴에 대한 데이터가 남아있습니다. 삭제해도 해당 데이터는 자동으로 정리되지 않으니 필요하면 각 탭에서 직접 정리해 주세요.`
      : "";
    if (!confirm(`이 메뉴를 삭제할까요?${warn}`)) return;
    setDraftMenus(prev => prev.filter(m => m.nodeId !== nodeId));
    markDirty();
    if (selectedMenuId === nodeId) selectMenu(null);
  }

  function moveMenu(nodeId, targetId, position) {
    if (nodeId === targetId) return;
    if (getDescendantIds(draftMenus, nodeId).includes(targetId)) return;

    setDraftMenus(prev => {
      const idx = prev.findIndex(m => m.nodeId === nodeId);
      const targetIdx = prev.findIndex(m => m.nodeId === targetId);
      if (idx === -1 || targetIdx === -1) return prev;

      const moving = prev[idx];
      const rest = [...prev.slice(0, idx), ...prev.slice(idx + 1)];

      let newParentId, insertAt;
      if (position === "inside") {
        newParentId = targetId;
        insertAt = rest.findIndex(m => m.nodeId === targetId) + 1;
        for (let i = 0; i < rest.length; i++) {
          if (rest[i].parentId === targetId && i + 1 > insertAt) insertAt = i + 1;
        }
      } else {
        const targetPos = rest.findIndex(m => m.nodeId === targetId);
        newParentId = rest[targetPos].parentId;
        insertAt = position === "before" ? targetPos : targetPos + 1;
      }

      const next = [...rest];
      next.splice(insertAt, 0, { ...moving, parentId: newParentId });
      return next;
    });
    markDirty();
  }

  function handleDragStartRow(nodeId) {
    setDraggedId(nodeId);
  }

  function handleDragOverRow(nodeId, position) {
    setDragOver(prev => (prev?.nodeId === nodeId && prev?.position === position ? prev : { nodeId, position }));
  }

  function handleDropRow() {
    if (draggedId && dragOver) moveMenu(draggedId, dragOver.nodeId, dragOver.position);
    setDraggedId(null);
    setDragOver(null);
  }

  function handleDragEndRow() {
    setDraggedId(null);
    setDragOver(null);
  }

  function confirmAddPerm() {
    const code = newPermCode.trim();
    const label = newPermLabel.trim();
    if (!code || !label) return;
    if (allCodes.has(code)) {
      alert("이미 사용 중인 권한 코드입니다.");
      return;
    }
    setDraftPerms(prev => [...prev, { code, label, nodes: [] }]);
    markDirty();
    selectPerm(code);
    setAddingPerm(false);
    setNewPermCode("");
    setNewPermLabel("");
  }

  function deletePermission(code) {
    const refs = checkPermExternalRefs(code);
    const warn = refs.length
      ? `\n\n주의: ${refs.join(", ")}에 이 권한에 대한 데이터가 남아있습니다. 삭제해도 해당 데이터는 자동으로 정리되지 않으니 필요하면 각 탭에서 직접 정리해 주세요.`
      : "";
    if (!confirm(`이 상세 권한을 삭제할까요?${warn}`)) return;
    setDraftPerms(prev => removeLeafByCode(prev, code));
    setDraftMenus(prev => prev.map(m => (
      m.scopeRefs?.includes(code) ? { ...m, scopeRefs: m.scopeRefs.filter(c => c !== code) } : m
    )));
    markDirty();
    if (selectedPermCode === code) selectPerm(null);
  }

  function updatePermLeaf(code, patch) {
    setDraftPerms(prev => updateLeafByCode(prev, code, patch));
    markDirty();
  }

  return (
    <div class="edit-body">
      <div class="edit-list-col">
        <div class="edit-list-top">
          <div class="edit-mt-subtabs">
            <button
              class={`edit-mt-subtab${subView === "menu" ? " is-active" : ""}`}
              onClick={() => selectSubView("menu")}
            >
              메뉴
            </button>
            <button
              class={`edit-mt-subtab${subView === "perm" ? " is-active" : ""}`}
              onClick={() => selectSubView("perm")}
            >
              상세 권한 코드
            </button>
          </div>
          {subView === "menu" ? (
            <button class="edit-sc-add-btn" onClick={() => addMenu(null)}>
              + 최상위 메뉴 추가
            </button>
          ) : (
            !addingPerm ? (
              <button class="edit-sc-add-btn" onClick={() => setAddingPerm(true)}>
                + 새 권한 추가
              </button>
            ) : (
              <div class="edit-mt-add-form">
                <input
                  class="edit-glossary-add-input"
                  placeholder="권한 코드 (예: p_new_perm)"
                  value={newPermCode}
                  onInput={e => setNewPermCode(e.target.value)}
                />
                <input
                  class="edit-glossary-add-input"
                  placeholder="권한 이름"
                  value={newPermLabel}
                  onInput={e => setNewPermLabel(e.target.value)}
                />
                <div class="edit-mt-add-actions">
                  <button
                    class="edit-glossary-add-btn"
                    onClick={confirmAddPerm}
                    disabled={!newPermCode.trim() || !newPermLabel.trim()}
                  >
                    추가
                  </button>
                  <button
                    class="edit-sc-delete-btn"
                    onClick={() => { setAddingPerm(false); setNewPermCode(""); setNewPermLabel(""); }}
                  >
                    취소
                  </button>
                </div>
              </div>
            )
          )}
        </div>

        <div class="edit-list-scroll">
          {subView === "menu" ? (
            menuTree.map(node => (
              <MenuTreeRow
                key={node.nodeId}
                node={node}
                depth={0}
                openMap={openMap}
                setOpenMap={setOpenMap}
                selectedMenuId={selectedMenuId}
                onSelect={selectMenu}
                onAddChild={addMenu}
                onDelete={deleteMenu}
                titleFor={currentMenuTitle}
                changedMenuIds={changedMenuIds}
                historyMenuIds={historyMenuIds}
                draggedId={draggedId}
                draggedDescendantIds={draggedDescendantIds}
                dragOver={dragOver}
                onDragStartRow={handleDragStartRow}
                onDragOverRow={handleDragOverRow}
                onDropRow={handleDropRow}
                onDragEndRow={handleDragEndRow}
              />
            ))
          ) : (
            allLeaves.map(l => (
              <div
                key={l.code}
                class={`edit-perm-row${selectedPermCode === l.code ? " is-active" : ""}`}
                onClick={() => selectPerm(l.code)}
              >
                <ChangeDot isLive={changedPermCodes.has(l.code)} isHistory={historyPermCodes.has(l.code)} />
                <span class="edit-perm-name">{stripGlossaryMarkers(currentPermLabel(l.code))}</span>
                <span class="edit-perm-code">{l.code.slice(0, 10)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div class="edit-form-col">
        {subView === "menu" ? (
          !selectedMenu ? (
            <div class="edit-form-empty">좌측에서 메뉴를 선택하면 편집할 수 있습니다.</div>
          ) : (
            <>
              <div class="edit-form-header">
                <div class="edit-form-heading">
                  <p class="edit-form-title">{currentMenuTitle(selectedMenu.nodeId)}</p>
                  <p class="edit-form-code">{selectedMenu.nodeId}</p>
                </div>
                <div class="edit-form-header-actions">
                  <label
                    class="edit-list-filter"
                    title="숨김 메뉴 (좌측 메뉴에 노출하지 않고, 다른 페이지의 링크로만 접근)"
                  >
                    <input
                      type="checkbox"
                      checked={!!selectedMenu.restricted}
                      onChange={e => updateMenu(selectedMenu.nodeId, { restricted: e.target.checked })}
                    />
                    숨김 메뉴
                  </label>
                  <button
                    class="edit-sc-delete-btn edit-form-delete-btn"
                    disabled={hasChildren(selectedMenu.nodeId)}
                    title={hasChildren(selectedMenu.nodeId) ? "하위 메뉴가 있으면 삭제할 수 없어요." : undefined}
                    onClick={() => deleteMenu(selectedMenu.nodeId)}
                  >
                    <TrashIcon />
                    삭제
                  </button>
                </div>
              </div>

              <div class="edit-field">
                <label class="edit-field-label">메뉴 이름</label>
                <input
                  class="edit-textarea"
                  style={{ minHeight: "auto" }}
                  value={currentMenuTitle(selectedMenu.nodeId)}
                  onInput={e => onMenuTitleChange(selectedMenu.nodeId, e.target.value)}
                />
              </div>

              <div class="edit-field">
                <label class="edit-field-label">메뉴 설명</label>
                <span class="edit-field-sub">해당 페이지가 어떤 기능을 하는지 짧게 설명해 주세요.</span>
                <MentionField
                  as="textarea"
                  class="edit-textarea"
                  placeholder="예) 그립 서비스를 이용하는 일반 사용자를 조회·관리하는 메뉴입니다."
                  value={currentMenuDesc(selectedMenu.nodeId)}
                  onInput={val => onMenuDescChange(selectedMenu.nodeId, val)}
                  terms={glossaryTerms}
                  onAddTerm={onAddGlossaryTerm}
                />
              </div>

              <div class="edit-field">
                <label class="edit-field-label">상위 메뉴</label>
                <select
                  class="edit-select"
                  value={selectedMenu.parentId ?? ""}
                  onChange={e => updateMenu(selectedMenu.nodeId, { parentId: e.target.value || null })}
                >
                  <option value="">(최상위)</option>
                  {draftMenus
                    .filter(m => m.nodeId !== selectedMenu.nodeId && !getDescendantIds(draftMenus, selectedMenu.nodeId).includes(m.nodeId))
                    .map(m => (
                      <option key={m.nodeId} value={m.nodeId}>{currentMenuTitle(m.nodeId)}</option>
                    ))}
                </select>
              </div>

              <div class="edit-field">
                <label class="edit-field-label">연결된 상세 권한</label>
                <span class="edit-field-sub">이 메뉴에서 선택 가능한 상세 권한이에요.</span>
                <MultiSelect
                  items={permItems}
                  selected={selectedMenu.scopeRefs ?? []}
                  onToggle={v => {
                    const cur = selectedMenu.scopeRefs ?? [];
                    const next = cur.includes(v) ? cur.filter(c => c !== v) : [...cur, v];
                    updateMenu(selectedMenu.nodeId, { scopeRefs: next });
                  }}
                  placeholder="상세 권한 선택"
                  searchable
                />
              </div>

            </>
          )
        ) : (
          !selectedLeaf ? (
            <div class="edit-form-empty">좌측에서 상세 권한을 선택하면 편집할 수 있습니다.</div>
          ) : (
            <>
              <div class="edit-form-header">
                <div class="edit-form-heading">
                  <p class="edit-form-title">{stripGlossaryMarkers(currentPermLabel(selectedLeaf.code))}</p>
                  <p class="edit-form-code">{selectedLeaf.code}</p>
                </div>
                <div class="edit-form-header-actions">
                  <label class="edit-list-filter">
                    <input
                      type="checkbox"
                      checked={!!selectedLeaf.approvalNeeded}
                      onChange={e =>
                        updatePermLeaf(selectedLeaf.code, { approvalNeeded: e.target.checked || undefined })
                      }
                    />
                    보안담당자 결재 필요
                  </label>
                  <button class="edit-sc-delete-btn edit-form-delete-btn" onClick={() => deletePermission(selectedLeaf.code)}>
                    <TrashIcon />
                    삭제
                  </button>
                </div>
              </div>

              <div class="edit-field">
                <label class="edit-field-label">권한 이름</label>
                <span class="edit-field-sub">
                  상세 권한 카드에 표시되는 이름이에요. <code>[[용어]]</code>로 태그하면
                  카드에서도 강조 표시되고, hover 시 뜨는 도움말 박스 하단에 용어 설명이 붙어요.
                  <code>@</code>를 입력하면 자동완성할 수도 있어요.
                </span>
                <MentionField
                  class="edit-textarea"
                  style={{ minHeight: "auto" }}
                  value={currentPermLabel(selectedLeaf.code)}
                  onInput={val => onPermLabelChange(selectedLeaf.code, val)}
                  terms={glossaryTerms}
                  onAddTerm={onAddGlossaryTerm}
                />
              </div>

              <div class="edit-field">
                <label class="edit-field-label">기본 설명</label>
                <span class="edit-field-sub">어느 메뉴에서 보든 공통으로 표시되는 설명이에요.</span>
                <MentionField
                  as="textarea"
                  class="edit-textarea"
                  placeholder="이 권한이 무엇을 허용하는지 한두 문장으로 설명해 주세요."
                  value={currentBase(selectedLeaf.code)}
                  onInput={val => onBaseChange(selectedLeaf.code, val)}
                  terms={glossaryTerms}
                  onAddTerm={onAddGlossaryTerm}
                />
              </div>

              {menusForSelectedPerm.length > 0 && (
                <>
                  <div class="edit-field-label" style={{ marginBottom: "6px" }}>
                    메뉴별 추가 설명
                  </div>
                  <span class="edit-field-sub" style={{ display: "block", marginBottom: "16px" }}>
                    해당 메뉴를 포커스했을 때 기본 설명 아래에 추가로 표시돼요.
                  </span>
                  {menusForSelectedPerm.map(menu => (
                    <div key={menu.nodeId} class="edit-menu-group">
                      <div class="edit-menu-group-label">
                        {currentMenuTitle(menu.nodeId)}
                        {menu.restricted && <span class="edit-menu-hidden-tag">hidden</span>}
                      </div>
                      <MentionField
                        as="textarea"
                        class="edit-textarea"
                        placeholder={`${currentMenuTitle(menu.nodeId)} 페이지에서만 보이는 추가 설명`}
                        value={currentMenuOverride(menu.nodeId, selectedLeaf.code)}
                        onInput={val => onMenuOverrideChange(menu.nodeId, selectedLeaf.code, val)}
                        terms={glossaryTerms}
                        onAddTerm={onAddGlossaryTerm}
                      />
                    </div>
                  ))}
                </>
              )}

            </>
          )
        )}
      </div>
    </div>
  );
}
