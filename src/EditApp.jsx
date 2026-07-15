import { useState, useMemo, useEffect, useRef } from "preact/hooks";
import MENUS_DATA from "./data/menus.json";
import { HELP_TEXTS } from "./data/helpTexts.js";
import { SHORTCUTS } from "./data/shortcuts.js";
import { GLOSSARY } from "./data/glossary.js";
import { CONTACT } from "./data/contact.js";
import {
  HiddenBadge,
  flatPermissions,
  buildAndFlattenMenus,
  MultiSelect,
} from "./lib/editShared.jsx";
import EditMenuTreeTab from "./EditMenuTreeTab.jsx";
import MentionField from "./components/MentionField.jsx";
import "./styles/edit.css";

// 현재 선택된 대상 메뉴(self + sc.menus + 이미 선택한 연쇄 키워드가 끌어오는 메뉴) 기준 키워드 옵션 목록
function getCascadeOptions(
  sc,
  selfSeq,
  extraMenuSeqs,
  getShortcuts,
  menuNameMap,
) {
  const options = [];
  const seen = new Set();
  const selfChipKey = `${selfSeq}:${sc.label}`;
  const candidateSeqs = new Set([selfSeq, ...sc.menus, ...extraMenuSeqs]);
  for (const seq of candidateSeqs) {
    const menuName = menuNameMap[seq] ?? String(seq);
    for (const tsc of getShortcuts(seq)) {
      if (!tsc.label.trim()) continue;
      const chipKey = `${seq}:${tsc.label}`;
      if (chipKey === selfChipKey) continue;
      if (seen.has(chipKey)) continue;
      seen.add(chipKey);
      const displayLabel = `${menuName} · ${tsc.label}`;
      options.push({ value: chipKey, label: displayLabel });
    }
  }
  return options;
}

