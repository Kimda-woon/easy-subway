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

  // 아이콘 (글자 대신 그림으로)
  var ICON_CHEV = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M5 8l7 7 7-7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_TRAIN = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="5" y="2.5" width="14" height="15" rx="4" fill="currentColor"/><rect x="7.5" y="5" width="9" height="5" rx="1.5" fill="#fff"/><circle cx="9" cy="13.5" r="1.4" fill="#fff"/><circle cx="15" cy="13.5" r="1.4" fill="#fff"/><path d="M8 17.5L6 21.5M16 17.5l2 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  var ICON_SWAP = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d="M4 8h14m0 0l-4-4m4 4l-4 4M20 16H6m0 0l4-4m-4 4l4 4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // 타는 역 → [다음 역(크게)] → 내리는 역 을 호선 색 선 위에 그린다. 글자는 꼭 필요한 것만.
  function stepHtml(ride) {
    var l = ride.line, last = ride.stops === 1;
    var h = '<div class="step" style="--c:' + l.color + '"><div class="step-head" style="background:' + l.color + ';color:' + l.text + '">' + ICON_TRAIN + '<b>' + l.name + '</b></div>';
    h += '<div class="route">';
    h += '<div class="rt-row"><span class="rt-node rt-n-from">' + ICON_TRAIN + '</span><b class="rt-name">' + yeok(ride.from) + '</b></div>';
    h += '<div class="rt-move">' + ICON_CHEV + ICON_CHEV + ICON_CHEV + '</div>';
    h += '<div class="rt-row rt-next"><span class="rt-node rt-n-next"></span><span class="rt-chip">다음' + (last ? ' · 내려요' : '') + '</span><b class="rt-big">' + yeok(ride.next) + '</b></div>';
    if (!last) {
      h += '<div class="rt-move">' + ICON_CHEV + '</div>';
      h += '<div class="rt-row"><span class="rt-node rt-n-end"></span><span class="rt-chip out">내려요</span><span class="rt-count">' + ride.stops + '정거장</span><b class="rt-name">' + yeok(ride.to) + '</b></div>';
    }
    return h + '</div></div>';
  }

  function transferHtml(prev, next) {
    var same = prev.line.id === next.line.id;
    return '<div class="transfer">' + ICON_SWAP + (same ? '' : badge(next.line)) + '<b>' + (same ? '다른 열차로 ' : '') + '갈아타요</b></div>';
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
    var html = '<div class="chain">' + rides.map(function (r) { return badge(r.line); }).join(' <span class="arrow">→</span> ') + '</div>';
    rides.forEach(function (ride, i) {
      if (i > 0) html += transferHtml(rides[i - 1], ride);
      html += stepHtml(ride);
    });
    html += '<div class="arrive">🎉 ' + yeok(b) + ' 도착</div>';

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
