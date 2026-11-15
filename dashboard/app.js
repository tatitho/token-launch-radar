/* Token Radar dashboard. Reads window.RADAR from data.js; no network. */
(function () {
  'use strict';

  var D = window.RADAR;
  var errBox = document.getElementById('err');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(n) { return typeof n === 'number' && isFinite(n) ? n : null; }
  function fmtUsd(n) {
    n = num(n); if (n === null) return 'n/a';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) {
    n = num(n); if (n === null) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    d = num(d); if (d === null) return 'n/a';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function fmtMult(m) {
    m = num(m); if (m === null) return 'n/a';
    return m < 0.01 ? m.toFixed(3) + 'x' : m.toFixed(2) + 'x';
  }
  function pctCls(n) {
    n = num(n); if (n === null) return 'flat';
    return n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat';
  }
  function confBadge(c) {
    c = (c || 'low').toLowerCase();
    if (c !== 'high' && c !== 'medium') c = 'low';
    return '<span class="badge ' + c + '">' + c + '</span>';
  }
  function flagChip(r) {
    var f = r.verified === false;
    return '<span class="badge ' + (f ? 'unverified' : 'verified') + ' flag">' + (f ? '&#9888; flagged' : '&#10003; verified') + '</span>';
  }
  /* Farm verdict: same rule as lib/model.ts (data.js carries farm_verdict;
     the fallback recomputes it from the row's own fields). SKIP = flagged
     row, governance-option value only. THIN = low confidence, or a curator /
     allocator row (fee slice, not the full TVL). FARM = the rest. */
  function farmVerdictOf(r) {
    if (r.farm_verdict === 'FARM' || r.farm_verdict === 'THIN' || r.farm_verdict === 'SKIP') return r.farm_verdict;
    if (r.verified === false) return 'SKIP';
    if ((r.confidence || '').toLowerCase() === 'low' || r.category === 'Risk Curators' || r.category === 'Onchain Capital Allocator') return 'THIN';
    return 'FARM';
  }
  function farmBadge(v) {
    var cls = v === 'FARM' ? 'high' : v === 'THIN' ? 'medium' : 'low';
    return '<span class="badge ' + cls + '">' + v + '</span>';
  }
  function farmCell(r) {
    var v = farmVerdictOf(r);
    var f = r.farm || {};
    var cap = f.capital_usd != null ? fmtUsd(f.capital_usd) : 'n/a';
    var dur = f.duration || 'n/a';
    var ar = f.airdrop_range;
    var tip = 'Verdict ' + v + '. Capital ' + cap + ', hold ' + dur +
      (ar ? '. Expected airdrop slice ' + fmtUsd(ar[0]) + '–' + fmtUsd(ar[1]) + ' (5–25% of implied FDV; points outstanding unknown, so no per-user value is promised).' : '');
    return '<td class="farmcell" title="' + esc(tip) + '">' + farmBadge(v) +
      '<br><span class="num" style="font-size:12px">' + cap + ' &middot; ' + esc(dur) + '</span></td>';
  }
  function catChip(cat) {
    var c = cat || 'Other';
    return '<span class="cat" style="color:' + catColor(c) + ';border-color:' + catColor(c) + '55;background:' + catColor(c) + '14">' + esc(c) + '</span>';
  }
  var CATC = {
    'Lending': '#57c8e8', 'Dexs': '#2ee6a8', 'Liquid Staking': '#b48cf2',
    'Yield': '#f2b544', 'Yield Aggregator': '#f2b544', 'RWA': '#ff9a5c',
    'Derivatives': '#ff6d6d', 'Prediction Market': '#7ee787', 'CDP': '#e88fd0',
    'Basis Trading': '#8fd0e8', 'Bridge': '#9aa7b1', 'Restaking': '#b48cf2',
    'Stablecoin Issuer': '#57e8c8', 'Payments': '#f2d544', 'Insurance': '#e8a0a0'
  };
  var PAL = ['#2ee6a8', '#57c8e8', '#f2b544', '#b48cf2', '#ff9a5c', '#ff6d6d', '#7ee787', '#e88fd0'];
  function catColor(c) {
    if (CATC[c]) return CATC[c];
    var h = 0, i; for (i = 0; i < c.length; i++) h = (h * 31 + c.charCodeAt(i)) >>> 0;
    return PAL[h % PAL.length];
  }
  function rowLink(r) { return '#/protocol/' + encodeURIComponent(r.slug); }
  function wlMark(r) { return r.watchlist ? '<span class="wl-dot" title="Watchlist"></span>' : ''; }

  if (!D || !Array.isArray(D.rows) || !D.rows.length) {
    errBox.hidden = false;
    errBox.innerHTML = '<b>No radar data found.</b> This page reads <span class="mono">window.RADAR</span> ' +
      'from <span class="mono">data.js</span> beside the dashboard folder. If you opened index.html ' +
      'directly, serve the output folder instead so the data file loads.';
    var tb = document.getElementById('tbody');
    if (tb) tb.innerHTML = '<tr><td colspan="10" class="mut">No data — data.js did not load.</td></tr>';
    var t10 = document.getElementById('top10body');
    if (t10) t10.innerHTML = '<tr><td colspan="8" class="mut">No data — data.js did not load.</td></tr>';
    return;
  }

  var rows = D.rows.slice();
  var maxBase = 0, i;
  for (i = 0; i < rows.length; i++) { var b = num(rows[i].implied_base); if (b !== null && b > maxBase) maxBase = b; }
  if (!maxBase) maxBase = 1;

  var asof = esc(D.snapshotAsOf || D.generated || '');
  var a1 = document.getElementById('asof'); if (a1) a1.textContent = asof || 'n/a';
  var a2 = document.getElementById('asof2'); if (a2) a2.textContent = asof || 'n/a';

  function renderStats() {
    var wl = 0, tvl = 0;
    for (var k = 0; k < rows.length; k++) {
      if (rows[k].watchlist) wl++;
      var t = num(rows[k].tvl_usd); if (t !== null) tvl += t;
    }
    var top = rows.slice().sort(function (x, y) { return (num(y.implied_base) || 0) - (num(x.implied_base) || 0); })[0];
    var aud = D.audit || {};
    document.getElementById('stats').innerHTML =
      stat(rows.length, 'protocols ranked', 'pre-token, by implied launch value') +
      stat(wl + ' / ' + (aud.watchlist || 40), 'watchlist covered', 'every watchlist protocol is on the board') +
      stat(fmtUsd(tvl), 'board TVL', 'combined TVL of ranked protocols') +
      stat(fmtUsd(top ? top.implied_base : null), 'top implied FDV', esc(top ? top.name : ''));
    function stat(big, label, sub) {
      return '<div class="stat"><b>' + big + '</b><span>' + esc(label) + '</span><em>' + esc(sub) + '</em></div>';
    }
  }

  function renderTop10() {
    var top = rows.slice().sort(function (x, y) { return (num(x.rank) || 9999) - (num(y.rank) || 9999); }).slice(0, 10);
    var h = '';
    for (var k = 0; k < top.length; k++) {
      var r = top[k];
      h += '<tr><td class="num">' + esc(r.rank) + '</td>' +
        '<td class="name">' + wlMark(r) + '<a href="' + rowLink(r) + '">' + esc(r.name) + '</a> ' + flagChip(r) + '</td>' +
        '<td>' + catChip(r.category) + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + pctCls(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td title="Low ' + fmtUsd(r.implied_low) + ' – bull ' + fmtUsd(r.implied_bull) + '"><span class="num"><b>' + fmtUsd(r.implied_base) + '</b></span>' +
        '<span class="bar"><i style="width:' + Math.max(2, Math.round(100 * (num(r.implied_base) || 0) / maxBase)) + '%"></i></span></td>' +
        '<td>' + confBadge(r.confidence) + '</td>' + farmCell(r) + '</tr>';
    }
    document.getElementById('top10body').innerHTML = h;
  }

  var state = { q: '', cat: 'all', chain: 'all', band: 'all', conf: 'all', farm: 'all', wl: false, hideFlag: false, sort: 'rank', dir: 1 };
  var FARM_ORDER = { FARM: 0, THIN: 1, SKIP: 2 };
  var SORTS = {
    rank: function (a, b) { return (num(a.rank) || 9999) - (num(b.rank) || 9999); },
    implied: function (a, b) { return (num(b.implied_base) || 0) - (num(a.implied_base) || 0); },
    tvl: function (a, b) { return (num(b.tvl_usd) || 0) - (num(a.tvl_usd) || 0); },
    age: function (a, b) { var x = num(a.age_days), y = num(b.age_days); if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return y - x; },
    chg: function (a, b) { var x = num(a.change_7d), y = num(b.change_7d); if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return y - x; },
    farm: function (a, b) { return (FARM_ORDER[farmVerdictOf(a)] - FARM_ORDER[farmVerdictOf(b)]) || ((num(a.rank) || 9999) - (num(b.rank) || 9999)); }
  };
  function inBand(r) {
    var t = num(r.tvl_usd); if (t === null) return state.band === 'all';
    if (state.band === 'b1') return t >= 1e9;
    if (state.band === 'b2') return t >= 5e8 && t < 1e9;
    if (state.band === 'b3') return t >= 1e8 && t < 5e8;
    if (state.band === 'b4') return t >= 5e7 && t < 1e8;
    if (state.band === 'b5') return t < 5e7;
    return true;
  }
  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = rows.filter(function (r) {
      if (state.wl && !r.watchlist) return false;
      if (state.hideFlag && r.verified === false) return false;
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (state.conf !== 'all' && (r.confidence || '').toLowerCase() !== state.conf) return false;
      if (state.farm !== 'all' && farmVerdictOf(r) !== state.farm) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (!inBand(r)) return false;
      if (q && (r.name || '').toLowerCase().indexOf(q) < 0 && (r.slug || '').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    out.sort(SORTS[state.sort] || SORTS.rank);
    if (state.dir === -1) out.reverse();
    return out;
  }
  function renderBoard() {
    var list = filtered();
    var h = '';
    if (!list.length) {
      h = '<tr><td colspan="10" class="mut">No protocols match these filters. Loosen the search or reset the filters.</td></tr>';
    }
    for (var k = 0; k < list.length; k++) {
      var r = list[k];
      h += '<tr><td class="num">' + esc(r.rank) + '</td>' +
        '<td class="name">' + wlMark(r) + '<a href="' + rowLink(r) + '">' + esc(r.name) + '</a> ' + flagChip(r) +
        '<br><span class="mut" style="font-size:12px">' + esc(r.slug) + '</span></td>' +
        '<td>' + catChip(r.category) + '</td>' +
        '<td class="mut" style="font-size:12.5px">' + esc((r.chains || []).slice(0, 2).join(', ') || 'n/a') +
        ((r.chains || []).length > 2 ? ' +' + ((r.chains || []).length - 2) : '') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + pctCls(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td><span class="num"><b>' + fmtUsd(r.implied_base) + '</b></span> <span class="mut num" style="font-size:12px">' + fmtUsd(r.implied_low) + ' – ' + fmtUsd(r.implied_bull) + '</span>' +
        '<span class="bar"><i style="width:' + Math.max(2, Math.round(100 * (num(r.implied_base) || 0) / maxBase)) + '%"></i></span></td>' +
        '<td>' + confBadge(r.confidence) + '</td>' + farmCell(r) + '</tr>';
    }
    document.getElementById('tbody').innerHTML = h;
    document.getElementById('count').innerHTML = 'Showing <b>' + list.length + '</b> of <b>' + rows.length + '</b> protocols';
    var ths = document.querySelectorAll('#boardtbl th[data-sort]');
    for (var j = 0; j < ths.length; j++) {
      ths[j].classList.toggle('sorted', ths[j].getAttribute('data-sort') === state.sort);
    }
    var dirBtn = document.getElementById('f-dir');
    dirBtn.innerHTML = state.dir === 1 ? '&#8595; desc' : '&#8593; asc';
  }
  function fillSelect(id, values) {
    var sel = document.getElementById(id);
    values.forEach(function (v) {
      var o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o);
    });
  }
  (function initFilters() {
    var cats = {}, chains = {};
    rows.forEach(function (r) { if (r.category) cats[r.category] = 1; (r.chains || []).forEach(function (c) { chains[c] = 1; }); });
    fillSelect('f-cat', Object.keys(cats).sort());
    fillSelect('f-chain', Object.keys(chains).sort());
    document.getElementById('f-q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
    document.getElementById('f-cat').addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
    document.getElementById('f-chain').addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
    document.getElementById('f-band').addEventListener('change', function (e) { state.band = e.target.value; renderBoard(); });
    document.getElementById('f-conf').addEventListener('change', function (e) { state.conf = e.target.value; renderBoard(); });
    document.getElementById('f-farm').addEventListener('change', function (e) { state.farm = e.target.value; renderBoard(); });
    document.getElementById('f-wl').addEventListener('change', function (e) { state.wl = e.target.checked; renderBoard(); });
    var wl = document.getElementById('f-wl');
    var hfLab = document.createElement('label');
    hfLab.className = 'f-check';
    hfLab.innerHTML = '<input id="f-hideflag" type="checkbox"> <span>Hide flagged rows</span>';
    wl.parentNode.parentNode.insertBefore(hfLab, wl.parentNode.nextSibling);
    document.getElementById('f-hideflag').addEventListener('change', function (e) { state.hideFlag = e.target.checked; renderBoard(); });
    document.getElementById('f-sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
    document.getElementById('f-dir').addEventListener('click', function () { state.dir = -state.dir; renderBoard(); });
    document.getElementById('f-reset').addEventListener('click', function () {
      state = { q: '', cat: 'all', chain: 'all', band: 'all', conf: 'all', farm: 'all', wl: false, hideFlag: false, sort: 'rank', dir: 1 };
      document.getElementById('f-q').value = ''; document.getElementById('f-cat').value = 'all';
      document.getElementById('f-chain').value = 'all'; document.getElementById('f-band').value = 'all';
      document.getElementById('f-conf').value = 'all'; document.getElementById('f-farm').value = 'all'; document.getElementById('f-wl').checked = false;
      document.getElementById('f-hideflag').checked = false;
      document.getElementById('f-sort').value = 'rank'; renderBoard();
    });
    var ths = document.querySelectorAll('#boardtbl th[data-sort]');
    for (var j = 0; j < ths.length; j++) {
      ths[j].setAttribute('tabindex', '0');
      ths[j].setAttribute('role', 'button');
      ths[j].addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.click(); }
      });
      ths[j].addEventListener('click', function () {
        var s = this.getAttribute('data-sort');
        if (state.sort === s) state.dir = -state.dir; else { state.sort = s; state.dir = 1; }
        document.getElementById('f-sort').value = s; renderBoard();
      });
    }
  })();

  function findRow(slug) {
    for (var k = 0; k < rows.length; k++) if (rows[k].slug === slug) return rows[k];
    return null;
  }
  function renderDetail(slug) {
    var box = document.getElementById('detail');
    var r = findRow(slug);
    if (!r) {
      box.innerHTML = '<div class="panel" style="padding:18px"><h2 style="margin:0 0 6px">Protocol not found</h2>' +
        '<p class="mut">No board row has slug <span class="mono">' + esc(slug) + '</span>. ' +
        '<a href="#/board">Return to the board</a>.</p></div>';
      return;
    }
    var farm = r.farm || {};
    var steps = r.farm_steps || [];
    var risks = r.risks || [];
    var comps = (D.live || []).filter(function (c) { return c.category === r.category; })
      .sort(function (a, b) { return (num(b.mcap_usd) || 0) - (num(a.mcap_usd) || 0); }).slice(0, 5);
    var stepsHtml = steps.length
      ? '<ol class="farm">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>'
      : '<p class="mut">No farm steps recorded for this protocol.</p>';
    var risksHtml = risks.length
      ? '<ul class="risks">' + risks.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>'
      : '<p class="mut">No specific risks recorded — the generic risks still apply: a token may never launch, and points may dilute.</p>';
    var compsHtml = comps.length
      ? '<div class="tbl-wrap"><table class="tbl mini"><thead><tr><th>Live comparable</th><th class="r">TVL</th><th class="r">Mcap</th><th class="r">mcap/TVL</th></tr></thead><tbody>' +
        comps.map(function (c) {
          return '<tr><td>' + esc(c.name) + '</td><td class="r num">' + fmtUsd(c.tvl_usd) + '</td><td class="r num">' + fmtUsd(c.mcap_usd) + '</td><td class="r num">' + fmtMult(c.multiple) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="mut">No live-token comparable in this category was in the snapshot.</p>';
    var airdrop = farm.airdrop_range || 'n/a';
    var pts = farm.points || 'unknown';
    box.innerHTML =
      '<div class="panel" style="padding:18px 20px"><div class="d-head"><div>' +
      '<h2>' + wlMark(r) + esc(r.name) + '</h2>' +
      '<div class="sub2">Rank #' + esc(r.rank) + ' &middot; ' + esc(r.slug) + ' &middot; listed on DefiLlama as <span class="mono">defillama.com/protocol/' + esc(r.slug) + '</span></div>' +
      '<div class="tagrow">' + catChip(r.category) +
      (r.watchlist ? '<span class="badge high">Watchlist</span>' : '') +
      (r.verified ? '<span class="badge verified">Token status verified</span>' : '<span class="badge unverified">Token status inferred</span>') +
      confBadge(r.confidence) + farmBadge(farmVerdictOf(r)) +
      (r.chains || []).map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('') +
      '</div></div></div>' +
      '<div class="d-grid">' +
      '<div class="d-stat"><span>TVL</span><b>' + fmtUsd(r.tvl_usd) + '</b><small>7d ' + fmtPct(r.change_7d) + '</small></div>' +
      '<div class="d-stat"><span>Age, no token</span><b>' + fmtAge(r.age_days) + '</b><small>since first listed</small></div>' +
      '<div class="d-stat"><span>Multiple used</span><b>' + fmtMult(r.multiple_used) + '</b><small>mcap/TVL, category-calibrated</small></div>' +
      '<div class="d-stat"><span>Implied FDV (base)</span><b>' + fmtUsd(r.implied_base) + '</b><small>low ' + fmtUsd(r.implied_low) + ' &middot; bull ' + fmtUsd(r.implied_bull) + '</small></div>' +
      '</div>' +
      '<div class="range"><div><span>Low</span><b>' + fmtUsd(r.implied_low) + '</b></div>' +
      '<div class="mid"><span>Base</span><b>' + fmtUsd(r.implied_base) + '</b></div>' +
      '<div><span>Bull</span><b>' + fmtUsd(r.implied_bull) + '</b></div></div>' +
      '<div class="d-cols"><div class="d-sec"><h3>Farm plan</h3>' + stepsHtml +
      '<dl class="kv"><dt>Capital</dt><dd class="num">' + (farm.capital_usd != null ? fmtUsd(farm.capital_usd) : 'n/a') + '</dd>' +
      '<dt>Duration</dt><dd>' + esc(farm.duration || 'n/a') + '</dd>' +
      '<dt>Points program</dt><dd>' + esc(pts) + '</dd>' +
      '<dt>Implied airdrop slice</dt><dd class="num">' + esc(airdrop) + '</dd></dl>' +
      '<p class="mut" style="font-size:12.5px">The airdrop slice is the implied FDV times the share a community allocation usually takes (5–25%). Points outstanding are unknown, so no per-user value is claimed.</p></div>' +
      '<div class="d-sec"><h3>Why this multiple</h3>' + compsHtml +
      (r.factor_used != null ? '<dl class="kv" style="margin:12px 0 0"><dt>Category factor (damped)</dt><dd class="num">' + fmtMult(r.factor_used) + '</dd></dl>' : '') +
      '<h3 style="margin-top:16px">Risks</h3>' + risksHtml + '</div></div></div>';
  }

  function calChart() {
    var m = D.model || {}, fp = m.fitPoints, ll = m.loglog, a, b;
    var noPts = '<p class="mut">No calibration points in data.</p>';
    if (!fp || !fp.length || !ll || (a = num(ll.a)) === null || (b = num(ll.b)) === null) return noPts;
    var L = 58, T = 12, w = 640 - L - 12, h = 360 - T - 34, Hb = T + h;
    var mnx = 1 / 0, mxx = 0, mny = 1 / 0, mxy = 0, i, p, x, y;
    for (i = 0; i < fp.length; i++) {
      p = fp[i]; x = num(p[0]); y = num(p[1]);
      if (x > 0 && y > 0) { if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; }
    }
    if (!(mxx > mnx) || !(mxy > mny)) return noPts;
    var x0 = Math.floor(Math.log10(mnx)), x1 = Math.ceil(Math.log10(mxx)), y0 = Math.floor(Math.log10(mny)), y1 = Math.ceil(Math.log10(mxy));
    function X(v){return L+(Math.log10(v)-x0)/(x1-x0)*w;}
    function Y(v){return T+h-(Math.log10(v)-y0)/(y1-y0)*h;}
    var s = '<svg viewBox="0 0 640 360" class="chart">', t, py, p10;
    for (t = x0; t <= x1; t++) { p10 = Math.pow(10, t); s += '<text x="' + X(p10) + '" y="' + (Hb + 16) + '" class="ax">' + fmtUsd(p10) + '</text>'; }
    for (t = y0; t <= y1; t++) { p10 = Math.pow(10, t); py = Y(p10); s += '<line x1="' + L + '" y1="' + py + '" x2="' + (L + w) + '" y2="' + py + '" class="grid"/><text x="' + (L - 6) + '" y="' + (py + 4) + '" class="ay">' + fmtUsd(p10) + '</text>'; }
    s += '<line x1="' + X(mnx) + '" y1="' + Y(Math.exp(a + b * Math.log(mnx))) + '" x2="' + X(mxx) + '" y2="' + Y(Math.exp(a + b * Math.log(mxx))) + '" class="fit"/>';
    for (i = 0; i < fp.length; i++) {
      p = fp[i]; x = num(p[0]); y = num(p[1]);
      if (x > 0 && y > 0) s += '<circle cx="' + X(x) + '" cy="' + Y(y) + '" r="3" fill="' + catColor(p[2] || 'Other') + '"/>';
    }
    return s + '</svg><p class="mut" style="font-size:13px;margin:10px 0 0">Dots: the ' + fp.length + ' live comps, log–log, by category. Line: log(mcap) = ' + a.toFixed(4) + ' + ' + b.toFixed(4) + ' &middot; log(TVL).</p>';
  }

  function renderModel() {
    var m = D.model || {};
    var aud = D.audit || {};
    var mults = m.categoryMultiples || {};
    var multRows = Object.keys(mults).sort().map(function (k) {
      var v = num(mults[k]);
      var d = v === null ? null : (k === 'Risk Curators' || k === 'Onchain Capital Allocator' ? 0.5 : Math.pow(v, 0.5));
      return '<tr><td>' + esc(k) + '</td><td class="r num">' + fmtMult(d) + '</td></tr>';
    }).join('');
    var excl = (aud.excluded || []).map(function (e) {
      return '<li><b>' + esc(e.reason) + '</b> — ' + esc(e.count) + ' protocols' +
        (e.examples && e.examples.length ? ' <span class="mut">(e.g. ' + e.examples.map(esc).join(', ') + ')</span>' : '') + '</li>';
    }).join('');
    var loo = m.loo || {};
    var cf = aud.counterfactual;
    var cfHtml = '';
    if (cf && cf.top_name && num(cf.top_value_usd) !== null && cf.above_top10 != null && cf.excluded_count != null) {
      cfHtml = '<p class="cf">Scored naively, the ' + cf.excluded_count + ' excluded protocols would take the top of the board — ' + esc(cf.top_name) + ' would rank #1 at ' + fmtUsd(cf.top_value_usd) + '; ' + cf.above_top10 + ' of them would beat today&rsquo;s #10. They are excluded because a CEX balance, a wrapped asset or a bridge is not a token launch, however large its TVL.</p>';
    }
    document.getElementById('model').innerHTML =
      '<div class="m-grid">' +
      '<div class="panel" style="padding:16px 18px"><div class="panel-h" style="padding:0 0 8px"><h2>How the implied value is built</h2></div>' +
      '<div class="formula">' + esc(m.formula || 'implied FDV = TVL x category multiple x stage discount') + '</div>' +
      '<p class="mut" style="font-size:13.5px;margin:12px 0 0">The multiple is <b style="color:var(--ink)">not a flat guess</b>: it is fitted from the ' +
      'snapshot&rsquo;s own live-token protocols — a log-log size curve (smaller protocols command higher ' +
      'multiples) times a category multiplier. One model drives this page and board.json, so the numbers agree.</p>' +
      '<dl class="kv" style="margin-top:14px">' +
      '<dt>Model</dt><dd class="mono">' + esc(m.name || 'n/a') + '</dd>' +
      '<dt>Log-log fit</dt><dd class="mono">log(mcap) = ' + (m.loglog ? m.loglog.a + ' + ' + m.loglog.b + ' &middot; log(TVL)' : 'n/a') + '</dd>' +
      '<dt>Stage discount</dt><dd class="mono">' + (m.stageDiscount != null ? m.stageDiscount : 'n/a') + ' (pre-token execution risk)</dd>' +
      '<dt>Backtest (leave-one-out)</dt><dd class="mono">' + (loo.n != null ? loo.n + ' live-token comps &middot; MAPE ' + (loo.mape != null ? (loo.mape * 100).toFixed(1) + '%' : 'n/a') + ' &middot; median |log error| ' + (loo.medianAbsLogErr != null ? loo.medianAbsLogErr.toFixed(2) : 'n/a') : 'n/a') + '</dd>' +
      '<dt>Comparables used</dt><dd class="mono">' + ((m.comps || []).length) + ' live-token protocols</dd></dl>' +
      '<h3 style="margin:16px 0 8px;font-size:14px;color:var(--acc)">Category multiples (mcap / TVL, damped &gamma;=0.5)</h3>' +
      (multRows ? '<div class="tbl-wrap"><table class="tbl mini"><thead><tr><th>Category</th><th class="r">Multiple</th></tr></thead><tbody>' + multRows + '</tbody></table></div>' : '<p class="mut">No category multiples in data.</p>') +
      '</div>' +
      '<div class="panel" style="padding:16px 18px"><div class="panel-h" style="padding:0 0 8px"><h2>Audit — what was counted, what was cut</h2></div>' +
      '<dl class="kv">' +
      '<dt>Snapshot protocols</dt><dd class="num">' + esc(aud.total != null ? aud.total : 'n/a') + '</dd>' +
      '<dt>Pre-token</dt><dd class="num">' + esc(aud.preToken != null ? aud.preToken : 'n/a') + '</dd>' +
      '<dt>Already have a token</dt><dd class="num">' + esc(aud.withToken != null ? aud.withToken : 'n/a') + '</dd>' +
      '<dt>Watchlist</dt><dd class="num">' + esc(aud.watchlist != null ? aud.watchlist : 'n/a') + '</dd>' +
      '<dt>Board rows</dt><dd class="num">' + esc(aud.boardRows != null ? aud.boardRows : rows.length) + '</dd></dl>' +
      '<h3 style="margin:16px 0 8px;font-size:14px;color:var(--acc)">Excluded — and why</h3>' +
      (excl ? '<ul class="excl">' + excl + '</ul>' : '<p class="mut">No exclusions recorded.</p>') +
      '<p class="mut" style="font-size:13px;margin-top:14px">Exclusion is the credibility test: a CEX balance, a wrapped asset or a versioned ' +
      'sub-entry of a protocol whose token already trades is not a token launch, however large its TVL. ' +
      'Every excluded protocol is counted above with its reason.</p>' + cfHtml + '</div>' +
      '</div>' +
      '<div class="panel" style="padding:16px 18px;margin-top:16px"><h2 style="margin:0 0 8px;font-size:15px">Calibration chart</h2>' + calChart() + '</div>';
  }

  function renderComps() {
    var live = (D.live || []).slice().sort(function (a, b) { return (num(b.mcap_usd) || 0) - (num(a.mcap_usd) || 0); });
    var h = '<div class="panel" style="padding:16px 18px"><div class="panel-h" style="padding:0 0 8px"><h2>Live-token comparables</h2><span class="hint">' + live.length + ' protocols with a trading token, from the same snapshot</span></div>' +
      '<p class="mut" style="font-size:13.5px;margin:0 0 12px">These are the protocols the multiples were fitted from. ' +
      'A pre-token protocol is valued by what the market already pays, per dollar of TVL, for a live token in the same category and size band — not by a flat rule.</p>';
    if (!live.length) {
      h += '<p class="mut">No live-token comparables in data.</p></div>';
    } else {
      h += '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Protocol</th><th>Category</th><th class="r">TVL</th><th class="r">Mcap</th><th class="r">mcap/TVL</th></tr></thead><tbody>' +
        live.map(function (c) {
          return '<tr><td class="name">' + esc(c.name) + '</td><td>' + catChip(c.category) + '</td>' +
            '<td class="r num">' + fmtUsd(c.tvl_usd) + '</td><td class="r num">' + fmtUsd(c.mcap_usd) + '</td>' +
            '<td class="r num"><b>' + fmtMult(c.multiple) + '</b></td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    document.getElementById('comps').innerHTML = h;
  }

  var views = ['board', 'detail', 'model', 'comps'];
  function route() {
    var hash = (window.location.hash || '').replace(/^#\/?/, '');
    var view = 'board', slug = null;
    if (hash === 'model') view = 'model';
    else if (hash === 'comps') view = 'comps';
    else if (hash.indexOf('protocol/') === 0) { view = 'detail'; slug = decodeURIComponent(hash.slice(9)); }
    views.forEach(function (v) {
      var el = document.getElementById('view-' + v);
      if (el) el.hidden = (v !== view);
    });
    var tabs = document.querySelectorAll('.tabs a');
    for (var j = 0; j < tabs.length; j++) {
      tabs[j].classList.toggle('on', tabs[j].getAttribute('data-view') === (view === 'detail' ? 'board' : view));
    }
    if (view === 'detail') renderDetail(slug);
    if (view === 'model') renderModel();
    if (view === 'comps') renderComps();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  renderStats();
  renderTop10();
  renderBoard();
  route();
})();
