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
    if (typeof fitStage === 'function' && !$('result').hidden) fitStage();
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
    document.querySelectorAll('.rb-big').forEach(function (el) {
      el.style.whiteSpace = 'nowrap'; el.style.fontSize = '';
      var size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth && size > 16) { size -= 1; el.style.fontSize = size + 'px'; }
      if (el.scrollWidth > el.clientWidth) el.style.whiteSpace = 'normal';  // 그래도 안 들어가면 줄바꿈 허용
    });
  }

  // ---------- 결과 화면: 호선 색 큰 면 + 큰 글자 ----------
  // 호선 안에 넣을 짧은 표시 (1~9호선은 숫자)
  var MARK = { 11: '경의', 12: '분당', 13: '신분당', 14: '공항', 15: 'GTX', 16: '경춘' };
  function lineMark(l) { return l.id <= 9 ? String(l.id) : MARK[l.id]; }
  // 밝은 호선색을 어둡게 (흰 이름표 안의 글자색용)
  function shade(hex, f) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgb(' + Math.round((n >> 16 & 255) * (1 - f)) + ',' + Math.round((n >> 8 & 255) * (1 - f)) + ',' + Math.round((n & 255) * (1 - f)) + ')';
  }
  var ICON_TRAIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="15" rx="4" fill="currentColor"/><rect x="7.5" y="5" width="9" height="5" rx="1.5" style="fill:var(--c)"/><circle cx="9" cy="13.5" r="1.4" style="fill:var(--c)"/><circle cx="15" cy="13.5" r="1.4" style="fill:var(--c)"/><path d="M8 17.5L6 21.5M16 17.5l2 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var ICON_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h15m0 0l-6-6m6 6l-6 6"/></svg>';
  var ICON_FLAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4m0 0h12l-3 4.5L18 13H6"/></svg>';

  // 호선 하나 = 색 면 하나: 타는 역 / 다음 역(가장 크게) / 내리는 역
  function rideBlock(ride) {
    var l = ride.line, mark = lineMark(l), light = l.text === '#ffffff';
    var chipBg = l.text, chipFg = light ? shade(l.color, 0.4) : l.color;
    var pillBg = light ? '#ffffff' : '#111827', pillFg = light ? '#111827' : '#ffffff';
    var decor = light ? 'rgba(255,255,255,0.17)' : 'rgba(0,0,0,0.10)';
    return '<section class="rb" style="--c:' + l.color + ';background:' + l.color + ';color:' + l.text + '">' +
      '<div class="rb-decor' + (mark.length > 1 ? ' sm' : '') + '" style="color:' + decor + '" aria-hidden="true">' + mark + '</div>' +
      '<div class="rb-in">' +
        '<div class="rb-from">' + ICON_TRAIN + '<span>' + yeok(ride.from) + '</span></div>' +
        '<div><div class="rb-row"><span class="rb-chip" style="background:' + chipBg + ';color:' + chipFg + '">다음 역</span>' + ICON_ARROW + '</div>' +
          '<div class="rb-big">' + ride.next + '</div></div>' +
        '<div class="rb-out">' + ICON_FLAG + '<span class="rb-pill" style="background:' + pillBg + ';color:' + pillFg + '">' + yeok(ride.to) + '</span><span>에서 내려요</span></div>' +
      '</div></section>';
  }

  function circleMark(l) {
    var m = lineMark(l);
    return '<span class="rb-circle' + (m.length > 1 ? ' sm' : '') + '" style="background:' + l.color + ';color:' + l.text + '">' + m + '</span>';
  }

  function transferBand(prev, next) {
    var same = prev.line.id === next.line.id;
    return '<div class="rb-band"><div class="rb-bandrow">' + circleMark(prev.line) +
      '<span class="rb-bandarrow">' + ICON_ARROW + '</span>' + circleMark(next.line) + '<b>갈아타요</b></div>' +
      (same ? '<small>같은 호선, 다른 열차</small>' : '') + '</div>';
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
    openResult(rides);
  }

  // ---------- 결과 화면: 모든 단계를 한 화면에 ----------
  // 화면에 넘치는지 직접 재면서, 모두 들어올 때까지 칸을 조금씩 줄인다 (폰 높이·글씨 크기와 상관없이 스크롤 없이).
  var lastFocus = null;
  function fitStage() {
    var stage = $('rv-stage'), s = 1;
    stage.style.setProperty('--shrink', s);
    fitNames();
    for (var i = 0; i < 40 && stage.scrollHeight > stage.clientHeight + 1 && s > 0.3; i++) {
      s *= 0.94;
      stage.style.setProperty('--shrink', s.toFixed(3));
      fitNames();
    }
  }

  function setInert(on) {
    ['main', 'header.top'].forEach(function (sel) { var el = document.querySelector(sel); if (el) el.inert = on; });
  }
  function openResult(rides) {
    var stage = $('rv-stage');
    stage.innerHTML = rides.map(function (ride, i) {
      return (i > 0 ? transferBand(rides[i - 1], ride) : '') + rideBlock(ride);
    }).join('');
    stage.scrollTop = 0;
    lastFocus = document.activeElement;
    $('result').hidden = false;
    document.documentElement.style.overflow = 'hidden';
    setInert(true);
    try { history.pushState({ r: 1 }, ''); } catch (e) {}   // 폰의 뒤로가기로도 돌아오게
    fitStage();
    $('rv-back').focus();
  }
  function closeResult(fromPop) {
    if ($('result').hidden) return;
    $('result').hidden = true;
    document.documentElement.style.overflow = '';
    setInert(false);
    if (!fromPop) { try { if (history.state && history.state.r) history.back(); } catch (e) {} }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $('rv-back').addEventListener('click', function () { closeResult(); });
  window.addEventListener('popstate', function () { closeResult(true); });
  window.addEventListener('resize', function () { if (!$('result').hidden) fitStage(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeResult(); });
  $('go').addEventListener('click', find);

  renderRecent();

  // 예전에 설치된 오프라인 저장본(서비스 워커)이 있으면 지워서 항상 최신 버전이 보이게 한다.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }).catch(function () {});
    if (window.caches) caches.keys().then(function (ks) { ks.forEach(function (k) { if (k.indexOf('subway-') === 0) caches.delete(k); }); }).catch(function () {});
  }
})();
