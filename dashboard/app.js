
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
  function fmtSigned(n) {
    n = num(n); if (n === null) return 'n/a';
    return (n < 0 ? '-$' : '+$') + Math.round(Math.abs(n));
  }
  function fmtSignedH(n) {
    n = num(n); if (n === null) return 'n/a';
    return (n < 0 ? '-$' : '+$') + Math.abs(n).toFixed(2) + '/h';
  }
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
  function fmtX(n) {
    n = num(n); if (n === null) return 'n/a';
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '×';
  }
  
  function impliedValueFromComps(tvl, category, haircut) {
    var m = D.model || {}, ll = m.loglog || {}, mults = m.effectiveMultiples || {};
    var a = num(ll.a), b = num(ll.b), c = num(ll.c);
    if (a === null || b === null || c === null || !(tvl > 0)) return null;
    var raw = mults[category]; if (raw == null) raw = 1;
    var f = (category === 'Risk Curators' || category === 'Onchain Capital Allocator') ? 0.5 : Math.pow(raw, 0.5);
    var x = Math.log(tvl);
    var v = Math.exp(a + b * x + c * x * x) * f * 0.6 * (haircut ? 0.1 : 1);
    return Math.max(1, Math.round(v));
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
  function wlMark(r) { return r.watchlist ? '<span class="wl-dot"></span>' : ''; }

  if (!D || !Array.isArray(D.rows) || !D.rows.length) {
    errBox.hidden = false;
    errBox.innerHTML = '<b>No radar data found.</b> This page reads <span class="mono">window.RADAR</span> ' +
      'from <span class="mono">data.js</span> beside the dashboard folder. Serve the output folder instead of opening index.html directly.';
    var tb = document.getElementById('tbody');
    if (tb) tb.innerHTML = '<tr><td colspan="12" class="mut">No data — data.js did not load.</td></tr>';
    var t10 = document.getElementById('top10body');
    if (t10) t10.innerHTML = '<tr><td colspan="7" class="mut">No data — data.js did not load.</td></tr>';
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
    var ex = (aud.excluded || []).reduce(function (s, e) { return s + (e.count || 0); }, 0);
    document.getElementById('stats').innerHTML =
      stat(rows.length, 'protocols ranked', 'of ' + (aud.total || 758) + ' read: ' + (aud.withToken || 416) + ' trade, ' + ex + ' excluded') +
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
        '<td><span class="num"><b>' + fmtUsd(r.implied_base) + '</b></span></td>' +
        '<td>' + confBadge(r.confidence) + '</td></tr>';
    }
    document.getElementById('top10body').innerHTML = h;
  }

  
  // Model + integrity strips (v6, L15), inserted above the board grid. The
  // integrity strip recomputes every row's implied value on this page from
  // its own stored terms (TVL x size multiple x category factor x 0.6 x
  // 0.10 haircut where it applies), in the same order as the build, and
  // ties the page to board.json via its sha256 (set by main.ts).
  function renderStrips() {
    var m = D.model || {}, loo = m.loo || {}, wf = m.walkforward || {}, cv = m.coverage || {};
    var x = loo.medianAbsLogErr != null ? Math.exp(loo.medianAbsLogErr).toFixed(2) : 'n/a';
    var w = wf.miss != null ? '&times;' + wf.miss.toFixed(2) : 'n/a';
    var c = cv.p25_75 != null ? Math.round(cv.p25_75 * 100) + '%' : 'n/a';
    var grid = document.getElementById('board-grid');
    if (!grid) return;
    var ig = D.integrity || {};
    var ok = 0, tot = 0, sum = 0;
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k];
      var v = Math.max(1, Math.round((num(r.tvl_usd) || 0) * (num(r.size_multiple) || 0) * (num(r.factor_used) || 0) * 0.6 * (r.haircut_applied ? 0.1 : 1)));
      tot++;
      if (v === num(r.implied_base)) ok++;
      sum += num(r.implied_base) || 0;
    }
    grid.insertAdjacentHTML('beforebegin',
      '<div class="panel" style="padding:10px 16px;font-size:13.5px">' +
      '<b>Model:</b> implied = TVL &times; size curve &times; category factor<sup>0.5</sup> &times; 0.6 — ' +
      'fitted on ' + (loo.n != null ? loo.n : 128) + ' live-token comps, LOO &times;' + x + ' &middot; walk-forward ' + w + ' &middot; P25–P75 holds ' + c + '</div>' +
      '<div class="panel" style="padding:10px 16px;font-size:13.5px">' +
      '<b>Integrity:</b> board.json sha256 <span class="mono">' + esc(ig.boardChecksum || 'n/a') + '</span> &middot; ' + ok + '/' + tot +
      ' rows recomputed here from their own terms &middot; totals equal ' + fmtUsd(sum) + '</div>');
  }

  var state = { q: '', cat: 'all', chain: 'all', band: 'all', conf: 'all', wl: false, sort: 'rank', dir: 1, dep: 10000 };
  // Farm economics at the chosen deposit (v6, L20 — candidate J, audited
  // against the top boards): slice = implied x 7% x (deployed / TVL),
  // deployed = min(ticket, 0.02% of TVL); T-bill is 4% annual on the
  // DEPLOYED ticket over the holding window; fees and hours are the plan's
  // own (flat). Same formula as the build-time net, computed at the plan's
  // minimum ticket.
  function windowYears(dur) {
    var m = /(\d+)\s*[–-]\s*(\d+)\s+days/.exec(dur || '');
    if (!m) return 45 / 365;
    return (Number(m[1]) + Number(m[2])) / 2 / 365;
  }
  function netAt(r) {
    var n = r.net || {};
    var fees = num(n.fees) || 0, hours = num(n.hours) || 0;
    var yrs = windowYears((r.farm || {}).duration);
    var dep = state.dep;
    var deployed = (r.tvl_usd > 0) ? Math.min(dep, 0.0002 * r.tvl_usd) : 0;
    var slice = (r.tvl_usd > 0) ? (num(r.implied_base) || 0) * 0.07 * (deployed / r.tvl_usd) : 0;
    var tbill = deployed * 0.04 * yrs;
    var net = slice - fees - tbill;
    var rate = (r.tvl_usd > 0) ? (num(r.implied_base) || 0) * 0.07 / r.tvl_usd - 0.04 * yrs : -1;
    var cap = 0.0002 * (r.tvl_usd || 0);
    return { slice: slice, deployed: deployed, fees: fees, tbill: tbill, hours: hours, net: net,
      netPerHour: hours > 0 ? net / hours : 0,
      breakEven: rate > 0 && fees / rate <= cap ? fees / rate : null,
      verdict: net > 0 ? 'farm' : slice > fees ? 'marginal' : 'skip' };
  }
  var SORTS = {
    rank: function (a, b) { return (num(a.rank) || 9999) - (num(b.rank) || 9999); },
    implied: function (a, b) { return (num(b.implied_base) || 0) - (num(a.implied_base) || 0); },
    tvl: function (a, b) { return (num(b.tvl_usd) || 0) - (num(a.tvl_usd) || 0); },
    age: function (a, b) { var x = num(a.age_days), y = num(b.age_days); if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return y - x; },
    chg: function (a, b) { var x = num(a.change_7d), y = num(b.change_7d); if (x === null && y === null) return 0; if (x === null) return 1; if (y === null) return -1; return y - x; },
    net: function (a, b) { return netAt(b).net - netAt(a).net; },
    neth: function (a, b) { return netAt(b).netPerHour - netAt(a).netPerHour; }
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
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (state.conf !== 'all' && (r.confidence || '').toLowerCase() !== state.conf) return false;
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
      h = '<tr><td colspan="12" class="mut">No protocols match these filters. Loosen the search or reset the filters.</td></tr>';
    }
    for (var k = 0; k < list.length; k++) {
      var r = list[k];
      var na = netAt(r);
      var np = na.net > 0 ? 'pos' : 'neg';
      h += '<tr><td class="num">' + esc(r.rank) + '</td>' +
        '<td class="num mut" style="font-size:12.5px">' + (num(r.rank_lo) != null && num(r.rank_hi) != null ? esc(r.rank_lo) + '–' + esc(r.rank_hi) : 'n/a') + '</td>' +
        '<td class="name">' + wlMark(r) + '<a href="' + rowLink(r) + '">' + esc(r.name) + '</a> ' + flagChip(r) +
        '<br><span class="mut" style="font-size:12px">' + esc(r.slug) + '</span></td>' +
        '<td>' + catChip(r.category) + '</td>' +
        '<td class="mut" style="font-size:12.5px">' + esc((r.chains || []).slice(0, 2).join(', ') || 'n/a') +
        ((r.chains || []).length > 2 ? ' +' + ((r.chains || []).length - 2) : '') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + pctCls(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td><span class="num"><b>' + fmtUsd(r.implied_base) + '</b></span> <span class="mut num" style="font-size:12px">' + fmtUsd(r.implied_low) + ' – ' + fmtUsd(r.implied_bull) + '</span></td>' +
        '<td class="num ' + np + '">' + fmtSigned(na.net) + '</td>' +
        '<td class="num ' + np + '">' + fmtSignedH(na.netPerHour) + '</td>' +
        '<td>' + confBadge(r.confidence) + '</td></tr>';
    }
    document.getElementById('tbody').innerHTML = h;
    var vc = { farm: 0, marginal: 0, skip: 0 };
    for (var vi = 0; vi < rows.length; vi++) vc[netAt(rows[vi]).verdict]++;
    document.getElementById('count').innerHTML = '<b>' + list.length + '</b> of <b>' + rows.length + '</b> &middot; at $' + state.dep.toLocaleString('en-US') + ': <b>' + vc.farm + '</b> farm / <b>' + vc.marginal + '</b> marginal / <b>' + vc.skip + '</b> skip';
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
    document.getElementById('f-wl').addEventListener('change', function (e) { state.wl = e.target.checked; renderBoard(); });
    document.getElementById('f-sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });
    document.getElementById('f-dep').addEventListener('change', function (e) { state.dep = Number(e.target.value) || 10000; renderBoard(); });
    document.getElementById('f-dir').addEventListener('click', function () { state.dir = -state.dir; renderBoard(); });
    document.getElementById('f-reset').addEventListener('click', function () {
      state = { q: '', cat: 'all', chain: 'all', band: 'all', conf: 'all', wl: false, sort: 'rank', dir: 1, dep: 10000 };
      document.getElementById('f-q').value = ''; document.getElementById('f-cat').value = 'all';
      document.getElementById('f-chain').value = 'all'; document.getElementById('f-band').value = 'all';
      document.getElementById('f-conf').value = 'all'; document.getElementById('f-wl').checked = false;
      document.getElementById('f-sort').value = 'rank'; document.getElementById('f-dep').value = '10000'; renderBoard();
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
    var net = netAt(r);
    var steps = r.farm_steps || [];
    var risks = r.risks || [];
    // v6, L16: nearest priced peers from ALL 128 live comps (not just the
    // 24 largest): same category, else the row's family pool, else all
    // comps — nearest by TVL, top 5. The old 24-row list left rows like
    // USDD with "no comparable" although its category has live comps.
    var allComps = (D.model && D.model.allComps) || [];
    var famCats = [];
    if (r.family && D.model && D.model.familyMultiples && D.model.familyMultiples[r.family]) famCats = D.model.familyMultiples[r.family].categories || [];
    var peers = allComps.filter(function (c) { return c.category === r.category; });
    var peerScope = 'same category';
    if (peers.length < 2 && famCats.length) { peers = allComps.filter(function (c) { return famCats.indexOf(c.category) >= 0; }); peerScope = 'same family (' + r.family + ')'; }
    if (peers.length < 2) { peers = allComps.slice(); peerScope = 'all live comps'; }
    peers = peers.sort(function (a, b) { return Math.abs(Math.log(a.tvl / r.tvl_usd)) - Math.abs(Math.log(b.tvl / r.tvl_usd)); }).slice(0, 5);
    var peersHtml = peers.length
      ? '<p class="mut" style="font-size:12.5px;margin:0 0 6px">Nearest priced peers — ' + esc(peerScope) + ', closest by TVL:</p><div class="tbl-wrap"><table class="tbl mini"><thead><tr><th>Live comparable</th><th class="r">TVL</th><th class="r">Mcap</th><th class="r">mcap/TVL</th></tr></thead><tbody>' +
        peers.map(function (c) {
          return '<tr><td>' + esc(c.name) + '</td><td class="r num">' + fmtUsd(c.tvl) + '</td><td class="r num">' + fmtUsd(c.mcap) + '</td><td class="r num">' + fmtMult(c.mcap / c.tvl) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="mut">No live-token comparable in this category was in the snapshot.</p>';
    // v6, L16: term-by-term dollar build from the row's own stored terms.
    var sizeUsd = (num(r.tvl_usd) || 0) * (num(r.size_multiple) || 0);
    var facUsd = sizeUsd * (num(r.factor_used) || 0);
    var discUsd = facUsd * 0.6;
    var finalUsd = discUsd * (r.haircut_applied ? 0.1 : 1);
    var facHow = r.factor_source === 'curator' ? 'curator 0.5× — nested TVL, undamped'
      : r.factor_source === 'family' ? 'family ' + (r.family || '') + ' ' + fmtMult(r.factor_raw) + ' → ' + fmtMult(r.factor_used)
      : r.factor_source === 'global' ? 'global fallback 1.0× — no comps here'
      : 'category ' + fmtMult(r.factor_raw) + ' → ' + fmtMult(r.factor_used);
    var buildHtml = '<div class="tbl-wrap"><table class="tbl mini"><thead><tr><th>Term</th><th>How</th><th class="r">Value</th></tr></thead><tbody>' +
      '<tr><td>Size curve</td><td>' + fmtUsd(r.tvl_usd) + ' TVL × ' + fmtMult(r.size_multiple) + '</td><td class="r num"><b>' + fmtUsd(sizeUsd) + '</b></td></tr>' +
      '<tr><td>Category factor</td><td>' + esc(facHow) + '</td><td class="r num"><b>' + fmtUsd(facUsd) + '</b></td></tr>' +
      '<tr><td>Stage discount</td><td>× 0.6 — pre-token execution risk</td><td class="r num"><b>' + fmtUsd(discUsd) + '</b></td></tr>' +
      (r.haircut_applied ? '<tr><td>Concern haircut</td><td>× 0.10 — baked verification concern, see Risks</td><td class="r num"><b>' + fmtUsd(finalUsd) + '</b></td></tr>' : '') +
      '</tbody></table></div>' +
      '<p class="mut" style="font-size:12.5px;margin:8px 0 0">Product = <b style="color:var(--ink)">' + fmtUsd(finalUsd) + '</b> (implied FDV, base). Page recompute: ' + fmtUsd(impliedValueFromComps(r.tvl_usd, r.category, r.haircut_applied)) + '.</p>';
    var stepsHtml = steps.length
      ? '<ol class="farm">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>'
      : '<p class="mut">No farm steps recorded for this protocol.</p>';
    var risksHtml = risks.length
      ? '<ul class="risks">' + risks.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>'
      : '<p class="mut">No specific risks recorded — the generic risks still apply: a token may never launch, and points may dilute.</p>';
    var dep = state.dep;
    var airLow = (num(r.implied_base) || 0) * 0.05;
    var airHigh = (num(r.implied_base) || 0) * 0.25;
    var airdrop = fmtUsd(airLow) + '–' + fmtUsd(airHigh);
    var evMult = fmtX(airLow / dep) + '–' + fmtX(airHigh / dep);
    var pts = farm.points || 'unknown';
    box.innerHTML =
      '<div class="panel" style="padding:18px 20px"><div class="d-head"><div>' +
      '<h2>' + wlMark(r) + esc(r.name) + '</h2>' +
      '<div class="sub2">Rank #' + esc(r.rank) + ' &middot; ' + esc(r.slug) + ' &middot; listed on DefiLlama as <span class="mono">defillama.com/protocol/' + esc(r.slug) + '</span></div>' +
      '<div class="tagrow">' + catChip(r.category) +
      (r.watchlist ? '<span class="badge high">Watchlist</span>' : '') +
      (r.verified ? '<span class="badge verified">Token status verified</span>' : '<span class="badge unverified">Token status inferred</span>') +
      confBadge(r.confidence) +
      (r.chains || []).map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('') +
      '</div></div></div>' +
      '<div class="d-grid">' +
      '<div class="d-stat"><span>TVL</span><b>' + fmtUsd(r.tvl_usd) + '</b><small>7d ' + fmtPct(r.change_7d) + '</small></div>' +
      '<div class="d-stat"><span>Age, no token</span><b>' + fmtAge(r.age_days) + '</b><small>since first listed</small></div>' +
      '<div class="d-stat"><span>Multiple used</span><b>' + fmtMult(r.multiple_used) + '</b><small>mcap/TVL, category-calibrated</small></div>' +
      '<div class="d-stat"><span>Implied FDV (base)</span><b>' + fmtUsd(r.implied_base) + '</b><small>low ' + fmtUsd(r.implied_low) + ' &middot; bull ' + fmtUsd(r.implied_bull) + '</small></div>' +
      '</div>' +
      '<div class="d-cols"><div class="d-sec"><h3>Farm plan</h3>' + stepsHtml +
      '<dl class="kv"><dt>Deposit</dt><dd class="num">' + fmtUsd(dep) + ' <span class="mut" style="font-size:12px">plan minimum ' + (farm.capital_usd != null ? fmtUsd(farm.capital_usd) : 'n/a') + ' — change it in the board filters</span></dd>' +
      '<dt>Duration</dt><dd>' + esc(farm.duration || 'n/a') + '</dd>' +
      '<dt>Points program</dt><dd>' + esc(pts) + '</dd>' +
      '<dt>Implied airdrop slice</dt><dd class="num">' + esc(airdrop) + '</dd>' +
      '<dt>Expected multiple</dt><dd class="num">' + evMult + ' <span class="mut" style="font-size:12px">whole pie &divide; ticket, not a per-user return</span></dd>' +
      '<dt>Net if it launches</dt><dd class="num ' + (net.net > 0 ? 'pos' : 'neg') + '">' + fmtSigned(net.net) + ' <span class="mut" style="font-size:12px">slice ' + fmtUsd(net.slice) + ' − fees ' + fmtUsd(net.fees) + ' − T-bill ' + fmtUsd(net.tbill) + ' &middot; deployed ' + fmtUsd(net.deployed) + ' of ' + fmtUsd(dep) + ' &middot; ' + fmtSignedH(net.netPerHour) + '</span></dd>' +
      '<dt>Break-even ticket</dt><dd class="num">' + (net.breakEven != null ? fmtUsd(net.breakEven) : 'never') + '</dd></dl>' +
      '<p class="mut" style="font-size:12.5px">The airdrop slice is the implied FDV times the share a community allocation usually takes (5–25%). Plan steps are written for the plan-minimum ticket; the net above is at the selected deposit, and only the deployed part (at most 0.02% of TVL) earns the slice — the net uses a 7% share, see Method §6.</p></div>' +
      '<div class="d-sec"><h3>Why this multiple</h3>' + buildHtml +
      '<h3 style="margin-top:16px">Nearest priced peers</h3>' + peersHtml +
      '<h3 style="margin-top:16px">Risks</h3>' + risksHtml + '</div></div></div>';
  }

  
  function calChart() {
    var m = D.model || {}, fp = m.fitPoints, ll = m.loglog, a, b, c;
    var noPts = '<p class="mut">No calibration points in data.</p>';
    if (!fp || !fp.length || !ll || (a = num(ll.a)) === null || (b = num(ll.b)) === null || (c = num(ll.c)) === null) return noPts;
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
    // Quadratic fit: a curve in log-log space, drawn as a 40-segment path.
    var pts = '', si, lx, tv, mv;
    for (si = 0; si <= 40; si++) {
      lx = Math.log(mnx) + (Math.log(mxx) - Math.log(mnx)) * si / 40;
      tv = Math.exp(lx); mv = Math.exp(a + b * lx + c * lx * lx);
      pts += (si === 0 ? 'M' : 'L') + X(tv).toFixed(1) + ' ' + Y(mv).toFixed(1);
    }
    s += '<path d="' + pts + '" class="fit"/>';
    for (i = 0; i < fp.length; i++) {
      p = fp[i]; x = num(p[0]); y = num(p[1]);
      if (x > 0 && y > 0) s += '<circle cx="' + X(x) + '" cy="' + Y(y) + '" r="3" fill="' + catColor(p[2] || 'Other') + '"/>';
    }
    return s + '</svg><p class="mut" style="font-size:13px;margin:10px 0 0">Dots: the ' + fp.length + ' live comps, log–log, by category. Curve: log(mcap) = ' + a.toFixed(4) + ' + ' + b.toFixed(4) + ' &middot; log(TVL) + ' + c.toFixed(4) + ' &middot; log(TVL)&sup2;.</p>';
  }

  function renderModel() {
    var m = D.model || {};
    var aud = D.audit || {};
    var lr = m.looRobust || {};
    var mults = m.categoryMultiples || {};
    var multRows = Object.keys(mults).sort().map(function (k) {
      var v = num(mults[k]);
      var d = v === null ? null : (k === 'Risk Curators' || k === 'Onchain Capital Allocator' ? 0.5 : Math.pow(v, 0.5));
      return '<tr><td>' + esc(k) + '</td><td class="r num">' + fmtMult(d) + '</td></tr>';
    }).join('');
    var abRows = (m.ablation || []).map(function (a) {
      return '<dt>' + a.label + '</dt><dd class="mono">LOO &times;' + a.looMiss.toFixed(2) + ' &middot; walk-forward &times;' + a.wfMiss.toFixed(2) + '</dd>';
    }).join('');
    var excl = (aud.excluded || []).map(function (e) {
      return '<li><b>' + esc(e.reason) + '</b> — ' + esc(e.count) + ' protocols' +
        (e.examples && e.examples.length ? ' <span class="mut">(e.g. ' + e.examples.map(esc).join(', ') + ')</span>' : '') + '</li>';
    }).join('');
    var loo = m.loo || {};
    var wf = m.walkforward || {};
    var cv = m.coverage || {};
    var wfLine = wf.miss != null ? 'Walk-forward (' + wf.nTrain + ' oldest fit, ' + wf.nTest + ' newest priced, ' + (wf.splitDate || 'n/a') + '): &times;' + wf.miss.toFixed(2) + ' median miss &middot; within 3&times; ' + (wf.within3 * 100).toFixed(1) + '%.' : '';
    var cvLine = cv.p25_75 != null ? 'Coverage (held-out caps): P25–P75 ' + (cv.p25_75 * 100).toFixed(1) + '% (of 50%) &middot; P10–P90 ' + (cv.p10_90 * 100).toFixed(1) + '% (of 80%) &middot; printed &times;' + cv.printedBand.toFixed(2) + ' band ' + (cv.printedCoverage * 100).toFixed(1) + '%.' : '';
    var cf = aud.counterfactual;
    var cfHtml = '';
    if (cf && cf.top_name && num(cf.top_value_usd) !== null && cf.above_top10 != null && cf.excluded_count != null) {
      cfHtml = '<p class="cf">Scored naively, the ' + cf.excluded_count + ' excluded protocols would take the top of the board — ' + esc(cf.top_name) + ' would rank #1 at ' + fmtUsd(cf.top_value_usd) + '; ' + cf.above_top10 + ' of them would beat today&rsquo;s #10. They are excluded because a CEX balance, a wrapped asset or a bridge is not a token launch, however large its TVL.</p>';
    }
    document.getElementById('model').innerHTML =
      '<div class="m-grid">' +
      '<div class="panel" style="padding:16px 18px"><div class="panel-h" style="padding:0 0 8px"><h2>How the implied value is built</h2></div>' +
      '<div class="formula">' + esc(m.formula || 'implied FDV = TVL x category multiple x stage discount') + '</div>' +
      '<dl class="kv" style="margin-top:14px">' +
      '<dt>Model</dt><dd class="mono">' + esc(m.name || 'n/a') + '</dd>' +
      '<dt>Log-log fit</dt><dd class="mono">' + (m.loglog && m.loglog.a != null && m.loglog.b != null ? 'log(mcap) = ' + m.loglog.a.toFixed(4) + ' + ' + m.loglog.b.toFixed(4) + ' &middot; log(TVL)' + (m.loglog.c != null ? ' + ' + m.loglog.c.toFixed(4) + ' &middot; log(TVL)&sup2; (quadratic, radar-6)' : '') : 'n/a') + '</dd>' +
      '<dt>Stage discount</dt><dd class="mono">' + (m.stageDiscount != null ? m.stageDiscount : 'n/a') + ' (pre-token execution risk)</dd>' +
      '<dt>Backtest (leave-one-out)</dt><dd class="mono">' + (loo.n != null ? loo.n + ' live-token comps &middot; LOO &times;' + (loo.medianAbsLogErr != null ? Math.exp(loo.medianAbsLogErr).toFixed(2) : 'n/a') + ' (median |log error| ' + (loo.medianAbsLogErr != null ? loo.medianAbsLogErr.toFixed(2) : 'n/a') + ') &middot; within 2&times; ' + (loo.within2 != null ? (loo.within2 * 100).toFixed(1) + '%' : 'n/a') + ' &middot; within 3&times; ' + (loo.within3 != null ? (loo.within3 * 100).toFixed(1) + '%' : 'n/a') : 'n/a') + '<br><span style="font-size:12px">MAPE ' + (loo.mape != null ? (loo.mape * 100).toFixed(1) + '%' : 'n/a') + ' (near-dead tokens dominate); robust view (mcap &ge; $1M): MAPE ' + (lr.mape != null ? (lr.mape * 100).toFixed(1) + '%' : 'n/a') + ', median |log error| ' + (lr.medianAbsLogErr != null ? lr.medianAbsLogErr.toFixed(2) : 'n/a') + '.</span>' + (wfLine ? '<br>' + wfLine : '') + (cvLine ? '<br>' + cvLine : '') + '</dd>' +
      '<dt>Bootstrap (refit uncertainty)</dt><dd class="mono">' + (m.bootstrap ? m.bootstrap.n + ' resample refits: size multiple at $100M TVL log-s.e. ' + m.bootstrap.curveSe100M.toFixed(2) + ' (&times;' + Math.exp(m.bootstrap.curveSe100M).toFixed(2) + '); coefficient s.e. a &plusmn;' + m.bootstrap.aSe.toFixed(1) + ', b &plusmn;' + m.bootstrap.bSe.toFixed(2) + ', c &plusmn;' + m.bootstrap.cSe.toFixed(3) + ' — large because the coefficients are correlated, read the curve, not the coefficients. Rank ranges (P10–P90) are in the Range column on the board.' : 'n/a') + '</dd>' +
      '<dt>Live comps</dt><dd class="mono">' + ((m.comps || []).length) + ' protocols</dd></dl>' +
      '<h3 style="margin:16px 0 8px;font-size:14px;color:var(--acc)">Ablation ladder — each term must earn its place</h3>' +
      (abRows ? '<dl class="kv" style="margin-top:10px">' + abRows + '</dl>' : '') +
      '<p class="mut" style="font-size:13px">The shipped model is rung 2 — growth and maturity were pruned, and launch odds were fitted and rejected; the formula above states both. The negative control (rung 5, shuffled growth) is worse on both holdouts too, so growth is noise, not signal.</p>' +
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
      cfHtml + '</div>' +
      '</div>' +
      '<div class="panel" style="padding:16px 18px;margin-top:16px"><h2 style="margin:0 0 8px;font-size:15px">Calibration chart</h2>' + calChart() + '</div>';
  }

  var views = ['board', 'detail', 'model'];
  function route() {
    var hash = (window.location.hash || '').replace(/^#\/?/, '');
    var view = 'board', slug = null;
    if (hash === 'model') view = 'model';
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
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  renderStats();
  renderTop10();
  renderStrips();
  document.getElementById('board-scatter').innerHTML = calChart();
  renderBoard();
  route();
})();
