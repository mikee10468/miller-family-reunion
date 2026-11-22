/* =========================================================================
   Backend connection — paste your Supabase keys here (see supabase/SETUP.md).
   The "anon public" key is SAFE to ship in a web app: it can only do what the
   database security rules (Row-Level Security) allow. NEVER paste service_role.
   Until these are filled in, the app runs in "offline/preview" mode and the
   Request Access form just saves locally.
   ========================================================================= */
window.MILLER_CONFIG = {
  SUPABASE_URL: "https://nlhjhirkvoftutpwfalh.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_wJmbfSBeEh_cFqsM8Ika-w_Xu0yNOyw",

  // App-level settings (editable anytime)
  photoLimitPerUser: 3,       // free photos per member (Step 4)
  videosEnabled: false,       // premium video uploads off until you set a fee (Step 4)
  facebookPageUrl: "",        // your family Facebook page/group, for the Share button
  siteUrl: "https://mikee10468.github.io/miller-family-reunion/", // public app URL (used in invite messages)

  // Web Push public key (safe to ship). The matching PRIVATE key is a Supabase
  // secret (VAPID_PRIVATE_KEY) used only by the send-push Edge Function.
  vapidPublicKey: "BDvUAInDL7LCGcjxkWDuRCtlcet_8E7cJNsmBk9WBFJ61Ehou2cllmJB0xZzd5213MC4W1MkuR6XNnFfkIZKu8s",
};

// True only when real keys have been pasted in.
window.MILLER_CONFIGURED = (function () {
  var c = window.MILLER_CONFIG || {};
  return (
    typeof c.SUPABASE_URL === "string" &&
    c.SUPABASE_URL.indexOf("http") === 0 &&
    typeof c.SUPABASE_ANON_KEY === "string" &&
    c.SUPABASE_ANON_KEY.indexOf("PASTE_") !== 0 &&
    c.SUPABASE_ANON_KEY.length > 20
  );
})();

/* =========================================================================
   Theme: light / dark / system. Applied on every page (this file loads first).
   window.MillerTheme = { get, set(mode), cycle() }  mode in light|dark|system
   ========================================================================= */
