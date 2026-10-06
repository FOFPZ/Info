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
  bindAll("title", P.siteTitle || "визитка");

  if (promptRow && promptRow.tagName === "FORM") {
    promptRow.addEventListener("submit", function (e) { e.preventDefault(); });
  }

  /* --- темы -------------------------------------------------------------- */
  var THEMES = ["green", "amber", "ice", "violet", "crimson", "paper"];
  var THEME_NAMES = {
    green: "phosphor-green", amber: "phosphor-amber", ice: "cold-ice",
    violet: "purple-moon", crimson: "crimson-alert", paper: "paper-white"
  };
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

  /* --- анимация появления: вывод печатается по символам -------------------
     Отключается при prefers-reduced-motion и параметром ?noanim в адресе.
     Клик по экрану или новая команда досрочно показывают текст целиком.
     ---------------------------------------------------------------------- */
  var ANIM = { enabled: !reduce, queue: [], running: false };
  try { if (/[?&]noanim/.test(location.search)) ANIM.enabled = false; } catch (e) {}

  function pump() {
    if (ANIM.running) return;
    var job = ANIM.queue.shift();
    if (!job) return;
    ANIM.running = true;
    (function step() {
      if (job.done) { ANIM.running = false; pump(); return; }
      job.i = Math.min(job.text.length, job.i + 2);
      job.target.textContent = job.text.slice(0, job.i);
      scrollDown();
      if (job.i >= job.text.length) {
        job.done = true;
        setTimeout(function () { ANIM.running = false; pump(); }, 40);
      } else {
        setTimeout(step, 12);
      }
    })();
  }

  function finishNow() {
    ANIM.queue.forEach(function (job) { if (!job.done) job.finish(); });
    ANIM.queue.length = 0;
    ANIM.running = false;
  }

  function typeInto(el, text, cls) {
    if (!ANIM.enabled || cls === "blank" || !text) { el.textContent = text; return; }
    el.textContent = "";
    var job = {
      text: text, i: 0, done: false, target: el,
      finish: function () { this.done = true; el.textContent = text; }
    };
    ANIM.queue.push(job);
    pump();
  }

  function revealCls() { return ANIM.enabled ? " reveal-in" : ""; }

  var print = {
    line: function (text, cls) {
      var el = mk("div", "line" + (cls ? " " + cls : ""), "");
      output.appendChild(el); trim(); scrollDown();
      typeInto(el, text, cls);
      return el;
    },
    blank: function () { return print.line("\u00a0", "blank"); },
    ascii: function (text) {
      var el = mk("pre", "line ascii" + revealCls(), text);
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    kv: function (k, v) {
      var el = mk("div", "line kv" + revealCls());
      el.appendChild(mk("span", "k", k));
      el.appendChild(mk("span", "v", v));
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    bar: function (k, v) {
      var n = Math.max(0, Math.min(100, Number(v) || 0));
      var width = 22;
      var filled = Math.round((n / 100) * width);
      var el = mk("div", "line kv skill" + revealCls());
      el.appendChild(mk("span", "k", k));
      el.appendChild(mk("span", "bar", "\u2588".repeat(filled) + "\u2591".repeat(width - filled)));
      el.appendChild(mk("span", "v", n + "%"));
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    tags: function (items) {
      var el = mk("div", "line tags" + revealCls());
      items.forEach(function (t) { el.appendChild(mk("span", "tag", t)); });
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    link: function (label, url, note) {
      var el = mk("div", "line link-row" + revealCls());
      var a = mk("a", "link", label);
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer nofollow";
      el.appendChild(a);
      if (note) el.appendChild(mk("span", "note", "\u2014 " + note));
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    icons: function (items) {
      var el = mk("div", "line icons-row" + revealCls());
      items.forEach(function (it) {
        var wrap = mk("span", "ticon-wrap");
        var s = mk("span", "ticon");
        var url = "assets/icons/" + it.file;
        s.style.maskImage = "url(" + url + ")";
        s.style.webkitMaskImage = "url(" + url + ")";
        s.setAttribute("title", it.label || it.file);
        wrap.appendChild(s);
        wrap.appendChild(mk("span", "ticon-label", it.label || it.file));
        el.appendChild(wrap);
      });
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    section: function (title) {
      var el = mk("div", "line section" + revealCls());
      el.appendChild(mk("span", "section-title", title));
      output.appendChild(el); trim(); scrollDown();
      return el;
    },
    neofetch: function (logo, rows) {
      var el = mk("div", "line neo" + revealCls());
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
      var ps = mk("span", "ps1");
      ps.appendChild(mk("span", "ps1-host", (P.host || "anon") + ":"));
      ps.appendChild(mk("span", "ps1-dir", P.dir || "~"));
      ps.appendChild(mk("span", "ps1-dollar", "$"));
      if (owner) ps.appendChild(mk("span", "ps1-owner", "(владелец)"));
      el.appendChild(ps);
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
    var badge = document.getElementById("owner-badge");
    var seg = document.getElementById("owner-seg");
    if (badge) badge.hidden = !on;
    if (seg) seg.hidden = !on;
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

  /* --- вкладки сайта: проекты и друзья живут здесь, не в консоли ---------- */
  var VIEWS = ["terminal", "projects", "friends", "log"];
  var MOVED = {
    projects: { view: "projects", title: "проекты" },
    friend:   { view: "friends",  title: "друзья" },
    log:      { view: "log",      title: "лог" }
  };

  function switchView(name) {
    if (VIEWS.indexOf(name) === -1) name = "terminal";
    VIEWS.forEach(function (v) {
      var sec = document.getElementById("view-" + v);
      var tab = document.getElementById("tab-" + v);
      if (sec) sec.hidden = v !== name;
      if (tab) tab.classList.toggle("active", v === name);
    });
    try {
      if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
    } catch (e) {}
    return name;
  }

  function markSpan(kind) {
    var url = "assets/icons/" + kind + ".svg";
    var m = mk("span", "mark");
    m.style.setProperty("-webkit-mask-image", "url('" + url + "')");
    m.style.setProperty("mask-image", "url('" + url + "')");
    return m;
  }

  function renderProjects() {
    var grid = document.getElementById("projects-grid");
    if (!grid) return;
    grid.innerHTML = "";
    (P.projects || []).forEach(function (p) {
      var card = mk("article", "card glass");
      var media = mk("div", "card-media");
      if (p.logo) {
        var img = document.createElement("img");
        img.className = "card-logo";
        img.src = p.logo;
        img.alt = "";
        img.loading = "lazy";
        img.addEventListener("error", function () {
          img.style.display = "none";
          if (p.mark) media.insertBefore(markSpan(p.mark), media.firstChild);
        });
        media.appendChild(img);
      } else if (p.mark) {
        media.appendChild(markSpan(p.mark));
      }
      var head = mk("div", "card-head");
      head.appendChild(mk("h3", "card-title", p.name));
      if (p.status) head.appendChild(mk("span", "chip", p.status));
      media.appendChild(head);
      card.appendChild(media);
      card.appendChild(mk("p", "card-text", p.desc));
      if (p.tags && p.tags.length) {
        var tags = mk("div", "tags");
        p.tags.forEach(function (t) { tags.appendChild(mk("span", "tag", t)); });
        card.appendChild(tags);
      }
      var links = mk("div", "card-links");
      if (p.url) {
        var a = mk("a", "card-link", "репозиторий →");
        a.href = p.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer nofollow";
        links.appendChild(a);
      }
      if (p.download) {
        var d = mk("a", "card-link", "скачать →");
        d.href = p.download;
        d.target = "_blank";
        d.rel = "noopener noreferrer nofollow";
        links.appendChild(d);
      }
      if (links.childNodes.length) card.appendChild(links);
      grid.appendChild(card);
    });
  }

  function renderFriends() {
    var grid = document.getElementById("friends-grid");
    if (!grid) return;
    grid.innerHTML = "";
    (P.friends || []).forEach(function (f) {
      var url = f.url || ("https://t.me/" + String(f.handle).replace("@", ""));
      var card = mk("article", "card glass");
      var row = mk("div", "friend-row");
      var av = mk("span", "avatar", String(f.handle).replace("@", "").charAt(0).toUpperCase());
      row.appendChild(av);
      var info = mk("div", "friend-info");
      var a = mk("a", "friend-handle", f.handle);
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer nofollow";
      info.appendChild(a);
      info.appendChild(mk("span", "friend-tag", "telegram"));
      row.appendChild(info);
      card.appendChild(row);
      if (f.note) card.appendChild(mk("p", "card-text", f.note));
      var tg = mk("a", "card-link", "написать в telegram →");
      tg.href = url;
      tg.target = "_blank";
      tg.rel = "noopener noreferrer nofollow";
      card.appendChild(tg);
      grid.appendChild(card);
    });
  }

  function renderLog() {
    var list = document.getElementById("log-list");
    if (!list) return;
    list.innerHTML = "";
    (P.changelog || []).forEach(function (e) {
      var li = mk("li", "log-row");
      li.appendChild(mk("span", "log-v", "v" + e.v));
      li.appendChild(mk("p", "log-text", e.t));
      list.appendChild(li);
    });
  }

  function initViews() {
    renderProjects();
    renderFriends();
    renderLog();
    Array.prototype.forEach.call(document.querySelectorAll(".tab, .view-back"), function (tab) {
      tab.addEventListener("click", function () {
        if (switchView(tab.getAttribute("data-view")) === "terminal" && !booting && !cmd.disabled) {
          cmd.focus();
        }
      });
    });
    window.addEventListener("hashchange", function () {
      switchView((location.hash || "#terminal").slice(1));
    });
    switchView((location.hash || "#terminal").slice(1));
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
        GROUPS.forEach(function (g) {
          var names = g[1].filter(function (n) {
            return COMMANDS[n] && !COMMANDS[n].hidden;
          });
          if (!names.length) return;
          print.section(g[0]);
          names.forEach(function (n) { print.kv(n, COMMANDS[n].d); });
        });
        print.blank();
        print.line("↑ ↓ — история · tab — дополнить · ctrl+l — очистить · ? — тоже help", "muted");
        print.line("проекты и друзья — вкладки сайта наверху", "muted");
      }
    },
    whoami: {
      d: "кто я (кратко)",
      run: function () {
        print.section("whoami");
        print.line(P.nick || "anon", "accent");
        (P.facts || []).forEach(function (f) { print.kv(f.k, f.v); });
      }
    },
    about: {
      d: "немного о себе",
      run: function () {
        print.section("обо мне");
        (P.about || []).forEach(function (t) { print.line(t); print.blank(); });
      }
    },
    skills: {
      d: "навыки и уровни",
      run: function () {
        print.section("навыки");
        (P.skills || []).forEach(function (s) { print.bar(s.k, s.v); });
        if (!P.skills || !P.skills.length) print.line("не публикуются", "muted");
      }
    },
    stack: {
      d: "инструменты",
      run: function () {
        print.section("инструменты");
        if (P.stack && P.stack.length) print.tags(P.stack);
        else print.line("не публикуется", "muted");
      }
    },
    links: {
      d: "публичные ссылки",
      run: function () {
        print.section("ссылки");
        (P.links || []).forEach(function (l) { print.link(l.label, l.url, l.note); });
        if (!P.links || !P.links.length) print.line("ссылок нет", "muted");
      }
    },
    contact: {
      d: "как связаться",
      run: function () {
        print.section("связь");
        (P.contact || []).forEach(function (t) { print.line(t); });
      }
    },
    privacy: {
      d: "что скрыто и почему",
      run: function () {
        print.section("приватность");
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
    matrix: {
      hidden: true,
      run: function () {
        print.line("подключаюсь к дождю…", "muted");
        matrixFx();
      }
    },
    "42": {
      hidden: true,
      run: function () {
        print.line("42. ответ готов, вопрос за вами.", "accent");
      }
    },
    привет: {
      hidden: true,
      run: function () {
        print.line("и здравствуйте. редкий случай, когда терминал приветствуют.", "warn");
      }
    },
    coffee: {
      hidden: true,
      run: function () {
        print.line("☕ налито. локально, без выхода из браузера.", "muted");
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
        print.section("кто на сайте");
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
        print.section("журнал команд");
        if (!j.cmds.length) { print.line("журнал команд пуст", "muted"); return; }
        print.line("хранится только в этом браузере:", "muted");
        j.cmds.slice(-n).forEach(function (e) {
          print.kv(new Date(e.t).toLocaleTimeString("ru-RU", { hour12: false }), e.c);
        });
      }
    },
    sessions: {
      d: "история визитов этого браузера",
      run: function () {
        var j = journal();
        print.section("визиты");
        if (!j.visits.length) { print.line("визитов не записано", "muted"); return; }
        print.line("хранится только в этом браузере:", "muted");
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
    "skills.txt":   "skills",
    "stack.txt":   "stack",
    "links.txt":   "links",
    "contact.txt": "contact",
    "privacy.txt":  "privacy"
  };

  /* разделы справки */
  var GROUPS = [
    ["база",              ["help", "whoami", "about", "skills", "stack"]],
    ["связи",             ["links", "contact"]],
    ["анонимность",       ["privacy", "mask"]],
    ["журнал (локально)", ["who", "history", "sessions", "journal"]],
    ["владелец",          ["login", "logout", "secret"]],
    ["система",           ["ls", "cat", "echo", "date", "uptime", "theme", "log", "clear", "exit"]]
  ];

  /* --- выполнение -------------------------------------------------------- */
  var ALIAS = { "?": "help", "h": "help", "cls": "clear", "man": "help" };

  function setStatus(text) { if (statusEl) statusEl.textContent = text; }

  function suggestFor(name) {
    var first = name.charAt(0);
    var list = Object.keys(COMMANDS).filter(function (n) {
      return n.charAt(0) === first && n !== name && n.indexOf(name) !== 0;
    });
    return list[0] || null;
  }

  function run(raw) {
    finishNow();
    var line = raw.trim();
    print.echo(line);
    updateGhost();
    if (!line) return;

    history.push(line);
    historyIndex = history.length;

    var j = journal();
    j.cmds.push({ t: Date.now(), c: line });
    if (j.cmds.length > 500) j.cmds = j.cmds.slice(-500);
    journalSave(j);
    touchVisit();

    var parts = line.split(/\s+/);
    var name = ALIAS[parts[0].toLowerCase()] || parts[0].toLowerCase();
    var args = parts.slice(1);

    if (MOVED[name]) {
      print.line("этот раздел живёт на сайте — открываю вкладку «" + MOVED[name].title + "»", "muted");
      switchView(MOVED[name].view);
      return;
    }

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
      var guess = suggestFor(name);
      if (guess) print.line("возможно, вы имели в виду: " + guess, "muted");
      else print.line("введите help, чтобы увидеть список команд", "muted");
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
      updateGhost();
    } else if (e.key === "ArrowRight" && cmd.selectionStart === cmd.value.length) {
      e.preventDefault();
      complete();
      updateGhost();
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      COMMANDS.clear.run([]);
    }
    updateGhost();
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

  /* --- призрачная подсказка: дописывает команду полупрозрачно ----------- */
  var ghost = document.getElementById("ghost");

  function updateGhost() {
    if (!ghost) return;
    var typed = cmd.value;
    var v = typed.trim().toLowerCase();
    var g = "";
    if (v && !/\s/.test(v)) {
      var m = Object.keys(COMMANDS).filter(function (n) { return n.indexOf(v) === 0; });
      if (m.length) g = m[0].slice(typed.trim().length);
    }
    ghost.textContent = g;
  }

  cmd.addEventListener("input", updateGhost);

  /* клик по экрану — фокус в поле ввода */
  if (screen) {
    screen.addEventListener("click", function (e) {
      if (booting) { skipBoot(); return; }
      finishNow();
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

  /* --- пасхалки ----------------------------------------------------------- */
  function matrixFx() {
    var scr = document.getElementById("screen");
    if (!scr) return;
    if (reduce) { print.line("дождь отключён настройкой уменьшенного движения.", "muted"); return; }
    var cv = document.createElement("canvas");
    cv.className = "matrix-fx";
    scr.appendChild(cv);
    var ctx = cv.getContext ? cv.getContext("2d") : null;
    if (!ctx) {
      if (cv.remove) cv.remove(); else scr.removeChild(cv);
      print.line("дождь не пришёл: браузер без канваса.", "muted");
      return;
    }
    cv.width = scr.clientWidth || 600;
    cv.height = scr.clientHeight || 400;
    var cols = Math.max(8, Math.floor(cv.width / 10));
    var y = [];
    for (var i = 0; i < cols; i++) y.push(Math.floor(Math.random() * -20));
    var glyphs = "01@#$%&<>!ｱｲｳｴｵｶｷｸ";
    var t0 = Date.now();
    (function frame() {
      ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = getComputedStyle(root).getPropertyValue("--accent") || "#4dff9b";
      ctx.font = "12px monospace";
      for (var c = 0; c < cols; c++) {
        ctx.fillText(glyphs.charAt(Math.floor(Math.random() * glyphs.length)), c * 10, y[c] * 12);
        if (y[c] * 12 > cv.height && Math.random() > 0.975) y[c] = 0;
        y[c]++;
      }
      if (Date.now() - t0 < 2800) requestAnimationFrame(frame);
      else {
        if (cv.remove) cv.remove(); else scr.removeChild(cv);
        print.line("дождь закончился. проснись, fofpz.", "muted");
      }
    })();
  }

  function disco() {
    print.line("пасхалка разблокирована: режим дискотеки.", "accent");
    if (reduce) return;
    var before = root.getAttribute("data-theme");
    var n = 0;
    var iv = setInterval(function () {
      setTheme(THEMES[n % THEMES.length], false);
      if (++n >= 10) { clearInterval(iv); setTheme(before, false); }
    }, 650);
  }

  var KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
                "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  var kpos = 0;
  document.addEventListener("keydown", function (e) {
    var k = e.key && e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === KONAMI[kpos]) {
      kpos++;
      if (kpos === KONAMI.length) { kpos = 0; disco(); }
    } else {
      kpos = (k === KONAMI[0]) ? 1 : 0;
    }
  });

  var logoClicks = 0;
  var logoEl = document.querySelector(".brand-logo");
  if (logoEl) {
    logoEl.addEventListener("click", function () {
      logoClicks++;
      if (logoClicks === 7) {
        logoClicks = 0;
        switchView("terminal");
        print.line("семь кликов по лого. терминал помнит добро.", "warn");
      }
    });
  }

  window.addEventListener("beforeunload", touchVisit);

  /* --- часы в строке состояния ------------------------------------------ */
  function tick() {
    if (!clockEl) return;
    clockEl.textContent = new Date().toLocaleTimeString("ru-RU", { hour12: false });
  }

  /* --- мягкий фон: сверху медленно плывут приглушённые глифы ------------- */
  function initBackground() {
    if (reduce) return;
    var canvas = document.createElement("canvas");
    canvas.id = "bg";
    canvas.setAttribute("aria-hidden", "true");
    document.body.insertBefore(canvas, document.body.firstChild);
    var ctx = canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) return;

    var glyphs = "01·+*◦∙";
    var parts = [];
    var W = 0, H = 0;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var color = "#4dff9b";
    var lastTheme = root.getAttribute("data-theme");

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.max(1, W * dpr);
      canvas.height = Math.max(1, H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function make(fromTop) {
      return {
        x: Math.random() * W,
        y: fromTop ? -24 : Math.random() * H,
        s: 12 + Math.random() * 10,
        v: 0.35 + Math.random() * 0.9,
        a: 0.08 + Math.random() * 0.14,
        d: (Math.random() - 0.5) * 0.2,
        g: glyphs.charAt(Math.floor(Math.random() * glyphs.length))
      };
    }

    function readAccent() {
      var c = "";
      try { c = getComputedStyle(root).getPropertyValue("--accent").trim(); } catch (e) {}
      return c || "#4dff9b";
    }

    resize();
    color = readAccent();
    var n = Math.max(60, Math.min(160, Math.floor(W / 14)));
    for (var i = 0; i < n; i++) parts.push(make(false));
    window.addEventListener("resize", resize);

    (function loop() {
      if (root.getAttribute("data-theme") !== lastTheme) {
        lastTheme = root.getAttribute("data-theme");
        color = readAccent();
      }
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = color;
      for (var k = 0; k < parts.length; k++) {
        var p = parts[k];
        p.y += p.v;
        p.x += p.d;
        if (p.y > H + 24 || p.x < -24 || p.x > W + 24) { parts[k] = make(true); continue; }
        ctx.globalAlpha = p.a;
        ctx.font = p.s + "px monospace";
        ctx.fillText(p.g, p.x, p.y);
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(loop);
    })();
  }

  /* --- засекреченная дата: живые символы вместо знаков вопроса ----------- */
  function initSecretDate() {
    var cfg = P.secretDate || {};
    var target = cfg.date || "20.09.2027";
    var el = document.getElementById("secret-date");
    var l1 = document.getElementById("secret-line1");
    var pool = "@#$%!&<>";

    if (l1) l1.textContent = cfg.line1 || "";
    if (!el) return;

    var digits = [];
    for (var i = 0; i < target.length; i++) {
      if (target.charAt(i) !== ".") digits.push(i);
    }

    /* сценарий круга: сначала прожектор по одной цифре (2@.@#… -> @#.0@.…),
       потом цифры накапливаются слева направо, пауза — и по новой -------- */
    var seq = [];
    digits.forEach(function (d) { seq.push([d]); });
    for (var k = 1; k <= digits.length; k++) seq.push(digits.slice(0, k));
    var cur = [];
    var si = 0;

    function rnd() { return pool.charAt(Math.floor(Math.random() * pool.length)); }

    function draw() {
      var out = "";
      for (var i = 0; i < target.length; i++) {
        var ch = target.charAt(i);
        if (ch === ".") { out += "."; continue; }
        out += cur.indexOf(i) !== -1 ? ch : rnd();
      }
      el.textContent = out;
    }

    draw();
    if (reduce) return;

    /* скрытые места шевелятся символами */
    setInterval(draw, 600);

    (function step() {
      var idx = si % seq.length;
      cur = seq[idx];
      draw();
      si++;
      var delay = idx === seq.length - 1 ? 4600 : (cur.length === 1 ? 1100 : 850);
      setTimeout(step, delay);
    })();
  }

  function startSecretLine2() {
    var cfg = P.secretDate || {};
    var l2 = document.getElementById("secret-line2");
    var text = cfg.line2 || "";
    if (!l2) return;
    if (reduce || !ANIM.enabled) { l2.textContent = text; return; }
    setTimeout(function () {
      var i = 0;
      (function step() {
        l2.textContent = text.slice(0, ++i);
        if (i < text.length) setTimeout(step, 48);
      })();
    }, 900);
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

  function progress() {
    return new Promise(function (resolve) {
      var el = mk("div", "line boot-bar");
      output.appendChild(el);
      scrollDown();
      if (skip || reduce) {
        el.textContent = "[" + "#".repeat(14) + "] 100%";
        resolve();
        return;
      }
      var p = 0;
      (function step() {
        p = Math.min(100, p + 6 + Math.random() * 10);
        var filled = Math.round(p / 100 * 14);
        el.textContent = "[" + "#".repeat(filled) + ".".repeat(14 - filled) + "] " + Math.round(p) + "%";
        scrollDown();
        if (p < 100) setTimeout(step, 55);
        else setTimeout(resolve, 160);
      })();
    });
  }

  async function boot() {
    initTheme();
    initBackground();
    initSecretDate();
    initViews();
    tick();
    setInterval(tick, 1000);

    document.addEventListener("keydown", skipBoot, { once: true });

    setStatus("загрузка");

    await sleep(200);
    bootLine("[ ok ]", " ядро терминала, сборка 7");
    await sleep(180);
    bootLine("[ ok ]", " подключение: " + (P.nick || "anon"));
    await sleep(180);
    bootLine("[ ok ]", " телеметрия, счётчики, cookies");
    bootLine("[выкл]", " ничего из перечисленного не используется", "ok");
    await sleep(200);
    bootLine("[ .. ]", " поиск личных данных");
    await sleep(340);
    bootLine("[ -- ]", " не найдено. так и задумано", "warn");
    await sleep(240);
    bootLine("[ ok ]", " сеанс открыт. добро пожаловать");
    await sleep(220);
    await progress();
    print.blank();
    print.ascii(logo());
    print.line(P.tagline || ("анонимная визитка · " + (P.role || "аноним")), "tagline");
    if (P.icons && P.icons.length) print.icons(P.icons);
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
    startSecretLine2();
    document.removeEventListener("keydown", skipBoot);
    promptRow.classList.add("ready");
    cmd.disabled = false;
    cmd.placeholder = "";
    cmd.focus({ preventScroll: true });
    setStatus("готово");
    document.title = P.siteTitle || ((P.nick || "FOFPZ") + " — анонимная визитка");
  }

  boot();
})();
