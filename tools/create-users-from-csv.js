/**
 * Tạo nhiều tài khoản Supabase Auth + profiles từ CSV.
 *
 * Cách chạy PowerShell:
 *   $env:SUPABASE_URL="https://moohpectkjtpbyrqeocq.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="DÁN_SERVICE_ROLE_KEY_Ở_ĐÂY"
 *   node tools/create-users-from-csv.js tools/users.csv
 *
 * LƯU Ý: SERVICE_ROLE_KEY là key quyền cao nhất, KHÔNG đưa lên GitHub, KHÔNG đưa vào frontend.
 */

const fs = require("fs");
const path = require("path");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const csvPath = process.argv[2] || path.join(__dirname, "users-sample.csv");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines.shift());
  return lines.map(line => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }

  if (!res.ok) {
    const message = json?.message || json?.msg || json?.error_description || text || `${res.status} ${res.statusText}`;
    throw new Error(message);
  }

  return json;
}

async function createAuthUser(row) {
  return await request(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    body: JSON.stringify({
      email: row.email,
      password: row.password,
      email_confirm: true,
      user_metadata: {
        full_name: row.full_name,
        employee_code: row.employee_code
      }
    })
  });
}

async function upsertProfile(userId, row) {
  const payload = {
    id: userId,
    employee_code: row.employee_code,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone || "",
    role_type: row.role_type || "TTS",
    team: row.team || "",
    status: "active",
    min_days_per_month: Number(row.min_days_per_month || 12)
  };

  return await request(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(payload)
  });
}

async function main() {
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));

  for (const row of rows) {
    if (!row.email || !row.password || !row.employee_code || !row.full_name) {
      console.log(`Bỏ qua dòng thiếu dữ liệu: ${JSON.stringify(row)}`);
      continue;
    }

    try {
      const user = await createAuthUser(row);
      await upsertProfile(user.id, row);
      console.log(`OK: ${row.email} -> ${row.employee_code}`);
    } catch (error) {
      console.error(`LỖI: ${row.email}: ${error.message}`);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
