// /api/law-search
// 법제처 국가법령정보 공동활용 Open API의 lawSearch.do 를 서버 사이드에서 대신 호출하는 프록시.
// 브라우저에서 law.go.kr을 직접 호출하면 CORS로 막히기 때문에, 그리고 OC 키를 클라이언트에
// 노출하지 않기 위해 이 서버리스 함수를 거칩니다.

const xml2js = require("xml2js");

const BASE_URL = "https://www.law.go.kr/DRF/lawSearch.do";

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "GET 요청만 지원합니다." });
    return;
  }

  const OC = process.env.LAW_API_OC;
  if (!OC) {
    res.status(500).json({
      error: "LAW_API_OC 환경변수가 설정되지 않았습니다. Vercel 프로젝트 설정 또는 .env.local 에 법제처에서 발급받은 OC 값을 등록해주세요.",
    });
    return;
  }

  const {
    target = "law", // law: 현행법령, ordin: 자치법규, admrul: 행정규칙, expc: 법령해석례 등
    query = "",
    display = "20",
    page = "1",
    search, // 1: 법령명 검색(기본), 2: 본문 검색
    org, // 소관부처 코드
    sort, // 정렬 옵션
    region, // 자치법규 검색 시 지역명을 query에 함께 넣는 것을 권장하지만, 일부 응답에 지역 필터가 있어 그대로 전달
  } = req.query;

  const params = new URLSearchParams({
    OC,
    target,
    type: "XML", // 법제처 API는 JSON 응답이 불안정하여 XML로 고정 후 서버에서 JSON 변환
    query,
    display: String(display),
    page: String(page),
  });
  if (search) params.set("search", search);
  if (org) params.set("org", org);
  if (sort) params.set("sort", sort);
  if (region) params.set("region", region);

  const upstreamUrl = `${BASE_URL}?${params.toString()}`;

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; KC-Law-Review/1.0)" },
    });
    const xmlText = await upstreamRes.text();

    if (!upstreamRes.ok) {
      res.status(upstreamRes.status).json({
        error: `법제처 API 호출 실패 (HTTP ${upstreamRes.status})`,
        raw: xmlText.slice(0, 500),
      });
      return;
    }

    const parsed = await xml2js.parseStringPromise(xmlText, {
      explicitArray: false,
      trim: true,
    });

    res.status(200).json({ ok: true, target, query, data: parsed });
  } catch (err) {
    res.status(502).json({
      error: "법제처 API 응답을 처리하는 중 오류가 발생했습니다.",
      detail: String(err && err.message ? err.message : err),
    });
  }
};