export default function EditApp({ onExit }) {
  const [tab, setTab] = useState(() => {
    const saved = sessionStorage.getItem("edit_tab");
    return saved === "helptexts" || saved === "menudescs"
      ? "menutree"
      : saved || "menutree";
  });

  // menutree 저장 후 MENUS_DATA가 in-place로 바뀌면, 아래 useMemo들을 다시 계산시키기 위한 카운터
  const [menusVersion, setMenusVersion] = useState(0);

  // menudescs state (메뉴/권한 구조 탭의 메뉴 설명 편집에서 사용)
  const [dirtyMenuDescs, setDirtyMenuDescs] = useState({});

  // helpTexts state (메뉴/권한 구조 탭의 상세 권한 설명 편집에서 사용)
  const allLeaves = useMemo(
    () => flatPermissions(MENUS_DATA.permissions),
    [menusVersion],
  );
  const [dirty, setDirty] = useState({
    permissions: {},
    menuOverrides: {},
    permissionNames: {},
    menuTitles: {},
  });

  // contact tab state
  const [dirtyContact, setDirtyContact] = useState({});

  // glossary tab state
  const [dirtyGlossary, setDirtyGlossary] = useState({});
  const [selectedTerm, setSelectedTerm] = useState(
    () => sessionStorage.getItem("edit_selectedTerm") || null,
  );
  const [glossarySearch, setGlossarySearch] = useState("");
  const [newTermDraft, setNewTermDraft] = useState("");

  // shortcuts tab state
  const allMenusFlat = useMemo(
    () => buildAndFlattenMenus(MENUS_DATA.menus),
    [menusVersion],
  );
  const allMenuItems = useMemo(
    () =>
      allMenusFlat.map((m) => ({
        value: m.nodeId,
        label:
          dirty.menuTitles[m.nodeId] ??
          HELP_TEXTS.menuTitles?.[m.nodeId] ??
          m.title,
        depth: m.depth,
        hidden: m.restricted,
      })),
    [allMenusFlat, dirty.menuTitles],
  );
  const menuNameMap = useMemo(() => {
    const m = {};
    for (const menu of MENUS_DATA.menus)
      m[menu.nodeId] =
        dirty.menuTitles[menu.nodeId] ??
        HELP_TEXTS.menuTitles?.[menu.nodeId] ??
        menu.title;
    return m;
  }, [menusVersion, dirty.menuTitles]);
  const allPermItems = useMemo(
    () =>
      allLeaves.map((l) => ({
        value: l.code,
        label:
          dirty.permissionNames[l.code] ??
          HELP_TEXTS.permissionNames?.[l.code] ??
          l.label ??
          l.code,
      })),
    [allLeaves, dirty.permissionNames],
  );

  const [dirtyShortcuts, setDirtyShortcuts] = useState({});
  const [selectedMenuSeq, setSelectedMenuSeq] = useState(
    () => sessionStorage.getItem("edit_selectedMenuSeq") || null,
  );
  const [menuSearch, setMenuSearch] = useState("");

  const menuSeqToPermCodes = useMemo(() => {
    const m = {};
    for (const menu of MENUS_DATA.menus) m[menu.nodeId] = menu.scopeRefs ?? [];
    return m;
  }, [menusVersion]);

  // menutree tab state (draft 전체 배열 방식 — 트리 재배열을 diff로 표현하기 어려워 다른 탭과 다르게 관리)
  const [draftMenus, setDraftMenus] = useState(() =>
    MENUS_DATA.menus.map((m) => ({
      ...m,
      scopeRefs: [...(m.scopeRefs ?? [])],
    })),
  );
  const [draftPerms, setDraftPerms] = useState(() =>
    structuredClone(MENUS_DATA.permissions),
  );
  const [isDirtyMenuTree, setIsDirtyMenuTree] = useState(false);
  // 새로 추가되어 아직 menus.json에 없는 메뉴/권한의 이름 fallback 조회용(overlay 없을 때만 사용)
  const draftLeaves = useMemo(() => flatPermissions(draftPerms), [draftPerms]);

  // 좌측 리스트 변경 표시용 원본 스냅샷 — 편집 세션 시작 시점(또는 마지막 저장 시점) 기준
  const baselineMenusRef = useRef(structuredClone(MENUS_DATA.menus));
  const baselinePermsRef = useRef(structuredClone(MENUS_DATA.permissions));
  const baselineShortcutsRef = useRef(structuredClone(SHORTCUTS));
  const baselineGlossaryRef = useRef(structuredClone(GLOSSARY));
  const baselineContactRef = useRef(structuredClone(CONTACT));

  const changedMenuIds = useMemo(() => {
    const baseMap = new Map(baselineMenusRef.current.map((m) => [m.nodeId, m]));
    const changed = new Set();
    for (const m of draftMenus) {
      const base = baseMap.get(m.nodeId);
      if (!base || JSON.stringify(m) !== JSON.stringify(base)) changed.add(m.nodeId);
    }
    for (const [nodeId, v] of Object.entries(dirty.menuTitles)) {
      const baseline = HELP_TEXTS.menuTitles?.[nodeId] ?? baseMap.get(nodeId)?.title ?? "";
      if ((v ?? "") !== baseline) changed.add(nodeId);
    }
    for (const [nodeId, v] of Object.entries(dirtyMenuDescs)) {
      const baseline = HELP_TEXTS.menuDescriptions?.[nodeId] ?? baseMap.get(nodeId)?.label ?? "";
      if ((v ?? "") !== baseline) changed.add(nodeId);
    }
    return changed;
  }, [draftMenus, dirty.menuTitles, dirtyMenuDescs]);

  const changedPermCodes = useMemo(() => {
    const baseLeafMap = new Map(
      flatPermissions(baselinePermsRef.current).map((l) => [l.code, l]),
    );
    const changed = new Set();
    for (const l of draftLeaves) {
      const base = baseLeafMap.get(l.code);
      if (!base || JSON.stringify(l) !== JSON.stringify(base)) changed.add(l.code);
    }
    for (const [code, v] of Object.entries(dirty.permissionNames)) {
      const baseline = HELP_TEXTS.permissionNames?.[code] ?? baseLeafMap.get(code)?.label ?? code;
      if ((v ?? "") !== baseline) changed.add(code);
    }
    for (const [code, v] of Object.entries(dirty.permissions)) {
      const baseline = HELP_TEXTS.permissions?.[code] ?? baseLeafMap.get(code)?.helpText ?? "";
      if ((v ?? "") !== baseline) changed.add(code);
    }
    for (const [menuSeq, overrides] of Object.entries(dirty.menuOverrides)) {
      const baseMenu = baselineMenusRef.current.find((m) => m.nodeId === menuSeq);
      for (const [code, v] of Object.entries(overrides)) {
        const baseline =
          HELP_TEXTS.menuOverrides?.[menuSeq]?.[code] ?? baseMenu?.permissionHelpText?.[code] ?? "";
        if ((v ?? "") !== baseline) changed.add(code);
      }
    }
    return changed;
  }, [draftLeaves, dirty.permissionNames, dirty.permissions, dirty.menuOverrides]);

  // helpTexts.js에 이미 저장된(과거에 최소 1회 수정 후 저장된) 이력이 있는지 여부
  const historyMenuIds = useMemo(() => {
    const set = new Set();
    for (const nodeId of Object.keys(HELP_TEXTS.menuTitles ?? {})) set.add(nodeId);
    for (const nodeId of Object.keys(HELP_TEXTS.menuDescriptions ?? {})) set.add(nodeId);
    for (const nodeId of Object.keys(HELP_TEXTS.menuOverrides ?? {})) set.add(nodeId);
    return set;
  }, [dirty, dirtyMenuDescs]);

  const historyPermCodes = useMemo(() => {
    const set = new Set();
    for (const code of Object.keys(HELP_TEXTS.permissionNames ?? {})) set.add(code);
    for (const code of Object.keys(HELP_TEXTS.permissions ?? {})) set.add(code);
    for (const overrides of Object.values(HELP_TEXTS.menuOverrides ?? {})) {
      for (const code of Object.keys(overrides)) set.add(code);
    }
    return set;
  }, [dirty, dirtyMenuDescs]);

  function getPermItemsForShortcut(sc) {
    const seqs = new Set([
      ...(selectedMenuSeq ? [selectedMenuSeq] : []),
      ...sc.menus,
    ]);
    const codes = new Set();
    for (const seq of seqs) {
      for (const code of menuSeqToPermCodes[seq] ?? []) codes.add(code);
    }
    return allPermItems.filter((p) => codes.has(p.value));
  }

  // save state
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  useEffect(() => {
    sessionStorage.setItem("edit_tab", tab);
  }, [tab]);

  useEffect(() => {
    if (selectedMenuSeq != null)
      sessionStorage.setItem("edit_selectedMenuSeq", String(selectedMenuSeq));
    else sessionStorage.removeItem("edit_selectedMenuSeq");
  }, [selectedMenuSeq]);

  useEffect(() => {
    if (selectedTerm) sessionStorage.setItem("edit_selectedTerm", selectedTerm);
    else sessionStorage.removeItem("edit_selectedTerm");
  }, [selectedTerm]);

  const isDirtyHelpTexts =
    Object.keys(dirty.permissions).length > 0 ||
    Object.keys(dirty.menuOverrides).length > 0 ||
    Object.keys(dirty.permissionNames).length > 0 ||
    Object.keys(dirty.menuTitles).length > 0;
  const isDirtyMenuDescs = Object.keys(dirtyMenuDescs).length > 0;
  const isDirtyGlossary = Object.keys(dirtyGlossary).length > 0;

  // helpTexts helpers
  function currentBase(code) {
    if (code in dirty.permissions) return dirty.permissions[code] ?? "";
    return (
      HELP_TEXTS.permissions[code] ??
      allLeaves.find((l) => l.code === code)?.helpText ??
      ""
    );
  }

  function currentMenuOverride(menuSeq, code) {
    const menuDirty = dirty.menuOverrides[menuSeq];
    if (menuDirty && code in menuDirty) return menuDirty[code] ?? "";
    return (
      HELP_TEXTS.menuOverrides[String(menuSeq)]?.[code] ??
      MENUS_DATA.menus.find((m) => m.nodeId === menuSeq)?.permissionHelpText?.[
        code
      ] ??
      ""
    );
  }

  function onBaseChange(code, val) {
    setDirty((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, [code]: val },
    }));
  }

  function onMenuOverrideChange(menuSeq, code, val) {
    setDirty((prev) => ({
      ...prev,
      menuOverrides: {
        ...prev.menuOverrides,
        [menuSeq]: { ...(prev.menuOverrides[menuSeq] ?? {}), [code]: val },
      },
    }));
  }

  // 메뉴 이름 / 상세 권한 이름 override — menus.json은 재수집 시 통째로 갈아끼워지므로
  // 이 이름 편집만은 helpTexts.js(menuTitles/permissionNames)에 별도 보관해 재수집을 견딘다.
  function currentMenuTitle(nodeId) {
    if (nodeId in dirty.menuTitles) return dirty.menuTitles[nodeId] ?? "";
    if (HELP_TEXTS.menuTitles?.[nodeId] != null)
      return HELP_TEXTS.menuTitles[nodeId];
    return draftMenus.find((m) => m.nodeId === nodeId)?.title ?? "";
  }

  function onMenuTitleChange(nodeId, val) {
    setDirty((prev) => ({
      ...prev,
      menuTitles: { ...prev.menuTitles, [nodeId]: val },
    }));
  }

  function currentPermLabel(code) {
    if (code in dirty.permissionNames) return dirty.permissionNames[code] ?? "";
    if (HELP_TEXTS.permissionNames?.[code] != null)
      return HELP_TEXTS.permissionNames[code];
    return draftLeaves.find((l) => l.code === code)?.label ?? code;
  }

  function onPermLabelChange(code, val) {
    setDirty((prev) => ({
      ...prev,
      permissionNames: { ...prev.permissionNames, [code]: val },
    }));
  }

  // menuDescs helpers
  function currentMenuDesc(menuSeq) {
    const key = String(menuSeq);
    if (key in dirtyMenuDescs) return dirtyMenuDescs[key] ?? "";
    if (HELP_TEXTS.menuDescriptions && key in HELP_TEXTS.menuDescriptions)
      return HELP_TEXTS.menuDescriptions[key];
    return MENUS_DATA.menus.find((m) => m.nodeId === menuSeq)?.label ?? "";
  }

  function onMenuDescChange(menuSeq, val) {
    setDirtyMenuDescs((prev) => ({ ...prev, [String(menuSeq)]: val }));
  }

  // contact helpers
  function currentContactField(key) {
    if (key in dirtyContact) return dirtyContact[key] ?? "";
    return CONTACT[key] ?? "";
  }

  function onContactFieldChange(key, val) {
    setDirtyContact((prev) => ({ ...prev, [key]: val }));
  }

  // glossary helpers
  function currentGlossaryDesc(term) {
    if (term in dirtyGlossary) return dirtyGlossary[term];
    return GLOSSARY[term] ?? null;
  }

  function onGlossaryDescChange(term, val) {
    setDirtyGlossary((prev) => ({ ...prev, [term]: val }));
  }

  function addGlossaryTerm(termArg) {
    const term = (termArg ?? newTermDraft).trim();
    if (!term || currentGlossaryDesc(term) != null) return;
    setDirtyGlossary((prev) => ({ ...prev, [term]: "" }));
    if (termArg == null) {
      setSelectedTerm(term);
      setNewTermDraft("");
    }
  }

  function deleteGlossaryTerm(term) {
    setDirtyGlossary((prev) => ({ ...prev, [term]: null }));
    if (selectedTerm === term) setSelectedTerm(null);
  }

  // shortcuts helpers
  function currentShortcuts(menuSeq) {
    const key = String(menuSeq);
    if (key in dirtyShortcuts) return dirtyShortcuts[key];
    return SHORTCUTS[key] ?? [];
  }

  function updateShortcuts(menuSeq, shortcuts) {
    setDirtyShortcuts((prev) => ({ ...prev, [String(menuSeq)]: shortcuts }));
  }

  function addKeyword() {
    const current = currentShortcuts(selectedMenuSeq);
    updateShortcuts(selectedMenuSeq, [
      ...current,
      { label: "", desc: "", menus: [], perms: [] },
    ]);
  }

  function updateKeyword(idx, newSc) {
    const current = currentShortcuts(selectedMenuSeq);
    const oldSc = current[idx];
    const updatedCurrent = current.map((s, i) => (i === idx ? newSc : s));

    const newDirty = {
      ...dirtyShortcuts,
      [String(selectedMenuSeq)]: updatedCurrent,
    };

    // label 변경 시: cascade로 참조하는 모든 키워드(현재 메뉴 포함)의 값을 일괄 교체
    if (oldSc.label !== newSc.label && oldSc.label.trim()) {
      const oldKey = `${selectedMenuSeq}:${oldSc.label}`;
      const newKey = `${selectedMenuSeq}:${newSc.label}`;
      for (const menu of MENUS_DATA.menus) {
        const seq = String(menu.nodeId);
        const scs = seq in newDirty ? newDirty[seq] : (SHORTCUTS[seq] ?? []);
        if (!scs.some((s) => s.cascades?.includes(oldKey))) continue;
        newDirty[seq] = scs.map((s) => {
          if (!s.cascades?.includes(oldKey)) return s;
          return {
            ...s,
            cascades: s.cascades.map((ck) => (ck === oldKey ? newKey : ck)),
          };
        });
      }
    }

    setDirtyShortcuts(newDirty);
  }

  function deleteKeyword(idx) {
    const current = currentShortcuts(selectedMenuSeq);
    const sc = current[idx];
    const updatedCurrent = current.filter((_, i) => i !== idx);

    const newDirty = {
      ...dirtyShortcuts,
      [String(selectedMenuSeq)]: updatedCurrent,
    };

    // 삭제 시: 이 키워드를 cascade로 참조하는 모든 키워드(현재 메뉴 포함)의 참조를 제거
    if (sc.label.trim()) {
      const chipKey = `${selectedMenuSeq}:${sc.label}`;
      for (const menu of MENUS_DATA.menus) {
        const seq = String(menu.nodeId);
        const scs = seq in newDirty ? newDirty[seq] : (SHORTCUTS[seq] ?? []);
        if (!scs.some((s) => s.cascades?.includes(chipKey))) continue;
        newDirty[seq] = scs.map((s) => {
          if (!s.cascades?.includes(chipKey)) return s;
          return { ...s, cascades: s.cascades.filter((ck) => ck !== chipKey) };
        });
      }
    }

    setDirtyShortcuts(newDirty);
  }

  // save
  async function saveContact() {
    const fullContact = { ...CONTACT, ...dirtyContact };
    const res = await fetch("/__write-contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fullContact),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error);
    }
    for (const key of Object.keys(CONTACT)) delete CONTACT[key];
    for (const [key, val] of Object.entries(fullContact)) CONTACT[key] = val;
    baselineContactRef.current = structuredClone(CONTACT);
    setDirtyContact({});
  }

  async function saveGlossary() {
    const fullGlossary = { ...GLOSSARY };
    for (const [term, desc] of Object.entries(dirtyGlossary)) {
      if (desc == null) delete fullGlossary[term];
      else fullGlossary[term] = desc.trim();
    }
    const res = await fetch("/__write-glossary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fullGlossary),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error);
    }
    for (const key of Object.keys(GLOSSARY)) delete GLOSSARY[key];
    for (const [key, val] of Object.entries(fullGlossary)) GLOSSARY[key] = val;
    baselineGlossaryRef.current = structuredClone(GLOSSARY);
    setDirtyGlossary({});
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg(null);

    try {
      if (tab === "glossary") {
        await saveGlossary();
      } else if (tab === "contact") {
        await saveContact();
      } else if (tab === "menutree") {
        if (isDirtyMenuTree) {
          const payload = {
            collectedAt: MENUS_DATA.collectedAt,
            menus: draftMenus,
            permissions: draftPerms,
          };
          const res = await fetch("/__write-menus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const err = await res
              .json()
              .catch(() => ({ error: res.statusText }));
            throw new Error(err.error);
          }
          // 메모리 내 MENUS_DATA 동기화(참조 유지) — 다른 탭의 useMemo가 menusVersion 변경으로 재계산됨
          MENUS_DATA.menus.splice(0, MENUS_DATA.menus.length, ...draftMenus);
          MENUS_DATA.permissions.splice(
            0,
            MENUS_DATA.permissions.length,
            ...draftPerms,
          );
          baselineMenusRef.current = structuredClone(draftMenus);
          baselinePermsRef.current = structuredClone(draftPerms);
          setIsDirtyMenuTree(false);
          setMenusVersion((v) => v + 1);
        }

        if (isDirtyHelpTexts || isDirtyMenuDescs) {
          const fullPermissions = { ...HELP_TEXTS.permissions };
          for (const [k, v] of Object.entries(dirty.permissions)) {
            const trimmed = v.trim();
            if (trimmed === "") delete fullPermissions[k];
            else fullPermissions[k] = trimmed;
          }
          const fullMenuOverrides = {};
          for (const [seq, overrides] of Object.entries(
            HELP_TEXTS.menuOverrides,
          )) {
            fullMenuOverrides[seq] = { ...overrides };
          }
          for (const [menuSeq, overrides] of Object.entries(
            dirty.menuOverrides,
          )) {
            if (!fullMenuOverrides[menuSeq]) fullMenuOverrides[menuSeq] = {};
            for (const [code, v] of Object.entries(overrides)) {
              const trimmed = v.trim();
              if (trimmed === "") delete fullMenuOverrides[menuSeq][code];
              else fullMenuOverrides[menuSeq][code] = trimmed;
            }
            if (Object.keys(fullMenuOverrides[menuSeq]).length === 0) {
              delete fullMenuOverrides[menuSeq];
            }
          }
          const fullMenuDescriptions = {
            ...(HELP_TEXTS.menuDescriptions ?? {}),
          };
          for (const [seq, v] of Object.entries(dirtyMenuDescs)) {
            // 빈 문자열도 명시 저장 — 삭제하면 menus.js의 description으로 폴백됨
            fullMenuDescriptions[seq] = v.trim();
          }
          const fullMenuTitles = { ...(HELP_TEXTS.menuTitles ?? {}) };
          for (const [nodeId, v] of Object.entries(dirty.menuTitles)) {
            const trimmed = v.trim();
            if (trimmed === "") delete fullMenuTitles[nodeId];
            else fullMenuTitles[nodeId] = trimmed;
          }
          const fullPermissionNames = {
            ...(HELP_TEXTS.permissionNames ?? {}),
          };
          for (const [code, v] of Object.entries(dirty.permissionNames)) {
            const trimmed = v.trim();
            if (trimmed === "") delete fullPermissionNames[code];
            else fullPermissionNames[code] = trimmed;
          }

          const res = await fetch("/__write-help-texts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              permissions: fullPermissions,
              menuOverrides: fullMenuOverrides,
              menuDescriptions: fullMenuDescriptions,
              menuTitles: fullMenuTitles,
              permissionNames: fullPermissionNames,
            }),
          });
          if (!res.ok) {
            const err = await res
              .json()
              .catch(() => ({ error: res.statusText }));
            throw new Error(err.error);
          }
          HELP_TEXTS.permissions = fullPermissions;
          HELP_TEXTS.menuOverrides = fullMenuOverrides;
          HELP_TEXTS.menuDescriptions = fullMenuDescriptions;
          HELP_TEXTS.menuTitles = fullMenuTitles;
          HELP_TEXTS.permissionNames = fullPermissionNames;
          setDirty({
            permissions: {},
            menuOverrides: {},
            permissionNames: {},
            menuTitles: {},
          });
          setDirtyMenuDescs({});
        }

        if (isDirtyGlossary) await saveGlossary();
      } else if (tab === "shortcuts") {
        const fullShortcuts = { ...SHORTCUTS };
        for (const [seq, shortcuts] of Object.entries(dirtyShortcuts)) {
          const valid = shortcuts
            .filter((s) => s.label.trim())
            .map((s) => {
              const entry = {
                label: s.label.trim(),
                menus: s.menus,
                perms: s.perms,
              };
              if (s.desc && s.desc.trim()) entry.desc = s.desc.trim();
              if (s.cascades && s.cascades.length > 0)
                entry.cascades = s.cascades;
              return entry;
            });
          if (valid.length === 0) delete fullShortcuts[seq];
          else fullShortcuts[seq] = valid;
        }
        const res = await fetch("/__write-shortcuts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fullShortcuts),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error);
        }
        // 메모리 내 SHORTCUTS 동기화 (parseMenus가 최신 값을 사용하도록)
        for (const key of Object.keys(SHORTCUTS)) delete SHORTCUTS[key];
        for (const [seq, scs] of Object.entries(fullShortcuts))
          SHORTCUTS[seq] = scs;
        baselineShortcutsRef.current = structuredClone(SHORTCUTS);
        setDirtyShortcuts({});
      }
      setSaveMsg({ type: "ok", text: "저장되었습니다" });
    } catch (e) {
      setSaveMsg({ type: "err", text: String(e) });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  const normalize = (s) => s.replace(/\s+/g, "").toLowerCase();

  // shortcuts tab filtered menu list
  const filteredMenusFlat = useMemo(() => {
    if (!menuSearch.trim()) return allMenusFlat;
    const q = normalize(menuSearch.trim());
    return allMenusFlat.filter((m) => {
      if (normalize(m.title).includes(q)) return true;
      return currentShortcuts(m.nodeId).some((s) =>
        normalize(s.label).includes(q),
      );
    });
  }, [allMenusFlat, menuSearch, dirtyShortcuts]);

  // shortcuts tab: 세션 시작 시점 대비 실제로 키워드 목록이 바뀐 메뉴
  const changedShortcutMenuSeqs = useMemo(() => {
    const changed = new Set();
    for (const m of allMenusFlat) {
      const baseline = baselineShortcutsRef.current[String(m.nodeId)] ?? [];
      const current = currentShortcuts(m.nodeId);
      if (JSON.stringify(current) !== JSON.stringify(baseline))
        changed.add(m.nodeId);
    }
    return changed;
  }, [allMenusFlat, dirtyShortcuts]);

  const selectedMenuName = selectedMenuSeq
    ? (MENUS_DATA.menus.find((m) => m.nodeId === selectedMenuSeq)?.title ?? "")
    : "";

  // glossary tab filtered list
  const allGlossaryTerms = useMemo(() => {
    const set = new Set(Object.keys(GLOSSARY));
    for (const k of Object.keys(dirtyGlossary)) set.add(k);
    return [...set]
      .filter((term) => currentGlossaryDesc(term) != null)
      .sort((a, b) => a.localeCompare(b, "ko"));
  }, [dirtyGlossary]);

  const filteredGlossaryTerms = useMemo(() => {
    if (!glossarySearch.trim()) return allGlossaryTerms;
    const q = normalize(glossarySearch.trim());
    return allGlossaryTerms.filter(
      (term) =>
        normalize(term).includes(q) ||
        normalize(currentGlossaryDesc(term) ?? "").includes(q),
    );
  }, [allGlossaryTerms, glossarySearch, dirtyGlossary]);

  // glossary tab: 세션 시작 시점 대비 실제로 설명이 바뀐(추가/삭제 포함) 용어
  const changedGlossaryTerms = useMemo(() => {
    const changed = new Set();
    const terms = new Set([
      ...Object.keys(baselineGlossaryRef.current),
      ...allGlossaryTerms,
    ]);
    for (const term of terms) {
      const baseline = baselineGlossaryRef.current[term] ?? null;
      const current = currentGlossaryDesc(term) ?? null;
      if (current !== baseline) changed.add(term);
    }
    return changed;
  }, [allGlossaryTerms, dirtyGlossary]);

  // 위 isDirtyXxx는 "필드를 건드렸는지"만 보는 얕은 판단이라, 입력했다가 원래 값으로
  // 되돌려도 계속 true로 남는다. 좌측 리스트 점 표시·헤더 배지·저장 버튼 활성화는
  // 실제로 원본과 값이 달라진 항목(changed*)이 있는지로 판단한다.
  const hasRealMenuTreeChanges =
    isDirtyMenuTree || changedMenuIds.size > 0 || changedPermCodes.size > 0;
  const hasRealShortcutChanges = changedShortcutMenuSeqs.size > 0;
  const hasRealGlossaryChanges = changedGlossaryTerms.size > 0;
  const contactKeys = new Set([
    ...Object.keys(baselineContactRef.current),
    ...Object.keys(dirtyContact),
  ]);
  const hasRealContactChanges = [...contactKeys].some(
    (key) =>
      currentContactField(key) !== (baselineContactRef.current[key] ?? ""),
  );
  const hasRealChanges =
    hasRealMenuTreeChanges ||
    hasRealShortcutChanges ||
    hasRealGlossaryChanges ||
    hasRealContactChanges;

  const currentTabIsDirty =
    tab === "shortcuts"
      ? hasRealShortcutChanges
      : tab === "glossary"
        ? hasRealGlossaryChanges
        : tab === "contact"
          ? hasRealContactChanges
          : tab === "menutree"
            ? hasRealMenuTreeChanges || hasRealGlossaryChanges
            : false;

  useEffect(() => {
    function onBeforeUnload(e) {
      if (hasRealChanges) e.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasRealChanges]);

  return (
    <div class="edit-app">
      <header class="edit-header">
        <span class="edit-header-badge">DEV</span>
        <div class="edit-tabs">
          <button
            class={`edit-tab${tab === "menutree" ? " is-active" : ""}`}
            onClick={() => setTab("menutree")}
          >
            메뉴/권한 구조
            {hasRealMenuTreeChanges && <span class="edit-tab-dot" />}
          </button>
          <button
            class={`edit-tab${tab === "shortcuts" ? " is-active" : ""}`}
            onClick={() => setTab("shortcuts")}
          >
            키워드 묶음
            {hasRealShortcutChanges && <span class="edit-tab-dot" />}
          </button>
          <button
            class={`edit-tab${tab === "glossary" ? " is-active" : ""}`}
            onClick={() => setTab("glossary")}
          >
            용어 사전
            {hasRealGlossaryChanges && <span class="edit-tab-dot" />}
          </button>
          <button
            class={`edit-tab${tab === "contact" ? " is-active" : ""}`}
            onClick={() => setTab("contact")}
          >
            담당자 정보
            {hasRealContactChanges && <span class="edit-tab-dot" />}
          </button>
        </div>
        {saveMsg && (
          <span
            style={{
              fontSize: "12px",
              color: saveMsg.type === "ok" ? "var(--success)" : "var(--danger)",
            }}
          >
            {saveMsg.text}
          </span>
        )}
        {hasRealChanges && !saveMsg && (
          <span class="edit-header-dirty">미저장 변경 있음</span>
        )}
        <button
          class="edit-save-btn"
          onClick={handleSave}
          disabled={!currentTabIsDirty || saving}
        >
          {saving ? "저장 중…" : "저장"}
        </button>
        <button class="edit-exit-btn" onClick={onExit}>
          ← 돌아가기
        </button>
      </header>

      {tab === "shortcuts" ? (
        <div class="edit-body">
          <div class="edit-list-col">
            <div class="edit-list-top">
              <input
                class="edit-list-search"
                type="text"
                placeholder="메뉴 검색"
                value={menuSearch}
                onInput={(e) => setMenuSearch(e.target.value)}
              />
            </div>
            <div class="edit-list-scroll">
              {filteredMenusFlat.map((m) => {
                const shortcuts = currentShortcuts(m.nodeId);
                const count = shortcuts.filter((s) => s.label.trim()).length;
                return (
                  <div
                    key={m.nodeId}
                    class={`edit-perm-row${selectedMenuSeq === m.nodeId ? " is-active" : ""}`}
                    style={{ paddingLeft: `${14 + m.depth * 14}px` }}
                    onClick={() => setSelectedMenuSeq(m.nodeId)}
                  >
                    <span
                      class={`edit-perm-dot${count > 0 ? " has-text" : ""}${changedShortcutMenuSeqs.has(m.nodeId) ? " is-live" : ""}`}
                      title={
                        changedShortcutMenuSeqs.has(m.nodeId)
                          ? "현재 변경한 내용이 있어요"
                          : undefined
                      }
                    />
                    <span class="edit-perm-name">{m.title}</span>
                    {m.restricted && <HiddenBadge />}
                    {count > 0 && <span class="edit-sc-count">{count}개</span>}
                  </div>
                );
              })}
              {filteredMenusFlat.length === 0 && (
                <div
                  style={{
                    padding: "20px 14px",
                    fontSize: "13px",
                    color: "var(--text-faint)",
                  }}
                >
                  결과 없음
                </div>
              )}
            </div>
          </div>

          <div class="edit-form-col">
            {selectedMenuSeq == null ? (
              <div class="edit-form-empty">
                좌측에서 메뉴를 선택하면 키워드를 편집할 수 있습니다.
              </div>
            ) : (
              <>
                <p class="edit-form-title">{selectedMenuName}</p>
                <button class="edit-sc-add-btn" onClick={addKeyword}>
                  + 키워드 추가
                </button>

                {currentShortcuts(selectedMenuSeq).length === 0 && (
                  <div
                    style={{
                      color: "var(--text-faint)",
                      fontSize: "13px",
                      marginTop: "20px",
                    }}
                  >
                    아직 키워드가 없습니다. 위 버튼으로 추가해 주세요.
                  </div>
                )}

                <div class="edit-sc-list">
                  {currentShortcuts(selectedMenuSeq).map((sc, i) => {
                    // 연쇄 키워드에서 파생된 locked menus/perms 계산
                    const cascadeMenusSet = new Set();
                    const cascadePermsSet = new Set();
                    const visited = new Set([`${selectedMenuSeq}:${sc.label}`]);
                    const queue = [...(sc.cascades ?? [])];
                    while (queue.length > 0) {
                      const chipKey = queue.shift();
                      if (visited.has(chipKey)) continue;
                      visited.add(chipKey);
                      const colonIdx = chipKey.indexOf(":");
                      if (colonIdx === -1) continue;
                      const seq = chipKey.slice(0, colonIdx);
                      const label = chipKey.slice(colonIdx + 1);
                      const cascadeSc = currentShortcuts(seq).find(
                        (s) => s.label === label,
                      );
                      if (!cascadeSc) continue;
                      for (const m of cascadeSc.menus) cascadeMenusSet.add(m);
                      for (const p of cascadeSc.perms) cascadePermsSet.add(p);
                      for (const nextKey of cascadeSc.cascades ?? []) {
                        if (!visited.has(nextKey)) queue.push(nextKey);
                      }
                    }
                    const lockedMenus = [...cascadeMenusSet].filter(
                      (m) => !sc.menus.includes(m),
                    );
                    const lockedPerms = [...cascadePermsSet].filter(
                      (p) => !sc.perms.includes(p),
                    );

                    // 대상 권한 items: 기존 + locked perm 항목(disabled)
                    const ownPermItems = getPermItemsForShortcut(sc);
                    const ownPermValues = new Set(
                      ownPermItems.map((p) => p.value),
                    );
                    const lockedMenuPermCodes = new Set();
                    for (const seq of lockedMenus) {
                      for (const code of menuSeqToPermCodes[seq] ?? [])
                        lockedMenuPermCodes.add(code);
                    }
                    const mergedPermItems = [
                      ...ownPermItems.map((item) =>
                        lockedPerms.includes(item.value)
                          ? { ...item, disabled: true }
                          : item,
                      ),
                      ...allPermItems
                        .filter(
                          (item) =>
                            (lockedPerms.includes(item.value) ||
                              lockedMenuPermCodes.has(item.value)) &&
                            !ownPermValues.has(item.value),
                        )
                        .map((item) => ({
                          ...item,
                          disabled: lockedPerms.includes(item.value),
                        })),
                    ];

                    return (
                      <div key={i} class="edit-sc-card">
                        <div class="edit-sc-card-header">
                          <input
                            class="edit-sc-label-input"
                            placeholder="키워드 이름 (예: 조회)"
                            value={sc.label}
                            onInput={(e) =>
                              updateKeyword(i, { ...sc, label: e.target.value })
                            }
                          />
                          <button
                            class="edit-sc-delete-btn"
                            onClick={() => deleteKeyword(i)}
                          >
                            삭제
                          </button>
                        </div>
                        <div class="edit-sc-desc-row">
                          <textarea
                            class="edit-sc-desc-input"
                            placeholder="키워드 설명 (칩 hover 시 표시)"
                            value={sc.desc ?? ""}
                            onInput={(e) =>
                              updateKeyword(i, { ...sc, desc: e.target.value })
                            }
                          />
                        </div>
                        <div class="edit-sc-field">
                          <span class="edit-sc-field-label">대상 메뉴</span>
                          <MultiSelect
                            items={allMenuItems.map((item) =>
                              item.value === selectedMenuSeq ||
                              lockedMenus.includes(item.value)
                                ? { ...item, disabled: true }
                                : item,
                            )}
                            selected={[...sc.menus, ...lockedMenus]}
                            onToggle={(v) => {
                              const next = sc.menus.includes(v)
                                ? sc.menus.filter((x) => x !== v)
                                : [...sc.menus, v];
                              updateKeyword(i, { ...sc, menus: next });
                            }}
                            placeholder="메뉴 선택"
                            searchable
                          />
                        </div>
                        <div class="edit-sc-field">
                          <span class="edit-sc-field-label">대상 권한</span>
                          <MultiSelect
                            items={mergedPermItems}
                            selected={[...sc.perms, ...lockedPerms]}
                            onToggle={(v) => {
                              const next = sc.perms.includes(v)
                                ? sc.perms.filter((x) => x !== v)
                                : [...sc.perms, v];
                              updateKeyword(i, { ...sc, perms: next });
                            }}
                            placeholder="권한 선택"
                            searchable
                          />
                        </div>
                        {(() => {
                          const cascadeOptions = getCascadeOptions(
                            sc,
                            selectedMenuSeq,
                            cascadeMenusSet,
                            currentShortcuts,
                            menuNameMap,
                          );
                          if (!cascadeOptions.length) return null;
                          const selectedCascades = sc.cascades ?? [];
                          return (
                            <div class="edit-sc-field edit-sc-cascade-field">
                              <span class="edit-sc-field-label">
                                연쇄 키워드
                              </span>
                              <span class="edit-sc-cascade-hint">
                                이 키워드 활성 시 함께 켜질 대상 메뉴의 키워드를
                                선택하세요.
                              </span>
                              <MultiSelect
                                items={cascadeOptions}
                                selected={selectedCascades}
                                onToggle={(v) => {
                                  const next = selectedCascades.includes(v)
                                    ? selectedCascades.filter((x) => x !== v)
                                    : [...selectedCascades, v];
                                  updateKeyword(i, { ...sc, cascades: next });
                                }}
                                placeholder="연쇄할 키워드 선택"
                              />
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      ) : tab === "glossary" ? (
        <div class="edit-body">
          <div class="edit-list-col">
            <div class="edit-list-top">
              <input
                class="edit-list-search"
                type="text"
                placeholder="용어 검색"
                value={glossarySearch}
                onInput={(e) => setGlossarySearch(e.target.value)}
              />
              <div class="edit-glossary-add-row">
                <input
                  class="edit-glossary-add-input"
                  type="text"
                  placeholder="새 용어 (예: 마스킹 해제)"
                  value={newTermDraft}
                  onInput={(e) => setNewTermDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.isComposing &&
                      e.keyCode !== 229
                    ) {
                      e.preventDefault();
                      addGlossaryTerm();
                    }
                  }}
                />
                <button
                  class="edit-glossary-add-btn"
                  onClick={() => addGlossaryTerm()}
                  disabled={
                    !newTermDraft.trim() ||
                    currentGlossaryDesc(newTermDraft.trim()) != null
                  }
                >
                  + 추가
                </button>
              </div>
            </div>
            <div class="edit-list-scroll">
              {filteredGlossaryTerms.map((term) => {
                const hasText = !!currentGlossaryDesc(term);
                return (
                  <div
                    key={term}
                    class={`edit-perm-row${selectedTerm === term ? " is-active" : ""}`}
                    onClick={() => setSelectedTerm(term)}
                  >
                    <span
                      class={`edit-perm-dot${hasText ? " has-text" : ""}${changedGlossaryTerms.has(term) ? " is-live" : ""}`}
                      title={
                        changedGlossaryTerms.has(term)
                          ? "현재 변경한 내용이 있어요"
                          : undefined
                      }
                    />
                    <span class="edit-perm-name">{term}</span>
                  </div>
                );
              })}
              {filteredGlossaryTerms.length === 0 && (
                <div
                  style={{
                    padding: "20px 14px",
                    fontSize: "13px",
                    color: "var(--text-faint)",
                  }}
                >
                  결과 없음
                </div>
              )}
            </div>
          </div>

          <div class="edit-form-col">
            {!selectedTerm || currentGlossaryDesc(selectedTerm) == null ? (
              <div class="edit-form-empty">
                좌측에서 용어를 선택하거나, 새 용어를 추가해서 설명을 편집할 수
                있습니다.
                <br />
                설명 텍스트 안에서 <code>@{selectedTerm || "용어"}</code>로
                태그하면 해당 툴팁 하단에 이 설명이 자동으로 표시돼요.
              </div>
            ) : (
              <>
                <p class="edit-form-title">{selectedTerm}</p>
                <p class="edit-form-code">
                  본문에서 <code>@{selectedTerm}</code> 로 태그하면 이 설명이
                  표시돼요.
                </p>

                <div class="edit-field">
                  <label class="edit-field-label">용어 설명</label>
                  <span class="edit-field-sub">
                    메뉴/권한 설명 툴팁 하단에 그대로 표시되는 문장이에요.
                  </span>
                  <MentionField
                    as="textarea"
                    class="edit-textarea"
                    placeholder="이 용어가 무엇을 의미하는지 한두 문장으로 설명해 주세요."
                    value={currentGlossaryDesc(selectedTerm) ?? ""}
                    onInput={(val) => onGlossaryDescChange(selectedTerm, val)}
                    terms={allGlossaryTerms}
                    onAddTerm={addGlossaryTerm}
                  />
                </div>

                <button
                  class="edit-sc-delete-btn"
                  style={{ marginTop: "12px" }}
                  onClick={() => deleteGlossaryTerm(selectedTerm)}
                >
                  이 용어 삭제
                </button>
              </>
            )}
          </div>
        </div>
      ) : tab === "contact" ? (
        <div class="edit-body">
          <div class="edit-form-col" style={{ flex: 1 }}>
            <p class="edit-form-title">담당자 정보</p>
            <p class="edit-form-code">
              화면 하단 "문의사항" 모달에 표시되는 안내 문구와 바로가기 링크예요.
            </p>

            <div class="edit-field">
              <label class="edit-field-label">안내 문구</label>
              <span class="edit-field-sub">
                모달에 "문의사항" 제목과 함께 표시되는 한 줄 설명이에요.
              </span>
              <input
                class="edit-textarea"
                style={{ minHeight: "auto" }}
                type="text"
                placeholder="예: 담당자에게 문의해주세요"
                value={currentContactField("subtitle")}
                onInput={(e) =>
                  onContactFieldChange("subtitle", e.target.value)
                }
              />
            </div>

            <div class="edit-field">
              <label class="edit-field-label">바로가기 링크</label>
              <span class="edit-field-sub">
                "바로가기" 버튼 클릭 시 이동할 URL이에요 (Slack DM, 메일 링크 등).
              </span>
              <input
                class="edit-textarea"
                style={{ minHeight: "auto" }}
                type="text"
                placeholder="https://..."
                value={currentContactField("href")}
                onInput={(e) => onContactFieldChange("href", e.target.value)}
              />
            </div>
          </div>
        </div>
      ) : tab === "menutree" ? (
        <EditMenuTreeTab
          draftMenus={draftMenus}
          setDraftMenus={setDraftMenus}
          draftPerms={draftPerms}
          setDraftPerms={setDraftPerms}
          markDirty={() => setIsDirtyMenuTree(true)}
          currentBase={currentBase}
          onBaseChange={onBaseChange}
          currentMenuOverride={currentMenuOverride}
          onMenuOverrideChange={onMenuOverrideChange}
          currentMenuDesc={currentMenuDesc}
          onMenuDescChange={onMenuDescChange}
          currentMenuTitle={currentMenuTitle}
          onMenuTitleChange={onMenuTitleChange}
          currentPermLabel={currentPermLabel}
          onPermLabelChange={onPermLabelChange}
          glossaryTerms={allGlossaryTerms}
          onAddGlossaryTerm={addGlossaryTerm}
          changedMenuIds={changedMenuIds}
          changedPermCodes={changedPermCodes}
          historyMenuIds={historyMenuIds}
          historyPermCodes={historyPermCodes}
        />
      ) : null}
    </div>
  );
}
