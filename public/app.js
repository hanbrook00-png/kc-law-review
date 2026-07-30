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

/* ============================================================================
 * 주차대수 자동 산정 데이터
 * 출처: 전주시 주차장 조례 별표7 (조례 제4385호, 2026.6.30. 개정), 주차장법 시행령 별표1
 * 산정식이 명확한 "면적당 1대" 형태 용도만 자동계산 대상으로 삼았습니다.
 * 공동주택·오피스텔(별표7 5호) 일반 세대는 세대별 전용면적 구간 산정이 필요해
 * 이 계산기로는 정확히 산출할 수 없으므로 별도 안내만 제공합니다 — 반드시
 * 「주택건설기준 등에 관한 규정」 제27조제1항 표를 국가법령정보센터에서 확인하세요.
 * ========================================================================== */

const PARKING_TABLE = [
  { id: "p1", label: "위락시설", jeonju: 80, national: 100, law: "전주시 주차장 조례 별표7 1호 / 주차장법 시행령 별표1" },
  { id: "p2", label: "문화·집회, 종교, 판매, 운수, 의료(정신·요양·격리병원 제외), 운동(골프장 등 제외), 업무(오피스텔 제외)", jeonju: 120, national: 150, law: "전주시 주차장 조례 별표7 2호 / 주차장법 시행령 별표1" },
  { id: "p2b", label: "└ 예식장 · 장례식장 (2호 중 강화)", jeonju: 80, national: 150, law: "전주시 주차장 조례 별표7 2호 단서" },
  { id: "p3", label: "제1종·제2종 근린생활시설, 숙박시설", jeonju: 150, national: 200, law: "전주시 주차장 조례 별표7 3호 / 주차장법 시행령 별표1" },
  { id: "p7", label: "수련시설, 공장(지식산업센터 제외), 발전시설", jeonju: 350, national: 350, law: "전주시 주차장 조례 별표7 7호" },
  { id: "p8", label: "창고시설", jeonju: 350, national: 400, law: "전주시 주차장 조례 별표7 8호" },
  { id: "p9", label: "학생용 기숙사", jeonju: 350, national: 400, law: "전주시 주차장 조례 별표7 9호" },
  { id: "p10", label: "방송통신시설 중 데이터센터", jeonju: 350, national: 400, law: "전주시 주차장 조례 별표7 10호" },
  { id: "p11", label: "그 밖의(기타) 시설물", jeonju: 250, national: 300, law: "전주시 주차장 조례 별표7 11호" },
  { id: "p11b", label: "└ 지식산업센터 (11호 중 강화)", jeonju: 150, national: 300, law: "전주시 주차장 조례 별표7 11호 단서" },
];

const PARKING_UNSUPPORTED_NOTE =
  "단독주택·공동주택·오피스텔·골프장 등 세대수·정원·홀 단위 산정 항목은 이 계산기가 지원하지 않습니다. " +
  "「주택건설기준 등에 관한 규정」 제27조제1항 및 전주시 주차장 조례 별표7 4~6호를 국가법령정보센터에서 직접 확인해주세요.";

/* ============================================================================
 * 직통계단 2개소 이상 설치대상 데이터 — 건축법 시행령 제34조제2항 1~5호
 * 출처: 법제처 국가법령정보 공동활용 API 실물 응답으로 원문 대조 확인 (2026.7.28. 시행본)
 * ========================================================================== */

const STAIR_MULTI_TABLE = [
  { id: "h1a", label: "문화·집회시설(전시장·동식물원 제외)·종교시설·위락시설 중 주점영업·장례시설", floorMin: null, threshold: 200, note: "제34조제2항제1호" },
  { id: "h1b", label: "제2종근린생활시설 중 공연장·종교집회장", floorMin: null, threshold: 300, note: "제34조제2항제1호 단서" },
  { id: "h2a", label: "다중주택·다가구주택, 정신과의원(입원실), 학원·독서실, 판매시설, 운수시설(여객), 의료시설(입원실 없는 치과병원 제외), 노유자시설 중 아동·노인·장애인거주시설, 장애인의료재활시설, 유스호스텔, 숙박시설", floorMin: 3, threshold: 200, note: "제34조제2항제2호" },
  { id: "h2b", label: "제2종근린생활시설 중 인터넷컴퓨터게임시설제공업소 (300㎡ 이상인 경우만 해당)", floorMin: 3, threshold: 300, note: "제34조제2항제2호 단서" },
  { id: "h3", label: "공동주택(층당 4세대 초과) 또는 업무시설 중 오피스텔", floorMin: null, threshold: 300, note: "제34조제2항제3호", isApartment: true },
  { id: "h4", label: "제1~3호 외 용도", floorMin: 3, threshold: 400, note: "제34조제2항제4호" },
  { id: "h5", label: "지하층", floorMin: null, threshold: 200, note: "제34조제2항제5호", isBasement: true },
];

