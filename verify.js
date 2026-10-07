// 실행: node subway/verify.js <seoul_subway_stations.csv>
// data.js 를 외부 역 목록(CSV: line, fr_code, name_ko)과 비교한다.
//  1) 이름 비교: 우리 데이터에만 있거나 CSV에만 있는 역
//  2) 순서 비교: 우리 데이터의 이웃 역 쌍이 CSV 역 코드 순서에도 이웃인지
const fs = require('fs');
const lines = require('./data.js');
const MAP = { 1: 'L1', 2: 'L2', 3: 'L3', 4: 'L4', 5: 'L5', 6: 'L6', 7: 'L7', 8: 'L8', 9: 'L9', 11: 'GYEONGUI', 12: 'SUINBUNDANG', 13: 'SINBUNDANG', 14: 'AREX', 15: 'GTXA', 16: 'GYEONGCHUN' };

function parseCsv(text) {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const cols = head.split(',');
  return rows.map(r => { const v = r.split(','); const o = {}; cols.forEach((c, i) => o[c] = v[i]); return o; });
}
const rows = parseCsv(fs.readFileSync(process.argv[2], 'utf8'));
// 같은 역을 부르는 다른 이름 (7호선은 '이수', 4호선은 '총신대입구')
const ALIAS = { '이수': '총신대입구' };
const norm = n => { n = n.replace(/\s/g, '').replace(/\(.*\)/, ''); return ALIAS[n] || n; };

let problems = 0;
lines.forEach(line => {
  const csv = rows.filter(r => r.line === MAP[line.id]);
  const ours = new Set(); line.paths.forEach(p => p.stations.forEach(s => ours.add(norm(s))));
  const theirs = new Set(csv.map(r => norm(r.name_ko)));
  const onlyOurs = [...ours].filter(n => !theirs.has(n));
  const onlyTheirs = [...theirs].filter(n => !ours.has(n));
  console.log(`\n■ ${line.name}: 우리 ${ours.size}개 / CSV ${theirs.size}개`);
  if (onlyOurs.length) { problems += onlyOurs.length; console.log('  CSV에 없음(우리만):', onlyOurs.join(', ')); }
  if (onlyTheirs.length) { problems += onlyTheirs.length; console.log('  우리에 없음(CSV만):', onlyTheirs.join(', ')); }
});
console.log('\n이름 차이 합계:', problems);

// ---- 순서 비교 ----
// 역 코드 = 접두 영문 + 숫자열(+ '-숫자'). 'A042'는 'A04'와 'A05' 사이(0으로 시작하면 문자열 비교),
// 'D4' < 'D19'(0 없으면 숫자 비교).
function codeParts(c) { const m = /^([A-Z]*)([\d]+)(?:-(\d+))?$/.exec(c) || ['', '', '0', '0']; return { p: m[1], d: m[2], s: +(m[3] || 0) }; }
function codeCmp(a, b) {
  const x = codeParts(a), y = codeParts(b);
  if (x.p !== y.p) return x.p < y.p ? -1 : 1;
  if (x.d !== y.d) {
    if (x.d[0] === '0' || y.d[0] === '0') return x.d < y.d ? -1 : 1;
    return +x.d - +y.d;
  }
  return x.s - y.s;
}
let orderProblems = 0;
lines.forEach(line => {
  const csv = rows.filter(r => r.line === MAP[line.id]).sort((a, b) => codeCmp(a.fr_code, b.fr_code));
  const theirsPairs = new Set();
  for (let i = 0; i < csv.length - 1; i++) {
    const a = norm(csv[i].name_ko), b = norm(csv[i + 1].name_ko);
    theirsPairs.add(a + '|' + b); theirsPairs.add(b + '|' + a);
  }
  const bad = new Set();
  line.paths.forEach(p => {
    const st = p.stations.map(norm), n = st.length;
    for (let i = 0; i < n - 1 + (p.ring ? 1 : 0); i++) {
      const a = st[i], b = st[(i + 1) % n];
      if (!theirsPairs.has(a + '|' + b)) bad.add(a + '–' + b);
    }
  });
  if (bad.size) { orderProblems += bad.size; console.log(`  ${line.name} 이웃이 CSV 순서와 다른 곳(분기·갈래 연결부는 정상일 수 있음):`, [...bad].join(', ')); }
});
console.log('순서 확인 필요 합계:', orderProblems);
