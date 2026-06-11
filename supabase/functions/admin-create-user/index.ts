const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

function validatePayload(payload: any) {
  const email = cleanText(payload.email).toLowerCase();
  const password = String(payload.password || "");
  const employeeCode = cleanText(payload.employee_code);
  const fullName = cleanText(payload.full_name);
  const roleType = cleanText(payload.role_type || "TTS");
  const team = cleanText(payload.team) || null;
  const minDays = Number(payload.min_days_per_month ?? 0);
  const status = cleanText(payload.status || "active");

  if (!email || !email.includes("@")) throw new Error("Email đăng nhập chưa hợp lệ.");
  if (!password || password.length < 8) throw new Error("Mật khẩu tạm cần tối thiểu 8 ký tự.");
  if (!employeeCode || employeeCode.length < 3) throw new Error("Mã nhân sự chưa hợp lệ.");
  if (!fullName || fullName.length < 2) throw new Error("Họ tên hiển thị chưa hợp lệ.");
  if (!["TTS", "NVPT", "LEADER", "ADMIN", "SUPER_ADMIN"].includes(roleType)) throw new Error("Vai trò chưa hợp lệ.");
  if (!Number.isFinite(minDays) || minDays < 0 || minDays > 31) throw new Error("Chỉ tiêu tháng phải từ 0 đến 31.");
  if (!["active", "inactive"].includes(status)) throw new Error("Trạng thái chưa hợp lệ.");

  return {
    email,
    password,
    employee_code: employeeCode,
    full_name: fullName,
    role_type: roleType,
    team,
    min_days_per_month: minDays,
    status
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret." }, 500);
  }

  const callerAuth = req.headers.get("Authorization") || "";
  if (!callerAuth.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization bearer token." }, 401);
  }

  try {
    const callerRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: callerAuth
      }
    });

    const caller = await callerRes.json().catch(() => null);
    if (!callerRes.ok || !caller?.id) {
      return jsonResponse({ error: "Phiên đăng nhập không hợp lệ." }, 401);
    }

    const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${caller.id}&select=id,email,role_type,status`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/vnd.pgrst.object+json"
      }
    });

    const profile = await profileRes.json().catch(() => null);
    if (!profileRes.ok || profile?.role_type !== "SUPER_ADMIN" || profile?.status !== "active") {
      return jsonResponse({ error: "Chỉ SUPER_ADMIN đang active mới được tạo tài khoản." }, 403);
    }

    const payload = validatePayload(await req.json());

    const createUserRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: payload.email,
        password: payload.password,
        email_confirm: true,
        user_metadata: {
          full_name: payload.full_name,
          employee_code: payload.employee_code,
          role_type: payload.role_type
        }
      })
    });

    const createdUser = await createUserRes.json().catch(() => null);
    if (!createUserRes.ok || !createdUser?.id) {
      return jsonResponse({
        error: "Không tạo được user trong Supabase Auth.",
        message: createdUser?.msg || createdUser?.message || createdUser?.error_description || "Có thể email đã tồn tại."
      }, 400);
    }

    const profilePayload = {
      id: createdUser.id,
      employee_code: payload.employee_code,
      full_name: payload.full_name,
      email: payload.email,
      phone: "",
      role_type: payload.role_type,
      team: payload.team,
      status: payload.status,
      min_days_per_month: payload.min_days_per_month
    };

    const profileUpsertRes = await fetch(`${supabaseUrl}/rest/v1/profiles?on_conflict=id`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(profilePayload)
    });

    const profileData = await profileUpsertRes.json().catch(() => null);
    if (!profileUpsertRes.ok) {
      return jsonResponse({
        error: "Đã tạo Auth user nhưng chưa tạo được profile.",
        message: profileData?.message || profileData?.hint || "Kiểm tra employee_code/email có bị trùng không."
      }, 400);
    }

    return jsonResponse({ ok: true, user_id: createdUser.id, profile: profileData?.[0] || profilePayload });
  } catch (err) {
    return jsonResponse({ error: err.message || String(err) }, 400);
  }
});
