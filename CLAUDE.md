# 권한 선택 페이지 — CLAUDE.md

## 프로젝트 개요

어드민 권한 신청 시 사용자가 직접 텍스트로 권한을 입력하다가 발생하는 오입력을 방지하는 단일 페이지 앱.
사용자가 필요한 권한 메뉴와 상세 권한을 선택하면 클립보드 복사용 텍스트를 생성해준다.

빌드 결과물: 단일 HTML 파일 (`dist/index.html`). 더블클릭으로 바로 열 수 있어야 한다.

---

## 브랜딩

- 로고: `https://gripshow.notion.site/image/...` (명세 참조)
- 주색: `#FF3C78` → CSS 변수 `--brand`
- 서체: `'Poppins', 'Pretendard', sans-serif`
  - Poppins: Google Fonts (라틴 전용)
  - Pretendard: jsdelivr CDN (한글 폴백)

---

## 기술 스택

- Vite + Preact + JSX
- 상태: `useReducer` (전역), `useState` (로컬 UI)
- 빌드: `vite-plugin-singlefile`
- 스타일: 순수 CSS + CSS 변수, 외부 UI 라이브러리 없음
- `class=` 사용 (`className=` 아님 — Preact)
- import는 `preact/hooks`에서

---

## 입력 데이터 구조

데이터는 외부 파일/API에서 불러오지 않고 소스에 직접 입력한다 (`src/data/menus.json`, `jsonLoader.js`가 정규화). 정확한 원본/정규화 구조는 소스 참고.

**코드만 봐서는 알기 어려운 규칙:**

- `restricted: true` = 좌측 메뉴에 없고, 다른 페이지에서 링크로만 접근 가능한 페이지 (숨김 처리일 뿐 접근 자체를 막는 게 아님)
- `permissions` 트리에 어떤 메뉴도 참조하지 않는 leaf(orphan)가 있을 수 있음. UI에는 노출되지 않음
- 서로 다른 메뉴가 같은 `permissionCode`를 참조하면 동일 권한으로 취급 (상세 권한 패널의 "전체" 보기에서는 중복 제거)

---

## 내부 상태 (state.js)

`initialState`/`reducer` 정의 및 필드는 소스 참고. action type: `SET_MENUS`, `TOGGLE_MENU`, `TOGGLE_PERM`, `SET_FOCUSED_MENU`, `SET_PERM_FILTER`, `SET_MENU_SEARCH`, `SET_PERM_SEARCH`, `ACTIVATE_SHORTCUT`, `DEACTIVATE_SHORTCUT`, `RESET`.

- `SET_PERM_FILTER`: 같은 `permCode`를 다시 dispatch하면 토글 해제(`null`)
- `ACTIVATE_SHORTCUT` / `DEACTIVATE_SHORTCUT`: `shortcut.menus`/`shortcut.perms`를 일괄 추가/제거. `DEACTIVATE_SHORTCUT`이 현재 `focusedMenuSeq`를 포함하면 포커스도 해제

---

## 화면 레이아웃 (3단 구성)

```
┌─────────────────────────────────────────────────────────┐
│  헤더 (로고 + 타이틀)                                       │
├──────────────┬──────────────────────┬───────────────────┤
│  권한 메뉴    │    상세 권한          │   선택 현황        │
│  (트리)      │    (목록)            │   (카트 패널)      │
│  280px       │    flex-1            │   300px           │
│              │                      │                   │
│  [검색창]    │  [검색창]            │  선택된 메뉴 목록  │
│              │                      │  선택된 상세권한   │
│  트리 노드   │  체크박스 목록       │                   │
│  클릭 시     │  (focusedMenu 기준   │  [클립보드 복사]   │
│  오른쪽 필터 │   또는 전체)         │  버튼             │
└──────────────┴──────────────────────┴───────────────────┘
```