const state = {
  project: {},
  selected: [], // { key, kind: 'law'|'ordin', title, mst, promul, enforce, org, kind_ }
  calcItems: [], // { key, category, label, formula, value, standard, verdict, relatedLaw }
  parkingRows: [], // { useId, area }
  ratio: {},       // 건폐율/용적률/조경 입력값 저장
  stair: {},       // 직통계단·피난거리 입력값 저장
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
  const count = state.selected.length + state.calcItems.length;
  document.getElementById("selCount").textContent = count;
  document.getElementById("selCount2").textContent = count;

  if (count === 0) {
    listEl.innerHTML = '<p class="empty">아직 추가된 법령/조례/판정 항목이 없습니다.<br>왼쪽에서 검색하거나 계산기를 사용한 뒤 “보고서에 추가”를 눌러주세요.</p>';
    return;
  }

  listEl.innerHTML = "";
  state.calcItems.forEach((c) => {
    listEl.appendChild(el("div", { class: "selected-item" }, [
      el("div", {}, [
        el("span", { class: "kind" }, "자동판정"),
        el("span", { class: "title" }, `${c.label} — ${c.value} (${c.verdict})`),
      ]),
      el("button", { onclick: () => removeCalcItem(c.key), "aria-label": "제거" }, "✕"),
    ]));
  });
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

const TAB_PANEL_IDS = { law: "tabLaw", ordin: "tabOrdin", calc: "tabCalc" };

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(TAB_PANEL_IDS[tab.dataset.tab]).classList.add("active");
  });
});

const CALC_PANEL_IDS = { parking: "calcParking", ratio: "calcRatio", stair: "calcStair" };

