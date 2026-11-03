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
