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
    // Admin-only: create/re-password a member's login (returns { email, password }).
    // If the admin's session token has gone stale (401), transparently refresh it
    // once and retry; if it still fails, surface a clear "session expired" error.
    async adminCreateMember({ email, full_name, role }) {
      const call = () => client.functions.invoke("admin-create-member", {
        body: { email, full_name: full_name || null, role: role || "member" },
      });
      let res = await call();
      const is401 = (r) => r && r.error && r.error.context && r.error.context.status === 401;
      if (is401(res)) {
        const { data: refreshed } = await client.auth.refreshSession();
        if (refreshed && refreshed.session) res = await call();
        if (is401(res)) {
          return { data: null, error: { code: "session_expired",
            message: "Your admin session expired — please sign out and sign in again, then retry." } };
        }
      }
      return res;
    },
    // Record a sign-in attempt (success or failure). Best-effort; never throws.
    async logLogin(email, success) {
      if (!client) return;
      try { await client.rpc("log_login", { p_email: (email || "").trim().toLowerCase(), p_success: !!success }); }
      catch (_) { /* logging must never block sign-in */ }
    },
    // Admin-only: most recent sign-in attempts for the admin login log.
    async recentLoginEvents(limit) {
      if (!client) return { data: [], error: null };
      return client.from("login_events").select("*").order("created_at", { ascending: false }).limit(limit || 100);
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
    // Admin/reviewer: create a bare tree person (no relations yet) and return its id.
    async createPersonDirect(fields) {
      const session = await this.getSession();
      const row = {
        full_name: fields.full_name,
        is_living: fields.is_living !== false,
        created_by: session ? session.user.id : null,
      };
      // Optional parent/gender so a node can be created as someone's child.
      if (fields.father_id) row.father_id = fields.father_id;
      if (fields.mother_id) row.mother_id = fields.mother_id;
      if (fields.gender) row.gender = fields.gender;
      return client.from("persons").insert(row).select("id").single();
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
      // The gallery shows curated gallery uploads only; post/chat/avatar images
      // still count toward the limit but live with their post/message/profile.
      return client.from("photos").select("*").eq("context", "gallery").order("created_at", { ascending: false });
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
    // Upload an image that rides along on a post / chat message. It creates a
    // photos row (so it counts against the shared per-member photo limit) and
    // returns its storage path. On quota hit the orphaned file is rolled back.
    async uploadSharedImage(file, context) {
      const session = await this.getSession();
      if (!session) return { error: { message: "Not signed in" } };
      const uid = session.user.id;
      const safe = (file.name || "image.jpg").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-40) || "image.jpg";
      const path = uid + "/" + (context || "post") + "_" + Date.now() + "_" + safe;
      const up = await client.storage.from(this.MEDIA_BUCKET).upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" });
      if (up.error) return { error: up.error };
      const profile = await this.getProfile();
      const ins = await client.from("photos").insert({
        owner_id: uid,
        owner_name: (profile && (profile.full_name || profile.email)) || "A family member",
        storage_path: path,
        kind: "photo",
        context: context || "post",
      });
      if (ins.error) {
        try { await client.storage.from(this.MEDIA_BUCKET).remove([path]); } catch (_) {}
        return { error: ins.error };
      }
      return { error: null, path };
    },
    // Free a photo slot tied to a deleted post/message/avatar: drop its photos
    // row and storage object. RLS limits this to the owner (or an admin).
    async releasePhoto(path) {
      if (!path) return;
      try { await client.from("photos").delete().eq("storage_path", path); } catch (_) {}
      try { await client.storage.from(this.MEDIA_BUCKET).remove([path]); } catch (_) {}
    },
    async signedUrl(path, expires) {
      const { data } = await client.storage.from(this.MEDIA_BUCKET).createSignedUrl(path, expires || 3600);
      return data ? data.signedUrl : null;
    },
    // Batch signed URLs -> { path: signedUrl }.
    async signedUrls(paths, expires) {
      const map = {};
      const list = (paths || []).filter(Boolean);
      if (!list.length) return map;
      const { data } = await client.storage.from(this.MEDIA_BUCKET).createSignedUrls(list, expires || 3600);
      (data || []).forEach((d) => { if (d && d.signedUrl && !d.error) map[d.path] = d.signedUrl; });
      return map;
    },

    /* ---- Profile avatar (photo / selfie) ---- */
    async uploadAvatar(file) {
      const session = await this.getSession();
      if (!session) return { error: { message: "Not signed in" } };
      const uid = session.user.id;
      const ext = ((file.name || "").match(/\.[a-zA-Z0-9]+$/) || [".jpg"])[0].toLowerCase();
      const path = uid + "/avatar_" + Date.now() + ext;
      const up = await client.storage.from(this.MEDIA_BUCKET).upload(path, file, { upsert: false, contentType: file.type || "image/jpeg" });
      if (up.error) return { error: up.error };
      const prof = await this.getProfile();
      const old = prof && prof.avatar_url;
      // Track the avatar as a photo so it counts against the shared limit.
      const ins = await client.from("photos").insert({
        owner_id: uid,
        owner_name: (prof && (prof.full_name || prof.email)) || "A family member",
        storage_path: path,
        kind: "photo",
        context: "avatar",
      });
      if (ins.error) {
        try { await client.storage.from(this.MEDIA_BUCKET).remove([path]); } catch (_) {}
        return { error: ins.error };
      }
      const upd = await client.from("profiles").update({ avatar_url: path }).eq("id", uid);
      if (upd.error) { await this.releasePhoto(path); return { error: upd.error }; }
      if (old && old !== path) await this.releasePhoto(old); // free the previous avatar's slot
      return { error: null, path };
    },
    async removeAvatar() {
      const session = await this.getSession();
      if (!session) return { error: { message: "Not signed in" } };
      const prof = await this.getProfile();
      const old = prof && prof.avatar_url;
      const upd = await client.from("profiles").update({ avatar_url: null }).eq("id", session.user.id);
      if (!upd.error && old) await this.releasePhoto(old);
      return upd;
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

    /* ---- Family news: birth & death notices ---- */
    async listBirthNotices() {
      return client.from("birth_notices").select("*").order("created_at", { ascending: false });
    },
    async addBirthNotice(n) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      return client.from("birth_notices").insert({
        baby_name: n.baby_name,
        birth_date: n.birth_date || null,
        parents: n.parents || null,
        details: n.details || null,
        shower_at: n.shower_at || null,
        shower_location: n.shower_location || null,
        shower_note: n.shower_note || null,
        created_by: session.user.id,
        created_by_name: (profile && (profile.full_name || profile.email)) || "A family member",
      });
    },
    async deleteBirthNotice(id) {
      return client.from("birth_notices").delete().eq("id", id);
    },
    async listDeathNotices() {
      return client.from("death_notices").select("*").order("created_at", { ascending: false });
    },
    async addDeathNotice(n) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      return client.from("death_notices").insert({
        person_name: n.person_name,
        birth_date: n.birth_date || null,
        death_date: n.death_date || null,
        service_at: n.service_at || null,
        service_location: n.service_location || null,
        burial_location: n.burial_location || null,
        eulogy: n.eulogy || null,
        details: n.details || null,
        created_by: session.user.id,
        created_by_name: (profile && (profile.full_name || profile.email)) || "A family member",
      });
    },
    async deleteDeathNotice(id) {
      return client.from("death_notices").delete().eq("id", id);
    },

    /* ---- Multi-event model: events + per-event rsvp / potluck / volunteer ---- */
    async listEvents() {
      return client.from("events").select("*")
        .order("kind", { ascending: true })
        .order("event_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
    },
    async createEvent(ev) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      return client.from("events").insert({
        kind: ev.kind,
        title: ev.title,
        event_date: ev.event_date || null,
        start_time: ev.start_time || null,
        location: ev.location || null,
        details: ev.details || null,
        rsvp_enabled: ev.rsvp_enabled !== false,
        potluck_enabled: ev.potluck_enabled !== false,
        volunteer_enabled: ev.volunteer_enabled !== false,
        baby_name: ev.baby_name || null,
        birth_date: ev.birth_date || null,
        parents: ev.parents || null,
        born_date: ev.born_date || null,
        death_date: ev.death_date || null,
        service_at: ev.service_at || null,
        service_location: ev.service_location || null,
        burial_location: ev.burial_location || null,
        eulogy: ev.eulogy || null,
        registry_url: ev.registry_url || null,
        school: ev.school || null,
        degree: ev.degree || null,
        wedding_party: ev.wedding_party || null,
        bridal_shower_date: ev.bridal_shower_date || null,
        bridal_shower_where: ev.bridal_shower_where || null,
        bachelor_date: ev.bachelor_date || null,
        bachelor_where: ev.bachelor_where || null,
        bachelorette_date: ev.bachelorette_date || null,
        bachelorette_where: ev.bachelorette_where || null,
        rehearsal_date: ev.rehearsal_date || null,
        rehearsal_where: ev.rehearsal_where || null,
        dress_fitting_date: ev.dress_fitting_date || null,
        suit_fitting_date: ev.suit_fitting_date || null,
        created_by: session.user.id,
        created_by_name: (profile && (profile.full_name || profile.email)) || "A family member",
      }).select("id").single();
    },
    async deleteEvent(id) {
      return client.from("events").delete().eq("id", id);
    },
    async listEventRsvps(eventId) {
      return client.from("event_rsvps").select("*").eq("event_id", eventId);
    },
    async getMyEventRsvp(eventId) {
      const session = await this.getSession();
      if (!session) return null;
      const { data } = await client.from("event_rsvps").select("*")
        .eq("event_id", eventId).eq("member_id", session.user.id).maybeSingle();
      return data || null;
    },
    async saveEventRsvp(eventId, { attending, guest_count, note }) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      return client.from("event_rsvps").upsert({
        event_id: eventId,
        member_id: session.user.id,
        member_name: (profile && (profile.full_name || profile.email)) || "A family member",
        attending: !!attending,
        guest_count: Math.max(0, parseInt(guest_count, 10) || 0),
        note: note || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "event_id,member_id" });
    },
    async listEventContributions(eventId) {
      return client.from("event_contributions").select("*").eq("event_id", eventId)
        .order("category", { ascending: true }).order("created_at", { ascending: true });
    },
    async addEventContribution(eventId, { item, category, note }) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      return client.from("event_contributions").insert({
        event_id: eventId,
        owner_id: session.user.id,
        owner_name: (profile && (profile.full_name || profile.email)) || "A family member",
        item, category: category || "food", note: note || null,
      });
    },
    async deleteEventContribution(id) {
      return client.from("event_contributions").delete().eq("id", id);
    },
    async listEventVolunteerRoles(eventId) {
      return client.from("event_volunteer_roles").select("*").eq("event_id", eventId).order("sort", { ascending: true });
    },
    async addEventVolunteerRole(eventId, { name, description }) {
      return client.from("event_volunteer_roles").insert({ event_id: eventId, name, description: description || null, sort: 99 });
    },
    async deleteEventVolunteerRole(id) {
      return client.from("event_volunteer_roles").delete().eq("id", id);
    },
    async listEventVolunteerSignups(roleIds) {
      if (!roleIds || !roleIds.length) return { data: [] };
      return client.from("event_volunteer_signups").select("*").in("role_id", roleIds);
    },
    async signupEventVolunteer(roleId) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      return client.from("event_volunteer_signups").insert({
        role_id: roleId, member_id: session.user.id,
        member_name: (profile && (profile.full_name || profile.email)) || "A family member",
      });
    },
    async withdrawEventVolunteer(roleId) {
      const session = await this.getSession();
      return client.from("event_volunteer_signups").delete().eq("role_id", roleId).eq("member_id", session.user.id);
    },

    /* ---- Feedback / suggestions ---- */
    async submitFeedback({ category, body }) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      return client.from("feedback").insert({
        user_id: session.user.id,
        user_name: (profile && (profile.full_name || profile.email)) || "A family member",
        category: category || "suggestion",
        body,
      });
    },
    async listFeedback() {
      return client.from("feedback").select("*").order("created_at", { ascending: false });
    },
    async setFeedbackStatus(id, status) {
      return client.from("feedback").update({ status }).eq("id", id);
    },
    async deleteFeedback(id) {
      return client.from("feedback").delete().eq("id", id);
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
    async createPost(body, imagePath) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      if (!profile || !profile.person_id) return { error: { message: "You must be linked to the family tree to post." } };
      return client.from("posts").insert({
        author_id: session.user.id,
        author_person_id: profile.person_id,
        author_name: profile.full_name || profile.email || "A family member",
        body: body || null,
        image_path: imagePath || null,
      });
    },
    async deletePost(id) {
      // Look up any attached image first so we can free its quota slot.
      let path = null;
      try { const { data } = await client.from("posts").select("image_path").eq("id", id).maybeSingle(); path = data && data.image_path; } catch (_) {}
      const del = await client.from("posts").delete().eq("id", id);
      if (!del.error && path) await this.releasePhoto(path);
      return del;
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
    async sendMessage(conversationId, body, imagePath) {
      const session = await this.getSession();
      const profile = await this.getProfile();
      return client.from("messages").insert({
        conversation_id: conversationId,
        author_id: session.user.id,
        author_name: (profile && (profile.full_name || profile.email)) || "A family member",
        body: body || null,
        image_path: imagePath || null,
      });
    },
    async deleteMessage(id) {
      let path = null;
      try { const { data } = await client.from("messages").select("image_path").eq("id", id).maybeSingle(); path = data && data.image_path; } catch (_) {}
      const del = await client.from("messages").delete().eq("id", id);
      if (!del.error && path) await this.releasePhoto(path);
      return del;
    },
    // Mark a conversation read up to now (clears its unread badge for me).
    async markConversationRead(conversationId) {
      const session = await this.getSession();
      if (!session) return { error: { message: "Not signed in" } };
      return client.from("conversation_reads").upsert(
        { user_id: session.user.id, conversation_id: conversationId, last_read_at: new Date().toISOString() },
        { onConflict: "user_id,conversation_id" }
      );
    },
    // { conversationId: unreadCount } for conversations with >0 unread.
    async unreadCounts() {
      const { data, error } = await client.rpc("unread_counts");
      const map = {};
      (data || []).forEach((r) => { map[r.conversation_id] = Number(r.n) || 0; });
      return { map, error };
    },
    /* ---- Presence (who's logged in right now) ---- */
    // Heartbeat: mark me as seen now. Fire-and-forget.
    async touchPresence() {
      try { return await client.rpc("touch_presence"); }
      catch (e) { return { error: e }; }
    },
    // Active members seen in the last few minutes: [{ id, full_name, last_seen }].
    async whoIsOnline() {
      const { data, error } = await client.rpc("who_is_online");
      return { data: data || [], error };
    },

    // Fire-and-forget push to the other recipients after a message is sent.
    async notifyNewMessage(conversationId) {
      try { return await client.functions.invoke("send-push", { body: { conversationId } }); }
      catch (e) { return { error: e }; }
    },

    /* ---- Web Push subscriptions ---- */
    async savePushSubscription(sub) {
      const session = await this.getSession();
      if (!session) return { error: { message: "Not signed in" } };
      const j = sub.toJSON ? sub.toJSON() : sub;
      return client.from("push_subscriptions").upsert({
        user_id: session.user.id,
        endpoint: j.endpoint,
        p256dh: j.keys && j.keys.p256dh,
        auth: j.keys && j.keys.auth,
        user_agent: (navigator && navigator.userAgent) || null,
      }, { onConflict: "endpoint" });
    },
    async removePushSubscription(endpoint) {
      return client.from("push_subscriptions").delete().eq("endpoint", endpoint);
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

    /* ---- Account recovery: security questions ---- */
    SECURITY_QUESTIONS: [
      "What city were you born in?",
      "What was the name of your first pet?",
      "What is your mother's maiden name?",
      "What was the name of your elementary school?",
      "What street did you grow up on?",
      "What was your childhood nickname?",
      "What is your favorite food?",
      "What was the make of your first car?",
      "What is the name of a favorite childhood friend?",
      "What city did your parents meet in?",
    ],
    // Has the signed-in member set up recovery questions?
    async hasSecurityQuestions() {
      const { data } = await client.rpc("has_security_questions");
      return !!data;
    },
    // Save the signed-in member's 3 questions + answers (answers hashed server-side).
    async setSecurityQuestions(questions, answers) {
      return client.rpc("set_security_questions", { p_q: questions, p_a: answers });
    },
    // Public (forgot password): fetch a user's 3 questions by email.
    async getRecoveryQuestions(email) {
      return client.functions.invoke("recover-password", { body: { action: "questions", email } });
    },
    // Public (forgot password): verify answers and set a new password.
    async resetPasswordWithAnswers(email, answers, password) {
      return client.functions.invoke("recover-password", { body: { action: "reset", email, answers, password } });
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