**레이아웃 전환:** 헤더의 레이아웃 토글 버튼(`App.jsx`, `layout-toggle-btn`)으로 권한 메뉴/상세 권한을 가로 배치(기본) ↔ 세로 배치(메뉴 위, 상세 권한 아래)로 전환 가능. 버튼은 텍스트 라벨 대신 3단 레이아웃 전체(메뉴/상세권한/선택 현황)를 그대로 그린 미니어처 아이콘(`components/icons.jsx`)으로 전환될 상태를 표시한다: `LayoutSideBySideIcon`은 메뉴·상세권한 두 사각형이 나란히 + 우측에 옅게 채운 고정 선택 현황 칸, `LayoutStackedIcon`은 메뉴·상세권한 두 사각형이 위아래로 쌓이고 우측에 동일한 선택 현황 칸(항상 고정 위치임을 시각적으로 표현). 버튼 안에는 아이콘 왼쪽에 고정 문구 "레이아웃 변경"(`.layout-toggle-label`)을 붙여 버튼의 기능 자체를 먼저 알리고, 아이콘은 클릭 시 어떤 모양으로 바뀔지를 보여준다. `title`/`aria-label`로 "나란히 보기"/"위아래로 보기" 텍스트를 추가 보조 제공 — "가로/세로 보기"라는 상태 라벨은 화면 회전(가로모드/세로모드)과 혼동될 수 있어 상태 텍스트 대신 아이콘 우선으로 변경. 선택 현황 패널은 두 모드 모두 우측 고정. 두 컬럼은 항상 `.col-menu-perm-group` 래퍼로 감싸 CSS만 전환하고 `MenuTree`/`PermissionList`는 리마운트되지 않음(펼침·스크롤·검색 상태 유지). 세로 모드에서는 드래그 핸들(`.layout-resize-handle`)로 메뉴/상세권한 높이 비율(20~80%) 조절 가능. 모드와 비율은 `localStorage`(`layout_stacked`, `layout_split_pct`)에 저장되어 새로고침 후에도 유지.

**반응형 지원 범위:** 데스크톱뿐 아니라 태블릿·모바일 폭까지 대응한다.
- **데스크톱 (≥1040px)**: 위 3단 고정폭 레이아웃 그대로.
- **태블릿 (768~1039px)**: 3단 컬럼을 유지하되 폭만 `%`/`flex`로 유동화(`layout.css`). 세로 보기 토글·리사이즈 핸들 그대로 사용 가능.
- **모바일 (<768px)**: 메뉴/상세 권한/선택 현황을 동시에 표시할 수 없어 상단 탭 전환 방식으로 전환(`App.jsx`의 `isMobile`/`activePanel` state, `.mobile-panel-tabs`). 세로 보기 토글과 리사이즈 핸들은 숨김. 메뉴에서 최하위 항목을 선택하면 상세 권한 탭으로 자동 전환됨. hover 전용 툴팁(`HelpTooltip`, 트리 아이콘 툴팁, 상세 권한 카드 도움말)은 `src/lib/useTooltip.js`를 통해 터치 기기에서 탭으로 열고 바깥 탭으로 닫히도록 처리.

---

## 핵심 기능 명세

### 1. 메뉴 트리 (MenuTree.jsx)

- 계층 구조 렌더링, 들여쓰기로 depth 표현
- **중간 노드**: 체크박스 없음, 클릭 시 접기/펼치기만
- **최하위 노드**: 체크박스 있음, 클릭 시 선택 토글
- `hidden: true` 노드: eye-off SVG 아이콘 표시 (메뉴명 바로 오른쪽), hover 시 "관리자 센터 좌측 메뉴에 나오지 않는 페이지에요" 툴팁 (`position: fixed`, `getBoundingClientRect` 기반)
- 권한 카운터 배지: 최하위 노드 우측에 `선택수/전체수` 표시 (선택 시 brand 색)
- 선택된 노드: `--brand` 색으로 강조
- 검색 시: 트리 자체는 필터링하지 않고 그대로 둠. 검색창 아래에 매칭된 메뉴(상위/하위 구분 없이, 전체 경로 breadcrumb과 함께)를 별도 목록으로 표시
  - 단, 매칭된 노드가 매칭된 자손 노드를 가지고 있으면(조상-자손이 같은 검색어에 동시 매칭) 조상 노드는 목록에서 생략하고 가장 하위(구체적인) 매칭만 표시. breadcrumb에 조상 이름이 이미 포함되므로 정보 손실 없음
  - 목록 항목 클릭 시: 조상 전체 펼침 + 검색어 초기화(목록 닫힘) + 해당 메뉴로 `scrollIntoView` 스크롤 후 잠깐 강조(깜빡임)만 수행. 선택/포커스(`SET_FOCUSED_MENU`)는 dispatch하지 않음 — 단순 위치 확인용
