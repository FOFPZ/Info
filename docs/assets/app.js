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