(function () {
  var KEY = "millerTheme";
  function prefersDark() { try { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; } catch (e) { return false; } }
  function apply(mode) {
    mode = mode || "system";
    var dark = mode === "dark" || (mode === "system" && prefersDark());
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme-pref", mode);
  }
  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  apply(saved() || "system");
  try {
    if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      var p = saved(); if (!p || p === "system") apply("system");
    });
  } catch (e) {}
  window.MillerTheme = {
    get: function () { return saved() || "system"; },
    set: function (t) { try { localStorage.setItem(KEY, t); } catch (e) {} apply(t); },
    cycle: function () { var o = ["light", "dark", "system"], i = o.indexOf(this.get()); var n = o[(i + 1) % o.length]; this.set(n); return n; },
  };
  var css =
    'html[data-theme="dark"] body{background:#160f1c !important;color:#e9def5 !important;}' +
    'html[data-theme="dark"] .card,html[data-theme="dark"] .branchcard{background:#241a2e !important;border-color:#3a2a46 !important;color:#e9def5 !important;}' +
    'html[data-theme="dark"] h1,html[data-theme="dark"] h2,html[data-theme="dark"] h3,html[data-theme="dark"] .card h2{color:#efe2ff !important;}' +
    'html[data-theme="dark"] .meta,html[data-theme="dark"] .lede,html[data-theme="dark"] .empty,html[data-theme="dark"] .quiet,html[data-theme="dark"] .hint,html[data-theme="dark"] .who{color:#cabedb !important;}' +
    'html[data-theme="dark"] input,html[data-theme="dark"] select,html[data-theme="dark"] textarea{background:#2c2138 !important;color:#e9def5 !important;border-color:#4a3a57 !important;}' +
    'html[data-theme="dark"] .node.pill{background:#312542 !important;}html[data-theme="dark"] .pill .node__name{color:#f3ecff !important;font-weight:700 !important;}' +
    'html[data-theme="dark"] .node__name,html[data-theme="dark"] .col__title,html[data-theme="dark"] .bc__name{color:#f3ecff !important;font-weight:700 !important;}' +
    'html[data-theme="dark"] .thread,html[data-theme="dark"] .panel{background:#1d1526 !important;}' +
    'html[data-theme="dark"] .m.them{background:#2c2138 !important;color:#e9def5 !important;}' +
    'html[data-theme="dark"] .nitem,html[data-theme="dark"] .fitem,html[data-theme="dark"] .row,html[data-theme="dark"] .list>.row{border-color:#3a2a46 !important;}' +
    'html[data-theme="dark"] .cchip,html[data-theme="dark"] .tab,html[data-theme="dark"] .cat,html[data-theme="dark"] .nchip,html[data-theme="dark"] .toggle button{background:#2c2138 !important;color:#e9def5 !important;}' +
    'html[data-theme="dark"] .tab.active,html[data-theme="dark"] .cchip.on,html[data-theme="dark"] .toggle button.on{background:linear-gradient(180deg,#6d28a8,#3b0a58) !important;color:#fff !important;}' +
    'html[data-theme="dark"] option{background:#2c2138;color:#e9def5;}' +
    'html[data-theme="dark"] .subbanner,html[data-theme="dark"] .col__title,html[data-theme="dark"] .scrollhint,html[data-theme="dark"] .momtag,html[data-theme="dark"] .badge,html[data-theme="dark"] .role-chip{color:#cdbbe0 !important;}' +
    'html[data-theme="dark"] .subtreebtn{background:#2c2138 !important;color:#d7bbf5 !important;border-color:#6d4a8a !important;}' +
    'html[data-theme="dark"] .desc li,html[data-theme="dark"] .col__title{color:#e9def5 !important;}' +
    'html[data-theme="dark"] .btn--outline{color:#d7bbf5 !important;border-color:#6d4a8a !important;}' +
    'html[data-theme="dark"] .filterbar input,html[data-theme="dark"] .treesearch{background:#2c2138 !important;color:#e9def5 !important;border-color:#4a3a57 !important;}' +
    'html[data-theme="dark"] .filtercount{color:#b9a9cb !important;}' +
    'html[data-theme="dark"] a.home,html[data-theme="dark"] a{color:#d7bbf5;}' +
    '.topbar{padding-right:52px !important;}' +
    '#miller-theme-ctl{position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);right:8px;z-index:9999;font-family:"Cinzel",serif;}' +
    '#miller-theme-ctl .mtc-btn{width:34px;height:34px;border-radius:50%;border:0;cursor:pointer;background:rgba(20,8,30,.5);color:#fff;font-size:1rem;line-height:1;box-shadow:0 2px 6px rgba(0,0,0,.35);}' +
    '#miller-theme-ctl .mtc-menu{position:absolute;top:40px;right:0;background:#fff;border:1px solid rgba(109,40,168,.25);border-radius:10px;box-shadow:0 8px 22px rgba(30,10,45,.3);overflow:hidden;min-width:134px;}' +
    '#miller-theme-ctl .mtc-opt{display:block;width:100%;text-align:left;padding:.55rem .85rem;border:0;background:#fff;color:#2e2435;font:inherit;font-size:.85rem;cursor:pointer;}' +
    '#miller-theme-ctl .mtc-opt:hover{background:#f3ecfb;}#miller-theme-ctl .mtc-opt.on{background:#efe6f7;font-weight:700;}' +
    'html[data-theme="dark"] #miller-theme-ctl .mtc-menu{background:#241a2e;border-color:#3a2a46;}' +
    'html[data-theme="dark"] #miller-theme-ctl .mtc-opt{background:#241a2e;color:#e9def5;}html[data-theme="dark"] #miller-theme-ctl .mtc-opt:hover{background:#2f2340;}html[data-theme="dark"] #miller-theme-ctl .mtc-opt.on{background:#3a2a46;}';
  function inject() { if (document.getElementById("miller-theme-css")) return; var s = document.createElement("style"); s.id = "miller-theme-css"; s.textContent = css; (document.head || document.documentElement).appendChild(s); }
  if (document.head) inject(); else document.addEventListener("DOMContentLoaded", inject);

  // Floating top-right Appearance control (light / dark / system) on every page.
  function buildThemeControl() {
    if (document.getElementById("miller-theme-ctl") || !document.body) return;
    var wrap = document.createElement("div"); wrap.id = "miller-theme-ctl";
    var btn = document.createElement("button"); btn.className = "mtc-btn"; btn.type = "button"; btn.title = "Appearance"; btn.setAttribute("aria-label", "Appearance"); btn.textContent = "🌓";
    var menu = document.createElement("div"); menu.className = "mtc-menu"; menu.style.display = "none";
    [["light", "☀️ Light"], ["dark", "🌙 Dark"], ["system", "🖥️ System"]].forEach(function (o) {
      var b = document.createElement("button"); b.className = "mtc-opt"; b.type = "button"; b.dataset.mode = o[0]; b.textContent = o[1];
      b.addEventListener("click", function (e) { e.stopPropagation(); window.MillerTheme.set(o[0]); mark(); menu.style.display = "none"; });
      menu.appendChild(b);
    });
    function mark() { var cur = window.MillerTheme.get(); menu.querySelectorAll(".mtc-opt").forEach(function (b) { b.classList.toggle("on", b.dataset.mode === cur); }); }
    btn.addEventListener("click", function (e) { e.stopPropagation(); mark(); menu.style.display = menu.style.display === "none" ? "block" : "none"; });
    document.addEventListener("click", function () { menu.style.display = "none"; });
    wrap.appendChild(btn); wrap.appendChild(menu); document.body.appendChild(wrap);
  }
  if (document.body) buildThemeControl(); else document.addEventListener("DOMContentLoaded", buildThemeControl);
})();