- 노드 클릭(최하위) → `SET_FOCUSED_MENU` dispatch → 상세 권한 패널 필터링
- 헤더 제목 옆 `HelpTooltip` 컴포넌트로 도움말 표시

### 2. 상세 권한 목록 (PermissionList.jsx)

- `focusedMenuSeq`가 있으면 해당 메뉴의 `permissions`만 표시
- `focusedMenuSeq`가 null이면 **전체 메뉴의** permissions 표시 (`permissionCode` 기준 중복 제거)
- 각 항목: 2열 카드 그리드(`perm-grid`) 레이아웃
  - 기본: 연한 회색 배경 + 테두리
  - 선택 시: brand 색 배경·테두리·텍스트
  - 체크박스 + label
- `requiresApproval: true` 항목: "결재" 뱃지 표시
- 검색: label 기준 필터링
- 선택 시: `TOGGLE_PERM` dispatch
- 헤더 제목 옆 `HelpTooltip` 컴포넌트로 도움말 표시

### 3. 선택 현황 패널 (CartPanel.jsx)

트리 구조(`├`, `└`, `│`)로 선택된 메뉴와 권한을 표시.

**헤더:**

- 제목 "선택 현황" 오른쪽에 선택 카운트 pill 표시: `N개 메뉴 · N개 권한` (brand 색, 선택 항목 없으면 숨김)
- 권한 수는 `selectedPermCodes.size` (중복 제거된 고유 수)

**메뉴 항목 (`type: 'menu'`):**

- ✓ 마크 + 메뉴명
- 메뉴명 오른쪽에 소형 brand 색 텍스트로 `N개 중 N개` (해당 메뉴의 상세권한 선택 현황). 상세권한이 없는 메뉴는 미표시. 0개 선택 시 흐린 색
- 우측 ✕ 버튼으로 개별 제거 (`TOGGLE_MENU`)

**상세 권한 항목 (`type: 'perm'`):**

- 권한명 + `requiresApproval` 시 자물쇠 아이콘
- 우측 ✕ 버튼 (`TOGGLE_PERM`)

**뷰 모드 토글 (`viewMode`: `'tree' | 'split'`):**

- "트리": 메뉴 트리 아래 각 메뉴 소속 상세 권한을 바로 들여쓰기 표시 (위 기본 동작). 메뉴 행의 `N/N개` 뱃지 클릭 시 해당 메뉴의 권한 목록 접기/펼치기
- "분리": 메뉴 트리(권한 없이)와 상세 권한 목록(permissionCode 기준 중복 제거)을 별도 섹션으로 분리 표시

**연결된 메뉴 없이 선택된 상세 권한 (orphan perms):**

- `computeOrphanPerms`(`tree.js`)로 계산 — 선택된 메뉴 어디에도 속하지 않은 선택된 permissionCode
- 트리 하단에 "권한 메뉴 선택하지 않음" 구분선과 함께 별도 표시, 개별 ✕ 제거 가능

**하단 고정:** 클립보드 복사 버튼(굵은 글자, `flex: 1`) + 초기화 버튼(소형 ghost)
- 초기화 버튼 클릭 시 커스텀 확인 모달 표시 → 확인 시 `RESET` dispatch

### 4. 유효성 검사 (validate.js)

`validate(state)` → `{ errors, warnings, missingMenus, approvalPerms, needsApproval, orphanPerms }`

- `missingMenus`: 상세 권한 미선택 메뉴의 전체 경로 문자열 배열 (`getAncestorPath`로 생성, "A > B > C" 형식)
- `approvalPerms`: 결재 필요한 선택된 권한 객체 배열 (permissionCode 기준 중복 제거, 선택된 메뉴 소속 + orphan 모두 포함)
- `orphanPerms`: `computeOrphanPerms`로 계산한, 선택된 메뉴 어디에도 속하지 않은 선택된 상세 권한 배열

