/* ============================================================================
 * KC 법규검토 워크벤치 — 프론트엔드 로직
 *
 * ⚠️ 중요 안내 (반드시 읽어주세요)
 * 법제처 국가법령정보 공동활용 Open API의 XML 응답 필드명은 공식 가이드 페이지가
 * 크롤링을 막아두고 있어(robots.txt) 이 코드 작성 시 100% 실물 응답으로 검증하지
 * 못했습니다. 아래 FIELD_MAP은 공개된 문서/레퍼런스 구현체 기준으로 가장 가능성이
 * 높은 필드명을 추정해 넣은 것입니다.
 *
 * 처음 실행해서 검색 결과가 이상하게 보이면 (제목이 비어있거나 "원본 보기"에만
 * 값이 있는 경우):
 *   1. 브라우저 개발자도구 → Network 탭 → /api/law-search 응답의 raw JSON 확인
 *   2. 실제 필드명을 아래 FIELD_MAP 의 candidates 배열 맨 앞에 추가
 * 이렇게 한 번만 보정하면 이후에는 정상적으로 동작합니다.
 * ========================================================================== */

const FIELD_MAP = {
  law: {
    listKey: ["LawSearch.law", "law"],
    title: ["법령명한글", "법령명", "법령약칭명"],
    mst: ["법령일련번호", "MST", "법령ID"],
    promul: ["공포일자"],
    enforce: ["시행일자"],
    org: ["소관부처명"],
    kind: ["법령구분명"],
  },
  ordin: {
listKey: ["OrdinSearch.law", "LawSearch.law", "law", "LawSearch.Ordin", "Ordin"],
    title: ["자치법규명", "법령명한글"],
    mst: ["자치법규일련번호", "법령일련번호", "MST"],
    promul: ["공포일자"],
    enforce: ["시행일자"],
    org: ["지자체기관명", "소관부처명"],
    kind: ["자치법규종류", "법령구분명"],
  },
};

// 자주 쓰는 건축 관계 국가법령 — 클릭 한 번으로 검색창에 채워줍니다.
const QUICK_LAWS = [
  "건축법", "건축법 시행령", "건축법 시행규칙",
  "국토의 계획 및 이용에 관한 법률", "주차장법",
  "소방시설 설치 및 관리에 관한 법률", "장애인·노인·임산부 등의 편의증진 보장에 관한 법률",
  "건축물의 설비기준 등에 관한 규칙", "산업안전보건법",
];

const state = {
  project: {},
  selected: [], // { key, kind: 'law'|'ordin', title, mst, promul, enforce, org, kind_ }
};

/* ---------------- 유틸 ---------------- */

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

function pick(obj, candidates, fallback = "") {
  for (const c of candidates) {
    const v = getPath(obj, c);
    if (v !== undefined && v !== null && v !== "") return typeof v === "object" ? (v._ || fallback) : v;
  }
  return fallback;
}

