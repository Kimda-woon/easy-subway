(function () {
  var router = createRouter(SUBWAY_LINES);
  var $ = function (id) { return document.getElementById(id); };
  var inputs = { from: $('from'), to: $('to') };
  var lists = { from: $('from-list'), to: $('to-list') };
  var names = router.stationNames();

  // ---------- 저장(실패해도 앱은 동작) ----------
  function load(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // ---------- 글자 크기 ----------
  function setScale(s) {
    document.documentElement.style.setProperty('--scale', s);
    document.querySelectorAll('.size button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.scale === s)); });
    save('subway.scale', s);
    if (typeof fitNames === 'function' && !$('result').hidden) fitNames();
  }
  document.querySelector('.size').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (b) setScale(+b.dataset.scale);
  });
  var savedScale = +load('subway.scale', 1.25);
  setScale(savedScale >= 1 && savedScale <= 1.5 ? savedScale : 1.25);

  // ---------- 역 검색 (이름 일부 / 초성) ----------
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function choseong(s) {
    return s.split('').map(function (ch) {
      var c = ch.charCodeAt(0) - 0xAC00;
      return c >= 0 && c <= 11171 ? CHO[Math.floor(c / 588)] : ch;
    }).join('');
  }
  function isChoseongOnly(s) { return s.length > 0 && s.split('').every(function (c) { return CHO.indexOf(c) >= 0; }); }
  function search(q) {
    q = q.trim();
    if (!router.hasStation(q)) q = q.replace(/역$/, '');
    if (!q) return [];
    var cho = isChoseongOnly(q);
    var hits = names.filter(function (n) { return cho ? choseong(n).indexOf(q) >= 0 : n.indexOf(q) >= 0; });
    hits.sort(function (a, b) {
      var sa = (cho ? choseong(a) : a).indexOf(q) === 0 ? 0 : 1, sb = (cho ? choseong(b) : b).indexOf(q) === 0 ? 0 : 1;
      return sa - sb || a.length - b.length || a.localeCompare(b, 'ko');
    });
    return hits;
  }
  function resolve(text) {
    var t = text.trim();
    if (router.hasStation(t)) return t;
    var stripped = t.replace(/역$/, '');
    if (router.hasStation(stripped)) return stripped;
    var hits = search(t);
    if (hits.length === 1) return hits[0];
    var exact = hits.filter(function (n) { return n.replace(/\(.*\)/, '') === stripped; });
    return exact.length === 1 ? exact[0] : null;
  }

  function badge(line, label) {
    return '<span class="badge" style="background:' + line.color + ';color:' + line.text + '">' + (label || line.name) + '</span>';
  }
  function yeok(n) { return /역$/.test(n) ? n : n + '역'; }  // '서울역'은 '서울역역'이 되지 않게

  function renderSuggest(which) {
    var ul = lists[which], q = inputs[which].value;
    var hits = search(q).slice(0, 6);
    if (!q.trim()) { ul.hidden = true; return; }
    ul.innerHTML = hits.length
      ? hits.map(function (n) {
          return '<li><button type="button" data-name="' + n + '">' + yeok(n) + ' ' + router.linesOf(n).map(function (l) { return badge(l); }).join(' ') + '</button></li>';
        }).join('')
      : '<li class="noresult">찾는 역이 없어요. 다른 이름으로 써 보세요.</li>';
    ul.hidden = false;
  }
  ['from', 'to'].forEach(function (w) {
    inputs[w].addEventListener('input', function () { renderSuggest(w); showMsg(''); });
    inputs[w].addEventListener('focus', function () { renderSuggest(w); });
    inputs[w].addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var first = lists[w].querySelector('button');
      if (first && !lists[w].hidden) first.click();
      else if (w === 'from') inputs.to.focus();
      else find();
    });
    lists[w].addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      inputs[w].value = b.dataset.name;
      lists[w].hidden = true;
      if (w === 'from' && !resolve(inputs.to.value)) inputs.to.focus();
      else inputs[w].blur();
    });
  });
  // 'pointerdown'으로 닫으면 목록이 사라지며 화면이 밀려 손가락 아래 버튼이 빠져나가므로, 손을 뗀 뒤(click)에 닫는다.
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.field')) { lists.from.hidden = true; lists.to.hidden = true; }
  });
  $('swap').addEventListener('click', function () {
    var t = inputs.from.value; inputs.from.value = inputs.to.value; inputs.to.value = t;
    if (!$('result').hidden) find();
  });

  function showMsg(t) { var m = $('msg'); m.textContent = t; m.hidden = !t; }

  // ---------- 최근 길 ----------
  function renderRecent() {
    var rec = load('subway.recent', []);
    $('recent').hidden = !rec.length;
    $('recent-list').innerHTML = rec.map(function (r, i) {
      return '<button type="button" data-i="' + i + '">' + yeok(r[0]) + ' → ' + yeok(r[1]) + '</button>';
    }).join('');
  }
  $('recent-list').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var r = load('subway.recent', [])[+b.dataset.i];
    if (r) { inputs.from.value = r[0]; inputs.to.value = r[1]; find(); }
  });
  function remember(a, b) {
    var rec = load('subway.recent', []).filter(function (r) { return !(r[0] === a && r[1] === b); });
    rec.unshift([a, b]);
    save('subway.recent', rec.slice(0, 5));
    renderRecent();
  }

  // ---------- 길 찾기 ----------
  // 다음 역 이름이 칸 너비에 한 줄로 들어오도록 글자 크기를 줄인다 ('역' 글자만 다음 줄로 떨어지는 것 방지)
  function fitNames() {
    document.querySelectorAll('.rt-big').forEach(function (el) {
      el.style.whiteSpace = 'nowrap'; el.style.fontSize = '';
      var size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth && size > 16) { size -= 1; el.style.fontSize = size + 'px'; }
      if (el.scrollWidth > el.clientWidth) el.style.whiteSpace = 'normal';  // 그래도 안 들어가면 줄바꿈 허용
    });
  }

  // 다음 역을 그림으로: 지금 역 → [다음 역(크게)] → 내리는 역 (호선 색 선 위에)
  function routeVisual(ride) {
    var chev = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 8l7 7 7-7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var last = ride.stops === 1;
    var sign = ride.labels.length ? '<small class="rt-sign">표지판에는 “' + ride.labels.slice(0, 2).join('” 또는 “') + (ride.labels.length > 2 ? '” 등' : '”') + '이라고 나와요</small>' : '';
    var h = '<div class="route" style="--c:' + ride.line.color + '">';
    h += '<div class="rt-row"><span class="rt-node rt-n-from"></span><small>지금 타는 역</small><b class="rt-name">' + yeok(ride.from) + '</b></div>';
    h += '<div class="rt-move">' + chev + chev + chev + '<span>이쪽으로 출발</span></div>';
    h += '<div class="rt-row rt-next"><span class="rt-node rt-n-next"></span><span class="rt-chip">다음 역' + (last ? ' · 여기서 내려요' : '') + '</span><b class="rt-big">' + yeok(ride.next) + '</b>' + sign + '</div>';
    if (!last) {
      h += '<div class="rt-move">' + chev + '<span>' + (ride.stops - 1) + '정거장 더 가요</span></div>';
      h += '<div class="rt-row"><span class="rt-node rt-n-end"></span><small>내리는 역 (타고 모두 ' + ride.stops + '정거장)</small><b class="rt-name">' + yeok(ride.to) + '</b></div>';
    }
    return h + '</div>';
  }

  function stepHtml(ride, no) {
    var l = ride.line, c = l.color;
    var h = '<div class="step"><div class="step-head" style="background:' + c + ';color:' + l.text + '"><span class="no">' + no + '</span>' +
      yeok(ride.from) + '에서 ' + l.name + ' 타기 (' + l.colorName + ')</div><div class="step-body">';
    h += routeVisual(ride);
    h += '<details><summary>지나가는 역 모두 보기 (' + (ride.stops + 1) + '개)</summary><ul class="stops" style="--c:' + c + '">' +
      ride.stations.map(function (s, i) {
        var edge = i === 0 || i === ride.stations.length - 1;
        return '<li class="' + (edge ? 'edge' : '') + '">' + yeok(s) + (i === 0 ? ' (타는 곳)' : edge ? ' (내리는 곳)' : '') + '</li>';
      }).join('') + '</ul></details></div></div>';
    return h;
  }

  function transferHtml(prev, next) {
    var same = prev.line.id === next.line.id;
    return '<div class="transfer"><p><b>🔁 갈아타기</b></p>' +
      (same
        ? '<p>' + yeok(prev.to) + '에서 내린 뒤 ' + badge(next.line, next.line.name) + ' <b>다른 열차</b>로 갈아타세요. 같은 호선이지만 가는 길이 갈라져서 열차가 달라요.</p>'
        : '<p>' + yeok(prev.to) + '에서 내린 뒤 ' + badge(next.line, next.line.name + ' (' + next.line.colorName + ')') + ' 표지판을 따라가세요.</p>') +
      '<p>걷는 길이 길 수 있어요. 천천히 가세요.</p></div>';
  }

  function unresolvedMsg(text, what) {
    var t = text.trim();
    if (!t) return what + ' 역을 써 주세요.';
    return search(t).length > 1
      ? '“' + t + '”(이)라는 역이 여러 개예요. 아래 목록에서 알맞은 역을 눌러 주세요.'
      : '“' + t + '” 역을 못 찾았어요. 다른 이름으로 써 보세요.';
  }

  // 실패하면 안내 문구와 함께 그 칸의 후보 목록을 다시 보여 준다 (버튼을 누르며 닫힌 목록 복구)
  function fail(which, what) {
    showMsg(unresolvedMsg(inputs[which].value, what));
    setTimeout(function () { renderSuggest(which); }, 0);
  }

  function find() {
    showMsg('');
    var a = resolve(inputs.from.value), b = resolve(inputs.to.value);
    if (!a) return fail('from', '타는');
    if (!b) return fail('to', '내릴');
    if (a === b) return showMsg('타는 역과 내리는 역이 같아요.');
    inputs.from.value = a; inputs.to.value = b;
    lists.from.hidden = lists.to.hidden = true;

    var route = router.findRoute(a, b);
    if (!route) return showMsg('이 두 역을 잇는 길을 못 찾았어요.');
    remember(a, b);

    var rides = route.rides;
    var chain = rides.map(function (r) { return badge(r.line); }).join(' → ');
    var html = '<div class="summary"><h2>' + yeok(a) + ' → ' + yeok(b) + '</h2>' +
      '<div class="chain">' + chain + '</div>' +
      '<p class="big">' + (route.transfers ? '갈아타는 곳 ' + route.transfers + '번' : '갈아타지 않아도 돼요') + ' · 약 ' + route.minutes + '분</p></div>';

    rides.forEach(function (ride, i) {
      if (i > 0) html += transferHtml(rides[i - 1], ride);
      html += stepHtml(ride, i + 1);
    });
    html += '<div class="arrive">🎉 ' + yeok(b) + '에 도착해요!</div>';

    var res = $('result');
    res.innerHTML = html;
    res.hidden = false;
    fitNames();
    res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('go').addEventListener('click', find);

  renderRecent();

  // 예전에 설치된 오프라인 저장본(서비스 워커)이 있으면 지워서 항상 최신 버전이 보이게 한다.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
    if (window.caches) caches.keys().then(function (ks) { ks.forEach(function (k) { if (k.indexOf('subway-') === 0) caches.delete(k); }); }).catch(function () {});
  }
})();
