// 실행: node subway/router.test.js
const assert = require('assert');
const lines = require('./data.js');
const { createRouter } = require('./router.js');
const r = createRouter(lines);

// 데이터 점검: 한 노선 안에서 역 이름이 겹치면 안 된다
lines.forEach(l => l.paths.forEach(p => assert.strictEqual(new Set(p.stations).size, p.stations.length, l.name + ' 중복 역')));

// 사용자 예시: 왕십리 → 돌곶이
let route = r.findRoute('왕십리', '돌곶이');
assert.strictEqual(route.transfers, 1);
const [a, b] = route.rides;
assert.strictEqual(a.line.id, 2); assert.strictEqual(a.next, '상왕십리'); assert.strictEqual(a.to, '신당'); assert.deepStrictEqual(a.labels, ['외선순환']);
assert.strictEqual(b.line.id, 6); assert.strictEqual(b.next, '동묘앞'); assert.strictEqual(b.to, '돌곶이'); assert.deepStrictEqual(b.labels, ['신내 방면']);
assert.strictEqual(b.stops, 8);

// 환승 없이 가는 길, 반대 방향
route = r.findRoute('돌곶이', '왕십리');
assert.strictEqual(route.rides[0].next, '상월곡'); assert.deepStrictEqual(route.rides[0].labels, ['응암 방면']);
assert.deepStrictEqual(route.rides[1].labels, ['내선순환']);

// 같은 노선 끝에서 끝
route = r.findRoute('강남', '잠실'); assert.strictEqual(route.transfers, 0); assert.deepStrictEqual(route.rides[0].labels, ['외선순환']);
route = r.findRoute('잠실', '강남'); assert.deepStrictEqual(route.rides[0].labels, ['내선순환']);
// 5호선 갈래: 마천 가는 열차만 안내
route = r.findRoute('천호', '올림픽공원'); assert.strictEqual(route.rides[0].line.id, 5); assert.deepStrictEqual(route.rides[0].labels, ['마천 방면']);
// 갈래 공통 구간은 두 방면 모두
route = r.findRoute('왕십리', '천호'); assert.deepStrictEqual(route.rides[0].labels, ['하남검단산 방면', '마천 방면']);
// 성수지선
route = r.findRoute('성수', '신설동'); assert.deepStrictEqual(route.rides[0].labels, ['신설동 방면']);
// 새 노선: 1호선·경의중앙·수인분당·신분당
route = r.findRoute('서울역', '인천'); assert.strictEqual(route.transfers, 0); assert.deepStrictEqual(route.rides[0].labels, ['인천 방면']);
route = r.findRoute('강남', '판교'); assert.strictEqual(route.rides[0].line.id, 13); assert.strictEqual(route.rides[0].next, '양재');
route = r.findRoute('서울숲', '선릉'); assert.strictEqual(route.rides[0].line.id, 12);
route = r.findRoute('용산', '양평(경기)'); assert.ok(route.rides.some(x => x.line.id === 11 && x.to === '양평(경기)'));
// 공항철도·GTX-A·경춘선
route = r.findRoute('서울역', '인천공항1터미널'); assert.strictEqual(route.transfers, 0); assert.strictEqual(route.rides[0].line.id, 14); assert.strictEqual(route.rides[0].next, '공덕');
// GTX-A 서울역~수서 구간은 아직 개통 전: 두 구간이 이어지면 안 된다
route = r.findRoute('서울역', '동탄'); assert.ok(!route.rides.some(x => x.line.id === 15 && x.stations.includes('서울역') && x.stations.includes('수서')));
route = r.findRoute('서울역', '연신내'); assert.strictEqual(route.rides[0].line.id, 15); assert.strictEqual(route.rides[0].stops, 1);
route = r.findRoute('수서', '동탄'); assert.strictEqual(route.rides[0].line.id, 15); assert.strictEqual(route.minutes, 3 * 5);
route = r.findRoute('청량리', '춘천'); assert.strictEqual(route.rides[0].line.id, 16); assert.deepStrictEqual(route.rides[0].labels, ['춘천 방면']);
route = r.findRoute('강남', '인천공항2터미널'); assert.ok(route.rides[route.rides.length - 1].line.id === 14);
// 셔틀 구간은 갈라지는 역에서 갈아타야 한다 (같은 호선이라도 다른 열차)
route = r.findRoute('건대입구', '용답'); assert.strictEqual(route.transfers, 1); assert.strictEqual(route.rides[1].from, '성수'); assert.deepStrictEqual(route.rides[1].labels, ['신설동 방면']);
route = r.findRoute('잠실', '까치산'); assert.strictEqual(route.rides[route.rides.length - 1].from, '신도림');
route = r.findRoute('서울역', '광명'); assert.strictEqual(route.rides[1].from, '금천구청'); assert.deepStrictEqual(route.rides[1].labels, ['광명 방면']);
route = r.findRoute('서울역', '서동탄'); assert.strictEqual(route.rides[1].from, '병점');
route = r.findRoute('의정부', '연천'); assert.strictEqual(route.rides[1].from, '소요산');
route = r.findRoute('성수', '신설동'); assert.strictEqual(route.transfers, 0);
// 6호선 응암순환은 한 방향으로만 돈다
route = r.findRoute('구산', '연신내'); assert.strictEqual(route.rides[0].stops, 5);
route = r.findRoute('불광', '응암'); assert.strictEqual(route.rides[0].stops, 4); assert.strictEqual(route.rides[0].next, '독바위');
route = r.findRoute('불광', '공덕'); assert.strictEqual(route.transfers, 1); assert.ok(route.rides[0].labels.length > 0);
// 환승이 적은 길을 우선 (시간이 조금 더 걸려도)
assert.strictEqual(r.findRoute('왕십리', '돌곶이').transfers, 1);
// 공식 노선도(2026-02) 기준: 4호선 진접 연장 구간에 당고개는 없다
assert.ok(!r.hasStation('당고개'));
route = r.findRoute('진접', '노원'); assert.deepStrictEqual(route.rides[0].stations, ['진접','오남','별내별가람','불암산','상계','노원']);
// 같은 역, 없는 역
assert.strictEqual(r.findRoute('강남', '강남'), null);
assert.strictEqual(r.findRoute('강남', '없는역'), null);

