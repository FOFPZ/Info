/* ============================================================================
   Терминал страницы. Логика: команды, автозагрузка, темы, история ввода.
   Внешних запросов нет, данные берутся из profile.js.
   ========================================================================= */
(function () {
  "use strict";

  var P = window.PROFILE || {};

  /* --- элементы ---------------------------------------------------------- */
  var root      = document.documentElement;
  var screen    = document.getElementById("screen");
  var output    = document.getElementById("output");
  var promptRow = document.getElementById("prompt-row");
  var cmd       = document.getElementById("cmd");
  var statusEl  = document.getElementById("status-msg");
  var clockEl   = document.getElementById("clock");
  var themeEl   = document.getElementById("theme-name");
  var themeBtn  = document.getElementById("theme-btn");
  var booting   = true;

  /* подпись приглашения берётся из профиля */
  function bindAll(key, text) {
    var nodes = document.querySelectorAll('[data-bind="' + key + '"]');
    Array.prototype.forEach.call(nodes, function (n) { n.textContent = text; });
  }
  bindAll("host", (P.host || "anon") + ":");
  bindAll("dir", P.dir || "~");

  if (promptRow && promptRow.tagName === "FORM") {
    promptRow.addEventListener("submit", function (e) { e.preventDefault(); });
  }

  /* --- темы -------------------------------------------------------------- */
  var THEMES = ["green", "amber", "ice"];
  var THEME_NAMES = { green: "phosphor-green", amber: "phosphor-amber", ice: "cold-ice" };
  var STORE_KEY = "fofpz-theme";

  function setTheme(name, announce) {
    if (THEMES.indexOf(name) === -1) name = THEMES[0];
    root.setAttribute("data-theme", name);
    if (themeEl) themeEl.textContent = THEME_NAMES[name];
    if (themeBtn) themeBtn.setAttribute("aria-label", "Тема: " + THEME_NAMES[name] + " (сменить)");
    try { localStorage.setItem(STORE_KEY, name); } catch (e) { /* приватный режим */ }
    touchVisit();
    if (announce) print.line("тема: " + THEME_NAMES[name], "muted");
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) {}
    setTheme(saved || THEMES[0], false);
  }

  /* --- уменьшенная анимация --------------------------------------------- */
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* --- печать ------------------------------------------------------------ */
  function mk(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }

  function scrollDown() {
    if (screen) screen.scrollTop = screen.scrollHeight;
  }

  function trim() {
    while (output.childNodes.length > 700) output.removeChild(output.firstChild);
  }

  var print = {
    line: function (text, cls) {
      var el = mk("div", "line" + (cls ? " " + cls : ""), text);
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    blank: function () { return print.line("\u00a0", "blank"); },
    ascii: function (text) {
      var el = mk("pre", "line ascii", text);
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    kv: function (k, v) {
      var el = mk("div", "line kv");
      el.appendChild(mk("span", "k", k));
      el.appendChild(mk("span", "v", v));
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    bar: function (k, v) {
      var n = Math.max(0, Math.min(100, Number(v) || 0));
      var width = 22;
      var filled = Math.round((n / 100) * width);
      var el = mk("div", "line kv skill");
      el.appendChild(mk("span", "k", k));
      el.appendChild(mk("span", "bar", "\u2588".repeat(filled) + "\u2591".repeat(width - filled)));
      el.appendChild(mk("span", "v", n + "%"));
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    tags: function (items) {
      var el = mk("div", "line tags");
      items.forEach(function (t) { el.appendChild(mk("span", "tag", t)); });
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    link: function (label, url, note) {
      var el = mk("div", "line link-row");
      var a = mk("a", "link", label);
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer nofollow";
      el.appendChild(a);
      if (note) el.appendChild(mk("span", "note", "\u2014 " + note));
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    neofetch: function (logo, rows) {
      var el = mk("div", "line neo");
      var pre = mk("pre", "neo-logo", logo);
      var side = mk("div", "neo-side");
      side.appendChild(mk("div", "neo-title", (P.host || "anon")));
      side.appendChild(mk("div", "neo-sep", "\u2500".repeat((P.host || "anon").length)));
      rows.forEach(function (r) {
        var line = mk("div", "neo-row");
        line.appendChild(mk("span", "k", r.k));
        line.appendChild(mk("span", "v", r.v));
        side.appendChild(line);
      });
      el.appendChild(pre);
      el.appendChild(side);
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    echo: function (rawLine, cls) {
      /* строка приглашения вместе с введённой командой */
      var el = mk("div", "line cmd-echo" + (cls ? " " + cls : ""));
      el.appendChild(mk("span", "ps1", (P.host || "anon") + ":" + (P.dir || "~") + "$"));
      el.appendChild(mk("span", "cmd-text", rawLine));
      output.appendChild(el); trim(); scrollDown();
      return el;
    }
  };

  /* --- SHA-256: пароль хранится только в виде хеша ----------------------- */
  function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var cp = str.codePointAt(i);
      if (cp > 0xffff) i++;
      if (cp < 0x80) out.push(cp);
      else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
      else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    }
    return new Uint8Array(out);
  }

  function sha256hex(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    var len = bytes.length;
    var padded = Math.ceil((len + 9) / 64) * 64;
    var buf = new Uint8Array(padded);
    buf.set(bytes);
    buf[len] = 0x80;
    var dv = new DataView(buf.buffer);
    var bits = len * 8;
    dv.setUint32(padded - 8, Math.floor(bits / 4294967296));
    dv.setUint32(padded - 4, bits >>> 0);
    var w = new Uint32Array(64);
    for (var off = 0; off < padded; off += 64) {
      var t;
      for (t = 0; t < 16; t++) w[t] = dv.getUint32(off + t * 4);
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(function (x) { return ("00000000" + x.toString(16)).slice(-8); }).join("");
  }

  /* --- режим владельца ----------------------------------------------------
     ВАЖНО: это демонстрация доступа на статичной странице, а не защита.
     В коде лежит только SHA-256 хеш пароля, сам пароль в репозиторий не
     попадает. Всё содержимое страницы по-прежнему публично в исходниках.
     ---------------------------------------------------------------------- */
  var AUTH = {
    user: "fofpz",
    passSha256: "bd87a45a29b400e16cc289f309b34eebb7961af6843feb2a3663ae07119f1f61"
  };
  var OWNER_KEY = "fofpz-owner";

  var dlg      = document.getElementById("login-dialog");
  var dlgForm  = document.getElementById("login-form");
  var dlgUser  = document.getElementById("login-user");
  var dlgPass  = document.getElementById("login-pass");
  var dlgMsg   = document.getElementById("login-msg");
  var dlgClose = document.getElementById("login-cancel");
  var loginBtn = document.getElementById("login-btn");
  var owner    = false;

  function openLogin() {
    if (owner) { print.line("вы уже в режиме владельца", "muted"); return; }
    if (!dlg) return;
    dlg.hidden = false;
    dlgMsg.textContent = "";
    dlgUser.value = "";
    dlgPass.value = "";
    dlgUser.focus();
  }

  function closeLogin() {
    if (dlg) dlg.hidden = true;
    if (!cmd.disabled) cmd.focus();
  }

  function setOwner(on, announce) {
    owner = on;
    if (COMMANDS.secret) COMMANDS.secret.hidden = !on;
    if (loginBtn) {
      loginBtn.textContent = on ? "выйти" : "войти";
      loginBtn.setAttribute("aria-label", on ? "Выйти из режима владельца" : "Войти в режим владельца");
    }
    try {
      if (on) sessionStorage.setItem(OWNER_KEY, "1");
      else sessionStorage.removeItem(OWNER_KEY);
    } catch (e) { /* приватный режим */ }
    touchVisit();
    if (announce) {
      if (on) {
        print.line("доступ разрешён. добро пожаловать, " + (P.nick || "FOFPZ"), "accent");
        print.line("открыта команда: secret", "muted");
      } else {
        print.line("сеанс владельца закрыт", "muted");
      }
      print.blank();
    }
  }

  function tryLogin() {
    var u = dlgUser.value.trim().toLowerCase();
    var ok = u === AUTH.user && sha256hex(utf8Bytes(dlgPass.value)) === AUTH.passSha256;
    if (ok) {
      closeLogin();
      setOwner(true, true);
      setStatus("владелец в системе");
    } else {
      dlgMsg.textContent = "отказано в доступе";
      dlgPass.value = "";
      if (dlg) {
        dlg.classList.remove("shake");
        void dlg.offsetWidth;
        dlg.classList.add("shake");
      }
      dlgPass.focus();
    }
  }

  if (dlgForm) {
    dlgForm.addEventListener("submit", function (e) { e.preventDefault(); tryLogin(); });
  }
  if (dlgClose) dlgClose.addEventListener("click", closeLogin);
  if (dlg) {
    dlg.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeLogin();
    });
  }
  if (loginBtn) {
    loginBtn.addEventListener("click", function () {
      if (owner) { setOwner(false, true); }
      else { openLogin(); }
      if (!booting && !cmd.disabled) cmd.focus();
    });
  }

  /* --- журнал сеансов -----------------------------------------------------
     Хранится ТОЛЬКО в localStorage браузера текущего посетителя и никуда
     не отправляется. Каждый видит лишь собственный журнал: владелец —
     свой, гость — свой. Узнать чужих посетителей статичная страница без
     внешней аналитики не может.
     ---------------------------------------------------------------------- */
  var JKEY = "fofpz-journal";

  function journal() {
    try {
      var j = JSON.parse(localStorage.getItem(JKEY) || "null");
      if (!j || typeof j !== "object") j = { visits: [], cmds: [] };
      if (!Array.isArray(j.visits)) j.visits = [];
      if (!Array.isArray(j.cmds)) j.cmds = [];
      return j;
    } catch (e) {
      return { visits: [], cmds: [] };
    }
  }

  function journalSave(j) {
    try { localStorage.setItem(JKEY, JSON.stringify(j)); } catch (e) {}
  }

  function touchVisit() {
    var j = journal();
    var v = j.visits[j.visits.length - 1];
    if (!v) { v = { start: Date.now() }; j.visits.push(v); }
    v.end = Date.now();
    v.theme = root.getAttribute("data-theme") || v.theme || "green";
    v.owner = owner;
    if (j.visits.length > 100) j.visits = j.visits.slice(-100);
    journalSave(j);
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "medium" });
  }

  function fmtDur(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + " с";
    return Math.floor(s / 60) + " мин " + (s % 60) + " с";
  }

  function browserName() {
    var ua = navigator.userAgent || "";
    function pick(re, name) {
      var m = ua.match(re);
      return m ? name + " " + String(m[1]).split(".")[0] : null;
    }
    return pick(/Edg\/([\d.]+)/, "edge") ||
           pick(/OPR\/([\d.]+)/, "opera") ||
           pick(/Firefox\/([\d.]+)/, "firefox") ||
           pick(/Chrome\/([\d.]+)/, "chrome") ||
           pick(/Version\/([\d.]+).*Safari/, "safari") ||
           "неизвестен";
  }

  /* --- ascii-лого -------------------------------------------------------- */
  var LOGO_BIG = [
    "███████╗  ██████╗ ███████╗ ██████╗  ███████╗",
    "██╔════╝ ██╔═══██╗██╔════╝ ██╔══██╗ ╚══███╔╝",
    "█████╗   ██║   ██║█████╗   ██████╔╝   ███╔╝",
    "██╔══╝   ██║   ██║██╔══╝   ██╔═══╝   ███╔╝",
    "██║      ╚██████╔╝██║      ██║      ███████╗",
    "╚═╝       ╚═════╝ ╚═╝      ╚═╝      ╚══════╝"
  ].join("\n");

  var LOGO_SMALL = [
    "┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐",
    "├─  │ │ ├─  ├─┘  ─┤",
    "┘   └─┘ ┘   ┘   └─┘"
  ].join("\n");

  function logo() {
    return window.innerWidth < 620 ? LOGO_SMALL : LOGO_BIG;
  }

  /* --- команды ----------------------------------------------------------- */
  var startedAt = Date.now();

  function uptimeString() {
    var s = Math.floor((Date.now() - startedAt) / 1000);
    var m = Math.floor(s / 60);
    var h = Math.floor(m / 60);
    if (h > 0) return h + " ч " + (m % 60) + " мин";
    if (m > 0) return m + " мин " + (s % 60) + " с";
    return s + " с";
  }

  var COMMANDS = {
    help: {
      d: "список команд",
      run: function () {
        print.line("доступные команды:", "muted");
        Object.keys(COMMANDS).forEach(function (name) {
          var c = COMMANDS[name];
          if (c.hidden) return;
          print.kv(name, c.d);
        });
        print.blank();
        print.line("↑ ↓ — история, tab — дополнить, ctrl+l — очистить", "muted");
      }
    },
    whoami: {
      d: "кто я (кратко)",
      run: function () {
        print.line(P.nick || "anon", "accent");
        (P.facts || []).forEach(function (f) { print.kv(f.k, f.v); });
      }
    },
    about: {
      d: "немного о себе",
      run: function () {
        (P.about || []).forEach(function (t) { print.line(t); print.blank(); });
      }
    },
    projects: {
      d: "мои проекты",
      run: function () {
        var list = P.projects || [];
        if (!list.length) { print.line("не публикуются", "muted"); return; }
        list.forEach(function (p) {
          var head = mk("div", "line proj-head");
          head.appendChild(mk("span", "accent", p.name));
          if (p.status) head.appendChild(mk("span", "muted", " · " + p.status));
          output.appendChild(head);
          print.line(p.desc);
          if (p.tags && p.tags.length) print.tags(p.tags);
          if (p.url) print.link(p.url.replace(/^https?:\/\//, ""), p.url);
          print.blank();
        });
      }
    },
    skills: {
      d: "навыки и уровни",
      run: function () {
        (P.skills || []).forEach(function (s) { print.bar(s.k, s.v); });
        if (!P.skills || !P.skills.length) print.line("не публикуются", "muted");
      }
    },
    stack: {
      d: "инструменты",
      run: function () {
        if (P.stack && P.stack.length) print.tags(P.stack);
        else print.line("не публикуется", "muted");
      }
    },
    links: {
      d: "публичные ссылки",
      run: function () {
        (P.links || []).forEach(function (l) { print.link(l.label, l.url, l.note); });
        if (!P.links || !P.links.length) print.line("ссылок нет", "muted");
      }
    },
    contact: {
      d: "как связаться",
      run: function () {
        (P.contact || []).forEach(function (t) { print.line(t); });
      }
    },
    privacy: {
      d: "что скрыто и почему",
      run: function () {
        (P.privacy || []).forEach(function (t, i) { print.line((i + 1) + ". " + t); });
      }
    },
    neofetch: {
      d: "сводка о системе",
      run: function () {
        var rows = (P.neofetch || []).slice();
        rows.push({ k: "uptime", v: uptimeString() });
        rows.push({ k: "тема", v: THEME_NAMES[root.getAttribute("data-theme")] || "-" });
        rows.push({ k: "экран", v: window.innerWidth + "x" + window.innerHeight });
        print.neofetch(logo(), rows);
      }
    },
    ls: {
      d: "показать разделы как файлы",
      run: function () {
        var names = Object.keys(FILES);
        print.line("всего " + names.length, "muted");
        print.tags(names);
        print.line("cat <файл> — открыть раздел", "muted");
      }
    },
    cat: {
      d: "cat <файл> — открыть раздел",
      run: function (args) {
        var name = args[0];
        if (!name) { print.line("использование: cat <файл>", "err"); return; }
        if (!FILES[name]) {
          print.line("cat: " + name + ": нет такого файла", "err");
          print.line("доступно: " + Object.keys(FILES).join(", "), "muted");
          return;
        }
        COMMANDS[FILES[name]].run([]);
      }
    },
    echo: {
      d: "echo <текст> — вывести текст",
      run: function (args) { print.line(args.join(" ")); }
    },
    date: {
      d: "текущие дата и время",
      run: function () {
        print.line(new Date().toLocaleString("ru-RU", { dateStyle: "full", timeStyle: "medium" }));
      }
    },
    uptime: {
      d: "сколько длится сеанс",
      run: function () { print.line("сеанс: " + uptimeString()); }
    },
    theme: {
      d: "theme [green|amber|ice] — оформление",
      run: function (args) {
        if (args[0]) { setTheme(args[0], true); return; }
        var i = THEMES.indexOf(root.getAttribute("data-theme"));
        setTheme(THEMES[(i + 1) % THEMES.length], true);
      }
    },
    clear: {
      d: "очистить экран",
      run: function () { output.innerHTML = ""; }
    },
    exit: {
      d: "закрыть сеанс",
      run: function () {
        print.line("Соединение закрыто.", "muted");
        cmd.disabled = true;
        cmd.placeholder = "сеанс завершён — обновите страницу";
        setStatus("сеанс завершён");
      }
    },
    login: {
      d: "войти в режим владельца",
      run: function () { openLogin(); }
    },
    logout: {
      d: "закрыть сеанс владельца",
      run: function () {
        if (!owner) { print.line("вы не входили", "muted"); return; }
        setOwner(false, true);
      }
    },
    secret: {
      d: "заметка владельца",
      hidden: true,
      run: function () {
        if (!owner) {
          print.line("сначала войдите: команда login или кнопка «войти» в шапке", "warn");
          return;
        }
        (P.ownerNote || []).forEach(function (t) { print.line(t); });
      }
    },
    who: {
      d: "кто сейчас на сайте (этот браузер)",
      run: function () {
        var j = journal();
        var v = j.visits[j.visits.length - 1] || { start: Date.now() };
        print.kv("статус", owner ? "владелец" : "гость");
        print.kv("визит номер", String(j.visits.length));
        print.kv("сеанс начат", fmtDate(v.start));
        print.kv("длительность", fmtDur(Date.now() - v.start));
        print.kv("тема", THEME_NAMES[root.getAttribute("data-theme")] || "-");
        print.kv("браузер", browserName());
        print.kv("экран", window.innerWidth + "x" + window.innerHeight);
        print.line("журнал хранится только в этом браузере и никуда не уходит", "muted");
      }
    },
    history: {
      d: "history [N] — журнал команд этого браузера",
      run: function (args) {
        var j = journal();
        var n = parseInt(args[0], 10) || 30;
        if (!j.cmds.length) { print.line("журнал команд пуст", "muted"); return; }
        print.line("последние команды (хранятся только здесь):", "muted");
        j.cmds.slice(-n).forEach(function (e) {
          print.kv(new Date(e.t).toLocaleTimeString("ru-RU", { hour12: false }), e.c);
        });
      }
    },
    sessions: {
      d: "история визитов этого браузера",
      run: function () {
        var j = journal();
        if (!j.visits.length) { print.line("визитов не записано", "muted"); return; }
        print.line("последние визиты (хранятся только здесь):", "muted");
        j.visits.slice(-10).forEach(function (v) {
          print.kv(fmtDate(v.start), fmtDur((v.end || v.start) - v.start) +
            (v.owner ? " · владелец" : "") + " · " + (THEME_NAMES[v.theme] || v.theme));
        });
      }
    },
    journal: {
      d: "journal clear|export — управление журналом",
      run: function (args) {
        var sub = (args[0] || "").toLowerCase();
        if (sub === "clear") {
          try { localStorage.removeItem(JKEY); } catch (e) {}
          print.line("журнал очищен", "muted");
          return;
        }
        if (sub === "export") {
          try {
            var blob = new Blob([JSON.stringify(journal(), null, 2)], { type: "application/json" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "fofpz-journal.json";
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
            print.line("файл журнала скачан", "muted");
          } catch (e) {
            print.line("браузер не дал скачать файл: " + e.message, "err");
          }
          return;
        }
        print.line("использование: journal clear | journal export", "muted");
      }
    },
    sudo: {
      d: "не рекомендуется",
      hidden: true,
      run: function () {
        print.line((P.nick || "anon") + " не в списке sudoers. Инцидент будет записан.", "warn");
        print.line("(шутка: никаких записей не ведётся)", "muted");
      }
    }
  };

  /* файлы для ls/cat → команды */
  var FILES = {
    "whoami.txt":   "whoami",
    "about.txt":    "about",
    "projects.txt": "projects",
    "skills.txt":   "skills",
    "stack.txt":   "stack",
    "links.txt":   "links",
    "contact.txt": "contact",
    "privacy.txt": "privacy"
  };

  /* --- выполнение -------------------------------------------------------- */
  function setStatus(text) { if (statusEl) statusEl.textContent = text; }

  function run(raw) {
    var line = raw.trim();
    print.echo(line);
    if (!line) return;

    history.push(line);
    historyIndex = history.length;

    var j = journal();
    j.cmds.push({ t: Date.now(), c: line });
    if (j.cmds.length > 500) j.cmds = j.cmds.slice(-500);
    journalSave(j);
    touchVisit();

    var parts = line.split(/\s+/);
    var name = parts[0].toLowerCase();
    var args = parts.slice(1);

    if (COMMANDS[name]) {
      try {
        COMMANDS[name].run(args);
        setStatus("ok: " + name);
      } catch (err) {
        print.line("ошибка выполнения: " + err.message, "err");
        setStatus("ошибка");
      }
    } else {
      print.line(name + ": команда не найдена", "err");
      print.line("введите help, чтобы увидеть список команд", "muted");
      setStatus("не найдено: " + name);
    }
    print.blank();
  }

  /* --- история и ввод ---------------------------------------------------- */
  var history = [];
  var historyIndex = 0;

  cmd.addEventListener("keydown", function (e) {
    if (booting) { skipBoot(); return; }

    if (e.key === "Enter") {
      e.preventDefault();
      var value = cmd.value;
      cmd.value = "";
      run(value);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (historyIndex > 0) { historyIndex--; cmd.value = history[historyIndex]; }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        historyIndex++;
        cmd.value = history[historyIndex];
      } else {
        historyIndex = history.length;
        cmd.value = "";
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      complete();
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      COMMANDS.clear.run([]);
    }
  });

  function complete() {
    var value = cmd.value.trim().toLowerCase();
    if (!value) return;
    var matches = Object.keys(COMMANDS).filter(function (n) {
      return n.indexOf(value) === 0;
    });
    if (matches.length === 1) {
      cmd.value = matches[0] + " ";
    } else if (matches.length > 1) {
      print.echo(cmd.value);
      print.tags(matches);
    }
  }

  /* клик по экрану — фокус в поле ввода */
  if (screen) {
    screen.addEventListener("click", function (e) {
      if (booting) { skipBoot(); return; }
      if (e.target && e.target.closest && e.target.closest("a")) return;
      if (!cmd.disabled) cmd.focus();
    });
  }

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var i = THEMES.indexOf(root.getAttribute("data-theme"));
      setTheme(THEMES[(i + 1) % THEMES.length], !booting);
      if (!booting) cmd.focus();
    });
  }

  window.addEventListener("beforeunload", touchVisit);

  /* --- часы в строке состояния ------------------------------------------ */
  function tick() {
    if (!clockEl) return;
    clockEl.textContent = new Date().toLocaleTimeString("ru-RU", { hour12: false });
  }

  /* --- автозагрузка ------------------------------------------------------ */
  var skip = false;
  function skipBoot() { skip = true; }

  function sleep(ms) {
    return new Promise(function (resolve) {
      if (skip || reduce) { resolve(); return; }
      setTimeout(resolve, ms);
    });
  }

  function typeCommand(text) {
    return new Promise(function (resolve) {
      var el = print.echo("");
      var target = el.querySelector(".cmd-text");
      if (skip || reduce) { target.textContent = text; resolve(); return; }
      var i = 0;
      (function step() {
        target.textContent = text.slice(0, ++i);
        scrollDown();
        if (i < text.length) setTimeout(step, 34);
        else setTimeout(resolve, 220);
      })();
    });
  }

  function bootLine(prefix, text, cls) {
    var el = mk("div", "line boot");
    el.appendChild(mk("span", "boot-pre", prefix));
    el.appendChild(mk("span", "boot-txt", text));
    if (cls) el.classList.add(cls);
    output.appendChild(el);
    scrollDown();
  }

  async function boot() {
    initTheme();
    tick();
    setInterval(tick, 1000);

    document.addEventListener("keydown", skipBoot, { once: true });

    setStatus("загрузка");

    await sleep(200);
    bootLine("[ ok ]", " инициализация ядра");
    await sleep(180);
    bootLine("[ ok ]", " подключение к " + (P.nick || "anon"));
    await sleep(180);
    bootLine("[ ok ]", " телеметрия, счётчики, cookies");
    bootLine("[выкл]", " ничего из этого не используется", "ok");
    await sleep(200);
    bootLine("[ .. ]", " поиск личных данных");
    await sleep(340);
    bootLine("[ -- ]", " не найдено. так и задумано", "warn");
    await sleep(240);
    bootLine("[ ok ]", " сеанс открыт");
    await sleep(220);
    print.blank();
    print.ascii(logo());
    print.line("анонимная визитка · " + (P.role || "аноним"), "muted");
    print.blank();

    await typeCommand("whoami");
    COMMANDS.whoami.run([]);
    print.blank();
    print.line("введите help, чтобы увидеть все команды", "hint");
    print.blank();

    var savedOwner = false;
    try { savedOwner = sessionStorage.getItem(OWNER_KEY) === "1"; } catch (e) {}
    if (savedOwner) {
      setOwner(true, false);
      print.line("сеанс владельца восстановлен", "muted");
      print.blank();
    }

    booting = false;
    skip = false;
    document.removeEventListener("keydown", skipBoot);
    promptRow.classList.add("ready");
    cmd.disabled = false;
    cmd.placeholder = "";
    cmd.focus({ preventScroll: true });
    setStatus("готово");
    document.title = (P.nick || "FOFPZ") + " — анонимная визитка";
  }

  boot();
})();
