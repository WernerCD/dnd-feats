/* Feats & Origins -- vanilla JS, no build step. */
(function () {
  'use strict';

  var REPO = 'dnd-feats';
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function norm(s) { return String(s || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function slug(s) { return norm(s).replace(/ /g, '-'); }

  var AB = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  var ABN = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
  var TABS = { feats: 'Feats', species: 'Species', backgrounds: 'Backgrounds' };
  var CAT_ORDER = ['Origin', 'General', 'Fighting Style', 'Epic Boon', 'Dragonmark', 'Dark Gift', 'Racial'];
  var DATA = null, BYID = {}, BOOK = {};

  /* ---------- state: everything that defines a view is in the link ---------- */
  var params = new URLSearchParams(location.search);
  function list(v) { return v ? v.split('|').filter(Boolean) : []; }
  var state = {
    ed: params.get('ed') || store.get('df.ed', '2024'),
    tab: params.get('tab') || 'feats',
    q: params.get('q') || '',
    cats: list(params.get('cat')),
    pre: params.get('pre') || '',
    abs: list(params.get('ab')),
    books: (function (b) { return !b ? null : b === 'srd' || b === 'all' ? b : b === 'none' ? [] : list(b); })(params.get('books')), /* null = the core books of the current list (STYLE 6f) */
    rep: params.get('rep') === '1',
    show: params.get('show') || '',
    at: parseInt(params.get('at'), 10) || 0,
    sort: params.get('sort') || 'name',
    srcQ: ''
  };
  if (!params.get('ed') && activeCh()) state.ed = activeCh().ed;
  if (['2014', '2024'].indexOf(state.ed) < 0) state.ed = '2024';
  if (!TABS[state.tab]) state.tab = 'feats';
  if (state.at < 1 || state.at > 20) state.at = 0;
  var openId = params.get('id') || params.get('feat') || params.get('species') || params.get('background') || '';

  /* ---------- characters (shared D&D Toolbox list, character.js) ---------- */
  function activeCh() { try { return window.DndChar ? DndChar.active() : null; } catch (e) { return null; } }
  /* this character's marks: { taken: [ids], planned: [ids], species: id, background: id }, read fresh every time */
  function marks(ch) {
    ch = ch || activeCh();
    var l = ch && ch.links && ch.links[REPO] || {};
    var ok = function (a) { return Array.isArray(a) ? a.filter(function (id) { return !DATA || BYID[id]; }) : []; };
    return { taken: ok(l.taken), planned: ok(l.planned), species: l.species && (!DATA || BYID[l.species]) ? l.species : null,
      background: l.background && (!DATA || BYID[l.background]) ? l.background : null };
  }
  function setMarks(patch) {
    var ch = activeCh(); if (!ch) return;
    var cur = DndChar.get(ch.id); if (!cur) return;   /* re-read: another tab may have changed it */
    var l = Object.assign({}, cur.links[REPO] || {}, patch);
    DndChar.setLink(ch.id, REPO, l);
    shareMarks(ch.id, l);
    publishSheet();
  }
  /* the hub's Character Sheet / Party summary (character.js v1.4, STYLE.md 6e); written only when it changed */
  function publishSheet() {
    var ch = activeCh(); if (!ch || !DATA || !DndChar.setSheet) return;
    var m = marks(ch), feats = [];
    m.taken.forEach(function (id) { feats.push({ n: BYID[id].name, cat: BYID[id].cat, status: 'taken' }); });
    m.planned.forEach(function (id) { feats.push({ n: BYID[id].name, cat: BYID[id].cat, status: 'planned' }); });
    var sp = m.species && BYID[m.species], bg = m.background && BYID[m.background];
    var sum = feats.length || sp || bg ? { v: 1, ed: ch.ed, feats: feats, species: sp ? sp.name : null, background: bg ? bg.name : null } : null;
    while (sum && JSON.stringify(sum).length > 5900 && sum.feats.length) sum.feats.pop();
    var cur = ch.sheet && ch.sheet[REPO];
    if (JSON.stringify(cur || null) !== JSON.stringify(sum)) DndChar.setSheet(ch.id, REPO, sum);
  }
  /* what this site adds to the character's share link (character.js v1.2+) */
  function shareMarks(id, l) {
    if (!DndChar.setShare) return;
    var d = { taken: l.taken || [], planned: l.planned || [], species: l.species || null, background: l.background || null };
    DndChar.setShare(id, REPO, d.taken.length || d.planned.length || d.species || d.background ? d : null);
  }
  /* marks that arrived with a share link: use them if this character has none here, otherwise ask */
  function takeShared() {
    var ch = activeCh(); if (!ch || !DndChar.takeInbox) return;
    var d = DndChar.takeInbox(ch.id, REPO); if (!d || typeof d !== 'object') return;
    var m = marks(ch), empty = !m.taken.length && !m.planned.length && !m.species && !m.background;
    if (!empty && !confirm('The share link for ' + ch.name + ' carries its own feats, species and background. Replace the ones marked in this browser?')) return;
    var ok = function (a) { return Array.isArray(a) ? a.filter(function (id) { return BYID[id]; }) : []; };
    setMarks({ taken: ok(d.taken), planned: ok(d.planned), species: BYID[d.species] ? d.species : null, background: BYID[d.background] ? d.background : null });
  }
  function toggleMark(kind, id) {
    var m = marks(), a = m[kind].slice(), i = a.indexOf(id), other = kind === 'taken' ? 'planned' : 'taken';
    var patch = {};
    if (i >= 0) a.splice(i, 1); else { a.push(id); var o = m[other].indexOf(id); if (o >= 0) { var b = m[other].slice(); b.splice(o, 1); patch[other] = b; } }
    patch[kind] = a;
    setMarks(patch);
  }

  /* ---------- eligibility: does the active character meet a feat's prerequisite? ---------- */
  var CASTERS = { bard: 1, cleric: 1, druid: 1, sorcerer: 1, warlock: 1, wizard: 1, artificer: 1 };
  var HALF = { paladin: 1, ranger: 1 };            /* spells at 2 (2014) or 1 (2024) */
  var THIRD = { fighter: /eldritch knight/i, rogue: /arcane trickster/i };
  var ARMOR = { light: ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'paladin', 'ranger', 'rogue', 'warlock', 'artificer'],
    medium: ['barbarian', 'cleric', 'druid', 'fighter', 'paladin', 'ranger', 'artificer'],
    shield: ['barbarian', 'cleric', 'druid', 'fighter', 'paladin', 'ranger', 'artificer'], heavy: ['fighter', 'paladin'] };
  var MARTIAL = ['barbarian', 'fighter', 'paladin', 'ranger'];
  function chLevel(ch) { return state.at || DndChar.level(ch); }
  /* class levels, raised proportionally when "At level" plans ahead: the extra levels go to the first class */
  function clsLevel(ch, cls) {
    var n = DndChar.levelIn(ch, cls);
    if (state.at && ch.classes.length && ch.classes[0].cls === cls) n += Math.max(0, state.at - DndChar.level(ch));
    return n;
  }
  function canCast(ch, ed) {
    return ch.classes.some(function (c) {
      var lv = clsLevel(ch, c.cls);
      if (CASTERS[c.cls]) return true;
      if (HALF[c.cls]) return lv >= (ed === '2014' ? 2 : 1);
      if (THIRD[c.cls]) return lv >= 3 && THIRD[c.cls].test(c.subName || c.sub || '');
      return false;
    });
  }
  function hasStyle(ch) {
    return ch.classes.some(function (c) { var lv = clsLevel(ch, c.cls); return (c.cls === 'fighter' && lv >= 1) || ((c.cls === 'paladin' || c.cls === 'ranger') && lv >= 2); });
  }
  function featName(id) { var f = BYID[id]; return f ? slug(f.name.replace(/\s*\(.*\)$/, '')) : ''; }
  var RANK = { ok: 0, check: 1, no: 2 };
  function worst(a, b) { return RANK[a] >= RANK[b] ? a : b; }
  /* -> { s: 'ok'|'check'|'no', why: [[status, text]] } */
  function evalFeat(f, ch) {
    if (!ch || !f.pre || !f.pre.length) return { s: 'ok', why: [] };
    var m = marks(ch), best = null;
    f.pre.forEach(function (a) {
      var s = 'ok', why = [];
      function add(st, t) { why.push([st, t]); s = worst(s, st); }
      if (a.level) {
        if (a.cls) { var cl = clsLevel(ch, a.cls); add(cl >= a.level ? 'ok' : 'no', cap(a.cls) + ' level ' + a.level + '+ (has ' + cl + ')'); }
        else { var lv = chLevel(ch); add(lv >= a.level ? 'ok' : 'no', 'Level ' + a.level + '+ (' + (state.at ? 'planning ' : 'is ') + lv + ')'); }
      }
      if (a.ab) {
        var okAb = a.ab.some(function (o) { return Object.keys(o).every(function (k) { return ch.ab[AB.indexOf(k)] >= o[k]; }); });
        add(okAb ? 'ok' : 'no', a.ab.map(function (o) { return Object.keys(o).map(function (k) { return ABN[k] + ' ' + o[k] + '+ (' + ch.ab[AB.indexOf(k)] + ')'; }).join(' and '); }).join(' or '));
      }
      if (a.race) {
        var sp = m.species && BYID[m.species];
        if (!sp) add('check', 'Species: set one for this character to check');
        else {
          var nm = norm(sp.name), par = sp.parent && BYID[sp.parent] ? norm(BYID[sp.parent].name) : '';
          var hit = a.race.some(function (r) {
            var p = r.split('|'), base = norm(p[0]);
            if (base === 'small race') return /small/i.test(sp.size || '');
            var isBase = nm === base || nm.indexOf(base + ' ') === 0 || par === base;
            return isBase && (!p[1] || nm.indexOf(norm(p[1])) >= 0);
          });
          var sub = a.race.some(function (r) { return r.indexOf('|') > 0; });
          add(hit ? 'ok' : (sub && a.race.some(function (r) { var b = norm(r.split('|')[0]); return nm === b; }) ? 'check' : 'no'), 'Species: ' + f.prereq.split(/, /).filter(function (x) { return !/level|strength|dexterity|constitution|intelligence|wisdom|charisma/i.test(x); })[0] + ' (is ' + sp.name + ')');
        }
      }
      if (a.cast) add(canCast(ch, f.ed) ? 'ok' : 'no', a.cast === 2 ? 'Spellcasting or Pact Magic feature' : 'Can cast a spell');
      if (a.feature) a.feature.forEach(function (ft) {
        if (ft === 'fighting style') add(hasStyle(ch) ? 'ok' : 'no', 'Fighting Style feature');
        else if (ft === 'spellcasting' || ft === 'pact magic') add(canCast(ch, f.ed) ? 'ok' : 'no', cap(ft) + ' feature');
        else add('check', cap(ft) + ' feature');
      });
      if (a.armor) {
        var hasA = ch.classes.some(function (c) { return (ARMOR[a.armor] || []).indexOf(c.cls) >= 0; });
        add(hasA ? 'ok' : 'check', cap(a.armor) + ' armor training' + (hasA ? '' : ' (not from a class; check)'));
      }
      if (a.weapon) {
        var hasW = ch.classes.some(function (c) { return MARTIAL.indexOf(c.cls) >= 0; });
        add(hasW ? 'ok' : 'check', 'Martial weapons' + (hasW ? '' : ' (not from a class; check)'));
      }
      if (a.feat) {
        var have = m.taken.map(featName);
        var hasF = a.feat.some(function (x) { return have.indexOf(x.replace(/-\(.*$/, '')) >= 0 || have.some(function (h) { return x.indexOf(h) === 0; }); });
        add(hasF ? 'ok' : 'no', 'Feat: ' + a.feat.map(function (x) { return x.replace(/-/g, ' '); }).join(' or ') + (hasF ? '' : ' (not marked taken)'));
      }
      if (a.background) {
        var bg = m.background && BYID[m.background];
        if (!bg) add('check', 'Background: set one for this character to check');
        else add(a.background.indexOf(bg.name.toLowerCase()) >= 0 ? 'ok' : 'no', 'Background (is ' + bg.name + ')');
      }
      if (a.campaign) add('check', a.campaign.join(' or ') + ' campaign (ask your DM)');
      if (a.other) add('check', 'Other requirement: see the book');
      if (!best || RANK[s] < RANK[best.s]) best = { s: s, why: why };
    });
    return best || { s: 'ok', why: [] };
  }
  function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
  var ELIG_TXT = { ok: 'Qualifies', no: 'Not yet', check: 'Check' };

  /* ---------- filtering ---------- */
  function rows() { return DATA ? DATA[state.tab].filter(function (r) { return r.ed === state.ed; }) : []; }
  /* books that have entries in the current tab and edition, in picker order (shared sources.js) */
  function listCodes() {
    var seen = {};
    rows().forEach(function (r) { seen[r.book] = 1; });
    var codes = Object.keys(seen);
    return window.DndSources ? DndSources.sort(codes) : codes.sort();
  }
  function coreCodes() { var c = listCodes(); return window.DndSources ? DndSources.defaults(c) : c; }
  function bookOn(code) {
    var b = state.books;
    if (b === null) return coreCodes().indexOf(code) >= 0;
    if (b === 'all') return true;
    if (b === 'srd') return /^SRD/.test(code);
    return b.indexOf(code) >= 0;
  }
  /* an explicit list that equals the default or every book collapses back to null / 'all' */
  function tidyBooks(on) {
    var core = coreCodes().slice().sort().join('|'), all = listCodes();
    if (on.slice().sort().join('|') === core) return null;
    if (on.length === all.length) return 'all';
    return on;
  }
  function preKind(f) {
    var k = {};
    (f.pre || []).forEach(function (a) {
      if (a.level && !a.cls) k.level = 1;
      if (a.ab) k.ability = 1;
      if (a.race) k.species = 1;
      if (a.cast) k.cast = 1;
      if (a.feat) k.feat = 1;
      if (a.cls || a.feature || a.armor || a.weapon || a.background || a.other) k['class'] = 1;
      if (a.campaign) k.campaign = 1;
    });
    if (!f.pre || !f.pre.length) k.none = 1;
    return k;
  }
  function hay(r) {
    if (!r._h) r._h = norm([r.name, r.sum, r.prereq, r.ability, r.cat, r.skills, r.tools, r.feat, r.type, BOOK[r.book] && BOOK[r.book].name, (r.text || '').replace(/<[^>]+>/g, ' ')].join(' '));
    return r._h;
  }
  function filtered() {
    var ch = activeCh(), m = ch ? marks(ch) : null, q = norm(state.q), isF = state.tab === 'feats';
    var out = rows().filter(function (r) {
      if (!bookOn(r.book)) return false;
      if (q && q.split(' ').some(function (w) { return hay(r).indexOf(w) < 0; })) return false;
      if (state.abs.length && !state.abs.some(function (a) { return (r.abilities || []).indexOf(a) >= 0; })) return false;
      if (isF) {
        if (state.cats.length && state.cats.indexOf(r.cat) < 0) return false;
        if (state.pre && !preKind(r)[state.pre]) return false;
        if (state.rep && !r.rep) return false;
      }
      if (ch && state.show) {
        if (state.show === 'ok') { if (isF && evalFeat(r, ch).s === 'no') return false; }
        else if (isF) {
          var t = m.taken.indexOf(r.id) >= 0, p = m.planned.indexOf(r.id) >= 0;
          if (state.show === 'taken' && !t) return false;
          if (state.show === 'planned' && !p) return false;
          if (state.show === 'mine' && !t && !p) return false;
        }
      }
      return true;
    });
    var by = {
      name: function (a, b) { return a.name.localeCompare(b.name); },
      cat: function (a, b) { return (CAT_ORDER.indexOf(a.cat) - CAT_ORDER.indexOf(b.cat)) || a.name.localeCompare(b.name); },
      src: function (a, b) { return (BOOK[a.book].name.localeCompare(BOOK[b.book].name)) || a.name.localeCompare(b.name); },
      ok: function (a, b) { return (ch && isF ? RANK[evalFeat(a, ch).s] - RANK[evalFeat(b, ch).s] : 0) || a.name.localeCompare(b.name); }
    };
    return out.sort(by[state.sort] || by.name);
  }

  /* ---------- rendering ---------- */
  function srcTag(r) {
    var b = BOOK[r.book] || { name: r.book, hue: 0 };
    return '<span class="srctag" style="--h:' + b.hue + '">' + esc(b.name) + (r.page ? ', p. ' + r.page : '') + '</span>';
  }
  function itemHref(id) { var u = new URLSearchParams(LINKQ); u.set('id', id); return '?' + u.toString(); }
  var LINKQ = '';
  function card(r, ch, m) {
    var isF = state.tab === 'feats', h = '', cls = 'card', ev = null;
    if (isF && ch) { ev = evalFeat(r, ch); if (ev.s === 'no') cls += ' not-ok'; }
    var taken = m && m.taken.indexOf(r.id) >= 0, planned = m && m.planned.indexOf(r.id) >= 0;
    var mine = m && (m.species === r.id || m.background === r.id);
    if (taken || mine) cls += ' is-taken'; else if (planned) cls += ' is-planned';
    h += '<article class="' + cls + '" data-id="' + esc(r.id) + '"' + (r.srd ? '' : ' style="--h:' + (BOOK[r.book] || {}).hue + '"') + '>';
    h += '<div class="card-top"><h3><a class="open" href="' + esc(itemHref(r.id)) + '" data-open="' + esc(r.id) + '">' + esc(r.name) + '</a></h3></div>';
    h += '<div class="pills">';
    if (isF) h += '<span class="cat c-' + slug(r.cat) + '">' + esc(r.cat) + '</span>';
    if (r.srd) h += '<span class="tagp srd" title="Full rules text from the free SRD">SRD text</span>';
    if (r.rep) h += '<span class="tagp" title="Can be taken more than once">Repeatable</span>';
    if (ev) h += '<span class="elig ' + ev.s + '">' + ELIG_TXT[ev.s] + '</span>';
    if (taken) h += '<span class="mark">Taken</span>'; else if (planned) h += '<span class="mark wish">Planned</span>';
    if (mine) h += '<span class="mark">This character</span>';
    h += '</div>';
    if (isF) h += '<p class="pre"><b>Prerequisite:</b> ' + esc(r.prereq || 'None') + '</p>';
    if (state.tab === 'species') {
      var bits = [r.size, r.speed && 'Speed ' + r.speed, r.dv && 'Darkvision ' + r.dv + ' ft.', r.type && r.type !== 'Humanoid' && r.type].filter(Boolean);
      if (bits.length) h += '<p class="pre">' + esc(bits.join(' · ')) + '</p>';
    }
    if (state.tab === 'backgrounds') {
      if (r.skills) h += '<p class="pre"><b>Skills:</b> ' + esc(r.skills) + '</p>';
      if (r.feat) h += '<p class="pre"><b>Feat:</b> ' + esc(r.feat) + '</p>';
    }
    if (r.ability) h += '<p class="abl"><b>Ability:</b> ' + esc(r.ability) + '</p>';
    if (r.sum) h += '<p class="summary">' + esc(r.sum) + '</p>';
    if (ev && ev.s !== 'ok') { var w = ev.why.filter(function (x) { return x[0] !== 'ok'; }).map(function (x) { return x[1]; }); h += '<p class="why' + (ev.s === 'check' ? ' check' : '') + '">' + esc(w.join('; ')) + '</p>'; }
    h += '<p class="src">' + srcTag(r) + '</p>';
    if (ch) h += markBtns(r, m);
    return h + '</article>';
  }
  function markBtns(r, m, dlg) {
    var c = dlg ? 'dlg-marks' : 'marks';
    if (state.tab === 'feats' || (dlg && dlgKind === 'feats')) {
      var t = m.taken.indexOf(r.id) >= 0, p = m.planned.indexOf(r.id) >= 0;
      return '<div class="' + c + '"><button type="button" class="mk" data-mark="taken" data-id="' + esc(r.id) + '" aria-pressed="' + t + '">Taken</button>' +
        '<button type="button" class="mk plan" data-mark="planned" data-id="' + esc(r.id) + '" aria-pressed="' + p + '">Planned</button></div>';
    }
    var kind = (dlg ? dlgKind : state.tab) === 'species' ? 'species' : 'background', on = m[kind] === r.id;
    return '<div class="' + c + '"><button type="button" class="mk" data-set="' + kind + '" data-id="' + esc(r.id) + '" aria-pressed="' + on + '">' +
      (on ? 'Character’s ' + kind : 'Use for character') + '</button></div>';
  }
  function render() {
    if (!DATA) return;
    var ch = activeCh(), m = ch ? marks(ch) : null, rs = filtered(), isF = state.tab === 'feats';
    $$('.seg [data-ed]').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.ed === state.ed)); });
    $$('.tabs [data-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tab === state.tab)); b.tabIndex = b.dataset.tab === state.tab ? 0 : -1; });
    $('#list').setAttribute('aria-labelledby', 'tab-' + state.tab);
    $$('.feat-only').forEach(function (e) { e.hidden = !isF || (e.classList.contains('ch-only') && !ch); });
    $$('.ch-only').forEach(function (e) { if (!e.classList.contains('feat-only')) e.hidden = !ch; });
    $$('#show .feat-opt').forEach(function (o) { o.hidden = !isF; o.disabled = !isF; });
    $('#sort').querySelector('[value="cat"]').hidden = !isF;
    $('#sort').querySelector('[value="ok"]').hidden = !ch || !isF;
    if ((!isF && (state.sort === 'cat' || state.sort === 'ok')) || (!ch && state.sort === 'ok')) state.sort = 'name';
    if (!isF) state.show = '';
    $('#search').value = state.q; $('#pre').value = state.pre; $('#rep').checked = state.rep; $('#show').value = state.show; $('#sort').value = state.sort;
    $('#atLvl').value = state.at || ''; $('#atLvl').placeholder = ch ? String(DndChar.level(ch)) : '';
    renderPickers();
    renderCharCard(ch, m);
    renderImport(ch, m);
    var all = rows().length;
    $('#count').textContent = rs.length + ' ' + (rs.length === 1 ? TABS[state.tab].replace(/s$/, '').replace('Specie', 'Species') : TABS[state.tab].toLowerCase()) + (rs.length !== all ? ' of ' + all : '') + ' · ' + state.ed + ' rules';
    $('#list').innerHTML = rs.map(function (r) { return card(r, ch, m); }).join('');
    $('#empty').hidden = rs.length > 0;
    writeUrl();
  }
  function renderCharCard(ch, m) {
    var el = $('#charCard');
    if (!ch) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    var sp = m.species && BYID[m.species], bg = m.background && BYID[m.background];
    var h = '<h2>' + esc(ch.name) + ' <span class="small">' + esc(DndChar.summary(ch) || 'no class yet') + ' · ' + esc(ch.ed) + ' rules</span></h2>';
    h += '<div class="row"><span class="abs">' + AB.map(function (a, i) { return '<span><b>' + a.toUpperCase() + '</b>' + ch.ab[i] + '</span>'; }).join('') + '</span>';
    h += '<span>Species: ' + (sp ? '<button type="button" class="linkish" data-open="' + esc(sp.id) + '">' + esc(sp.name) + '</button>' : '<span class="muted">not set</span>') + '</span>';
    h += '<span>Background: ' + (bg ? '<button type="button" class="linkish" data-open="' + esc(bg.id) + '">' + esc(bg.name) + '</button>' : '<span class="muted">not set</span>') + '</span></div>';
    var feats = function (ids, label) { return ids.length ? '<li>' + label + ': ' + ids.map(function (id) { return '<button type="button" class="linkish" data-open="' + esc(id) + '">' + esc(BYID[id].name) + '</button>'; }).join(', ') + '</li>' : ''; };
    var lst = feats(m.taken, 'Taken') + feats(m.planned, 'Planned');
    h += lst ? '<ul>' + lst + '</ul>' : '<p class="small">Mark feats as Taken or Planned on their cards. Set a species and background from their tabs.</p>';
    if (state.at) h += '<p class="small">Prerequisites are checked as if ' + esc(ch.name) + ' were level ' + state.at + '. <button type="button" class="linkish" id="atClear">Use the real level</button></p>';
    el.innerHTML = h;
  }

  /* ---------- imported characters (character.js v1.6 ch.imp, STYLE.md 6g) ---------- */
  var IMP_SRC = { ddb: 'D&D Beyond', foundry: 'Foundry VTT', fc5: 'Fight Club 5', dicecloud: 'DiceCloud' };
  var impDone = null;   /* { id, text } after an import was applied or dismissed, until the user closes the note */
  function impSrc(imp) { return IMP_SRC[imp.src] || 'another tool'; }
  function toks(s) { return norm(s).split(' ').filter(Boolean).sort().join(' '); }
  /* name -> entry in this edition: exact, then the same words in any order ("High Elf" = "Elf (High)"), then without a (choice) */
  function matchName(kind, ed, name) {
    var pool = DATA[kind].filter(function (r) { return r.ed === ed; });
    var n = norm(name), t = toks(name), base = norm(String(name).replace(/\s*\(.*?\)\s*/g, ' '));
    var srdFirst = function (a) { return a.sort(function (x, y) { return (y.srd ? 1 : 0) - (x.srd ? 1 : 0); })[0]; };
    return srdFirst(pool.filter(function (r) { return norm(r.name) === n; })) ||
      srdFirst(pool.filter(function (r) { return toks(r.name) === t; })) ||
      (base && base !== n ? srdFirst(pool.filter(function (r) { return norm(r.name) === base; })) : null) ||
      (kind === 'species' && !/half/.test(n) ? srdFirst(pool.filter(function (r) { return !r.parent && n.split(' ').indexOf(norm(r.name)) > 0; })) : null) || null;   /* "Wood Elf" -> Elf (2024 lineages) */
  }
  function impTime(x) { var t = Date.parse(x || ''); return isNaN(t) ? 0 : t; }
  function impPlan(ch) {
    var imp = ch && ch.imp;
    if (!imp || !imp.at || !DATA) return null;
    var l = ch.links[REPO] || {};
    if (l.impAt && impTime(l.impAt) >= impTime(imp.at)) return null;
    var ed = imp.ed === '2014' || imp.ed === '2024' ? imp.ed : ch.ed, plan = { imp: imp, ed: ed, feats: [], miss: [], species: null, background: null };
    (Array.isArray(imp.feats) ? imp.feats : []).forEach(function (nm) {
      var f = matchName('feats', ed, nm);
      if (f) { if (plan.feats.indexOf(f.id) < 0) plan.feats.push(f.id); } else plan.miss.push('feat "' + nm + '"');
    });
    ['species', 'background'].forEach(function (k) {
      if (!imp[k]) return;
      var r = matchName(k === 'species' ? 'species' : 'backgrounds', ed, imp[k]);
      if (r) plan[k] = r.id; else plan.miss.push(k + ' "' + imp[k] + '"');
    });
    return plan;
  }
  function renderImport(ch, m) {
    var el = $('#impCard'), h = '';
    if (impDone && ch && impDone.id === ch.id) {
      h = '<p>' + esc(impDone.text) + '</p><div class="dlg-marks"><button type="button" class="btn" id="impClose">OK</button></div>';
    } else {
      impDone = null;
      var plan = ch ? impPlan(ch) : null;
      if (!plan) { el.hidden = true; el.innerHTML = ''; return; }
      var src = impSrc(plan.imp), when = plan.imp.at.slice(0, 10);
      h = '<h2>Imported from ' + esc(src) + '</h2><p class="small">' + esc(ch.name) + ' was imported on ' + esc(when) + ' (' + esc(plan.ed) + ' rules). Nothing changes here until you choose.</p><ul>';
      var newF = plan.feats.filter(function (id) { return m.taken.indexOf(id) < 0; });
      h += '<li>Feats to mark Taken: ' + (newF.length ? newF.map(function (id) { return esc(BYID[id].name); }).join(', ') : '<span class="muted">none new</span>') + (m.taken.length ? ' <span class="small">(feats already marked here stay)</span>' : '') + '</li>';
      ['species', 'background'].forEach(function (k) {
        if (!plan[k]) return;
        var cur = m[k] && BYID[m[k]];
        h += '<li>' + cap(k) + ': ' + esc(BYID[plan[k]].name) + (cur && cur.id !== plan[k] ? ' <span class="small">(replaces ' + esc(cur.name) + ')</span>' : '') + '</li>';
      });
      if (plan.miss.length) h += '<li class="warn-txt">Not found on this site: ' + esc(plan.miss.join(', ')) + '</li>';
      h += '</ul><div class="dlg-marks"><button type="button" class="btn" id="impUse" aria-pressed="false">Use the feats, species and background imported from ' + esc(src) + '</button><button type="button" class="btn" id="impSkip">Not now</button></div>';
    }
    el.hidden = false;
    el.innerHTML = h;
  }
  function applyImport(use) {
    var ch = activeCh(), plan = ch && impPlan(ch); if (!plan) return;
    var m = marks(ch), patch = { impAt: plan.imp.at }, src = impSrc(plan.imp);
    if (use) {
      patch.taken = m.taken.concat(plan.feats.filter(function (id) { return m.taken.indexOf(id) < 0; }));
      patch.planned = m.planned.filter(function (id) { return plan.feats.indexOf(id) < 0; });
      if (plan.species) patch.species = plan.species;
      if (plan.background) patch.background = plan.background;
    }
    impDone = { id: ch.id, text: use ? 'Used the import from ' + src + '.' + (plan.miss.length ? ' Not found on this site, so not added: ' + plan.miss.join(', ') + '.' : ' Everything matched.') : 'Skipped the import from ' + src + '. It will be offered again if the character is imported again.' };
    setMarks(patch);
    render();
    var b = $('#impClose'); if (b) b.focus();
  }

  /* ---------- filter menus ---------- */
  function renderPickers() {
    var rs = rows();
    /* category */
    var cats = CAT_ORDER.filter(function (c) { return rs.some(function (r) { return r.cat === c; }); });
    state.cats = state.cats.filter(function (c) { return cats.indexOf(c) >= 0 || !DATA; });
    $('#catList').innerHTML = cats.map(function (c) {
      var n = rs.filter(function (r) { return r.cat === c; }).length;
      return '<label class="srcrow"><input type="checkbox" data-cat="' + esc(c) + '"' + (state.cats.indexOf(c) >= 0 ? ' checked' : '') + '><span>' + esc(c) + '</span><span class="n">' + n + '</span></label>';
    }).join('');
    sumLabel('#catPick', '#catSum', 'Category', state.cats);
    /* ability */
    $('#abList').innerHTML = AB.map(function (a) {
      var n = rs.filter(function (r) { return (r.abilities || []).indexOf(a) >= 0; }).length;
      return '<label class="srcrow' + (n ? '' : ' zero') + '"><input type="checkbox" data-ab="' + a + '"' + (state.abs.indexOf(a) >= 0 ? ' checked' : '') + '><span>' + ABN[a] + '</span><span class="n">' + n + '</span></label>';
    }).join('');
    sumLabel('#abPick', '#abSum', 'Ability score', state.abs.map(function (a) { return a.toUpperCase(); }));
    $('#abHint').textContent = state.tab === 'backgrounds' && state.ed === '2014' ? '2014 backgrounds give no ability increase.' : 'Shows entries that can raise any ticked score.';
    /* sources */
    var books = listCodes().map(function (c) { return BOOK[c]; });
    var q = norm(state.srcQ), grp = '';
    $('#srcList').innerHTML = books.filter(function (b) { return !q || norm(b.name).indexOf(q) >= 0; }).map(function (b) {
      var n = rs.filter(function (r) { return r.book === b.code; }).length, h = '';
      var g = window.DndSources ? DndSources.info(b.code).groupName : '';
      if (g && g !== grp) { grp = g; h += '<div class="src-group">' + esc(g) + '</div>'; }
      return h + '<label class="srcrow"><input type="checkbox" data-src="' + esc(b.code) + '"' + (bookOn(b.code) ? ' checked' : '') + '><span class="dot" style="--h:' + b.hue + '"></span><span>' + esc(b.name) + '</span><span class="n">' + n + '</span></label>';
    }).join('') || '<p class="small">No book matches.</p>';
    var on = books.filter(function (b) { return bookOn(b.code); });
    var lbl = state.books === null ? 'Sources: core books' : state.books === 'srd' ? 'Sources: SRD only' : state.books === 'all' ? 'Sources: all books' : 'Sources: ' + on.length + ' of ' + books.length;
    $('#srcSum').textContent = lbl;
    $('#srcPick').classList.toggle('filtered', state.books !== null);
  }
  function sumLabel(pick, sum, name, vals) {
    $(sum).textContent = vals.length ? name + ': ' + (vals.length > 2 ? vals.length + ' picked' : vals.join(', ')) : name;
    $(pick).classList.toggle('filtered', vals.length > 0);
  }

  /* ---------- link ---------- */
  function writeUrl() {
    var u = new URL(location.href), p = u.searchParams;
    function setP(n, v) { if (v) p.set(n, v); else p.delete(n); }
    p.set('ed', state.ed);
    setP('tab', state.tab !== 'feats' && state.tab);
    setP('q', state.q);
    setP('cat', state.cats.join('|'));
    setP('pre', state.pre);
    setP('ab', state.abs.join('|'));
    setP('books', state.books === null ? '' : typeof state.books === 'string' ? state.books : state.books.join('|') || 'none');
    setP('rep', state.rep && '1');
    setP('show', state.show);
    setP('at', state.at && String(state.at));
    setP('sort', state.sort !== 'name' && state.sort);
    ['feat', 'species', 'background'].forEach(function (k) { p.delete(k); });
    if (!$('#detail').open) p.delete('id');
    if (u.href !== location.href) history.replaceState(null, '', u);
    var lq = new URLSearchParams(u.search); lq.delete('id'); lq.delete('char');
    LINKQ = lq.toString();
  }
  function update(patch, focusSel) {
    var a = document.activeElement;
    Object.assign(state, patch);
    store.set('df.ed', state.ed);
    render();
    if (focusSel) { var f = $(focusSel); if (f) f.focus(); }
    else if (a && a.isConnected && a !== document.body) a.focus();
  }

  /* ---------- detail dialog ---------- */
  var dlgKind = 'feats', dlgOpener = null;
  function kindOf(id) { for (var k in TABS) if (DATA[k].some(function (r) { return r.id === id; })) return k; return null; }
  function openDetail(id, opener) {
    var r = BYID[id]; if (!r) return;
    dlgKind = kindOf(id);
    if (opener) dlgOpener = opener;
    var ch = activeCh(), m = ch ? marks(ch) : null, b = BOOK[r.book] || { name: r.book };
    var h = '<div class="sb-head"><h2 id="dTitle">' + esc(r.name) + '</h2></div>';
    h += '<p class="sb-sub">' + esc(dlgKind === 'feats' ? r.cat + ' feat' : dlgKind === 'species' ? 'Species' : 'Background') + ' · ' + esc(r.ed) + ' rules ' + srcTag(r) + '</p>';
    /* same name in the other edition */
    var twins = DATA[dlgKind].filter(function (x) { return x.id !== r.id && norm(x.name) === norm(r.name); });
    if (twins.length) h += '<div class="ed-tabs" role="group" aria-label="Other versions">' + twins.slice(0, 6).map(function (x) {
      return '<button type="button" data-open="' + esc(x.id) + '">' + esc(x.ed + ' · ' + (BOOK[x.book] || {}).name) + '</button>'; }).join('') + '</div>';
    h += '<dl class="facts-dl">';
    function dd(k, v) { if (v) h += '<dt>' + k + '</dt><dd>' + v + '</dd>'; }
    if (dlgKind === 'feats') { dd('Category', esc(r.cat)); dd('Prerequisite', esc(r.prereq || 'None')); dd('Repeatable', r.rep ? 'Yes' : ''); }
    if (dlgKind === 'species') {
      dd('Size', esc(r.size)); dd('Speed', esc(r.speed)); dd('Darkvision', r.dv ? esc(r.dv + ' ft.') : ''); dd('Creature type', esc(r.type));
      if (r.parent && BYID[r.parent]) dd('Variant of', '<button type="button" class="linkish" data-open="' + esc(r.parent) + '">' + esc(BYID[r.parent].name) + '</button>');
      var kids = DATA.species.filter(function (x) { return x.parent === r.id; });
      if (kids.length) dd('Variants', kids.map(function (x) { return '<button type="button" class="linkish" data-open="' + esc(x.id) + '">' + esc(x.name) + '</button>'; }).join(', '));
    }
    if (dlgKind === 'backgrounds') {
      dd('Skills', esc(r.skills)); dd('Tools', esc(r.tools));
      if (r.feat) {
        var fn = norm(r.feat.replace(/\s*\(.*$/, ''));
        var fm = DATA.feats.filter(function (x) { return x.ed === r.ed && norm(x.name) === fn; })[0];
        dd('Feat', fm ? '<button type="button" class="linkish" data-open="' + esc(fm.id) + '">' + esc(r.feat) + '</button>' : esc(r.feat));
      }
    }
    dd('Ability', esc(r.ability));
    dd('Source', esc(b.name) + (r.page ? ', p. ' + r.page : '') + (r.alsoIn ? '<br><span class="small">Also in ' + esc(r.alsoIn) + '</span>' : ''));
    h += '</dl>';
    if (dlgKind === 'feats' && ch) {
      var ev = evalFeat(r, ch);
      h += '<p><span class="elig ' + ev.s + '">' + ELIG_TXT[ev.s] + '</span> <span class="small">for ' + esc(ch.name) + (state.at ? ' at level ' + state.at : '') + '</span></p>';
      if (ev.why.length) h += '<ul class="elig-list">' + ev.why.map(function (w) { return '<li class="' + w[0] + '">' + ({ ok: '✓ ', no: '✕ ', check: '? ' })[w[0]] + esc(w[1]) + '</li>'; }).join('') + '</ul>';
    }
    if (ch) h += markBtns(r, m, true);
    if (r.sum) h += '<p class="summary">' + esc(r.sum) + '</p>';
    if (r.text) h += '<div class="itext">' + r.text + '</div><p class="small">Rules text: ' + esc(b.name) + ', CC BY 4.0, Wizards of the Coast LLC.</p>';
    else h += '<p class="note-idx">This entry is from <b>' + esc(b.name) + '</b>' + (r.page ? ', page ' + r.page : '') + '. It is not in the free System Reference Document, so only the facts and an original summary are shown here; the rules text is in the book.</p>';
    $('#dBody').innerHTML = h;
    var d = $('#detail');
    if (!d.open) { d.showModal(); if (window.DndUI) DndUI.enter(d.querySelector('.dlg')); }
    d.querySelector('.dlg').scrollTop = 0;
    var u = new URL(location.href); u.searchParams.set('id', id); history.replaceState(null, '', u);
  }
  $('#closeDlg').addEventListener('click', function () { $('#detail').close(); });
  $('#detail').addEventListener('click', function (e) { if (e.target === this) this.close(); });
  $('#detail').addEventListener('close', function () {
    var u = new URL(location.href); u.searchParams.delete('id'); history.replaceState(null, '', u);
    render();
    if (dlgOpener && dlgOpener.isConnected) dlgOpener.focus();
    else if (dlgOpener && dlgOpener.dataset && dlgOpener.dataset.open) { var n = document.querySelector('#list [data-open="' + dlgOpener.dataset.open + '"]'); if (n) n.focus(); }
    dlgOpener = null;
  });

  /* ---------- events ---------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-open],[data-mark],[data-set],#atClear,#impUse,#impSkip,#impClose');
    if (t && t.id === 'atClear') return update({ at: 0 });
    if (t && (t.id === 'impUse' || t.id === 'impSkip')) return applyImport(t.id === 'impUse');
    if (t && t.id === 'impClose') { impDone = null; render(); var s0 = $('#search'); if (s0) s0.focus(); return; }
    if (t && t.dataset.open && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) { ev.preventDefault(); openDetail(t.dataset.open, $('#detail').open ? null : t); return; }
    if (t && t.dataset.mark) { toggleMark(t.dataset.mark, t.dataset.id); return afterMark(t); }
    if (t && t.dataset.set) {
      var m = marks(), p = {}; p[t.dataset.set] = m[t.dataset.set] === t.dataset.id ? null : t.dataset.id;
      setMarks(p); return afterMark(t);
    }
    if (!ev.target.isConnected) return;
    ['#catPick', '#abPick', '#srcPick'].forEach(function (s) { var p = $(s); if (p.open && !p.contains(ev.target)) p.open = false; });
  });
  /* a mark changed: redraw (onChange fires too) and keep focus on the same button */
  function afterMark(btn) {
    var sel = '[data-' + (btn.dataset.mark ? 'mark="' + btn.dataset.mark : 'set="' + btn.dataset.set) + '"][data-id="' + btn.dataset.id + '"]';
    var inDlg = $('#detail').open;
    if (inDlg) openDetail(btn.dataset.id); else render();
    var n = document.querySelector((inDlg ? '#dBody ' : '#list ') + sel); if (n) n.focus();
  }
  $$('.seg [data-ed]').forEach(function (b) { b.addEventListener('click', function () { update({ ed: b.dataset.ed, books: keepBooks() }); }); });
  $$('.tabs [data-tab]').forEach(function (b) {
    b.addEventListener('click', function () { update({ tab: b.dataset.tab, books: keepBooks() }); });
    b.addEventListener('keydown', function (e) {
      var keys = Object.keys(TABS), i = keys.indexOf(state.tab);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var n = keys[(i + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length];
        update({ tab: n, books: keepBooks() }, '#tab-' + n);
      }
    });
  });
  var qT = null;
  $('#search').addEventListener('input', function () { var v = this.value; clearTimeout(qT); qT = setTimeout(function () { update({ q: v }); }, 150); });
  $('#pre').addEventListener('change', function () { update({ pre: this.value }); });
  $('#rep').addEventListener('change', function () { update({ rep: this.checked }); });
  $('#show').addEventListener('change', function () { update({ show: this.value }); });
  $('#sort').addEventListener('change', function () { update({ sort: this.value }); });
  $('#atLvl').addEventListener('change', function () { var n = parseInt(this.value, 10); update({ at: n >= 1 && n <= 20 ? n : 0 }); });
  $('#catList').addEventListener('change', function (e) {
    var c = e.target.dataset.cat; if (!c) return;
    var a = state.cats.filter(function (x) { return x !== c; }); if (e.target.checked) a.push(c);
    update({ cats: a }, '#catList [data-cat="' + c + '"]');
  });
  $('#abList').addEventListener('change', function (e) {
    var c = e.target.dataset.ab; if (!c) return;
    var a = state.abs.filter(function (x) { return x !== c; }); if (e.target.checked) a.push(c);
    update({ abs: AB.filter(function (x) { return a.indexOf(x) >= 0; }) }, '#abList [data-ab="' + c + '"]');
  });
  /* switching edition or tab: SRD-only and all-books carry over; anything else goes back to the core books of the new list */
  function keepBooks() { return state.books === 'srd' || state.books === 'all' ? state.books : null; }
  $('#srcList').addEventListener('change', function (e) {
    var c = e.target.dataset.src; if (!c) return;
    var on = listCodes().filter(bookOn).filter(function (x) { return x !== c; }); if (e.target.checked) on.push(c);
    update({ books: tidyBooks(on) }, '#srcList [data-src="' + c + '"]');
  });
  $('#srcQ').addEventListener('input', function () { state.srcQ = this.value; renderPickers(); });
  $('#srcSrd').addEventListener('click', function () { update({ books: 'srd' }); });
  $('#srcCore').addEventListener('click', function () { update({ books: null }); });
  $('#srcAll').addEventListener('click', function () { update({ books: 'all' }); });
  $('#srcNone').addEventListener('click', function () { update({ books: [] }); });
  $('#catClear').addEventListener('click', function () { update({ cats: [] }); });
  $('#abClear').addEventListener('click', function () { update({ abs: [] }); });
  $('#resetBtn').addEventListener('click', function () { update({ q: '', cats: [], pre: '', abs: [], books: null, rep: false, show: '', at: 0, sort: 'name' }); });
  $('#copyLink').addEventListener('click', function () {
    var btn = this, u = new URL(location.href); u.searchParams.delete('char');
    var ch = activeCh(); if (ch) u.searchParams.set('char', ch.id);
    var done = function () { var t = btn.textContent; btn.textContent = 'Copied'; if (window.DndUI) DndUI.pop(btn); setTimeout(function () { btn.textContent = t; }, 1400); };
    if (navigator.clipboard) navigator.clipboard.writeText(u.href).then(done, function () { prompt('Copy this link:', u.href); });
    else prompt('Copy this link:', u.href);
  });
  /* filter menus: one open at a time, Escape closes and returns focus, kept inside the screen */
  ['#catPick', '#abPick', '#srcPick'].forEach(function (s) {
    var p = $(s);
    p.addEventListener('toggle', function () {
      if (!p.open) return;
      ['#catPick', '#abPick', '#srcPick'].forEach(function (o) { if (o !== s) $(o).open = false; });
      var pop = p.querySelector('.srcpop'); pop.style.left = '0px';
      var r = pop.getBoundingClientRect(), over = r.right - (window.innerWidth - 16);
      if (over > 0) pop.style.left = -over + 'px';
    });
    p.addEventListener('keydown', function (e) { if (e.key === 'Escape') { p.open = false; p.querySelector('summary').focus(); } });
  });

  /* the character changed (header picker, another site, another tab) */
  function chSig(ch) { return ch ? [ch.id, ch.ed, JSON.stringify(ch.classes), ch.ab.join(','), JSON.stringify(ch.links[REPO] || {}), ch.imp && ch.imp.at || ''].join('|') : ''; }
  var appliedSig = chSig(activeCh()), appliedId = activeCh() ? activeCh().id : '', appliedEd = activeCh() ? activeCh().ed : null;
  if (window.DndChar) DndChar.onChange(function (ch) {
    if (!DATA) return;
    var sig = chSig(ch);
    if (sig === appliedSig) return;   /* another site re-saved it: nothing this site reads changed */
    appliedSig = sig;
    var id = ch ? ch.id : '', patch = {};
    if (id !== appliedId) {
      appliedId = id; appliedEd = ch ? ch.ed : null;
      if (ch && ch.ed !== state.ed) patch.ed = ch.ed;
      if (!ch) { patch.show = ''; patch.at = 0; if (state.sort === 'ok') patch.sort = 'name'; }
    } else if (ch.ed !== appliedEd) {
      var userPicked = state.ed !== appliedEd;   /* follow the new edition only if the user hasn't picked another here */
      appliedEd = ch.ed;
      if (!userPicked) patch.ed = ch.ed;
    }
    takeShared();
    publishSheet();
    if ($('#detail').open) openDetail(new URL(location.href).searchParams.get('id') || '');
    update(patch);
  });

  /* ---------- load ---------- */
  fetch('data/feats.json?v=dev').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
    DATA = d;
    d.books.forEach(function (b) { BOOK[b.code] = b; });
    ['feats', 'species', 'backgrounds'].forEach(function (k) { d[k].forEach(function (r) { BYID[r.id] = r; }); });
    if (Array.isArray(state.books)) state.books = state.books.filter(function (c) { return BOOK[c]; });
    if (window.DndSources) d.books = DndSources.sort(d.books.map(function (b) { return b.code; })).map(function (c) { return BOOK[c]; });
    $('#generated').textContent = 'Data built ' + d.generated + ': ' + d.feats.length + ' feats, ' + d.species.length + ' species and ' + d.backgrounds.length + ' backgrounds across both editions.';
    $('#srcLinks').innerHTML = d.books.map(function (b) {
      var n = []; if (b.n['2014']) n.push(b.n['2014'] + ' (2014)'); if (b.n['2024']) n.push(b.n['2024'] + ' (2024)');
      var name = b.srd ? '<a href="https://dnd.wizards.com/resources/systems-reference-document" rel="noopener">' + esc(b.name) + '</a>' : esc(b.name);
      return '<li style="--h:' + b.hue + '"><span class="dot"></span>' + name + '<span class="small">' + n.join(', ') + '</span></li>';
    }).join('');
    /* ?char=<id> that isn't in this browser */
    var want = params.get('char');
    if (want && window.DndChar && !DndChar.get(want)) {
      var n = document.createElement('p'); n.className = 'notice wrap'; n.textContent = "That character isn't in this browser, so the feats are shown without one.";
      $('main').insertBefore(n, $('main').firstChild);
    }
    takeShared();
    publishSheet();
    render();
    if (openId && BYID[openId]) {
      var k = kindOf(openId); if (k !== state.tab || BYID[openId].ed !== state.ed) { state.tab = k; state.ed = BYID[openId].ed; render(); }
      openDetail(openId);
    }
  }).catch(function (e) {
    $('#list').innerHTML = '<p class="empty">The data didn\'t load (' + esc(e.message) + '). Reload the page to try again.</p>';
  });
})();
