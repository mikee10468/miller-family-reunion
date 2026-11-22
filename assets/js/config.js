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
    'html[data-theme="dark"] .meta,html[data-theme="dark"] .lede,html[data-theme="dark"] .empty,html[data-theme="dark"] .quiet,html[data-theme="dark"] .hint,html[data-theme="dark"] .who{color:#b9a9cb !important;}' +
    'html[data-theme="dark"] input,html[data-theme="dark"] select,html[data-theme="dark"] textarea{background:#2c2138 !important;color:#e9def5 !important;border-color:#4a3a57 !important;}' +
    'html[data-theme="dark"] .node.pill{background:#2c2138 !important;}html[data-theme="dark"] .pill .node__name{color:#e9def5 !important;}' +
    'html[data-theme="dark"] .thread,html[data-theme="dark"] .panel{background:#1d1526 !important;}' +
    'html[data-theme="dark"] .m.them{background:#2c2138 !important;color:#e9def5 !important;}' +
    'html[data-theme="dark"] .nitem,html[data-theme="dark"] .fitem,html[data-theme="dark"] .row,html[data-theme="dark"] .list>.row{border-color:#3a2a46 !important;}' +
    'html[data-theme="dark"] .cchip,html[data-theme="dark"] .tab,html[data-theme="dark"] .cat{background:#2c2138 !important;color:#e9def5 !important;}' +
    'html[data-theme="dark"] a.home,html[data-theme="dark"] a{color:#d7bbf5;}';
  function inject() { if (document.getElementById("miller-theme-css")) return; var s = document.createElement("style"); s.id = "miller-theme-css"; s.textContent = css; (document.head || document.documentElement).appendChild(s); }
  if (document.head) inject(); else document.addEventListener("DOMContentLoaded", inject);
})();
