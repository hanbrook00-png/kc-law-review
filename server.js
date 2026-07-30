// 로컬 실행용 서버. Vercel에 배포할 때는 이 파일 대신 /api 폴더가 서버리스 함수로 자동 인식됩니다.
// 로컬에서 빠르게 테스트하고 싶을 때: npm install && node server.js  (기본 http://localhost:3000)

require("dotenv").config({ path: ".env.local" });
require("dotenv").config(); // .env 도 보조로 지원

const express = require("express");
const path = require("path");

const lawSearch = require("./api/law-search.js");
const lawDetail = require("./api/law-detail.js");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/law-search", (req, res) => lawSearch(req, res));
app.get("/api/law-detail", (req, res) => lawDetail(req, res));

app.listen(PORT, () => {
  console.log(`KC 법규 검토 웹앱 실행 중: http://localhost:${PORT}`);
  if (!process.env.LAW_API_OC) {
    console.warn("⚠️  LAW_API_OC 환경변수가 없습니다. .env.local 파일을 만들고 LAW_API_OC=발급받은ID 를 넣어주세요.");
  }
});
