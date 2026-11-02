/* =========================================================================
   Thin wrapper around supabase-js. Loads the client (if configured) and
   exposes helpers used by login.html, admin.html, and the access form.
   Requires config.js and the supabase-js UMD build to be loaded first.
   ========================================================================= */
(function () {
  const ready = window.MILLER_CONFIGURED && window.supabase;
  const client = ready
    ? window.supabase.createClient(
        window.MILLER_CONFIG.SUPABASE_URL,
        window.MILLER_CONFIG.SUPABASE_ANON_KEY
      )
    : null;

  const MillerDB = {
    configured: !!ready,
    client,

    /* ---- Auth ---- */
    async sendMagicLink(email, redirectTo) {
      return client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo || window.location.origin + "/login.html" },
      });
    },
    async getSession() {
      if (!client) return null;
      const { data } = await client.auth.getSession();
      return data.session || null;
    },
    async getProfile() {
      const session = await this.getSession();
      if (!session) return null;
      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (error) return null;
      return data;
    },
    async signOut() {
      return client.auth.signOut();
    },

    /* ---- Access requests ---- */
    async submitAccessRequest(payload) {
      return client.from("access_requests").insert(payload);
    },
    async listAccessRequests(status) {
      let q = client.from("access_requests").select("*").order("created_at", { ascending: false });
      if (status) q = q.eq("status", status);
      return q;
    },
    async setAccessRequestStatus(id, status) {
      const session = await this.getSession();
      return client
        .from("access_requests")
        .update({ status, reviewed_by: session ? session.user.id : null, reviewed_at: new Date().toISOString() })
        .eq("id", id);
    },

    /* ---- Invites ---- */
    async createInvite({ email, role, expiresDays }) {
      const session = await this.getSession();
      const code = randomCode();
      const expires_at = expiresDays
        ? new Date(Date.now() + expiresDays * 86400000).toISOString()
        : null;
      const { error } = await client.from("invites").insert({
        code, email: email || null, role: role || "member",
        created_by: session ? session.user.id : null, expires_at,
      });
      return { code, error };
    },
    async redeemInvite(code) {
      return client.rpc("redeem_invite", { p_code: code });
    },

    /* ---- Members / roles ---- */
    async listProfiles() {
      return client.from("profiles").select("*").order("created_at", { ascending: true });
    },
    async setRole(id, role) {
      return client.from("profiles").update({ role }).eq("id", id);
    },
    async setStatus(id, status) {
      return client.from("profiles").update({ status }).eq("id", id);
    },

    /* ---- Family tree ---- */
    async listPersons() {
      return client.from("persons").select("*").order("birth_year", { ascending: true, nullsFirst: true });
    },
    async listPartners() {
      return client.from("partners").select("*");
    },
    async listSubmissions(status) {
      let q = client.from("person_submissions").select("*").order("created_at", { ascending: false });
      if (status) q = q.eq("status", status);
      return q;
    },
    // kind: 'add' | 'edit'; data: object of person fields; targetId for edits
    async submitPerson({ kind, targetId, data, note }) {
      const session = await this.getSession();
      return client.from("person_submissions").insert({
        kind,
        target_id: targetId || null,
        data: data || {},
        submitter_note: note || null,
        submitted_by: session ? session.user.id : null,
      });
    },
    async approveSubmission(id, note) {
      return client.rpc("approve_submission", { p_id: id, p_note: note || null });
    },
    async rejectSubmission(id, note) {
      return client.rpc("reject_submission", { p_id: id, p_note: note || null });
    },

    /* ---- Photos / media ---- */
    MEDIA_BUCKET: "family-media",
    async getSettings() {
      const { data } = await client.from("app_settings").select("*");
      const map = {};
      (data || []).forEach((r) => { map[r.key] = r.value; });
      return map;
    },
    async saveSetting(key, value) {
      return client.from("app_settings").upsert({ key, value: String(value) }, { onConflict: "key" });
    },
    async listPhotos() {
      return client.from("photos").select("*").order("created_at", { ascending: false });
    },
    async myPhotoCount() {
      const session = await this.getSession();
      if (!session) return 0;
      const { count } = await client.from("photos")
        .select("*", { count: "exact", head: true })
        .eq("owner_id", session.user.id).eq("kind", "photo");
      return count || 0;
    },
    async uploadPhoto({ file, caption }) {
      const session = await this.getSession();
      if (!session) return { error: { message: "Not signed in" } };
      const uid = session.user.id;
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-40) || "photo.jpg";
      const path = uid + "/" + Date.now() + "_" + safe;
      const up = await client.storage.from(this.MEDIA_BUCKET).upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" });
      if (up.error) return { error: up.error };
      const profile = await this.getProfile();
      const ins = await client.from("photos").insert({
        owner_id: uid,
        owner_name: (profile && (profile.full_name || profile.email)) || "A family member",
        storage_path: path,
        caption: caption || null,
        kind: "photo",
      });
      if (ins.error) {
        await client.storage.from(this.MEDIA_BUCKET).remove([path]); // roll back orphaned file (e.g. quota hit)
        return { error: ins.error };
      }
      return { error: null };
    },
    async signedUrl(path, expires) {
      const { data } = await client.storage.from(this.MEDIA_BUCKET).createSignedUrl(path, expires || 3600);
      return data ? data.signedUrl : null;
    },
    async deletePhoto(photo) {
      const del = await client.from("photos").delete().eq("id", photo.id);
      if (!del.error) await client.storage.from(this.MEDIA_BUCKET).remove([photo.storage_path]);
      return del;
    },

    /* ---- Event: RSVP / potluck / volunteers ---- */
    async getMyRsvp() {
      const session = await this.getSession();
      if (!session) return null;
      const { data } = await client.from("rsvps").select("*").eq("member_id", session.user.id).maybeSingle();
      return data || null;
    },
    async saveRsvp({ attending, guest_count, note }) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      return client.from("rsvps").upsert({
        member_id: session.user.id,
        member_name: (profile && (profile.full_name || profile.email)) || "A family member",
        attending: !!attending,
        guest_count: Math.max(0, parseInt(guest_count, 10) || 0),
        note: note || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "member_id" });
    },
    async listRsvps() {
      return client.from("rsvps").select("*").order("member_name", { ascending: true });
    },
    async listContributions() {
      return client.from("contributions").select("*").order("category", { ascending: true }).order("created_at", { ascending: true });
    },
    async addContribution({ item, category, note }) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      return client.from("contributions").insert({
        owner_id: session.user.id,
        owner_name: (profile && (profile.full_name || profile.email)) || "A family member",
        item, category: category || "food", note: note || null,
      });
    },
    async deleteContribution(id) {
      return client.from("contributions").delete().eq("id", id);
    },
    async listVolunteerRoles() {
      return client.from("volunteer_roles").select("*").order("sort", { ascending: true });
    },
    async listVolunteerSignups() {
      return client.from("volunteer_signups").select("*");
    },
    async signupVolunteer(roleId) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      return client.from("volunteer_signups").insert({
        role_id: roleId, member_id: session.user.id,
        member_name: (profile && (profile.full_name || profile.email)) || "A family member",
      });
    },
    async withdrawVolunteer(roleId) {
      const session = await this.getSession();
      return client.from("volunteer_signups").delete().eq("role_id", roleId).eq("member_id", session.user.id);
    },
  };

  function randomCode() {
    // human-friendly: no ambiguous chars (0/O, 1/I)
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    const arr = new Uint32Array(8);
    (window.crypto || {}).getRandomValues
      ? window.crypto.getRandomValues(arr)
      : arr.forEach((_, i) => (arr[i] = Math.floor(Math.random() * 2 ** 32)));
    for (let i = 0; i < 8; i++) s += chars[arr[i] % chars.length];
    return s.slice(0, 4) + "-" + s.slice(4);
  }

  window.MillerDB = MillerDB;
})();
