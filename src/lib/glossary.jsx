import { getActiveGlossary } from "./activeDataset.js";
import { highlight } from "./text.jsx";

// "[[용어]]" 마커를 파싱해 표시용 노드와 등장한 용어 목록을 함께 반환한다.
// 용어집에 없는 태그는 마커만 벗기고 일반 텍스트로 취급(강등)한다.
// query를 넘기면 마커를 벗긴 각 조각에 검색 하이라이트(highlight)도 함께 적용한다.
export function parseGlossaryText(text, query, opts) {
  if (!text) return { nodes: text, terms: [] };
  const edit = opts?.edit ?? false;
  const re = /\[\[(.+?)\]\]/g;
  const nodes = [];
  const terms = [];
  let lastEnd = 0;
  let m;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > lastEnd) {
      nodes.push(highlight(text.slice(lastEnd, m.index), query));
    }
    const term = m[1];
    if (getActiveGlossary()[term] != null) {
      const highlighted = highlight(term, query);
      const rendered = opts?.renderTerm ? (
        opts.renderTerm(
          term,
          <>
            {edit ? "@" : ""}
            {highlighted}
          </>,
          key++,
        )
      ) : (
        <span class={edit ? "glossary-term-edit" : "glossary-term"} key={key++}>
          {edit ? "@" : ""}
          {highlighted}
        </span>
      );
      nodes.push(rendered);
      if (!terms.includes(term)) terms.push(term);
    } else {
      nodes.push(highlight(term, query));
    }
    lastEnd = re.lastIndex;
  }
  if (lastEnd < text.length) nodes.push(highlight(text.slice(lastEnd), query));
  return { nodes, terms };
}

// "[[용어]]" 마커만 제거한 순수 텍스트 — 폭 측정, aria-label 등 마크업이 필요 없는 곳에 사용
export function stripGlossaryMarkers(text) {
  if (!text) return text;
  return text.replace(/\[\[(.+?)\]\]/g, "$1");
}

// 여러 설명 텍스트에 등장한 용어를 중복 없이 하나로 모은다.
export function mergeGlossaryTerms(...termLists) {
  const merged = [];
  for (const terms of termLists) {
    for (const term of terms) {
      if (!merged.includes(term)) merged.push(term);
    }
  }
  return merged;
}

// 용어 설명 안에 또 다른 [[용어]]가 있으면 그 용어도 재귀적으로 포함시킨다(순환 참조 방지)
export function expandGlossaryTerms(initialTerms) {
  const result = [];
  const seen = new Set();
  const queue = [...initialTerms];
  for (const term of initialTerms) seen.add(term);
  while (queue.length > 0) {
    const term = queue.shift();
    result.push(term);
    const { terms: nested } = parseGlossaryText(getActiveGlossary()[term]);
    for (const t of nested) {
      if (seen.has(t)) continue;
      seen.add(t);
      queue.push(t);
    }
  }
  return result;
}

function renderGlossaryRows(expanded) {
  return (
    <span class="glossary-notes">
      {expanded.map((term) => (
        <span class="glossary-note-row" key={term}>
          <span class="glossary-note-term">{term}</span>
          <span class="glossary-note-desc">
            {parseGlossaryText(getActiveGlossary()[term]).nodes}
          </span>
        </span>
      ))}
    </span>
  );
}

// 이미 열려있는 설명 툴팁 하단에 덧붙일 "관련 용어" 박스. 용어 설명 안에 중첩된 용어도 함께 펼쳐 표시한다.
export function GlossaryNotes({ terms, withDivider = true }) {
  const expanded = expandGlossaryTerms(terms ?? []);
  if (expanded.length === 0) return null;
  return (
    <>
      {withDivider && <hr class="glossary-notes-divider" />}
      {renderGlossaryRows(expanded)}
    </>
  );
}
