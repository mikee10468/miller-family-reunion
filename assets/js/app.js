/* =========================================================================
   Miller Family & Friends Day — landing page logic
   -------------------------------------------------------------------------
   CONFIG: edit these values freely. In Step 2, the "Request Access" form
   will be wired to the Supabase backend; for now it emails the admin.
   ========================================================================= */
const CONFIG = {
  // Event
  eventTitle: "Lawrence & Lula Miller Family & Friends Day",
  eventLocation: "Mellon Park, Fifth Ave & Beechwood Blvd, Pittsburgh, PA 15206",
  // July 3, 2027, 12:00pm–8:00pm (local time)
  eventStart: new Date(2027, 6, 3, 12, 0, 0),
  eventEnd: new Date(2027, 6, 3, 20, 0, 0),
  mapsQuery: "Mellon Park, Fifth Avenue & Beechwood Boulevard, Pittsburgh, PA 15206",

};

// Facebook page/group URL comes from config.js (window.MILLER_CONFIG) when set.
function fbPageUrl() {
  return (window.MILLER_CONFIG && window.MILLER_CONFIG.facebookPageUrl) || "";
}

/* ---------- Countdown ---------- */
(function countdown() {
  const els = {
    d: document.getElementById("cd-days"),
    h: document.getElementById("cd-hours"),
    m: document.getElementById("cd-mins"),
    s: document.getElementById("cd-secs"),
  };
  if (!els.d) return;
  const pad = (n) => String(n).padStart(2, "0");
  function tick() {
    const diff = CONFIG.eventStart.getTime() - Date.now();
    if (diff <= 0) {
      document.getElementById("countdown").innerHTML =
        '<p style="font-family:Cinzel,serif;color:var(--gold-soft);font-size:1.2rem;">💜 It\'s Family Day! 💜</p>';
      return;
    }
    const sec = Math.floor(diff / 1000);
    els.d.textContent = Math.floor(sec / 86400);
    els.h.textContent = pad(Math.floor((sec % 86400) / 3600));
    els.m.textContent = pad(Math.floor((sec % 3600) / 60));
    els.s.textContent = pad(sec % 60);
  }
  tick();
  setInterval(tick, 1000);
})();

/* ---------- Map link ---------- */
(function mapLink() {
  const el = document.getElementById("map-link");
  if (el) el.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(CONFIG.mapsQuery);
})();

/* ---------- Add to Calendar (.ics download) ---------- */
(function calendar() {
  const btn = document.getElementById("add-calendar");
  if (!btn) return;
  const fmt = (d) =>
    d.getUTCFullYear() +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0") + "T" +
    String(d.getUTCHours()).padStart(2, "0") +
    String(d.getUTCMinutes()).padStart(2, "0") + "00Z";
  btn.addEventListener("click", () => {
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Miller Family//Reunion//EN",
      "BEGIN:VEVENT",
      "UID:miller-reunion-2027@family",
      "DTSTAMP:" + fmt(new Date()),
      "DTSTART:" + fmt(CONFIG.eventStart),
      "DTEND:" + fmt(CONFIG.eventEnd),
      "SUMMARY:" + CONFIG.eventTitle,
      "LOCATION:" + CONFIG.eventLocation.replace(/,/g, "\\,"),
      "DESCRIPTION:Honoring Our Past \\, Celebrating Our Present \\, Building Our Future.",
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "miller-family-day-2027.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();

/* ---------- Request Access form ---------- */
(function accessForm() {
  const form = document.getElementById("access-form");
  const note = document.getElementById("form-note");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.name || !data.email) {
      note.textContent = "Please enter at least your name and email.";
      note.className = "form__note err";
      return;
    }
    const firstName = data.name.split(" ")[0];
    const payload = {
      full_name: data.name,
      email: data.email,
      phone: data.phone || null,
      relationship: data.relationship || null,
      note: data.message || null,
    };

    // Preferred path: save the request to the backend.
    if (window.MillerDB && window.MillerDB.configured) {
      note.textContent = "Sending…";
      note.className = "form__note";
      const { error } = await window.MillerDB.submitAccessRequest(payload);
      if (error) {
        note.textContent = "Sorry, something went wrong sending your request. Please try again.";
        note.className = "form__note err";
        return;
      }
      note.textContent = "Thank you, " + firstName + "! Your request was sent. A family admin or elder will review it and send your invite.";
      note.className = "form__note ok";
      form.reset();
      return;
    }

    // Fallback (backend not connected yet): keep a local record only.
    try {
      const reqs = JSON.parse(localStorage.getItem("accessRequests") || "[]");
      reqs.push({ ...payload, at: new Date().toISOString() });
      localStorage.setItem("accessRequests", JSON.stringify(reqs));
    } catch (_) {}
    note.textContent = "Thank you, " + firstName + "! Your request was saved and will be reviewed once the family hub is live.";
    note.className = "form__note ok";
    form.reset();
  });
})();

/* ---------- Share ---------- */
(function share() {
  const url = window.location.href.split("#")[0];
  const text = "Join the " + CONFIG.eventTitle + " — July 3, 2027!";

  const native = document.getElementById("share-native");
  if (native) {
    native.addEventListener("click", async () => {
      if (navigator.share) {
        try { await navigator.share({ title: CONFIG.eventTitle, text, url }); } catch (_) {}
      } else {
        copyLink(url);
      }
    });
  }
  const fb = document.getElementById("share-fb");
  if (fb) fb.href = fbPageUrl()
    ? fbPageUrl()
    : "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url);

  const wa = document.getElementById("share-wa");
  if (wa) wa.href = "https://wa.me/?text=" + encodeURIComponent(text + " " + url);

  const copy = document.getElementById("share-copy");
  if (copy) copy.addEventListener("click", () => copyLink(url));

  function copyLink(u) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(u).then(
        () => toast("Link copied!"),
        () => toast("Copy failed — long-press the address bar.")
      );
    } else {
      toast("Copy the link from your address bar.");
    }
  }
})();

function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.style.cssText =
    "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#2a0742;color:#fff;" +
    "padding:.7rem 1.2rem;border-radius:999px;z-index:80;box-shadow:0 8px 24px rgba(0,0,0,.35);font-family:Cinzel,serif;";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ---------- Install (Add to Home Screen) ---------- */
(function install() {
  const banner = document.getElementById("install-banner");
  const installBtn = document.getElementById("install-btn");
  const dismiss = document.getElementById("install-dismiss");
  const iosHelp = document.getElementById("ios-help");
  const iosClose = document.getElementById("ios-close");
  let deferred = null;

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
  const dismissed = (() => { try { return localStorage.getItem("installDismissed") === "1"; } catch (_) { return false; } })();

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    if (!dismissed && !isStandalone) banner.hidden = false;
  });

  if (installBtn) installBtn.addEventListener("click", async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      banner.hidden = true;
    } else if (isIOS) {
      iosHelp.hidden = false;
    }
  });

  if (dismiss) dismiss.addEventListener("click", () => {
    banner.hidden = true;
    try { localStorage.setItem("installDismissed", "1"); } catch (_) {}
  });

  if (iosClose) iosClose.addEventListener("click", () => { iosHelp.hidden = true; });

  // iOS has no beforeinstallprompt — show the banner with instructions.
  if (isIOS && !isStandalone && !dismissed) banner.hidden = false;
})();

/* ---------- Service worker ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
