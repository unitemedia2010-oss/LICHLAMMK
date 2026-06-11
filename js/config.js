(function () {
  const SUPABASE_URL = "https://moohpectkjtpbyrqeocq.supabase.co/";
  
  // Key bảo mật chuẩn đã ghép vào
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vb2hwZWN0a2p0cGJ5cnFlb2NxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNDE5NzEsImV4cCI6MjA5NjcxNzk3MX0.wOoq_SkvFJuLBYWIbGbJDFj7JfEK1_qHPt6uvlM5XcU";
  const SESSION_KEY = "uws_supabase_session";

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function authHeaders(extra = {}) {
    const session = getSession();
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
      ...extra
    };
  }

  function encodeValue(value) {
    return String(value)
      .replaceAll('"', '\\"');
  }

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.method = "GET";
      this.selectColumns = "*";
      this.filters = [];
      this.orders = [];
      this.limitValue = null;
      this.body = null;
      this.isSingle = false;
      this.head = false;
      this.countMode = null;
      this.extraHeaders = {};
    }

    select(columns = "*", options = {}) {
      this.method = options?.head ? "HEAD" : "GET";
      this.selectColumns = columns || "*";
      this.head = !!options?.head;
      this.countMode = options?.count || null;
      return this;
    }

    insert(payload) {
      this.method = "POST";
      this.body = payload;
      this.extraHeaders["Prefer"] = "return=representation";
      return this;
    }

    update(payload) {
      this.method = "PATCH";
      this.body = payload;
      this.extraHeaders["Prefer"] = "return=representation";
      return this;
    }

    delete() {
      this.method = "DELETE";
      this.extraHeaders["Prefer"] = "return=minimal";
      return this;
    }

    eq(column, value) {
      this.filters.push([column, `eq.${encodeValue(value)}`]);
      return this;
    }

    gte(column, value) {
      this.filters.push([column, `gte.${encodeValue(value)}`]);
      return this;
    }

    lte(column, value) {
      this.filters.push([column, `lte.${encodeValue(value)}`]);
      return this;
    }

    in(column, values) {
      const list = (values || []).map(v => `"${encodeValue(v)}"`).join(",");
      this.filters.push([column, `in.(${list})`]);
      return this;
    }

    order(column, options = {}) {
      this.orders.push(`${column}.${options.ascending === false ? "desc" : "asc"}`);
      return this;
    }

    limit(n) {
      this.limitValue = n;
      return this;
    }

    single() {
      this.isSingle = true;
      return this.execute();
    }

    async execute() {
      const url = new URL(`${SUPABASE_URL}/rest/v1/${this.table}`);

      if (this.method === "GET" || this.method === "HEAD") {
        url.searchParams.set("select", this.selectColumns);
      }

      for (const [col, val] of this.filters) {
        url.searchParams.append(col, val);
      }

      if (this.orders.length) {
        url.searchParams.set("order", this.orders.join(","));
      }

      if (this.limitValue !== null) {
        url.searchParams.set("limit", String(this.limitValue));
      }

      const headers = authHeaders({
        ...this.extraHeaders
      });

      if (this.countMode) {
        headers["Prefer"] = `count=${this.countMode}`;
      }

      if (this.isSingle) {
        headers["Accept"] = "application/vnd.pgrst.object+json";
      }

      if (this.body !== null) {
        headers["Content-Type"] = "application/json";
      }

      try {
        const res = await fetch(url.toString(), {
          method: this.method,
          headers,
          body: this.body !== null ? JSON.stringify(this.body) : undefined
        });

        let data = null;
        let error = null;
        let count = null;

        if (this.head) {
          const range = res.headers.get("content-range");
          if (range && range.includes("/")) {
            const total = range.split("/").pop();
            count = total === "*" ? null : Number(total);
          }
        } else {
          const text = await res.text();
          data = text ? JSON.parse(text) : null;
        }

        if (!res.ok) {
          error = data || { message: `${res.status} ${res.statusText}` };
          data = null;
        }

        return { data, error, count };
      } catch (err) {
        return { data: null, error: { message: err.message }, count: null };
      }
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }
  }

  const supabaseClient = {
    auth: {
      async signInWithPassword({ email, password }) {
        try {
          const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: {
              apikey: SUPABASE_ANON_KEY,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password })
          });

          const json = await res.json();

          if (!res.ok) {
            return { data: null, error: { message: json.error_description || json.msg || json.message || "Login failed" } };
          }

          setSession(json);
          return { data: { user: json.user, session: json }, error: null };
        } catch (err) {
          return { data: null, error: { message: err.message } };
        }
      },

      async getUser() {
        const session = getSession();
        if (!session?.access_token) {
          return { data: { user: null }, error: null };
        }

        try {
          const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: authHeaders()
          });

          const json = await res.json();

          if (!res.ok) {
            clearSession();
            return { data: { user: null }, error: { message: json.msg || json.message || "Invalid session" } };
          }

          return { data: { user: json }, error: null };
        } catch (err) {
          return { data: { user: null }, error: { message: err.message } };
        }
      },

      async signOut() {
        clearSession();
        return { error: null };
      }
    },

    from(table) {
      return new QueryBuilder(table);
    },

    async rpc(name, params = {}) {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: authHeaders({
            "Content-Type": "application/json"
          }),
          body: JSON.stringify(params)
        });

        const text = await res.text();
        const data = text ? JSON.parse(text) : null;

        if (!res.ok) {
          return { data: null, error: data || { message: `${res.status} ${res.statusText}` } };
        }

        return { data, error: null };
      } catch (err) {
        return { data: null, error: { message: err.message } };
      }
    }
  };

  const ADMIN_ROLES = ["LEADER", "ADMIN", "SUPER_ADMIN"];

  const SHIFT_LABELS = {
    morning: "Sáng",
    afternoon: "Chiều",
    full_day: "Cả ngày"
  };

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
    const d = new Date(dateString + "T00:00:00");
    return d.toLocaleDateString("vi-VN");
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
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  async function getCurrentUserAndProfile() {
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData?.user) {
      return { user: null, profile: null, error: userError };
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", userData.user.id)
      .single();

    return { user: userData.user, profile, error: profileError };
  }

  function showMessage(el, text, type = "") {
    if (!el) return;
    el.textContent = text || "";
    el.className = `message ${type}`.trim();
  }

  window.UWS = {
    supabase: supabaseClient,
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

  console.log("Unite Work Schedule no-CDN config loaded");
})();
