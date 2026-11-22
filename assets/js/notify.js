/* Miller Family — notifications helper (shared across pages).
   - registers the service worker (also enables offline),
   - shows an unread badge on any link to chat.html,
   - manages Web Push enable/registration.
   Loaded AFTER config.js + supabase-client.js. Safe on pages without a chat link. */
(function () {
  "use strict";
  if (!window.MillerDB) return;

  // small badge style, injected once so pages don't each need CSS
  try {
    const st = document.createElement("style");
    st.textContent =
      ".nbadge{display:inline-block;min-width:1.1em;padding:0 .35em;margin-left:.3em;" +
      "background:#e23;color:#fff;border-radius:999px;font-family:'Cinzel',serif;" +
      "font-size:.62rem;line-height:1.5;text-align:center;vertical-align:middle;font-weight:700;}";
    document.head.appendChild(st);
  } catch (_) {}

  function urlB64(base64) {
    const pad = "=".repeat((4 - (base64.length % 4)) % 4);
    const s = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(s);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function ensureSW() {
    if (!("serviceWorker" in navigator)) return null;
    try { return await navigator.serviceWorker.register("service-worker.js"); }
    catch (_) { return null; }
  }

  function setBadge(total) {
    const links = document.querySelectorAll('a[href$="chat.html"]');
    links.forEach((a) => {
      let b = a.querySelector(".nbadge");
      if (total > 0) {
        if (!b) { b = document.createElement("span"); b.className = "nbadge"; a.appendChild(b); }
        b.textContent = total > 99 ? "99+" : String(total);
      } else if (b) { b.remove(); }
    });
    // reflect in the tab title (strip any existing count first)
    const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
    document.title = total > 0 ? "(" + (total > 99 ? "99+" : total) + ") " + base : base;
  }

  let timer = null;
  async function refreshBadge() {
    try {
      const session = await MillerDB.getSession();
      if (!session) { setBadge(0); return 0; }
      const { map } = await MillerDB.unreadCounts();
      let total = 0; for (const k in map) total += map[k] || 0;
      setBadge(total);
      return total;
    } catch (_) { return 0; }
  }

  function pushState() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
    return Notification.permission; // 'default' | 'granted' | 'denied'
  }

  // Returns { ok, error }. Works even if permission was already granted
  // (re-subscribes and re-saves), and reports the real reason on failure.
  async function enablePush() {
    try {
      if (pushState() === "unsupported") {
        return { ok: false, error: "Notifications aren't available here. On iPhone, install the app to your Home Screen (Share → Add to Home Screen) and open it from that icon first." };
      }
      const key = (window.MILLER_CONFIG || {}).vapidPublicKey;
      if (!key) return { ok: false, error: "Push isn't configured yet." };
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return { ok: false, error: "You didn't allow notifications. Enable them in your browser/site settings and try again." };
      await ensureSW();
      const ready = await navigator.serviceWorker.ready;
      let sub = await ready.pushManager.getSubscription();
      if (!sub) sub = await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key) });
      const { error } = await MillerDB.savePushSubscription(sub);
      if (error) return { ok: false, error: "Couldn't save your device: " + (error.message || error) };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  }

  // If permission is already granted, make sure this device actually has a
  // subscription saved — create one if missing. Runs on every page load, so
  // simply opening the app repairs a device whose earlier save didn't stick.
  async function syncExistingSub() {
    try {
      if (pushState() !== "granted") return;
      const key = (window.MILLER_CONFIG || {}).vapidPublicKey;
      await ensureSW();
      const ready = await navigator.serviceWorker.ready;
      let sub = await ready.pushManager.getSubscription();
      if (!sub && key) sub = await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key) });
      if (sub) await MillerDB.savePushSubscription(sub);
    } catch (_) {}
  }

  window.MillerNotify = { refreshBadge, enablePush, pushState, setBadge };

  function start() {
    if (!MillerDB.configured) return;
    ensureSW();
    syncExistingSub();
    refreshBadge();
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (document.visibilityState === "visible") refreshBadge(); }, 25000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshBadge(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
