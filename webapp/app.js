(function () {
  "use strict";

  var STORAGE_KEY = "career-tool-v2";  // 질문 구성이 바뀌면 버전을 올려 예전 기록과 섞이지 않게 함
  var LAST_PAGE = 6;                   // 마지막 페이지는 메모
  var TEXT_MAX = 40, MEMO_MAX = 120;
  var BASE_TITLE = "전역 후 진로 방향 잡기";
  var app = document.getElementById("app");

  var saved = loadSaved();
  var state = freshState();
  // ui.resumeAvailable: 저장된 기록이 있고 아직 이어서 하기를 누르지 않은 상태
  var ui = { screen: "start", error: "", missing: [], resumeAvailable: !!saved };
  if (saved) {
    // 시작 화면을 저장된 구분·전역일로 미리 채움 (지난 날짜는 비움)
    state.role = saved.role;
    state.discharge = isPast(saved.discharge) ? "" : saved.discharge;
  }

  function freshState() {
    return { role: "", discharge: "", page: 1, done: false, answers: {}, memo: { want: "", worry: "" } };
  }

  /* ---------- 저장 ---------- */
  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }
  // 저장된 값을 질문 정의에 맞춰 검증·정리. 쓸 수 있는 내용이 없으면 null
  function normalize(s) {
    if (!s || typeof s !== "object") return null;
    var out = freshState();
    if (s.role === "soldier" || s.role === "officer") out.role = s.role;
    if (validDateStr(s.discharge)) out.discharge = s.discharge;
    var p = parseInt(s.page, 10);
    out.page = p >= 1 && p <= LAST_PAGE ? p : 1;
    var a = s.answers && typeof s.answers === "object" ? s.answers : {};
    QUESTIONS.forEach(function (q) {
      var v = a[q.id];
      if (q.type === "text") {
        if (typeof v === "string" && v) out.answers[q.id] = v.slice(0, TEXT_MAX);
        return;
      }
      var vals = (Array.isArray(v) ? v : [v]).filter(function (x) {
        return typeof x === "string" && !!optOf(q, x);
      });
      if (!vals.length) return;
      if (q.type === "single") out.answers[q.id] = vals[0];
      else out.answers[q.id] = q.max ? vals.slice(0, q.max) : vals;
    });
    var m = s.memo && typeof s.memo === "object" ? s.memo : {};
    out.memo.want = typeof m.want === "string" ? m.want.slice(0, MEMO_MAX) : "";
    out.memo.worry = typeof m.worry === "string" ? m.worry.slice(0, MEMO_MAX) : "";
    out.done = s.done === true && missingIn(out).length === 0;
    if (!out.role && !out.discharge && !Object.keys(out.answers).length) return null;
    return out;
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 저장 불가 환경 */ }
  }
  function clearSaved() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* 무시 */ }
  }

  /* ---------- 유틸 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function todayStart() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function toDateStr(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseDate(str) {
    var p = str.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function validDateStr(str) {
    if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    return toDateStr(parseDate(str)) === str;  // 2026-13-45 같은 값 걸러냄
  }
  function isPast(str) { return !validDateStr(str) || parseDate(str) < todayStart(); }
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  // 날짜 사이 일수 (자정 기준, 서머타임 영향 없게 UTC로 계산)
  function daysBetween(a, b) {
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  }
  // 올해가 아니면 연도를 붙임
  function fmt(d) {
    var md = (d.getMonth() + 1) + "월 " + d.getDate() + "일";
    return d.getFullYear() === todayStart().getFullYear() ? md : d.getFullYear() + "년 " + md;
  }
  function fmtFull(d) { return d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일"; }
  function dLabel(days) { return days === 0 ? "D-day" : days > 0 ? "D-" + days : "전역일 지남"; }
  function qById(id) { return QUESTIONS.filter(function (q) { return q.id === id; })[0]; }
  function optOf(q, v) { return (q.options || []).filter(function (o) { return o.v === v; })[0]; }
  function selectedIn(st, q) {
    var a = st.answers[q.id];
    if (a === undefined || a === "") return [];
    return Array.isArray(a) ? a : [a];
  }
  function selected(q) { return selectedIn(state, q); }
  function answered(qid, values) {
    return selected(qById(qid)).some(function (v) { return values.indexOf(v) !== -1; });
  }
  function missingOn(st, p) {
    return QUESTIONS.filter(function (q) { return q.page === p && q.required && selectedIn(st, q).length === 0; });
  }
  function missingIn(st) {
    var all = [];
    for (var p = 1; p <= LAST_PAGE; p++) all = all.concat(missingOn(st, p));
    return all;
  }

  /* ---------- 점수 계산 ---------- */
  function excluded(c) {
    return EXCLUDE_RULES.some(function (r) {
      return r.candidates.indexOf(c.id) !== -1 && answered(r.q, r.values);
    });
  }
  // 점수 → 근거 수 → 가장 강한 근거 → 목록 순서
  function compare(a, b) {
    return b.score - a.score || b.reasons.length - a.reasons.length || b.peak - a.peak || a.idx - b.idx;
  }
  function score() {
    var res = [];
    CANDIDATES.forEach(function (c, i) {
      if (!excluded(c)) res.push({ c: c, idx: i, score: 0, reasons: [], peak: 0 });
    });
    QUESTIONS.forEach(function (q) {
      if (q.type === "text") return;
      selected(q).forEach(function (v) {
        var o = optOf(q, v);
        if (!o) return;
        res.forEach(function (r) {
          var w = o.w[r.c.id] || 0;
          r.score += w;
          if (w > r.peak) r.peak = w;
          if (w >= 2 && o.because) r.reasons.push({ w: w, text: o.because });
        });
      });
    });
    res.sort(compare);

    // 1순위 + 다른 분야 최고 후보 + 남은 후보 중 최고. 표시는 점수 순으로 다시 정렬
    var first = res[0];
    var other = res.filter(function (r) { return r.c.cat !== first.c.cat; })[0];
    var picked = [first];
    if (other) picked.push(other);
    var third = res.filter(function (r) { return picked.indexOf(r) === -1 && r.score > 0; })[0];
    if (third) picked.push(third);
    var natural = res.slice(0, 3);
    if (other && natural.indexOf(other) === -1) other.forced = true;
    picked.sort(compare);

    // 같은 근거 문장이 여러 후보에 반복되지 않게 나눠 씀
    var used = {};
    picked.forEach(function (r) {
      var sorted = r.reasons.slice().sort(function (a, b) { return b.w - a.w; });
      var fresh = sorted.filter(function (x) { return !used[x.text]; }).slice(0, 3);
      if (!fresh.length && sorted.length) fresh = [sorted[0]];
      fresh.forEach(function (x) { used[x.text] = 1; });
      r.shownReasons = fresh;
    });

    var more = res.filter(function (r) { return picked.indexOf(r) === -1 && r.score > 0; }).slice(0, 3);
    var tie = picked.length > 1 && picked[0].score === picked[1].score;
    return { shown: picked, more: more, tie: tie, max: Math.max(first.score, 1) };
  }
  function reasonText(r) {
    if (!r.shownReasons.length) return ALT_REASON;
    return r.shownReasons.map(function (x) { return x.text; }).join(" ") + " 그래서 " + r.c.fit;
  }
  function conflictNotes() {
    return CONFLICTS.filter(function (cf) {
      return cf.when.every(function (w) { return answered(w[0], w[1]); });
    }).map(function (cf) { return cf.text; });
  }

  /* ---------- 월별 할 일 ---------- */
  function daysLeft() { return daysBetween(todayStart(), parseDate(state.discharge)); }
  function stageTasks(cand, idx, second) {
    var stages = TRACKS[cand.track].stages;
    if (idx !== 0) return stages[idx].concat(COMMON_TASKS[idx]);
    var prep = PREP_TASKS[state.answers.prep] || PREP_TASKS.some;
    var trackTasks = prep.skipFirstStage ? stages[1].slice(0, 2) : stages[0].slice(0, 2);
    var region = REGION_TASKS[state.answers.region];
    var extra = [];
    if (state.role === "officer") extra.push(OFFICER_TASK);
    if (second) extra.push(SECOND_TASK.replace("{name}", second.name).replace("{task}", second.starter[0]));
    // 기간이 짧으면 앞쪽 할 일만 남으므로 중요도 순으로 둔다
    return [COMMON_TASKS[0][0], cand.starter[0]].concat(prep.before, cand.starter.slice(1), extra, trackTasks,
      region ? [region] : [], COMMON_TASKS[0].slice(1));
  }
  // 오늘부터 전역일까지를 1~3구간으로 고르게 나눔
  function buildPlan(cand, second) {
    var days = Math.max(daysLeft(), 0);
    var n = days <= 30 ? 1 : days <= 60 ? 2 : 3;
    var groups = n === 3 ? [[0], [1], [2]] : n === 2 ? [[0, 1], [2]] : [[0, 1, 2]];
    var today = todayStart();
    var seen = {};  // 구간이 달라도 같은 할 일은 한 번만
    return groups.map(function (g, i) {
      var startOff = Math.round(days * i / n);
      var endOff = i === n - 1 ? days : Math.max(Math.round(days * (i + 1) / n) - 1, startOff);
      var take = g.length === 1 ? 8 : g.length === 2 ? 4 : 3;
      var tasks = [];
      g.forEach(function (idx) {
        stageTasks(cand, idx, second).slice(0, take).forEach(function (t) {
          if (!seen[t]) { seen[t] = 1; tasks.push(t); }
        });
      });
      return {
        label: (i + 1) + "구간: " + fmt(addDays(today, startOff)) + " ~ " + fmt(addDays(today, endOff)),
        sub: g.map(function (s) { return STAGE_NAMES[s]; }).join(" · ") +
          " (" + dLabel(days - startOff) + " ~ " + dLabel(days - endOff) + ")",
        tasks: tasks.slice(0, 8)
      };
    });
  }

  /* ---------- 아이콘 (인라인 SVG, 외부 요청 없음) ---------- */
  var ICONS = {
    compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    edit: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    left: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    right: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>'
  };
  function icon(name) {
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>';
  }
  var PAGE_SHORT = { 1: "학력", 2: "경험", 3: "관심", 4: "가치", 5: "계획", 6: "메모" };

  /* ---------- 화면: 시작 ---------- */
  function renderStart() {
    var html = '<section class="hero">' +
      '<div class="hero-text">' +
      '<span class="eyebrow">전역 2~3개월 전 대원·간부를 위한 면담 준비</span>' +
      '<h1 tabindex="-1" class="focus-target">전역 후 진로,<br>구체적으로 정리해 볼까요?</h1>' +
      '<p class="lead">선택지에 답하면 면담에 바로 가져갈 수 있는 정리표와 진로 후보, 할 일 계획이 만들어져요.</p>' +
      '<ul class="meta-list">' +
      '<li>' + icon("clock") + '약 10~15분 소요</li>' +
      '<li>' + icon("layers") + '6단계 선택형 질문</li>' +
      '<li>' + icon("shield") + '로그인 없음 · 이 기기에만 저장</li>' +
      '</ul></div>' +
      '<div class="hero-side">';

    if (ui.resumeAvailable) {
      html += '<div class="card resume-card"><h2>' + (saved.done ? "확인한 결과가 있어요" : "작성하던 내용이 있어요") + '</h2>' +
        '<p class="muted small">이 기기에 저장된 기록이에요. 이어서 진행하거나 새로 시작할 수 있어요.</p>' +
        '<div class="btn-row"><button type="button" data-act="resume">' + icon(saved.done ? "clipboard" : "right") +
        (saved.done ? "결과 다시 보기" : "이어서 하기") + '</button>' +
        '<button type="button" class="danger" data-act="wipe">' + icon("refresh") + '지우고 새로 시작</button></div></div>';
    }

    html += '<div class="card start-card"><h2>시작하기</h2>' + errorBox() +
      '<fieldset class="plain"><legend class="q-title">구분</legend><div class="role-row">' +
      roleOption("soldier", "대원") + roleOption("officer", "간부") + '</div></fieldset>' +
      '<div class="field"><label class="q-title" for="discharge">전역(예정)일</label>' +
      '<span class="hint" id="discharge-hint">오늘부터 전역일까지를 나눠 할 일 계획을 만들어요.</span>' +
      '<input type="date" id="discharge" aria-describedby="discharge-hint" min="' + toDateStr(todayStart()) +
      '" value="' + esc(state.discharge) + '"></div>' +
      '<button type="button" class="block" data-act="start">시작하기' + icon("right") + '</button></div>' +
      '</div></section>';

    html += '<p class="section-label">결과로 받는 것</p><section class="features">' +
      feature("clipboard", "강점·경험 정리표", "복무 경험과 강점을 이력서·면접에서 쓸 수 있는 표현으로 정리해요.") +
      feature("star", "진로 후보 3개와 이유", "21개 진로 중 답변에 맞는 3개를 고르고, 왜 맞는지 설명해요.") +
      feature("calendar", "할 일 계획과 면담 질문", "전역일까지 구간별 할 일과 담당자에게 물어볼 질문 3개를 만들어요.") +
      '</section>';
    app.innerHTML = html;
  }
  function feature(ic, title, text) {
    return '<div class="card feature"><span class="feature-icon">' + icon(ic) + '</span><div><h3>' + title + '</h3><p>' + text + '</p></div></div>';
  }
  function roleOption(v, label) {
    return '<label class="option"><input type="radio" name="role" value="' + v + '"' +
      (state.role === v ? " checked" : "") + '><span class="opt-label">' + label + '</span></label>';
  }
  function errorBox() {
    return ui.error ? '<div class="error" role="alert" tabindex="-1" id="page-error">' + icon("alert") + '<span>' + esc(ui.error) + '</span></div>' : "";
  }

  /* ---------- 화면: 질문 ---------- */
  function stepper(p) {
    var items = "";
    for (var i = 1; i <= LAST_PAGE; i++) {
      var cls = i < p ? "done" : i === p ? "current" : "";
      items += '<li class="' + cls + '"' + (i === p ? ' aria-current="step"' : "") + '>' +
        '<span class="seg"></span><span class="step-label">' + i + '. ' + PAGE_SHORT[i] + '</span></li>';
    }
    return '<ol class="stepper" aria-label="진행 단계">' + items + '</ol>';
  }
  function renderQuiz() {
    var p = state.page;
    var numbered = QUESTIONS.filter(function (q) { return q.type !== "text"; });
    var html = '<div class="quiz-head">' + stepper(p) +
      '<h1 class="page-title focus-target" tabindex="-1"><span class="page-count">' + p + ' / ' + LAST_PAGE + ' 단계</span>' +
      esc(PAGE_TITLES[p]) + '</h1></div>' + errorBox();

    if (p < LAST_PAGE) {
      QUESTIONS.filter(function (q) { return q.page === p; }).forEach(function (q) {
        if (q.type === "text") {
          html += '<div class="card"><label class="q-title" for="q-' + q.id + '">' + esc(q.label) + '</label>' +
            '<span class="hint">비워 두어도 괜찮아요. 결과표에 그대로 들어가요. 이름·군번·부대 정보는 적지 마세요.</span>' +
            '<input type="text" id="q-' + q.id + '" data-q="' + q.id + '" maxlength="' + TEXT_MAX + '" placeholder="' +
            esc(q.placeholder || "") + '" value="' + esc(state.answers[q.id] || "") + '"></div>';
          return;
        }
        var isMissing = ui.missing.indexOf(q.id) !== -1;
        html += '<fieldset class="card' + (isMissing ? " missing" : "") + '" id="card-' + q.id + '">' +
          '<legend class="q-title"><span class="q-num">문항 ' + (numbered.indexOf(q) + 1) + ' / ' + numbered.length + '</span>' + esc(q.label) +
          (isMissing ? ' <span class="req">답해 주세요</span>' : '') + '</legend>';
        html += '<span class="hint">' + (q.type === "multi" ? (q.max ? "최대 " + q.max + "개까지 선택" : "해당하는 것을 모두 선택") : "하나만 선택") + '</span>';
        html += '<div class="options">';
        q.options.forEach(function (o) {
          var checked = selected(q).indexOf(o.v) !== -1;
          html += '<label class="option"><input type="' + (q.type === "multi" ? "checkbox" : "radio") +
            '" name="' + esc(q.id) + '" value="' + esc(o.v) + '"' + (checked ? " checked" : "") + '><span>' +
            '<span class="opt-label">' + esc(o.label) + '</span>' +
            (o.desc ? '<span class="desc">' + esc(o.desc) + '</span>' : "") + '</span></label>';
        });
        html += '</div></fieldset>';
      });
    } else {
      html += '<div class="card"><div class="notice">' + icon("info") + '<span>이름·군번·부대 정보는 적지 마세요. 적은 내용은 결과표에 그대로 들어가요.</span></div>' +
        '<div class="field"><label class="q-title" for="memo-want">전역 후 하고 싶은 것을 한 줄로 적어 주세요.</label>' +
        '<span class="hint">비워 두어도 괜찮아요.</span>' +
        '<input type="text" id="memo-want" maxlength="' + MEMO_MAX + '" placeholder="예: 네트워크 엔지니어로 일하기" value="' + esc(state.memo.want) + '"></div>' +
        '<div class="field" style="margin-bottom:0"><label class="q-title" for="memo-worry">가장 걱정되는 것은 무엇인가요?</label>' +
        '<span class="hint">비워 두어도 괜찮아요.</span>' +
        '<input type="text" id="memo-worry" maxlength="' + MEMO_MAX + '" placeholder="예: 경력이 없어서 서류에서 떨어질까 봐" value="' + esc(state.memo.worry) + '"></div></div>';
    }

    html += '<div class="quiz-nav">' +
      '<button type="button" class="secondary" data-act="prev">' + icon("left") + (p === 1 ? "처음으로" : "이전") + '</button>' +
      '<button type="button" data-act="next">' + (p === LAST_PAGE ? "결과 보기" : "다음") + icon(p === LAST_PAGE ? "check" : "right") + '</button></div>';
    app.innerHTML = html;
  }

  /* ---------- 화면: 결과 ---------- */
  function renderResult() {
    var sc = score();
    var best = sc.shown[0].c;
    var second = sc.shown[1] ? sc.shown[1].c : null;
    var days = daysLeft();
    var d = parseDate(state.discharge);
    var roleLabel = state.role === "officer" ? "간부" : "대원";
    var plan = buildPlan(best, second);

    var html = '<div class="toolbar no-print">' +
      '<button type="button" class="danger" data-act="wipe">' + icon("trash") + '기록 지우기</button>' +
      '<button type="button" class="secondary" data-act="edit">' + icon("edit") + '답변 수정</button>' +
      '<button type="button" data-act="print">' + icon("printer") + '인쇄 / PDF 저장</button></div>';

    // 문서 머리말: 제목 + 기본 정보 표
    html += '<section class="doc-head"><span class="doc-kicker">면담 준비 자료</span>' +
      '<h1 tabindex="-1" class="focus-target">전역 후 진로 방향 정리</h1>' +
      '<dl class="doc-meta">' +
      '<div><dt>구분</dt><dd>' + roleLabel + '</dd></div>' +
      '<div><dt>작성일</dt><dd>' + fmtFull(todayStart()) + '</dd></div>' +
      '<div><dt>전역(예정)일</dt><dd>' + fmtFull(d) + ' (' + dLabel(days) + ')</dd></div>' +
      '<div><dt>분야</dt><dd>' + esc(best.cat) + '</dd></div>' +
      '<div class="wide"><dt>1순위 방향</dt><dd>' + esc(best.name) + '</dd></div>' +
      '</dl></section>';

    html += '<nav class="jump no-print" aria-label="결과 바로가기">' +
      '<a href="#sec-1">' + icon("clipboard") + '정리표</a><a href="#sec-2">' + icon("star") + '진로 후보</a>' +
      '<a href="#sec-3">' + icon("calendar") + '할 일</a><a href="#sec-4">' + icon("message") + '면담 질문</a></nav>';

    // 1. 정리표
    html += section(1, "강점·경험 정리표", "면담과 이력서에서 쓸 수 있도록 답변을 정리했어요.") +
      '<div class="table-wrap"><table>' +
      '<thead><tr><th scope="col">항목</th><th scope="col">내 답변</th><th scope="col">이력서·면접에서 이렇게 말해 보세요</th></tr></thead><tbody>';
    var eduO = optOf(qById("eduLevel"), state.answers.eduLevel), majorO = optOf(qById("major"), state.answers.major);
    var majorName = String(state.answers.majorName || "").trim();
    html += row("학력·전공", esc(eduO ? eduO.label : "-") + " · " + esc(majorO ? majorO.label : "-") +
      (majorName ? " (" + esc(majorName) + ")" : ""));
    ["post", "cert", "strength"].forEach(function (id) {
      var q = qById(id);
      var sel = selected(q).map(function (v) { return optOf(q, v); }).filter(Boolean);
      html += '<tr><th scope="row">' + esc(q.short) + '</th><td>' + sel.map(function (o) { return esc(o.label); }).join("<br>") +
        '</td><td class="phrase">' + sel.map(function (o) { return esc(o.phrase || ""); }).join("<br>") + '</td></tr>';
    });
    ["interest", "value", "style", "study", "biz", "region", "prep"].forEach(function (id) {
      var q = qById(id);
      var labels = selected(q).map(function (v) { var o = optOf(q, v); return o ? (o.brief || o.label) : ""; }).filter(Boolean);
      html += row(q.short, esc(labels.join(", ") || "-"));
    });
    if (state.memo.want || state.memo.worry) {
      html += row("나의 메모", (state.memo.want ? "하고 싶은 것: " + esc(state.memo.want) + "<br>" : "") +
        (state.memo.worry ? "걱정되는 것: " + esc(state.memo.worry) : ""));
    }
    html += '</tbody></table></div></section>';

    // 2. 진로 후보
    html += section(2, "진로 후보와 이유", "답변을 점수로 계산한 결과예요. 정답이 아니라 면담에서 이야기를 시작하는 출발점으로 활용하세요.");
    conflictNotes().forEach(function (t) { html += '<div class="notice warn">' + icon("alert") + '<span>' + esc(t) + '</span></div>'; });
    if (sc.tie) html += '<div class="notice">' + icon("info") + '<span>1순위와 2순위의 점수가 같아요. 두 방향을 함께 비교해 보세요.</span></div>';
    sc.shown.forEach(function (r, i) {
      var pct = Math.max(Math.round((Math.max(r.score, 0) / sc.max) * 100), 5);
      html += '<article class="cand' + (i === 0 ? " top" : "") + '"><div class="cand-head">' +
        '<span class="rank-badge">' + (i + 1) + '순위</span>' +
        '<div class="cand-title"><h3>' + esc(r.c.name) + '</h3><div class="tags"><span class="tag">' + esc(r.c.cat) + '</span>' +
        (r.forced ? '<span class="tag alt">다른 분야 대안</span>' : '') + '</div></div>' +
        '<span class="score">점수 <b>' + r.score + '</b></span></div>' +
        '<div class="meter" aria-hidden="true"><span style="width:' + pct + '%"></span></div>' +
        '<p class="desc">' + esc(r.c.desc) + '</p>' +
        (r.forced ? '<p class="alt-note">1순위와 다른 분야 중에서 가장 가까운 후보예요.</p>' : '') +
        '<div class="reason"><span class="reason-label">왜 이 방향?</span><p>' + esc(reasonText(r)) + '</p></div></article>';
    });
    if (sc.more.length) {
      html += '<div class="more"><p class="more-title">그 밖에 살펴볼 만한 진로</p><ul>' +
        sc.more.map(function (r) {
          return '<li><span class="more-name">' + esc(r.c.name) + '</span><span class="tag">' + esc(r.c.cat) + '</span>' +
            '<span class="more-desc">' + esc(r.c.desc) + '</span></li>';
        }).join("") + '</ul></div>';
    }
    if (state.answers.value === "unsure") {
      html += '<div class="notice" style="margin:14px 0 0">' + icon("info") + '<span>아직 방향이 정해지지 않았다면, 1순위 하나만 붙잡기보다 2~3순위까지 면담에서 같이 비교해 보세요.</span></div>';
    }
    html += '</section>';

    // 3. 기간별 할 일
    html += section(3, "기간별 할 일", '1순위 "' + esc(best.name) + '" 기준으로, 오늘부터 전역일까지를 나눠 정리했어요.') + '<ol class="timeline">';
    plan.forEach(function (s, i) {
      html += '<li class="stage"><div class="stage-head"><h3><span class="stage-no">' + (i + 1) + '구간</span> ' +
        esc(s.label.replace(/^\d+구간: /, "")) + '</h3><span class="stage-sub">' + esc(s.sub) + '</span></div><ul class="tasks">' +
        s.tasks.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ul></li>';
    });
    html += '</ol></section>';

    // 4. 면담 질문: 1순위, 2순위(없으면 유형 질문), 공통
    var qs = [best.ask, second ? second.ask : TRACKS[best.track].ask, COMMON_INTERVIEW_Q];
    html += section(4, "면담 때 물어볼 질문", "담당자에게 그대로 물어보세요.") + '<ol class="qs">' +
      qs.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ol></section>';

    html += '<div class="card info-card">' + icon("info") + '<div><h3>군 전직지원 안내</h3>' +
      '<p>전역 후 지원 제도는 제대군인지원센터(<a href="https://www.vnet.go.kr" target="_blank" rel="noopener noreferrer">vnet.go.kr</a>)에서 최신 내용을 확인할 수 있어요. 면담 때 담당자에게도 함께 물어보세요.</p></div></div>';

    html += '<div class="toolbar no-print" style="margin-top:20px">' +
      '<button type="button" class="secondary" data-act="edit">' + icon("edit") + '답변 수정</button>' +
      '<button type="button" data-act="print">' + icon("printer") + '인쇄 / PDF 저장</button></div>';
    app.innerHTML = html;
  }
  function section(n, title, desc) {
    return '<section class="card section" id="sec-' + n + '"><h2 class="sec-title"><span class="sec-num">' + n + '</span>' + title + '</h2>' +
      (desc ? '<p class="sec-desc">' + desc + '</p>' : '');
  }
  function row(th, tdHtml) {
    return '<tr><th scope="row">' + esc(th) + '</th><td colspan="2">' + tdHtml + '</td></tr>';
  }

  /* ---------- 렌더 ---------- */
  function render() {
    app.className = "wrap screen-" + ui.screen;
    if (ui.screen === "start") renderStart();
    else if (ui.screen === "quiz") renderQuiz();
    else renderResult();
    document.title = ui.screen === "quiz" ? state.page + "/" + LAST_PAGE + " " + PAGE_TITLES[state.page] + " | " + BASE_TITLE
      : ui.screen === "result" ? "결과 | " + BASE_TITLE : BASE_TITLE;
    window.scrollTo(0, 0);
    // 화면이 바뀌면 키보드·스크린리더 위치를 제목(오류가 있으면 오류)으로 옮김
    var target = document.getElementById("page-error") || app.querySelector(".focus-target");
    if (target && ui.focus) target.focus({ preventScroll: !document.getElementById("page-error") });
    if (ui.missing.length && ui.focus) {
      var first = document.getElementById("card-" + ui.missing[0]);
      if (first) first.scrollIntoView({ block: "center" });
    }
    ui.focus = true;  // 첫 로드에는 포커스를 옮기지 않음
  }
  function show(screen, error, missing) {
    ui.screen = screen;
    ui.error = error || "";
    ui.missing = missing || [];
    render();
  }

  /* ---------- 오류 표시 정리 ---------- */
  function clearErrors(card) {
    ui.error = "";
    Array.prototype.forEach.call(app.querySelectorAll(".error"), function (el) { el.parentNode.removeChild(el); });
    if (card) {
      card.classList.remove("missing");
      var req = card.querySelector(".req");
      if (req) req.parentNode.removeChild(req);
      ui.missing = ui.missing.filter(function (id) { return "card-" + id !== card.id; });
    }
  }
  function showCardError(card, msg) {
    clearErrors();
    var div = document.createElement("div");
    div.className = "error card-error";
    div.setAttribute("role", "alert");
    div.innerHTML = icon("alert") + "<span>" + esc(msg) + "</span>";
    var opts = card.querySelector(".options");
    card.insertBefore(div, opts);
  }

  /* ---------- 이벤트 ---------- */
  app.addEventListener("change", function (e) {
    var t = e.target;
    if (t.name === "role") {
      state.role = t.value;
      clearErrors();
      return;
    }
    var q = qById(t.name);
    if (!q || q.type === "text") return;
    var card = document.getElementById("card-" + q.id);
    if (q.type === "single") {
      state.answers[q.id] = t.value;
    } else {
      var cur = selected(q).slice();
      var opt = optOf(q, t.value);
      if (t.checked) {
        if (opt.exclusive) {
          cur = [t.value];
        } else {
          cur = cur.filter(function (v) { return !optOf(q, v).exclusive; });
          if (q.max && cur.length >= q.max) {
            t.checked = false;
            if (card) showCardError(card, "최대 " + q.max + "개까지만 고를 수 있어요. 다른 항목을 먼저 해제해 주세요.");
            return;
          }
          cur.push(t.value);
        }
      } else {
        cur = cur.filter(function (v) { return v !== t.value; });
      }
      state.answers[q.id] = cur;
      // 상호 배타 항목 처리를 위해 체크 상태를 동기화
      Array.prototype.forEach.call(app.querySelectorAll('input[name="' + q.id + '"]'), function (inp) {
        inp.checked = cur.indexOf(inp.value) !== -1;
      });
    }
    clearErrors(card);
    save();
  });

  app.addEventListener("input", function (e) {
    var t = e.target;
    if (t.id === "memo-want") { state.memo.want = t.value.slice(0, MEMO_MAX); save(); }
    if (t.id === "memo-worry") { state.memo.worry = t.value.slice(0, MEMO_MAX); save(); }
    if (t.id === "discharge") { state.discharge = t.value; clearErrors(); }
    var qid = t.getAttribute("data-q");
    if (qid) { state.answers[qid] = t.value.slice(0, TEXT_MAX); save(); }
  });

  app.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-act]");
    if (!btn) return;
    var act = btn.getAttribute("data-act");

    if (act === "start") {
      var dEl = document.getElementById("discharge");
      if (dEl) state.discharge = dEl.value;
      if (!state.role) return show("start", "대원 또는 간부를 선택해 주세요.");
      if (!state.discharge) return show("start", "전역(예정)일을 입력해 주세요.");
      if (!validDateStr(state.discharge)) return show("start", "전역(예정)일을 날짜 형식에 맞게 입력해 주세요.");
      if (isPast(state.discharge)) return show("start", "오늘 또는 이후 날짜를 입력해 주세요.");
      if (ui.resumeAvailable) {
        // 저장된 기록이 있는데 이어서 하기 대신 새로 시작하는 경우
        if (!window.confirm("이 기기에 이전 기록이 있어요. 지우고 새로 시작할까요?\n이어서 하려면 '취소'를 누른 뒤 '이어서 하기'를 눌러 주세요.")) return;
        var role = state.role, discharge = state.discharge;
        state = freshState();
        state.role = role;
        state.discharge = discharge;
        saved = null;
        ui.resumeAvailable = false;
      }
      save();
      show(state.done ? "result" : "quiz");
    } else if (act === "resume") {
      var keepRole = state.role, keepDate = state.discharge;
      state = saved;
      saved = null;
      ui.resumeAvailable = false;
      if (!state.role) state.role = keepRole;
      if (!state.role || isPast(state.discharge)) {
        // 구분이 없거나 저장된 전역일이 지났으면 다시 입력받고, 답변은 유지
        state.discharge = isPast(state.discharge) ? (isPast(keepDate) ? "" : keepDate) : state.discharge;
        return show("start", "저장된 답변을 불러왔어요. 전역(예정)일과 구분을 확인한 뒤 '시작하기'를 눌러 주세요.");
      }
      show(state.done ? "result" : "quiz");
    } else if (act === "wipe") {
      if (!window.confirm("저장된 기록을 모두 지울까요?")) return;
      clearSaved();
      state = freshState();
      saved = null;
      ui.resumeAvailable = false;
      show("start");
    } else if (act === "prev") {
      if (state.page === 1) return show("start");
      state.page -= 1;
      save();
      show("quiz");
    } else if (act === "next") {
      var missing = missingOn(state, state.page);
      if (missing.length) {
        return show("quiz", "아직 답하지 않은 질문이 있어요: " +
          missing.map(function (q) { return "'" + q.short + "'"; }).join(", "),
          missing.map(function (q) { return q.id; }));
      }
      if (state.page < LAST_PAGE) {
        state.page += 1;
        save();
        show("quiz");
      } else {
        var all = missingIn(state);  // 저장 기록을 고쳐 쓴 경우 대비
        if (all.length) {
          state.page = all[0].page;
          return show("quiz", "아직 답하지 않은 질문이 있어요: '" + all[0].short + "'", [all[0].id]);
        }
        state.done = true;
        save();
        show("result");
      }
    } else if (act === "edit") {
      state.page = 1;
      state.done = false;
      save();
      show("quiz");
    } else if (act === "print") {
      window.print();
    }
  });

  render();
})();