document.querySelectorAll(".calc-subtab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".calc-subtab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".calc-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(CALC_PANEL_IDS[tab.dataset.calc]).classList.add("active");
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

/* ============================================================================
 * 자동 판정 계산기 — 주차대수
 * ========================================================================== */

function initParkingSelect() {
  const sel = document.getElementById("parkingUseSelect");
  PARKING_TABLE.forEach((row) => {
    sel.appendChild(el("option", { value: row.id }, row.label));
  });
}

function calcParkingRowUnits(row, region) {
  const unitArea = region === "jeonju" ? row.jeonju : row.national;
  const raw = row.area / unitArea;
  return { unitArea, raw };
}

function renderParkingRows() {
  const body = document.getElementById("parkingRowsBody");
  const region = document.getElementById("parkingRegion").value;
  body.innerHTML = "";

  let sumRaw = 0;
  state.parkingRows.forEach((r, idx) => {
    const def = PARKING_TABLE.find((p) => p.id === r.useId);
    if (!def) return;
    const { unitArea, raw } = calcParkingRowUnits({ ...def, area: r.area }, region);
    sumRaw += raw;

    const tr = el("tr", {}, [
      el("td", {}, def.label),
      el("td", { class: "num" }, String(r.area)),
      el("td", {}, `${unitArea}㎡당 1대`),
      el("td", { class: "num" }, raw.toFixed(2) + "대"),
      el("td", {}, el("button", { class: "row-remove", onclick: () => removeParkingRow(idx) }, "✕")),
    ]);
    body.appendChild(tr);
  });

  renderParkingSummary(sumRaw);
}

function removeParkingRow(idx) {
  state.parkingRows.splice(idx, 1);
  saveState();
  renderParkingRows();
}

function finalizeParkingCount(sumRaw) {
  if (sumRaw < 1) return 0;
  return Math.round(sumRaw);
}

function renderParkingSummary(sumRaw) {
  const box = document.getElementById("parkingSummary");
  const total = finalizeParkingCount(sumRaw);
  const disabled = total >= 10 ? Math.ceil(total * 0.03) : 0;
  const wide = total >= 50 ? Math.ceil(total * 0.3) : 0;
  const ev = total >= 50 ? Math.ceil(total * 0.05) : 0;

  box.innerHTML = "";
  box.appendChild(el("p", {}, [
    "산정 결과 합계: ", el("strong", {}, raw2(sumRaw) + "대 → "), el("strong", {}, total + "대"),
    " (소수점 0.5 이상 올림, 1대 미만은 0대 처리)",
  ]));
  if (total > 0) {
    const extras = [];
    if (disabled) extras.push(`장애인전용구획 ${disabled}대 이상 (법정대수 10대 이상 시 3%)`);
    if (wide) extras.push(`확장형구획 ${wide}대 이상 (법정대수 50대 이상 시 30%)`);
    if (ev) extras.push(`전기차구획 ${ev}대 이상 (법정대수 50대 이상 시 5%)`);
    if (extras.length) box.appendChild(el("p", {}, "특례구획: " + extras.join(" · ")));
  }
  box.appendChild(el("p", { html: `<span style="color:var(--ink-faint)">${PARKING_UNSUPPORTED_NOTE}</span>` }));

  const planField = document.getElementById("parkingPlanWrap");
  if (!planField) {
    const wrap = el("div", { class: "field", id: "parkingPlanWrap" }, [
      el("label", { for: "parkingPlanInput" }, "계획(설계) 주차대수 — 적합 여부 비교용, 알고 있으면 입력"),
      el("input", { id: "parkingPlanInput", type: "text", inputmode: "decimal", placeholder: "예) 8" }),
    ]);
    box.parentNode.insertBefore(wrap, box.nextSibling);
    document.getElementById("parkingPlanInput").addEventListener("input", () => saveState());
  }
}

function raw2(n) { return (Math.round(n * 100) / 100).toFixed(2); }

const PARKING_KEYWORD_MAP = [
  [["위락시설"], "p1"],
  [["예식장", "장례식장"], "p2b"],
  [["문화", "집회", "종교시설", "판매시설", "운수시설", "의료시설", "운동시설", "업무시설", "공공용시설"], "p2"],
  [["근린생활시설", "숙박시설"], "p3"],
  [["수련시설", "공장", "발전시설"], "p7"],
  [["창고"], "p8"],
  [["기숙사"], "p9"],
  [["데이터센터"], "p10"],
  [["지식산업센터"], "p11b"],
];

function matchParkingUse(useText) {
  if (!useText) return null;
  for (const [keywords, id] of PARKING_KEYWORD_MAP) {
    if (keywords.some((k) => useText.includes(k))) return id;
  }
  return null;
}

document.getElementById("btnFillFromProject").addEventListener("click", () => {
  const msg = document.getElementById("parkingFillMsg");
  const useText = (state.project.pUse || "").trim();
  const areaText = (state.project.pArea || "").trim();
  const matchedId = matchParkingUse(useText);

  if (!useText && !areaText) {
    msg.textContent = "먼저 왼쪽 '01·프로젝트 개요'에 건축물 용도와 연면적을 입력해주세요.";
    return;
  }
  if (matchedId) {
    document.getElementById("parkingUseSelect").value = matchedId;
  }
  if (areaText) {
    document.getElementById("parkingAreaInput").value = areaText;
  }
  msg.textContent = matchedId
    ? "용도와 면적을 채웠습니다. 필요하면 용도를 다시 선택한 뒤 '행 추가'를 눌러주세요."
    : `'${useText}'와 자동으로 매칭되는 용도를 찾지 못했습니다. 위 목록에서 직접 선택해주세요 (면적만 채웠습니다).`;
});

document.getElementById("btnAddParkingRow").addEventListener("click", () => {
  const addMsg = document.getElementById("parkingAddMsg");
  const useId = document.getElementById("parkingUseSelect").value;
  const areaRaw = document.getElementById("parkingAreaInput").value;
  const areaVal = parseFloat(areaRaw);

  if (!areaRaw || Number.isNaN(areaVal) || areaVal <= 0) {
    addMsg.textContent = "면적(㎡)을 숫자로 입력한 뒤 '행 추가'를 눌러주세요.";
    return;
  }
  addMsg.textContent = "";
  state.parkingRows.push({ useId, area: areaVal });
  document.getElementById("parkingAreaInput").value = "";
  saveState();
  renderParkingRows();
});

document.getElementById("parkingRegion").addEventListener("change", () => {
  saveState();
  renderParkingRows();
});

document.getElementById("btnAddParkingToReport").addEventListener("click", () => {
  if (state.parkingRows.length === 0) return;
  const region = document.getElementById("parkingRegion").value;
  let sumRaw = 0;
  const formulaParts = [];
  state.parkingRows.forEach((r) => {
    const def = PARKING_TABLE.find((p) => p.id === r.useId);
    if (!def) return;
    const { unitArea, raw } = calcParkingRowUnits({ ...def, area: r.area }, region);
    sumRaw += raw;
    formulaParts.push(`${def.label} ${r.area}㎡÷${unitArea}=${raw.toFixed(2)}대`);
  });
  const total = finalizeParkingCount(sumRaw);
  const planInput = document.getElementById("parkingPlanInput");
  const planned = planInput && planInput.value ? parseFloat(planInput.value) : null;

  let verdict = "확인필요";
  if (planned !== null && !Number.isNaN(planned)) {
    verdict = planned >= total ? "적합" : "부적합";
  }

  addCalcItem({
    category: "주차대수",
    label: "부설주차장 법정대수",
    formula: formulaParts.join(" + ") + ` = 합계 ${raw2(sumRaw)}대 (반올림 → ${total}대)` +
      (planned !== null ? ` · 계획대수 ${planned}대와 비교` : ""),
    value: `법정 ${total}대` + (planned !== null ? ` / 계획 ${planned}대` : ""),
    standard: region === "jeonju" ? "전주시 주차장 조례 별표7" : "주차장법 시행령 별표1 (참고)",
    verdict,
    relatedLaw: "주차장법, 주차장법 시행령, " + (region === "jeonju" ? "전주시 주차장 조례" : "(해당 지자체 주차장 조례 별도 확인 필요)"),
  });
});

/* ============================================================================
 * 자동 판정 계산기 — 건폐율 · 용적률 · 조경면적
 * ========================================================================== */

function computeRatios() {
  const site = parseFloat(document.getElementById("rAreaSite").value);
  const building = parseFloat(document.getElementById("rAreaBuilding").value);
  const floorRatioArea = parseFloat(document.getElementById("rAreaFloorRatio").value);
  const landscape = parseFloat(document.getElementById("rAreaLandscape").value);
  const maxCoverage = parseFloat(document.getElementById("rMaxCoverage").value);
  const maxFar = parseFloat(document.getElementById("rMaxFar").value);
  const minLandscape = document.getElementById("rMinLandscape").value
    ? parseFloat(document.getElementById("rMinLandscape").value) : null;

  const results = [];

  if (site > 0 && !Number.isNaN(building)) {
    const coverage = (building / site) * 100;
    const ok = !Number.isNaN(maxCoverage) ? coverage <= maxCoverage : null;
    results.push({
      category: "건폐율", label: "건폐율",
      formula: `건축면적 ${building}㎡ ÷ 대지면적 ${site}㎡ × 100`,
      value: coverage.toFixed(2) + "%",
      standard: !Number.isNaN(maxCoverage) ? `허용 ${maxCoverage}% 이하` : "허용 기준 미입력",
      verdict: ok === null ? "확인필요" : (ok ? "적합" : "부적합"),
      relatedLaw: "국토의 계획 및 이용에 관한 법률 제77조, 건축법 제55조",
    });
  }

  if (site > 0 && !Number.isNaN(floorRatioArea)) {
    const far = (floorRatioArea / site) * 100;
    const ok = !Number.isNaN(maxFar) ? far <= maxFar : null;
    results.push({
      category: "용적률", label: "용적률",
      formula: `용적률 산정용 연면적 ${floorRatioArea}㎡ ÷ 대지면적 ${site}㎡ × 100`,
      value: far.toFixed(2) + "%",
      standard: !Number.isNaN(maxFar) ? `허용 ${maxFar}% 이하` : "허용 기준 미입력",
      verdict: ok === null ? "확인필요" : (ok ? "적합" : "부적합"),
      relatedLaw: "국토의 계획 및 이용에 관한 법률 제78조, 건축법 제56조",
    });
  }

  if (site > 0 && !Number.isNaN(landscape) && minLandscape !== null) {
    const ratio = (landscape / site) * 100;
    const ok = ratio >= minLandscape;
    results.push({
      category: "조경면적", label: "조경면적률",
      formula: `조경면적 ${landscape}㎡ ÷ 대지면적 ${site}㎡ × 100`,
      value: ratio.toFixed(2) + "%",
      standard: `필요 ${minLandscape}% 이상`,
      verdict: ok ? "적합" : "부적합",
      relatedLaw: "건축법 제42조, 건축법 시행령 제27조 (조경 기준은 지자체 조례로 강화될 수 있음)",
    });
  }

  return results;
}

function renderRatioResults() {
  const body = document.getElementById("ratioRowsBody");
  body.innerHTML = "";
  const results = computeRatios();
  state._ratioResults = results;

  if (results.length === 0) {
    body.appendChild(el("tr", {}, el("td", { colspan: "5", class: "state-msg" }, "대지면적과 최소 하나의 비교값을 입력한 뒤 계산하기를 눌러주세요.")));
    return;
  }

  results.forEach((r) => {
    body.appendChild(el("tr", {}, [
      el("td", {}, r.label),
      el("td", {}, r.formula),
      el("td", { class: "num" }, r.value),
      el("td", {}, r.standard),
      el("td", {}, verdictBadge(r.verdict)),
    ]));
  });
}

function verdictBadge(verdict) {
  const cls = verdict === "적합" ? "badge-ok" : verdict === "부적합" ? "badge-fail" : "badge-check";
  return el("span", { class: `badge-verdict ${cls}` }, verdict);
}

document.getElementById("btnCalcRatio").addEventListener("click", () => {
  ["rAreaSite", "rAreaBuilding", "rAreaFloorRatio", "rAreaLandscape", "rMaxCoverage", "rMaxFar", "rMinLandscape"]
    .forEach((id) => { state.ratio[id] = document.getElementById(id).value; });
  saveState();
  renderRatioResults();
});

document.getElementById("btnAddRatioToReport").addEventListener("click", () => {
  const results = state._ratioResults && state._ratioResults.length ? state._ratioResults : computeRatios();
  if (!results.length) return;
  results.forEach((r) => addCalcItem(r));
});

/* ============================================================================
 * 자동 판정 계산기 — 직통계단 · 피난거리 (건축법 시행령 제34조 · 제35조)
 * ========================================================================== */

function initStairMultiSelect() {
  const sel = document.getElementById("stMultiUse");
  sel.appendChild(el("option", { value: "" }, "해당없음 (판정 안 함)"));
  STAIR_MULTI_TABLE.forEach((row) => {
    const cond = [`${row.threshold}㎡ 이상`];
    if (row.floorMin) cond.push(`${row.floorMin}층 이상`);
    if (row.isBasement) cond.push("지하층");
    sel.appendChild(el("option", { value: row.id }, `${row.label} [${row.note}, ${cond.join(" · ")}]`));
  });
}

function computeStairDistance() {
  const distanceRaw = document.getElementById("stDistance").value;
  const distance = parseFloat(distanceRaw);
  if (!distanceRaw || Number.isNaN(distance)) return null;

  const fireResistant = document.getElementById("stFireResistant").checked;
  const apt16 = document.getElementById("stApt16").checked;
  const basementExcl = document.getElementById("stBasementExcl").checked;
  const factoryType = document.getElementById("stFactoryType").value;

  let allowed = 30;
  let basis = "원칙 30m 이하 (제34조제1항 본문)";
  if (factoryType === "auto") {
    allowed = 75;
    basis = "자동화 생산시설 + 자동식 소화설비 설치 공장 → 75m 이하 (제34조제1항 단서)";
  } else if (factoryType === "unmanned") {
    allowed = 100;
    basis = "무인화 공장 → 100m 이하 (제34조제1항 단서)";
  } else if (fireResistant && basementExcl) {
    basis = "내화구조/불연재료이나 지하층 대규모 공연장·집회장·관람장·전시장(바닥면적 300㎡ 이상)에 해당해 완화 제외 → 30m 이하";
  } else if (fireResistant) {
    allowed = apt16 ? 40 : 50;
    basis = apt16
      ? "내화구조/불연재료 + 공동주택 16층 이상인 층 → 40m 이하 (제34조제1항 단서)"
      : "내화구조/불연재료 → 50m 이하 (제34조제1항 단서)";
  }

  const ok = distance <= allowed;
  return {
    category: "직통계단·피난거리", label: "보행거리",
    formula: `실제 보행거리 ${distance}m vs 허용 ${allowed}m (${basis})`,
    value: `${distance}m`,
    standard: `${allowed}m 이하`,
    verdict: ok ? "적합" : "부적합",
    relatedLaw: "건축법 시행령 제34조제1항",
  };
}

function computeStairMulti() {
  const useId = document.getElementById("stMultiUse").value;
  if (!useId) return null;
  const def = STAIR_MULTI_TABLE.find((d) => d.id === useId);
  if (!def) return null;

  const areaRaw = document.getElementById("stMultiArea").value;
  const area = parseFloat(areaRaw);
  if (!areaRaw || Number.isNaN(area)) return null;

  const floor = parseFloat(document.getElementById("stMultiFloor").value);
  const units = parseFloat(document.getElementById("stMultiUnits").value);
  const installedRaw = document.getElementById("stMultiInstalled").value;
  const installed = parseFloat(installedRaw);

  let floorOk = true;
  if (def.floorMin) floorOk = !Number.isNaN(floor) && floor >= def.floorMin;
  const areaOk = area >= def.threshold;
  const unitsExcluded = !!def.isApartment && !Number.isNaN(units) && units <= 4;
  const target = floorOk && areaOk && !unitsExcluded;
  const required = target ? 2 : 1;

  const formulaParts = [`바닥면적 ${area}㎡ (기준 ${def.threshold}㎡, ${areaOk ? "충족" : "미충족"})`];
  if (def.floorMin) formulaParts.push(`${Number.isNaN(floor) ? "층수 미입력" : floor + "층"} (기준 ${def.floorMin}층 이상, ${floorOk ? "충족" : "미충족"})`);
  if (def.isApartment) formulaParts.push(Number.isNaN(units) ? "세대수 미입력(오피스텔 등)" : `층당 ${units}세대 (${unitsExcluded ? "4세대 이하 → 대상 제외" : "4세대 초과"})`);

  let verdict = "확인필요";
  if (installedRaw && !Number.isNaN(installed)) verdict = installed >= required ? "적합" : "부적합";

  return {
    category: "직통계단·피난거리",
    label: `직통계단 개소수 — ${def.label}`,
    formula: formulaParts.join(" / "),
    value: `법정 ${required}개소 이상 / 실제 ${installedRaw ? installed + "개소" : "미입력"}`,
    standard: `${def.note}` + (target ? " — 2개소 이상 설치대상" : " — 기준 미충족(일반기준 1개소)"),
    verdict,
    relatedLaw: "건축법 시행령 제34조제2항",
  };
}

const STAIR_LEVEL = { general: 0, escape: 1, special: 2 };
const STAIR_LEVEL_LABEL = { general: "일반 직통계단", escape: "피난계단", special: "특별피난계단" };

function computeStairEvac() {
  const floorType = document.getElementById("stPeFloorType").value;
  const floorNumRaw = document.getElementById("stPeFloorNum").value;
  const floorNum = parseFloat(floorNumRaw);
  if (!floorNumRaw || Number.isNaN(floorNum)) return [];

  const areaRaw = document.getElementById("stPeArea").value;
  const area = parseFloat(areaRaw);
  const apartment = document.getElementById("stPeApartment").checked;
  const gatBokdo = document.getElementById("stPeGatBokdo").checked;
  const fireResistant = document.getElementById("stPeFireResistant").checked;
  const compart = document.getElementById("stPeCompart").checked;
  const sales = document.getElementById("stPeSales").checked;
  const installedRaw = document.getElementById("stPeInstalled").value;

  const article1Target = (floorType === "above" && floorNum >= 5) || (floorType === "below" && floorNum >= 2);
  // 제35조제1항 단서 1호·2호는 문언상 "5층 이상인 층"만을 대상으로 하므로,
  // 지하 2층 이하인 층에는 이 예외(단서)가 적용되지 않는다.
  const article1Exception = fireResistant && floorType === "above" && floorNum >= 5 && (
    (!Number.isNaN(area) && area <= 200) || compart
  );

  const specialThreshold = apartment ? 16 : 11;
  const article2Target = !gatBokdo && !Number.isNaN(area) && area >= 400 && (
    (floorType === "above" && floorNum >= specialThreshold) ||
    (floorType === "below" && floorNum >= 3)
  );

  let requiredLevel, requiredLabel, basis;
  if (article2Target) {
    requiredLevel = 2;
    requiredLabel = "특별피난계단";
    basis = `${floorType === "above" ? "지상" : "지하"} ${floorNum}층 + 바닥면적 ${area}㎡(400㎡ 이상) → ${floorType === "above" ? `기준 ${specialThreshold}층 이상(공동주택 16층/그 외 11층)` : "지하 3층 이하"} 충족 (제35조제2항)`;
  } else if (article1Target && !article1Exception) {
    requiredLevel = 1;
    requiredLabel = "피난계단 이상(특별피난계단도 가능)";
    basis = `${floorType === "above" ? "지상 5층 이상" : "지하 2층 이하"} (${floorNum}층) → 원칙 대상 (제35조제1항)`;
  } else if (article1Target && article1Exception) {
    requiredLevel = 0;
    requiredLabel = "설치의무 없음 (예외 적용)";
    basis = "원칙 대상이나 내화구조/불연재료 + (바닥면적 200㎡ 이하 또는 200㎡ 이내마다 방화구획) 단서 적용 (제35조제1항 단서)";
  } else {
    requiredLevel = 0;
    requiredLabel = "설치의무 없음";
    basis = `${floorType === "above" ? "지상 5층 미만" : "지하 1층"}으로 제35조 적용대상 아님`;
  }

  const installedLevel = STAIR_LEVEL[installedRaw];
  let verdict = "확인필요";
  if (installedLevel !== undefined) verdict = installedLevel >= requiredLevel ? "적합" : "부적합";

  const results = [{
    category: "직통계단·피난거리",
    label: "피난계단/특별피난계단",
    formula: basis,
    value: `기준: ${requiredLabel} / 실제: ${installedRaw ? STAIR_LEVEL_LABEL[installedRaw] : "미입력"}`,
    standard: requiredLabel,
    verdict,
    relatedLaw: "건축법 시행령 제35조",
  }];

  if (sales && (article1Target || article2Target)) {
    results.push({
      category: "직통계단·피난거리",
      label: "판매시설 특별피난계단 특칙",
      formula: "판매시설 용도로 쓰는 층의 직통계단 중 1개소 이상은 특별피난계단으로 설치해야 함 (개소별 형식은 이 계산기가 구분하지 않으므로 도면에서 개별 확인 필요)",
      value: "1개소 이상 특별피난계단 필요",
      standard: "제35조제3항",
      verdict: "확인필요",
      relatedLaw: "건축법 시행령 제35조제3항",
    });
  }
  return results;
}

function computeStairAll() {
  const results = [];
  const d = computeStairDistance();
  if (d) results.push(d);
  const m = computeStairMulti();
  if (m) results.push(m);
  results.push(...computeStairEvac());
  return results;
}

function renderStairResults() {
  const body = document.getElementById("stairRowsBody");
  body.innerHTML = "";
  const results = computeStairAll();
  state._stairResults = results;

  if (results.length === 0) {
    body.appendChild(el("tr", {}, el("td", { colspan: "5", class: "state-msg" }, "A·B·C 중 값을 입력한 항목만 계산됩니다. 위에 값을 입력한 뒤 계산하기를 눌러주세요.")));
    return;
  }

  results.forEach((r) => {
    body.appendChild(el("tr", {}, [
      el("td", {}, r.label),
      el("td", {}, r.formula),
      el("td", { class: "num" }, r.value),
      el("td", {}, r.standard),
      el("td", {}, verdictBadge(r.verdict)),
    ]));
  });
}

const STAIR_TEXT_FIELDS = [
  "stDistance", "stFactoryType",
  "stMultiUse", "stMultiFloor", "stMultiArea", "stMultiUnits", "stMultiInstalled",
  "stPeFloorType", "stPeFloorNum", "stPeArea", "stPeInstalled",
];
const STAIR_CHECK_FIELDS = [
  "stFireResistant", "stApt16", "stBasementExcl",
  "stPeApartment", "stPeGatBokdo", "stPeFireResistant", "stPeCompart", "stPeSales",
];

function saveStairInputs() {
  STAIR_TEXT_FIELDS.forEach((id) => { state.stair[id] = document.getElementById(id).value; });
  STAIR_CHECK_FIELDS.forEach((id) => { state.stair[id] = document.getElementById(id).checked; });
  saveState();
}

function restoreStairInputs() {
  STAIR_TEXT_FIELDS.forEach((id) => {
    if (state.stair[id] !== undefined) document.getElementById(id).value = state.stair[id];
  });
  STAIR_CHECK_FIELDS.forEach((id) => {
    if (state.stair[id] !== undefined) document.getElementById(id).checked = state.stair[id];
  });
}

document.getElementById("btnCalcStair").addEventListener("click", () => {
  saveStairInputs();
  renderStairResults();
});

document.getElementById("btnAddStairToReport").addEventListener("click", () => {
  const results = state._stairResults && state._stairResults.length ? state._stairResults : computeStairAll();
  if (!results.length) return;
  results.forEach((r) => addCalcItem(r));
});

/* ---------------- 자동 판정 항목 공통 처리 ---------------- */

function addCalcItem(item) {
  const key = `calc:${item.category}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`;
  state.calcItems.push({ key, ...item });
  saveState();
  renderSelected();
}

function removeCalcItem(key) {
  state.calcItems = state.calcItems.filter((c) => c.key !== key);
  saveState();
  renderSelected();
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
  renderReportCalc();
  renderVerdictBanner();

  const opinionEl = document.getElementById("repOpinion");
  if (state.opinion) opinionEl.value = state.opinion;
  opinionEl.oninput = () => { state.opinion = opinionEl.value; saveState(); };
}

function renderVerdictBanner() {
  const banner = document.getElementById("repVerdictBanner");
  const items = state.calcItems;
  banner.className = "report-verdict-banner";
  if (items.length === 0) {
    banner.classList.add("v-empty");
    banner.textContent = "";
    return;
  }
  const hasFail = items.some((c) => c.verdict === "부적합");
  const hasCheck = items.some((c) => c.verdict === "확인필요");
  if (hasFail) {
    banner.classList.add("v-fail");
    banner.textContent = "종합 판정: 부적합 항목 있음 — 아래 자동 판정 결과 표를 확인하세요";
  } else if (hasCheck) {
    banner.classList.add("v-check");
    banner.textContent = "종합 판정: 일부 항목 확인 필요 — 계획 대수·허용 기준 등을 입력해 재계산하세요";
  } else {
    banner.classList.add("v-ok");
    banner.textContent = "종합 판정: 자동 판정 대상 항목 전체 적합";
  }
}

function renderReportCalc() {
  const body = document.getElementById("repCalcBody");
  const emptyMsg = document.getElementById("repCalcEmpty");
  body.innerHTML = "";
  if (state.calcItems.length === 0) {
    emptyMsg.style.display = "block";
    return;
  }
  emptyMsg.style.display = "none";
  state.calcItems.forEach((c) => {
    body.appendChild(el("tr", {}, [
      el("td", {}, c.label),
      el("td", {}, c.formula),
      el("td", {}, c.value),
      el("td", {}, c.standard),
      el("td", {}, verdictBadge(c.verdict)),
      el("td", {}, c.relatedLaw || "-"),
    ]));
  });
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

function restoreRatioInputs() {
  Object.entries(state.ratio || {}).forEach(([id, val]) => {
    const node = document.getElementById(id);
    if (node && val) node.value = val;
  });
}

loadState();
bindProjectFields();
renderQuickChips();
initParkingSelect();
renderParkingRows();
restoreRatioInputs();
initStairMultiSelect();
restoreStairInputs();
renderSelected();
