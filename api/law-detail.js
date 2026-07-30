// /api/law-detail
// 법제처 lawService.do 프록시. 검색 결과에서 얻은 MST(일련번호)로 법령/자치법규 본문을 조회합니다.

const xml2js = require("xml2js");

const BASE_URL = "https://www.law.go.kr/DRF/lawService.do";

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "GET 요청만 지원합니다." });
    return;
  }

  const OC = process.env.LAW_API_OC;
  if (!OC) {
    res.status(500).json({
      error: "LAW_API_OC 환경변수가 설정되지 않았습니다.",
    });
    return;
  }

  const { target = "law", mst, id, jo } = req.query;

  if (!mst && !id) {
    res.status(400).json({ error: "mst(법령/자치법규 일련번호) 또는 id 파라미터가 필요합니다." });
    return;
  }

  const params = new URLSearchParams({ OC, target, type: "XML" });
  if (mst) params.set("MST", mst);
  if (id) params.set("ID", id);
  if (jo) params.set("JO", jo); // 특정 조 번호만 조회하고 싶을 때

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

    res.status(200).json({ ok: true, target, mst: mst || id, data: parsed });
  } catch (err) {
    res.status(502).json({
      error: "법제처 API 응답을 처리하는 중 오류가 발생했습니다.",
      detail: String(err && err.message ? err.message : err),
    });
  }
};