| 조건                                     | 종류    | 메시지                                               |
| ---------------------------------------- | ------- | ---------------------------------------------------- |
| 메뉴·권한 모두 미선택                    | error   | "권한 메뉴 또는 상세 권한을 선택해주세요."           |
| permissions 있는 메뉴에 상세 권한 미선택 | warning | "상세 권한을 선택하지 않은 메뉴가 있습니다."         |
| 연결된 메뉴 없이 선택된 상세 권한 존재   | warning | "연결된 메뉴 없이 선택된 상세 권한이 있습니다."      |
| `requiresApproval` 권한 포함             | warning | "보안담당자 결재가 필요한 권한이 포함되어 있습니다." |

### 5. 복사 모달 (CopyModal.jsx)

- warnings/errors가 있을 때 표시
- errors가 있으면 "알겠습니다" 버튼 없이 닫기만
- warnings만 있으면 내용 보여주고 "알겠습니다, 복사" → 복사 진행

**상세 권한 미선택 notice (`modal-notice--warn`):**

- 점선 원 아이콘 + 제목 "상세권한이 비어있는 메뉴가 있어요"
- 설명 텍스트
- 접기/펼치기 토글 (`ExpandSection`): "N개 메뉴 자세히 보기" → 전체 경로 목록

**연결된 메뉴 없는 상세 권한 notice (`modal-notice--warn`):**

- 점선 원 아이콘 + 제목 "메뉴 없이 선택된 상세권한이 있어요"
- 설명 텍스트
- 접기/펼치기 토글: "N개 권한 자세히 보기" → `orphanPerms` 권한명 목록

**결재 필요 notice (`modal-notice--danger`):**

- 자물쇠 아이콘 + 제목 "정보보안 담당자의 결재가 필요해요"
- 설명 텍스트
- 접기/펼치기 토글: "N개 권한 자세히 보기" → 권한명 목록

### 6. 클립보드 포맷 (clipboard.js)

트리 형태가 아니라 "메뉴명" / "상세 권한" 두 섹션으로 나눈 평문. `generateClipboardText`는 텍스트, `generateClipboardHtml`은 서식 있는 HTML(붙여넣기용)을 생성한다.

```
메뉴명
이용자 관리 > 이용자
이용자 관리 > 이용자 상세보기
상품/판매 관리 > 상품 관리 > 최상품 관리

상세 권한
이용자 외 1개 > 이용자 조회
이용자 상세보기 > 이용자 마스킹 해제
권한 메뉴 없음 > 상품 조회
```

**렌더링 규칙:**

- 섹션 1 "메뉴명": 선택된 최하위(leaf) 메뉴만, DFS 순서대로 `getAncestorPath`로 만든 전체 경로("A > B > C")를 한 줄씩 나열
- 섹션 2 "상세 권한": 선택된 permissionCode를 DFS 순서 + permissionCode 기준 중복 제거로 나열. `메뉴명 > 권한설명` 형식
  - 같은 권한을 여러 선택 메뉴가 공유하면 첫 메뉴명 뒤에 `외 N개`를 붙임 (예: "이용자 외 1개 > 이용자 조회")
  - `computeOrphanPerms`로 계산한 orphan 권한(선택된 메뉴 어디에도 속하지 않은 선택된 권한)은 `권한 메뉴 없음 > 권한설명`으로 표시
- 두 섹션 모두 항목이 없으면 해당 섹션(헤더 포함)을 생략
- restricted, requiresApproval 등 부가 정보는 표시하지 않음
- HTML 버전은 각 줄의 `title > ` 부분을 10pt 굵게, 권한 설명 부분을 9pt 이탤릭으로 렌더링

**generateClipboardText(state) / generateClipboardHtml(state) 공통 로직 (`buildLines`):**

1. `buildTree(menus)`로 트리 구성 후 DFS로 선택된 leaf만 순서대로 수집
2. 수집된 leaf들의 경로로 "메뉴명" 섹션 생성
3. leaf들의 선택된 permissions를 permissionCode 기준으로 그룹핑(첫 등장 메뉴 + 개수)해 "상세 권한" 섹션 생성
4. `computeOrphanPerms`로 orphan 권한을 "상세 권한" 섹션 끝에 추가

---

## tree.js 핵심 유틸

`isLeaf`, `getAncestorPath`, `buildTree`, `computeOrphanPerms` 제공 — 시그니처와 동작은 소스 참고.

**단축 선택 (shortcuts):**

