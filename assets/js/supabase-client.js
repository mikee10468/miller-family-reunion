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
    async signInWithPassword(email, password) {
      return client.auth.signInWithPassword({ email: (email || "").trim(), password });
    },
    async updatePassword(newPassword) {
      return client.auth.updateUser({ password: newPassword });
    },
    // Admin-only: create/re-password a member's login (returns { email, password })
    async adminCreateMember({ email, full_name, role }) {
      return client.functions.invoke("admin-create-member", {
        body: { email, full_name: full_name || null, role: role || "member" },
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
    // ---- Date helpers (birth/death stored as year + optional month/day ints) ----
    // Full date -> DD/MM/YYYY; year-only -> YYYY; nothing -> "".
    fmtDate(year, month, day) {
      if (!year) return "";
      if (month && day) {
        const p2 = (n) => String(n).padStart(2, "0");
        return p2(day) + "/" + p2(month) + "/" + year;
      }
      return String(year);
    },
    // Parse "DD/MM/YYYY" (or D/M/YYYY, - or . separators) or a 4-digit year.
    // Returns {year, month, day} (month/day omitted for year-only) or {error}.
    parseDateStr(str) {
      const s = String(str == null ? "" : str).trim();
      if (!s) return {};
      if (/^\d{4}$/.test(s)) return { year: +s };
      const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      if (!m) return { error: "Use DD/MM/YYYY (e.g. 16/04/1975) or just a 4-digit year." };
      const day = +m[1], month = +m[2], year = +m[3];
      if (day < 1 || day > 31) return { error: "Day must be 01–31 (format DD/MM/YYYY)." };
      if (month < 1 || month > 12) return { error: "Month must be 01–12 (format DD/MM/YYYY)." };
      return { year, month, day };
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
    // Reviewer-only hard delete of a tree person. FKs (father_id/mother_id,
    // profiles.person_id, comments) are ON DELETE SET NULL; partners cascade.
    // So children/members are kept but unlinked, never deleted.
    async deletePerson(id) {
      return client.from("persons").delete().eq("id", id);
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

    /* ---- Tree link: which tree person a member IS ---- */
    // A member claims their own node on the tree (enables posting).
    async setMyPerson(personId) {
      const session = await this.getSession();
      return client.from("profiles").update({ person_id: personId || null }).eq("id", session.user.id);
    },
    // Admin override: link any member to a tree person.
    async setMemberPerson(userId, personId) {
      return client.from("profiles").update({ person_id: personId || null }).eq("id", userId);
    },

    /* ---- Message board: posts + polymorphic comments ---- */
    async listPosts() {
      return client.from("posts").select("*").order("created_at", { ascending: false });
    },
    async createPost(body) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      if (!profile || !profile.person_id) return { error: { message: "You must be linked to the family tree to post." } };
      return client.from("posts").insert({
        author_id: session.user.id,
        author_person_id: profile.person_id,
        author_name: profile.full_name || profile.email || "A family member",
        body,
      });
    },
    async deletePost(id) {
      return client.from("posts").delete().eq("id", id);
    },
    // All comments for a given target type (e.g. 'post'); group client-side.
    async listComments(targetType) {
      return client.from("comments").select("*").eq("target_type", targetType).order("created_at", { ascending: true });
    },
    async addComment({ targetType, targetId, body }) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      if (!profile || !profile.person_id) return { error: { message: "You must be linked to the family tree to comment." } };
      return client.from("comments").insert({
        target_type: targetType,
        target_id: targetId,
        author_id: session.user.id,
        author_person_id: profile.person_id,
        author_name: profile.full_name || profile.email || "A family member",
        body,
      });
    },
    async deleteComment(id) {
      return client.from("comments").delete().eq("id", id);
    },

    /* ---- Chat: family group chat + reviewer-only direct chats ---- */
    async getFamilyConversation() {
      const { data } = await client.from("conversations").select("*").eq("kind", "family").limit(1).maybeSingle();
      return data || null;
    },
    // Conversations the signed-in user can see (family + their own direct chats).
    async listConversations() {
      return client.from("conversations").select("*").order("created_at", { ascending: true });
    },
    async listConversationMembers() {
      return client.from("conversation_members").select("*");
    },
    async startDirectConversation(otherUserId) {
      return client.rpc("start_direct_conversation", { p_other: otherUserId });
    },
    async listMessages(conversationId, sinceIso) {
      let q = client.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
      if (sinceIso) q = q.gt("created_at", sinceIso);
      return q;
    },
    async sendMessage(conversationId, body) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      return client.from("messages").insert({
        conversation_id: conversationId,
        author_id: session.user.id,
        author_name: (profile && (profile.full_name || profile.email)) || "A family member",
        body,
      });
    },
    async deleteMessage(id) {
      return client.from("messages").delete().eq("id", id);
    },

    /* ---- Guest passes (self-signup invite codes) ---- */
    // Reviewer creates a code valid `days` days (default 7).
    async createGuestPass({ days, label } = {}) {
      const session = await this.getSession();
      const code = "MILLER-" + randomCode().replace("-", "");
      const expires_at = new Date(Date.now() + (days || 7) * 86400000).toISOString();
      const { data, error } = await client.from("guest_passes").insert({
        code, label: label || null,
        created_by: session ? session.user.id : null,
        expires_at,
      }).select().single();
      return { data, error, code, expires_at };
    },
    async listGuestPasses() {
      return client.from("guest_passes").select("*").order("created_at", { ascending: false });
    },
    async revokeGuestPass(id) {
      return client.from("guest_passes").update({ revoked: true }).eq("id", id);
    },
    async listGuestRedemptions() {
      return client.from("guest_pass_redemptions").select("*").order("created_at", { ascending: false });
    },
    // Public: a joiner creates their own account with a valid code.
    async redeemGuestPass({ code, email, password, full_name }) {
      return client.functions.invoke("redeem-guest-pass", {
        body: { code, email, password, full_name },
      });
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
