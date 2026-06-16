import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const ALLOWED_ROLES = new Set(["TTS", "NVPT", "LEADER", "ADMIN", "SUPER_ADMIN"]);
const ALLOWED_STATUS = new Set(["active", "inactive"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function readPrivilegedKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;

  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return Object.values(parsed || {}).find((value) => typeof value === "string") as string || "";
  } catch {
    return "";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ message: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const privilegedKey = readPrivilegedKey();
  if (!supabaseUrl || !privilegedKey) {
    return json({ message: "Thiếu SUPABASE_URL hoặc privileged key trong Edge Function." }, 500);
  }

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ message: "Thiếu access token." }, 401);

  const admin = createClient(supabaseUrl, privilegedKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json({ message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." }, 401);

  const { data: caller, error: callerError } = await admin
    .from("profiles")
    .select("role_type,status")
    .eq("id", userData.user.id)
    .single();

  if (callerError || !caller || caller.role_type !== "SUPER_ADMIN" || caller.status !== "active") {
    return json({ message: "Chỉ SUPER_ADMIN đang hoạt động mới được tạo tài khoản." }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ message: "JSON body không hợp lệ." }, 400);
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const employeeCode = String(payload.employee_code || "").trim().toUpperCase();
  const fullName = String(payload.full_name || "").trim();
  const roleType = String(payload.role_type || "TTS").trim().toUpperCase();
  const area = String(payload.area || "").trim() || null;
  const team = String(payload.team || "").trim() || null;
  const status = String(payload.status || "active").trim().toLowerCase();
  const minDays = Number(payload.min_days_per_month ?? 12);

  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ message: "Email chưa hợp lệ." }, 422);
  if (password.length < 8) return json({ message: "Mật khẩu cần tối thiểu 8 ký tự." }, 422);
  if (employeeCode.length < 3 || employeeCode.length > 40) return json({ message: "Mã nhân sự phải từ 3 đến 40 ký tự." }, 422);
  if (fullName.length < 2 || fullName.length > 120) return json({ message: "Họ tên chưa hợp lệ." }, 422);
  if (!ALLOWED_ROLES.has(roleType)) return json({ message: "Vai trò chưa hợp lệ." }, 422);
  if (!ALLOWED_STATUS.has(status)) return json({ message: "Trạng thái chưa hợp lệ." }, 422);
  if (roleType === "LEADER" && (!area || !team)) return json({ message: "LEADER cần có đủ Khu vực và Team." }, 422);
  if (!Number.isInteger(minDays) || minDays < 0 || minDays > 31) return json({ message: "Chỉ tiêu tháng phải từ 0 đến 31 ngày." }, 422);

  const [emailLookup, codeLookup] = await Promise.all([
    admin.from("profiles").select("id").eq("email", email).limit(1),
    admin.from("profiles").select("id").eq("employee_code", employeeCode).limit(1)
  ]);

  if (emailLookup.error || codeLookup.error) {
    return json({ message: emailLookup.error?.message || codeLookup.error?.message || "Không kiểm tra được dữ liệu trùng." }, 500);
  }
  if (emailLookup.data?.length || codeLookup.data?.length) {
    return json({ message: "Email hoặc mã nhân sự đã tồn tại." }, 409);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      employee_code: employeeCode,
      full_name: fullName,
      role_type: roleType,
      area,
      team
    }
  });

  if (createError || !created.user) {
    const statusCode = /already|registered|exists/i.test(createError?.message || "") ? 409 : 400;
    return json({ message: createError?.message || "Không tạo được Auth user." }, statusCode);
  }

  const profile = {
    id: created.user.id,
    employee_code: employeeCode,
    full_name: fullName,
    email,
    phone: null,
    role_type: roleType,
    area,
    team,
    status,
    min_days_per_month: minDays
  };

  const { error: profileError } = await admin.from("profiles").insert(profile);
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    const statusCode = profileError.code === "23505" ? 409 : 500;
    return json({ message: `Không tạo được hồ sơ; Auth user đã được hoàn tác. ${profileError.message}` }, statusCode);
  }

  return json({ ok: true, user_id: created.user.id, profile }, 201);
});