`src/data/shortcuts.js`의 `SHORTCUTS`(nodeId → 라벨별 `{ label, menus, perms, cascades }`)를 `lib/shortcuts.js`가 소비해, 메뉴/권한 칩 클릭 한 번으로 여러 메뉴·권한을 한꺼번에 선택/해제(`ACTIVATE_SHORTCUT`/`DEACTIVATE_SHORTCUT`)할 수 있게 한다. `cascades`(`"nodeId:label"` 형식)로 다른 메뉴의 shortcut을 연쇄 포함할 수 있다(`getEffectiveTargets`가 BFS로 전개). `getActiveShortcutLabels`는 특정 메뉴에서 현재 선택 상태와 완전히 일치하는 shortcut 라벨들을 판별해 칩 활성 표시에 사용한다.

---

## CSS 변수

`base.css`의 `:root`에 정의. 주색은 `--brand`(#FF3C78, 브랜딩 참고), 그 외 색상/radius 변수는 소스 참고 — 신규 색상 추가 시 여기 문서를 따로 갱신하지 말고 `base.css`를 단일 소스로 유지할 것.

---

## 코드 규칙

- `class=` (not `className=`) — Preact 방식
- import는 `preact/hooks`에서: `import { useState, useReducer, useCallback } from 'preact/hooks'`
- 상태 변경은 `dispatch({ type: ... })` 우선
- 인라인 스타일 지양, CSS 클래스 우선
- 주석은 한국어, 필요한 곳만
- 디바운스 150ms (검색 인풋)

---

## 빌드

```bash
npm run dev    # 개발 서버
npm run build  # dist/index.html 단일 파일 출력
```

---

## 깃 컨벤션 (1인 프로젝트)

혼자 하는 **공개(public)** 저장소. 규칙의 목적은 협업이 아니라 "미래의 나"를 위한 것이므로 가볍게 유지한다.

- **브랜치**: `main` 직접 커밋이 기본. 크게 갈아엎거나 실험적인 작업만 짧은 브랜치(`feat/xxx`)를 파고 끝나면 머지 후 삭제. GitFlow(develop/release)는 쓰지 않음.
- **커밋 메시지**: Conventional Commits 접두사 + 한국어 본문.
  - `feat` 기능 / `fix` 버그 / `refactor` 리팩터링 / `chore` 설정·잡무 / `docs` 문서 / `style` 스타일 / `test` 테스트
  - 예: `feat: 세로 레이아웃 리사이즈 핸들 추가`, `fix: 모바일 탭 전환 시 스크롤 초기화`
- **커밋 단위**: 하나의 논리적 변경 = 한 커밋. 몰아서 대형 커밋 지양.
- **버전 태그**: 의미 있는 배포 시점에만 `git tag vX.Y.Z` + `package.json` version 동기화.
- **오버엔지니어링 금지**: PR 필수화·브랜치 보호·CODEOWNERS·수기 CHANGELOG·강제 pre-commit 훅은 두지 않음.

### 공개 저장소 데이터 분리 (필수)

사내 식별 정보(실제 메뉴/권한 구조, 회사 Slack 워크스페이스·member ID, 담당자 실명 등)는 **절대 커밋하지 않는다.**

- 실데이터는 `src/data/*` (gitignore됨), 공개용은 `*.sample.*`만 커밋한다.
  - 실: `menus.json`, `helpTexts.js`, `shortcuts.js`, `glossary.js`, `contact.js`
  - 커밋: 위 각각의 `*.sample.*` (허구 데이터 / placeholder)
- 문의처 등 사내 정보는 소스에 하드코딩하지 말고 `src/data/contact.js`(gitignore)로 분리하고, `App.jsx`는 `CONTACT`를 import해서 사용한다.
- 새 데이터 쌍을 추가하면 `scripts/dev-with-sample.mjs`의 `PAIRS`에도 등록한다.
- clone 직후에는 실데이터가 없어 그대로는 빌드 안 됨 — `npm run dev:sample`로 샘플 데이터를 써서 실행하거나 `*.sample.*`를 실파일명으로 복사한다.

---

## 만들지 말 것 (scope out)

- 사용자 계정/로그인 관련 기능
- 권한 신청 제출/API 연동
- 서버 사이드 로직
- 다국어(i18n)
- JSON 파일 업로드 UI (데이터는 소스에 하드코딩 또는 import)