function fmtDate(d) {
  if (!d || String(d).length !== 8) return d || "-";
  const s = String(d);
  return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

function saveState() {
  localStorage.setItem("kc-law-review-state", JSON.stringify(state));
}
function loadState() {
  try {
    const raw = localStorage.getItem("kc-law-review-state");
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch (e) { /* 무시 */ }
}

/* ---------------- API 호출 ---------------- */

async function searchLaw(target, query) {
  const url = `/api/law-search?target=${encodeURIComponent(target)}&query=${encodeURIComponent(query)}&display=20`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || "검색 실패");
  return json.data;
}

async function fetchDetail(target, mst) {
  const url = `/api/law-detail?target=${encodeURIComponent(target)}&mst=${encodeURIComponent(mst)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || "상세 조회 실패");
  return json.data;
}

function extractList(data, kind) {
  const map = FIELD_MAP[kind];
  let list = null;
  for (const path of map.listKey) {
    const v = getPath(data, path);
    if (v) { list = v; break; }
  }
  if (!list) return [];
  return Array.isArray(list) ? list : [list];
}

/* ---------------- 검색 렌더링 ---------------- */

async function runSearch(kind, query, resultsElId) {
  const resultsEl = document.getElementById(resultsElId);
  resultsEl.innerHTML = "";
  resultsEl.appendChild(el("p", { class: "state-msg" }, "검색 중…"));

  try {
    const data = await searchLaw(kind, query);
    const items = extractList(data, kind);
    resultsEl.innerHTML = "";

    if (items.length === 0) {
      resultsEl.appendChild(el("p", { class: "state-msg" }, "검색 결과가 없습니다. 검색어를 바꿔보세요."));
      return;
    }

    items.forEach((item) => {
      const map = FIELD_MAP[kind];
      const title = pick(item, map.title, "(제목 없음 — 원본 보기로 확인)");
      const mst = pick(item, map.mst, "");
      const promul = pick(item, map.promul, "");
      const enforce = pick(item, map.enforce, "");
      const org = pick(item, map.org, "");
      const kindName = pick(item, map.kind, "");

      const card = el("div", { class: "result-card" }, [
        el("div", { class: "result-main" }, [
          el("p", { class: "result-title" }, title),
          el("div", { class: "result-meta" }, [
            kindName && el("span", {}, `분류 ${kindName}`),
            promul && el("span", {}, `공포 ${fmtDate(promul)}`),
            enforce && el("span", {}, `시행 ${fmtDate(enforce)}`),
            org && el("span", {}, org),
          ].filter(Boolean)),
        ]),
        el("div", { class: "result-actions" }, [
          el("button", {
            class: "btn btn-primary",
            onclick: () => addToSelection(kind, { title, mst, promul, enforce, org, kindName }),
          }, "보고서에 추가"),
          mst && el("button", {
            class: "btn btn-ghost",
            onclick: () => openDetail(kind, mst, title),
          }, "원문 보기"),
        ].filter(Boolean)),
      ]);
      resultsEl.appendChild(card);
    });
  } catch (err) {
    resultsEl.innerHTML = "";
    resultsEl.appendChild(el("p", { class: "state-msg error" }, `오류: ${err.message}`));
  }
}

/* ---------------- 상세 모달 ---------------- */

async function openDetail(kind, mst, title) {
  const modal = document.getElementById("detailModal");
  const body = document.getElementById("modalBody");
  modal.classList.remove("hidden");
  body.innerHTML = `<h3>${title}</h3><p class="state-msg">원문 조회 중…</p>`;
  try {
    const data = await fetchDetail(kind, mst);
    body.innerHTML = `<h3>${title}</h3>`;
    body.appendChild(el("p", { class: "hint" }, "아래는 법제처 API 원본 응답입니다. 필요한 조문을 찾아 검토 보고서의 '종합 검토의견'에 직접 인용/요약해 넣으세요."));
    body.appendChild(el("pre", {}, JSON.stringify(data, null, 2)));
  } catch (err) {
    body.innerHTML = `<h3>${title}</h3><p class="state-msg error">오류: ${err.message}</p>`;
  }
}

document.getElementById("modalClose").addEventListener("click", () => {
  document.getElementById("detailModal").classList.add("hidden");
});
document.getElementById("detailModal").addEventListener("click", (e) => {
  if (e.target.id === "detailModal") e.target.classList.add("hidden");
});

/* ---------------- 선택 목록 ---------------- */

function addToSelection(kind, item) {
  const key = `${kind}:${item.mst || item.title}`;
  if (state.selected.some((s) => s.key === key)) return;
  state.selected.push({ key, kind, ...item });
  saveState();
  renderSelected();
}

function removeFromSelection(key) {
  state.selected = state.selected.filter((s) => s.key !== key);
  saveState();
  renderSelected();
}

function renderSelected() {
  const listEl = document.getElementById("selectedList");
  const count = state.selected.length;
  document.getElementById("selCount").textContent = count;
  document.getElementById("selCount2").textContent = count;

  if (count === 0) {
    listEl.innerHTML = '<p class="empty">아직 추가된 법령/조례가 없습니다.<br>왼쪽에서 검색 후 “보고서에 추가”를 눌러주세요.</p>';
    return;
  }

  listEl.innerHTML = "";
  state.selected.forEach((s) => {
    listEl.appendChild(el("div", { class: "selected-item" }, [
      el("div", {}, [
        el("span", { class: "kind" }, s.kind === "law" ? "국가법령" : "자치법규"),
        el("span", { class: "title" }, s.title),
      ]),
      el("button", { onclick: () => removeFromSelection(s.key), "aria-label": "제거" }, "✕"),
    ]));
  });
}

/* ---------------- 프로젝트 정보 ---------------- */

const PROJECT_FIELDS = ["pName", "pRegion", "pUse", "pArea", "pFloors", "pNote"];

function bindProjectFields() {
  PROJECT_FIELDS.forEach((id) => {
    const node = document.getElementById(id);
    if (state.project[id]) node.value = state.project[id];
    node.addEventListener("input", () => {
      state.project[id] = node.value;
      saveState();
    });
  });
}

/* ---------------- 탭 ---------------- */

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab === "law" ? "tabLaw" : "tabOrdin").classList.add("active");
  });
});

/* ---------------- 검색 폼 ---------------- */

document.getElementById("lawSearchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = document.getElementById("lawQuery").value.trim();
  if (!q) return;
  runSearch("law", q, "lawResults");
});

document.getElementById("ordinSearchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = document.getElementById("ordinQuery").value.trim();
  if (!q) return;
  runSearch("ordin", q, "ordinResults");
});

function renderQuickChips() {
  const wrap = document.getElementById("lawQuickChips");
  QUICK_LAWS.forEach((name) => {
    wrap.appendChild(el("button", {
      class: "chip",
      onclick: () => {
        document.getElementById("lawQuery").value = name;
        runSearch("law", name, "lawResults");
      },
    }, name));
  });
}

/* ---------------- 화면 전환 ---------------- */

function showReport() {
  document.getElementById("viewSearch").classList.add("hidden");
  document.getElementById("viewReport").classList.remove("hidden");
  renderReport();
  window.scrollTo(0, 0);
}
function showSearch() {
  document.getElementById("viewReport").classList.add("hidden");
  document.getElementById("viewSearch").classList.remove("hidden");
}

document.getElementById("btnGoReport").addEventListener("click", showReport);
document.getElementById("btnGoReport2").addEventListener("click", showReport);
document.getElementById("btnBackToSearch").addEventListener("click", showSearch);
document.getElementById("btnPrint").addEventListener("click", () => window.print());

/* ---------------- 보고서 렌더링 ---------------- */

function renderReport() {
  const p = state.project;
  document.getElementById("repTitle").textContent = p.pName || "사업명 미입력";
  document.getElementById("repRegion").textContent = p.pRegion || "-";
  document.getElementById("repUse").textContent = p.pUse || "-";
  document.getElementById("repArea").textContent = p.pArea ? `${p.pArea} ㎡` : "-";
  document.getElementById("repFloors").textContent = p.pFloors || "-";
  document.getElementById("repDate").textContent = new Date().toLocaleDateString("ko-KR");
  document.getElementById("repNote").textContent = p.pNote || "";

  const laws = state.selected.filter((s) => s.kind === "law");
  const ordins = state.selected.filter((s) => s.kind === "ordin");

  renderReportList("repLaws", laws, "추가된 국가법령이 없습니다.");
  renderReportList("repOrdins", ordins, "추가된 자치법규가 없습니다.");

  const opinionEl = document.getElementById("repOpinion");
  if (state.opinion) opinionEl.value = state.opinion;
  opinionEl.oninput = () => { state.opinion = opinionEl.value; saveState(); };
}

function renderReportList(elId, items, emptyMsg) {
  const wrap = document.getElementById(elId);
  wrap.innerHTML = "";
  if (items.length === 0) {
    wrap.appendChild(el("p", { class: "report-empty" }, emptyMsg));
    return;
  }
  items.forEach((s) => {
    wrap.appendChild(el("div", { class: "report-item" }, [
      el("div", { class: "title" }, s.title),
      el("div", { class: "meta" }, [
        s.kindName && `분류 ${s.kindName}`,
        s.promul && `공포 ${fmtDate(s.promul)}`,
        s.enforce && `시행 ${fmtDate(s.enforce)}`,
        s.org && s.org,
      ].filter(Boolean).join("  ·  ")),
    ]));
  });
}

/* ---------------- 초기화 ---------------- */

loadState();
bindProjectFields();
renderQuickChips();
renderSelected();