// 구조 점검(표본): 끝점이 이어지고, 이웃한 역끼리만 가고, 방향 이름이 비지 않고, 같은 열차를 두 번 타지 않는다
const nm = r.stationNames();
const adjacent = (line, a, b) => line.paths.some(p => { const st = p.stations, i = st.indexOf(a), n = st.length;
  return i >= 0 && (st[i + 1] === b || (!p.oneWay && st[i - 1] === b) || (p.ring && (st[(i + 1) % n] === b || (!p.oneWay && st[(i - 1 + n) % n] === b)))); });
for (let i = 0; i < nm.length; i += 3) for (let j = 1; j < nm.length; j += 53) {
  const a = nm[i], b = nm[(i + j) % nm.length]; if (a === b) continue;
  const x = r.findRoute(a, b); assert.ok(x, a + '→' + b + ' 경로 없음');
  assert.strictEqual(x.rides[0].from, a); assert.strictEqual(x.rides[x.rides.length - 1].to, b);
  x.rides.forEach((ride, k) => {
    assert.ok(ride.stops >= 1 && ride.labels.length > 0, a + '→' + b + ' ' + ride.line.name + ' 방향 이름');
    for (let q = 0; q < ride.stations.length - 1; q++) assert.ok(adjacent(ride.line, ride.stations[q], ride.stations[q + 1]), a + '→' + b + ' 이웃 아님');
    if (k > 0) { assert.strictEqual(x.rides[k - 1].to, ride.from); assert.ok(x.rides[k - 1].svc !== ride.svc, '같은 열차 연속'); }
  });
}

// 모든 역 쌍이 연결되는지 (2~9호선이 하나의 망)
const names = r.stationNames();
names.forEach(n => assert.ok(r.findRoute('시청', n) || n === '시청', '연결 안 됨: ' + n));
console.log('OK —', names.length, '개 역,', lines.length, '개 노선');
