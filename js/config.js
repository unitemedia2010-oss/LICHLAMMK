(function () {
  "use strict";

  const SUPABASE_URL = "https://moohpectkjtpbyrqeocq.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vb2hwZWN0a2p0cGJ5cnFlb2NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDE5NzEsImV4cCI6MjA5NjcxNzk3MX0.wOoq_SkvFJuLBYWIbGbJDFj7JfEK1_qHPt6uvlM5XcU";

  if (!window.supabase?.createClient) {
    throw new Error("Không tải được Supabase SDK. Kiểm tra kết nối mạng hoặc CDN.");
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "uws_auth_session"
    }
  });

  const ADMIN_ROLES = ["LEADER", "ADMIN", "SUPER_ADMIN"];
  const SHIFT_LABELS = { morning: "Sáng", afternoon: "Chiều", full_day: "Cả ngày" };
  const STATUS_LABELS = {
    pending: "Chờ duyệt",
    approved: "Đã duyệt",
    rejected: "Từ chối",
    cancelled: "Đã hủy"
  };
  const REASON_LABELS = {
    sick: "Ốm",
    personal: "Việc cá nhân",
    school: "Lịch học",
    family: "Việc gia đình",
    exam: "Thi / kiểm tra",
    other: "Khác"
  };

  function formatDate(dateString) {
    if (!dateString) return "";
    return new Date(`${String(dateString).slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN");
  }

  function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function getMonday(inputDate = new Date()) {
    const d = new Date(inputDate);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  async function getCurrentUserAndProfile() {
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData?.user) {
      return { user: null, profile: null, error: userError };
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("*")
      .eq("id", userData.user.id)
      .single();

    if (profileError || !profile) {
      return { user: userData.user, profile: null, error: profileError };
    }

    if (profile.status !== "active") {
      await client.auth.signOut();
      return {
        user: null,
        profile: null,
        error: { message: "Tài khoản đã bị khóa. Vui lòng liên hệ Admin/HR." }
      };
    }

    return { user: userData.user, profile, error: null };
  }

  function showMessage(el, text, type = "") {
    if (!el) return;
    el.textContent = text || "";
    el.className = `message ${type}`.trim();
  }

  window.UWS = {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    supabase: client,
    ADMIN_ROLES,
    SHIFT_LABELS,
    STATUS_LABELS,
    REASON_LABELS,
    formatDate,
    toISODate,
    getMonday,
    addDays,
    getCurrentUserAndProfile,
    showMessage
  };
})();
