"use strict";

/* UWS_PAGE_SCOPE */
(() => {

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  supabase,
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
} = window.UWS;

let currentUser = null;
let currentProfile = null;
let selectedWeekStart = getMonday(new Date());
let selectedAdminMonth = new Date();
selectedAdminMonth.setDate(1);
selectedAdminMonth.setHours(0, 0, 0, 0);

let allSchedules = [];
let profileSettingsRows = [];
let profileSettingsSearchQuery = "";

const weekStartInput = document.getElementById("adminWeekStart");
const adminMonthTitle = document.getElementById("adminMonthTitle");
const adminMonthSummary = document.getElementById("adminMonthSummary");
let adminMonthRowsByDate = {};
const profileSettingsTable = document.getElementById("profileSettingsTable");
const profileSettingsMessage = document.getElementById("profileSettingsMessage");
const createAccountMessage = document.getElementById("createAccountMessage");
const createAccountBtn = document.getElementById("createAccountBtn");
const accountAdminPanel = document.getElementById("accountAdminPanel");
const dangerZonePanel = document.getElementById("dangerZonePanel");
const TIME_META_REGEX = /\[\[UWS_TIME:(\d{2}:\d{2})-(\d{2}:\d{2})\]\]\s*/;
const OFF_SUBMITTED_MARKER = "[[UWS_OFF_SUBMITTED]]";
const deleteScheduleModal = document.getElementById("deleteScheduleModal");
const deleteConfirmPassword = document.getElementById("deleteConfirmPassword");
const deleteScheduleMessage = document.getElementById("deleteScheduleMessage");

const changePasswordModal = document.getElementById("changePasswordModal");
const currentPasswordInput = document.getElementById("currentPasswordInput");
const newPasswordInput = document.getElementById("newPasswordInput");
const confirmNewPasswordInput = document.getElementById("confirmNewPasswordInput");
const changePasswordMessage = document.getElementById("changePasswordMessage");
let createAccountBusy = false;

function getAdminCreateUserUrl() {
  return `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/admin-create-user`;
}

function getCreateAccountDeployHint() {
  return "Chạy trong thư mục project: npx supabase link --project-ref moohpectkjtpbyrqeocq; npx supabase functions deploy admin-create-user --no-verify-jwt";
}

function setCreateAccountBusy(isBusy) {
  createAccountBusy = isBusy;
  if (!createAccountBtn) return;
  createAccountBtn.disabled = isBusy;
  createAccountBtn.textContent = isBusy ? "Đang tạo..." : "Tạo tài khoản";
}

async function readJsonResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function getCreateAccountErrorMessage(status, statusText, body = {}) {
  const detail = body.message || body.error || body.msg || body.error_description || `${status} ${statusText}`;
  if (status === 404) {
    return `Edge Function admin-create-user chưa được deploy hoặc sai project ref (endpoint trả 404). ${getCreateAccountDeployHint()}`;
  }
  if (status === 401) {
    return `Phiên đăng nhập hoặc JWT của Edge Function không hợp lệ. Hãy đăng nhập lại; nếu vừa deploy function, nhớ dùng --no-verify-jwt. Chi tiết: ${detail}`;
  }
  if (status === 403) {
    return `Tài khoản hiện tại chưa phải SUPER_ADMIN active hoặc bị chặn quyền tạo tài khoản. Chi tiết: ${detail}`;
  }
  if (status === 409) {
    return `Email hoặc mã nhân sự đã tồn tại. Chi tiết: ${detail}`;
  }
  if (status === 422) {
    return `Dữ liệu tài khoản chưa hợp lệ. Chi tiết: ${detail}`;
  }
  if (status >= 500) {
    return `Edge Function đang lỗi server. Kiểm tra biến môi trường bảo mật và log của Edge Function. Chi tiết: ${detail}`;
  }
  return detail;
}

async function checkCreateUserFunctionAvailability() {
  if (!isSuperAdmin() || !createAccountMessage) return;

  try {
    const res = await fetch(getAdminCreateUserUrl(), {
      method: "OPTIONS",
      headers: {
        apikey: SUPABASE_ANON_KEY
      }
    });

    if (res.status === 404) {
      showMessage(createAccountMessage, `Chưa deploy Edge Function admin-create-user nên chưa tạo được tài khoản từ web. ${getCreateAccountDeployHint()}`, "warn");
      return;
    }

    if (!res.ok && res.status >= 500) {
      showMessage(createAccountMessage, `Edge Function đang phản hồi lỗi ${res.status}. Kiểm tra Supabase Function logs trước khi tạo tài khoản.`, "warn");
    }
  } catch (err) {
    showMessage(createAccountMessage, `Chưa kết nối được Edge Function admin-create-user. Nếu bấm tạo tài khoản đang báo Failed to fetch thì gần như chắc function chưa deploy/CORS chưa có. ${getCreateAccountDeployHint()}`, "warn");
  }
}

function getWeekDates() {
  return Array.from({ length: 7 }, (_, i) => addDays(selectedWeekStart, i));
}

function getAdminMonthStart() {
  return new Date(selectedAdminMonth.getFullYear(), selectedAdminMonth.getMonth(), 1);
}

function getAdminMonthEnd() {
  return new Date(selectedAdminMonth.getFullYear(), selectedAdminMonth.getMonth() + 1, 0);
}

function getAdminGridDates() {
  const start = getAdminMonthStart();
  const end = getAdminMonthEnd();
  const startDay = start.getDay();
  const startOffset = startDay === 0 ? 6 : startDay - 1;
  const gridStart = addDays(start, -startOffset);
  const endDay = end.getDay();
  const endOffset = endDay === 0 ? 0 : 7 - endDay;
  const gridEnd = addDays(end, endOffset);

  const dates = [];
  let cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    dates.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function sameAdminMonth(date) {
  return date.getMonth() === selectedAdminMonth.getMonth() && date.getFullYear() === selectedAdminMonth.getFullYear();
}

function isToday(date) {
  const now = new Date();
  return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function parseScheduleNote(note) {
  const raw = String(note || "");
  const match = raw.match(TIME_META_REGEX);
  if (!match) return { cleanNote: raw.trim(), timeText: "" };
  return {
    cleanNote: raw.replace(TIME_META_REGEX, "").trim(),
    timeText: `${match[1]} - ${match[2]}`
  };
}

const LEAVE_PERIOD_LABELS = {
  full_shift: "Toàn bộ ca",
  first_half: "Nửa đầu ca",
  last_half: "Nửa cuối ca",
  custom: "Theo giờ"
};

function normalizeTime(value) {
  return value ? String(value).slice(0, 5) : "";
}

function formatLeavePeriod(row) {
  const period = row.leave_period || "full_shift";
  const start = normalizeTime(row.leave_start_time);
  const end = normalizeTime(row.leave_end_time);
  if (start && end) return `${LEAVE_PERIOD_LABELS[period] || "Theo giờ"} • ${start} - ${end}`;
  return `${LEAVE_PERIOD_LABELS[period] || "Toàn bộ ca"} • ${SHIFT_LABELS[row.shift] || row.shift}`;
}

function requireShiftLabel(row) {
  if (row.is_off || row.shift === "off") return "OFF";
  const meta = parseScheduleNote(row.note);
  return `${SHIFT_LABELS[row.shift] || row.shift}${meta.timeText ? ` • ${escapeHtml(meta.timeText)}` : ""}`;
}

function displayProfileName(profile) {
  const name = String(profile?.full_name || "").trim();
  if (name && !name.includes("@")) return name;
  return profile?.employee_code || profile?.email || "Nhân sự";
}

function isSuperAdmin() {
  return currentProfile?.role_type === "SUPER_ADMIN";
}

function isAdmin() {
  return currentProfile?.role_type === "ADMIN";
}

function isLeader() {
  return currentProfile?.role_type === "LEADER";
}

function applyRoleBasedUi() {
  const superOnlyEls = document.querySelectorAll(".super-admin-only");
  superOnlyEls.forEach(el => el.classList.toggle("hidden", !isSuperAdmin()));

  const roleLabel = isSuperAdmin() ? "SUPER_ADMIN" : isAdmin() ? "ADMIN" : isLeader() ? "LEADER" : currentProfile?.role_type || "USER";
  const menuBtn = document.getElementById("accountMenuBtn");
  if (menuBtn && !menuBtn.querySelector(".role-pill")) {
    const pill = document.createElement("span");
    pill.className = "role-pill";
    pill.textContent = roleLabel;
    menuBtn.insertBefore(pill, menuBtn.querySelector(".chevron"));
  }
}


function closeAccountMenu() {
  document.getElementById("accountMenu")?.classList.add("hidden");
  document.getElementById("accountMenuBtn")?.setAttribute("aria-expanded", "false");
}

function toggleAccountMenu(event) {
  event?.stopPropagation();
  const menu = document.getElementById("accountMenu");
  const btn = document.getElementById("accountMenuBtn");
  if (!menu || !btn) return;

  const willOpen = menu.classList.contains("hidden");
  menu.classList.toggle("hidden", !willOpen);
  btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
}

function closeProfileSettingsModal() {
  document.getElementById("profileSettingsModal")?.classList.add("hidden");
}

function openProfileSettingsModal() {
  const modal = ensureProfileSettingsModal();
  if (!modal) return;
  modal.classList.remove("hidden");
  setTimeout(() => document.getElementById("profileSettingsSearchInput")?.focus(), 60);
}

function applyProfileSettingsSearch() {
  profileSettingsSearchQuery = document.getElementById("profileSettingsSearchInput")?.value.trim() || "";
  renderProfileSettings();
}

function clearProfileSettingsSearch() {
  profileSettingsSearchQuery = "";
  const input = document.getElementById("profileSettingsSearchInput");
  if (input) input.value = "";
  renderProfileSettings();
}

function ensureProfileSettingsModal() {
  if (!isSuperAdmin()) return null;

  const existing = document.getElementById("profileSettingsModal");
  if (existing) return existing;

  const tableHead = document.querySelector(".account-table-head");
  const tableWrap = document.querySelector(".profile-settings-wrap");
  const message = profileSettingsMessage;
  const panelHead = accountAdminPanel?.querySelector(":scope > .section-head");
  const refreshBtn = document.getElementById("refreshProfilesBtn");

  if (!tableHead || !tableWrap || !message || !panelHead) return null;

  if (!document.getElementById("openProfileSettingsBtn")) {
    const openBtn = document.createElement("button");
    openBtn.id = "openProfileSettingsBtn";
    openBtn.className = "btn secondary";
    openBtn.type = "button";
    openBtn.textContent = "Cấu hình hồ sơ";
    openBtn.addEventListener("click", openProfileSettingsModal);
    panelHead.insertBefore(openBtn, refreshBtn || null);
  }

  const modal = document.createElement("div");
  modal.id = "profileSettingsModal";
  modal.className = "uws-modal hidden";
  modal.innerHTML = `
    <div class="uws-modal-backdrop" data-close-profile-settings></div>
    <div class="uws-modal-card profile-settings-modal-card">
      <div class="modal-head">
        <div>
          <p class="eyebrow">Danh sách tài khoản</p>
          <h2>Cấu hình hồ sơ & chỉ tiêu</h2>
          <p class="muted">Tìm nhanh theo mã, họ tên, email, vai trò, team hoặc trạng thái.</p>
        </div>
        <button class="modal-close" type="button" data-close-profile-settings>×</button>
      </div>
      <div class="profile-settings-toolbar">
        <label class="profile-search-field">
          Tìm kiếm tài khoản
          <input id="profileSettingsSearchInput" type="text" placeholder="Nhập mã, tên, email, team..." autocomplete="off" />
        </label>
        <button id="profileSettingsSearchBtn" class="btn primary" type="button">Tìm kiếm</button>
        <button id="profileSettingsClearSearchBtn" class="btn ghost" type="button">Xóa lọc</button>
      </div>
      <p id="profileSettingsResultCount" class="profile-results-count muted"></p>
      <div id="profileSettingsModalBody"></div>
    </div>
  `;

  const body = modal.querySelector("#profileSettingsModalBody");
  body.appendChild(tableHead);
  body.appendChild(tableWrap);
  body.appendChild(message);
  document.body.appendChild(modal);

  modal.querySelectorAll("[data-close-profile-settings]").forEach(el => {
    el.addEventListener("click", closeProfileSettingsModal);
  });
  modal.querySelector("#profileSettingsSearchBtn")?.addEventListener("click", applyProfileSettingsSearch);
  modal.querySelector("#profileSettingsClearSearchBtn")?.addEventListener("click", clearProfileSettingsSearch);
  modal.querySelector("#profileSettingsSearchInput")?.addEventListener("keydown", event => {
    if (event.key === "Enter") applyProfileSettingsSearch();
  });

  return modal;
}

function ensureMonthlyExcelButton() {
  const monthActions = document.querySelector(".month-actions");
  if (!monthActions || document.getElementById("exportMonthExcelBtn")) return;

  const btn = document.createElement("button");
  btn.id = "exportMonthExcelBtn";
  btn.className = "btn primary export-month-excel-btn";
  btn.type = "button";
  btn.textContent = "Tải Excel tháng";
  btn.addEventListener("click", exportMonthExcel);
  monthActions.classList.add("has-export");
  monthActions.appendChild(btn);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeSearchValue(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getProfileSearchText(profile) {
  return normalizeSearchValue([
    profile.employee_code,
    profile.full_name,
    profile.email,
    profile.role_type,
    profile.team,
    profile.status
  ].join(" "));
}

function getProfileSettingsFilteredRows() {
  const query = normalizeSearchValue(profileSettingsSearchQuery);
  if (!query) return profileSettingsRows;
  return profileSettingsRows.filter(profile => getProfileSearchText(profile).includes(query));
}

async function requireAdmin() {
  const result = await getCurrentUserAndProfile();
  currentUser = result.user;
  currentProfile = result.profile;

  if (!currentUser || !currentProfile) {
    window.location.href = "./index.html";
    return false;
  }

  if (currentProfile.status !== "active") {
    await supabase.auth.signOut();
    window.location.href = "./index.html";
    return false;
  }

  if (!ADMIN_ROLES.includes(currentProfile.role_type)) {
    window.location.href = "./employee.html";
    return false;
  }

  applyRoleBasedUi();
  return true;
}

async function loadMetrics() {
  const weekDates = getWeekDates();
  const start = toISODate(weekDates[0]);
  const end = toISODate(weekDates[6]);

  const [{ count: pendingScheduleCount }, { count: approvedWeekCount }, { count: pendingLeaveCount }, { count: employeeCount }] = await Promise.all([
    supabase.from("schedule_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("schedule_requests").select("*", { count: "exact", head: true }).eq("status", "approved").gte("work_date", start).lte("work_date", end),
    supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("profiles").select("*", { count: "exact", head: true }).in("role_type", ["TTS","NVPT"]).eq("status", "active")
  ]);

  document.getElementById("pendingScheduleCount").textContent = pendingScheduleCount || 0;
  document.getElementById("approvedWeekCount").textContent = approvedWeekCount || 0;
  document.getElementById("pendingLeaveCount").textContent = pendingLeaveCount || 0;
  document.getElementById("employeeCount").textContent = employeeCount || 0;
}

function renderProfileSettings() {
  if (!profileSettingsTable) return;

  if (!profileSettingsRows.length) {
    profileSettingsTable.innerHTML = `<tr><td colspan="8" class="empty-row">Chưa có tài khoản để cấu hình.</td></tr>`;
    return;
  }

  const filteredRows = getProfileSettingsFilteredRows();
  const countEl = document.getElementById("profileSettingsResultCount");
  if (countEl) {
    countEl.textContent = profileSettingsSearchQuery
      ? `Tìm thấy ${filteredRows.length}/${profileSettingsRows.length} tài khoản.`
      : `${profileSettingsRows.length} tài khoản.`;
  }

  if (!filteredRows.length) {
    profileSettingsTable.innerHTML = `<tr><td colspan="8" class="empty-row">Không tìm thấy tài khoản phù hợp.</td></tr>`;
    return;
  }

  profileSettingsTable.innerHTML = filteredRows.map(profile => `
    <tr data-profile-id="${profile.id}">
      <td><b>${escapeHtml(profile.employee_code || "")}</b></td>
      <td><input class="profile-name-input" type="text" value="${escapeHtml(profile.full_name || "")}" placeholder="Nhập họ tên" /></td>
      <td><span class="muted">${escapeHtml(profile.email || "")}</span></td>
      <td>
        <select class="profile-role-input">
          ${["TTS", "NVPT", "LEADER", "ADMIN", "SUPER_ADMIN"].map(role => `<option value="${role}" ${profile.role_type === role ? "selected" : ""}>${role}</option>`).join("")}
        </select>
      </td>
      <td><input class="profile-team-input" type="text" value="${escapeHtml(profile.team || "")}" placeholder="Team" /></td>
      <td><input class="profile-target-input" type="number" min="0" max="31" value="${Number(profile.min_days_per_month || 0)}" /></td>
      <td>
        <select class="profile-status-input">
          <option value="active" ${profile.status === "active" ? "selected" : ""}>active</option>
          <option value="inactive" ${profile.status === "inactive" ? "selected" : ""}>inactive</option>
        </select>
      </td>
      <td><button class="btn primary profile-save-btn" type="button" data-profile-id="${profile.id}">Lưu</button></td>
    </tr>
  `).join("");
}

async function loadProfileSettings() {
  if (!profileSettingsTable || !isSuperAdmin()) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, employee_code, full_name, email, phone, role_type, team, status, min_days_per_month")
    .in("role_type", ["TTS", "NVPT", "LEADER", "ADMIN", "SUPER_ADMIN"])
    .order("role_type", { ascending: true })
    .order("employee_code", { ascending: true });

  if (error) {
    profileSettingsRows = [];
    profileSettingsTable.innerHTML = `<tr><td colspan="8" class="empty-row">${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  profileSettingsRows = data || [];
  renderProfileSettings();
}

async function updateProfileSetting(profileId) {
  if (!isSuperAdmin()) {
    showMessage(profileSettingsMessage, "Chỉ SUPER_ADMIN mới được quản trị tài khoản.", "err");
    return;
  }

  const row = document.querySelector(`tr[data-profile-id="${profileId}"]`);
  if (!row) return;

  const fullName = row.querySelector(".profile-name-input")?.value.trim();
  const roleType = row.querySelector(".profile-role-input")?.value;
  const team = row.querySelector(".profile-team-input")?.value.trim();
  const minDays = Number(row.querySelector(".profile-target-input")?.value || 0);
  const status = row.querySelector(".profile-status-input")?.value;

  if (profileId === currentUser?.id && (roleType !== "SUPER_ADMIN" || status !== "active")) {
    showMessage(profileSettingsMessage, "Không thể tự hạ quyền hoặc khóa tài khoản SUPER_ADMIN đang đăng nhập.", "err");
    await loadProfileSettings();
    return;
  }

  if (!fullName || fullName.length < 2) {
    showMessage(profileSettingsMessage, "Vui lòng nhập họ tên hợp lệ.", "err");
    return;
  }

  if (Number.isNaN(minDays) || minDays < 0 || minDays > 31) {
    showMessage(profileSettingsMessage, "Chỉ tiêu tháng phải từ 0 đến 31 ngày.", "err");
    return;
  }

  showMessage(profileSettingsMessage, "Đang lưu cấu hình nhân sự...");

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      role_type: roleType,
      team: team || null,
      min_days_per_month: minDays,
      status
    })
    .eq("id", profileId);

  if (error) {
    showMessage(profileSettingsMessage, error.message, "err");
    return;
  }

  showMessage(profileSettingsMessage, "Đã lưu cấu hình nhân sự.", "ok");
  await refreshAll();
}

function getAccountFormPayload() {
  return {
    email: document.getElementById("newAccountEmail")?.value.trim() || "",
    password: document.getElementById("newAccountPassword")?.value || "",
    employee_code: document.getElementById("newAccountCode")?.value.trim() || "",
    full_name: document.getElementById("newAccountName")?.value.trim() || "",
    role_type: document.getElementById("newAccountRole")?.value || "TTS",
    team: document.getElementById("newAccountTeam")?.value.trim() || null,
    min_days_per_month: Number(document.getElementById("newAccountTarget")?.value || 0),
    status: document.getElementById("newAccountStatus")?.value || "active"
  };
}

function clearAccountForm(options = {}) {
  ["newAccountEmail", "newAccountPassword", "newAccountCode", "newAccountName"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const team = document.getElementById("newAccountTeam");
  const target = document.getElementById("newAccountTarget");
  const role = document.getElementById("newAccountRole");
  const status = document.getElementById("newAccountStatus");
  if (team) team.value = "UNITE";
  if (target) target.value = "12";
  if (role) role.value = "TTS";
  if (status) status.value = "active";
  if (options.clearMessage !== false) showMessage(createAccountMessage, "");
}

function validateAccountPayload(payload) {
  if (!payload.email || !payload.email.includes("@")) return "Email đăng nhập chưa hợp lệ.";
  if (!payload.password || payload.password.length < 8) return "Mật khẩu tạm cần tối thiểu 8 ký tự.";
  if (!payload.employee_code || payload.employee_code.length < 3) return "Mã nhân sự chưa hợp lệ.";
  if (!payload.full_name || payload.full_name.length < 2) return "Họ tên hiển thị chưa hợp lệ.";
  if (!Number.isFinite(payload.min_days_per_month) || payload.min_days_per_month < 0 || payload.min_days_per_month > 31) return "Chỉ tiêu tháng phải từ 0 đến 31 ngày.";
  if (!["TTS", "NVPT", "LEADER", "ADMIN", "SUPER_ADMIN"].includes(payload.role_type)) return "Vai trò chưa hợp lệ.";
  return "";
}

async function createAccount() {
  if (createAccountBusy) return;

  if (!isSuperAdmin()) {
    showMessage(createAccountMessage, "Chỉ SUPER_ADMIN mới được tạo tài khoản.", "err");
    return;
  }

  const payload = getAccountFormPayload();
  const validationError = validateAccountPayload(payload);
  if (validationError) {
    showMessage(createAccountMessage, validationError, "err");
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    showMessage(createAccountMessage, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", "err");
    return;
  }

  showMessage(createAccountMessage, "Đang tạo tài khoản qua Edge Function admin-create-user...");

  setCreateAccountBusy(true);
  try {
    const res = await fetch(getAdminCreateUserUrl(), {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const json = await readJsonResponse(res);

    if (!res.ok) {
      const message = getCreateAccountErrorMessage(res.status, res.statusText, json);
      showMessage(createAccountMessage, `Không tạo được tài khoản: ${message}`, "err");
      return;
    }

    clearAccountForm({ clearMessage: false });
    showMessage(createAccountMessage, "Đã tạo tài khoản và hồ sơ nhân sự. Nhân sự có thể đăng nhập ngay.", "ok");
    await refreshAll();
  } catch (err) {
    showMessage(createAccountMessage, `Không gọi được Edge Function admin-create-user. Endpoint hiện tại: ${getAdminCreateUserUrl()}. ${getCreateAccountDeployHint()}. Chi tiết trình duyệt: ${err.message}`, "err");
  } finally {
    setCreateAccountBusy(false);
  }
}

async function loadMonthSummary() {
  const startIso = toISODate(getAdminMonthStart());
  const endIso = toISODate(getAdminMonthEnd());

  const [scheduleRes, offRes] = await Promise.all([
    supabase
      .from("schedule_requests")
      .select("id, work_date, shift, status, note, submitted_at, profiles:employee_id(full_name, employee_code, team, email, role_type)")
      .gte("work_date", startIso)
      .lte("work_date", endIso)
      .in("status", ["pending", "approved"])
      .order("work_date", { ascending: true })
      .order("submitted_at", { ascending: true }),
    supabase
      .from("unavailability")
      .select("id, unavailable_date, shift, status, note, created_at, profiles:employee_id(full_name, employee_code, team, email, role_type)")
      .gte("unavailable_date", startIso)
      .lte("unavailable_date", endIso)
      .eq("status", "active")
      .order("unavailable_date", { ascending: true })
  ]);

  if (scheduleRes.error || offRes.error) {
    adminMonthRowsByDate = {};
    adminMonthSummary.innerHTML = `<div class="empty-row">${escapeHtml(scheduleRes.error?.message || offRes.error?.message || "Không tải được lịch tháng.")}</div>`;
    return;
  }

  adminMonthTitle.textContent = `Tháng ${selectedAdminMonth.getMonth() + 1}/${selectedAdminMonth.getFullYear()}`;

  const offRows = (offRes.data || [])
    .filter(row => String(row.note || "").includes(OFF_SUBMITTED_MARKER))
    .map(row => ({
      ...row,
      id: `off:${row.id}`,
      work_date: row.unavailable_date,
      shift: "off",
      status: "off",
      is_off: true,
      note: String(row.note || "").replace(OFF_SUBMITTED_MARKER, "").trim()
    }));

  const rowsAll = [...(scheduleRes.data || []), ...offRows];
  const byDate = {};
  rowsAll.forEach(row => {
    const iso = String(row.work_date).slice(0, 10);
    byDate[iso] ||= [];
    byDate[iso].push(row);
  });
  adminMonthRowsByDate = byDate;

  const dates = getAdminGridDates();
  adminMonthSummary.innerHTML = dates.map(date => {
    const iso = toISODate(date);
    const rows = byDate[iso] || [];
    const approved = rows.filter(row => row.status === "approved").length;
    const pending = rows.filter(row => row.status === "pending").length;
    const offCount = rows.filter(row => row.status === "off").length;
    const weeklyOff = date.getDay() === 0;
    const isOtherMonth = !sameAdminMonth(date) ? "is-other-month" : "";
    const isTodayClass = isToday(date) ? "is-today" : "";
    const eventClass = rows.length ? "has-events" : "";
    const pendingClass = pending ? "has-pending" : "";
    const approvedClass = approved ? "has-approved" : "";
    const offClass = offCount ? "has-off" : "";
    const weeklyOffClass = weeklyOff ? "is-weekly-off" : "";

    const existingEventsHtml = rows.length
      ? rows.map(row => `
          <div class="admin-event ${row.status}">
            <div class="admin-event-name">${escapeHtml(displayProfileName(row.profiles))}</div>
            <div class="admin-event-meta">${escapeHtml(requireShiftLabel(row))}</div>
          </div>
        `).join("")
      : "";
    const eventsHtml = weeklyOff
      ? `<div class="admin-weekly-off"><b>Chủ Nhật</b><span>Nghỉ hàng tuần</span></div>${existingEventsHtml}`
      : (existingEventsHtml || `<div class="admin-empty-cell">Trống</div>`);

    return `
      <div class="calendar-cell admin-calendar-cell ${isOtherMonth} ${isTodayClass} ${eventClass} ${pendingClass} ${approvedClass} ${offClass} ${weeklyOffClass}" data-date="${iso}">
        <div class="cell-top">
          <div>
            <div class="date-number">${date.getDate()}</div>
            <div class="date-small">${formatDate(iso)}</div>
          </div>
          <div class="admin-day-stats">
            ${weeklyOff ? `<span class="admin-chip weekly-off">CN OFF</span>` : `
              <span class="admin-chip ok">Duyệt ${approved}</span>
              <span class="admin-chip pending">Chờ ${pending}</span>
              ${offCount ? `<span class="admin-chip off">OFF ${offCount}</span>` : ""}
            `}
          </div>
        </div>
        <div class="admin-events-wrap">${eventsHtml}</div>
      </div>
    `;
  }).join("");
}

async function loadPendingSchedules() {
  const { data, error } = await supabase
    .from("schedule_requests")
    .select("*, profiles:employee_id(employee_code,full_name,role_type,team)")
    .eq("status", "pending")
    .order("work_date", { ascending: true })
    .order("submitted_at", { ascending: true });

  const tbody = document.getElementById("pendingScheduleTable");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data?.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Không có yêu cầu chờ duyệt.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(row => {
    const meta = parseScheduleNote(row.note);
    return `
      <tr>
        <td><input type="checkbox" class="schedule-check" value="${row.id}" /></td>
        <td><b>${escapeHtml(displayProfileName(row.profiles))}</b><br><span class="muted">${escapeHtml(row.profiles?.employee_code || "")}</span></td>
        <td>${escapeHtml(row.profiles?.role_type || "")}</td>
        <td>${escapeHtml(row.profiles?.team || "")}</td>
        <td>${formatDate(row.work_date)}</td>
        <td>${SHIFT_LABELS[row.shift] || row.shift}${meta.timeText ? `<br><span class="muted">${escapeHtml(meta.timeText)}</span>` : ""}</td>
        <td>${escapeHtml(meta.cleanNote || "")}</td>
      </tr>
    `;
  }).join("");
}

async function loadPendingLeaves() {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*, profiles:employee_id(employee_code,full_name,role_type,team)")
    .eq("status", "pending")
    .order("leave_date", { ascending: true });

  const tbody = document.getElementById("pendingLeaveTable");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data?.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Không có yêu cầu xin nghỉ chờ duyệt.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(row => `
    <tr>
      <td><input type="checkbox" class="leave-check" value="${row.id}" /></td>
      <td><b>${escapeHtml(displayProfileName(row.profiles))}</b><br><span class="muted">${escapeHtml(row.profiles?.employee_code || "")}</span></td>
      <td>${formatDate(row.leave_date)}</td>
      <td>${escapeHtml(formatLeavePeriod(row))}</td>
      <td>${REASON_LABELS[row.leave_type] || row.leave_type}</td>
      <td>${row.is_late_notice ? '<span class="badge rejected">Sát giờ</span>' : '<span class="badge approved">Bình thường</span>'}</td>
      <td>${escapeHtml(row.reason_note || "")}</td>
    </tr>
  `).join("");
}

async function loadAllSchedules() {
  const weekDates = getWeekDates();
  const start = toISODate(weekDates[0]);
  const end = toISODate(weekDates[6]);

  const { data, error } = await supabase
    .from("schedule_requests")
    .select("*, profiles:employee_id(employee_code,full_name,role_type,team)")
    .gte("work_date", start)
    .lte("work_date", end)
    .order("work_date", { ascending: true });

  const tbody = document.getElementById("allScheduleTable");

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  allSchedules = data || [];

  if (!allSchedules.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Chưa có lịch trong tuần này.</td></tr>`;
    return;
  }

  tbody.innerHTML = allSchedules.map(row => {
    const meta = parseScheduleNote(row.note);
    return `
      <tr>
        <td><b>${escapeHtml(displayProfileName(row.profiles))}</b><br><span class="muted">${escapeHtml(row.profiles?.employee_code || "")}</span></td>
        <td>${escapeHtml(row.profiles?.role_type || "")}</td>
        <td>${escapeHtml(row.profiles?.team || "")}</td>
        <td>${formatDate(row.work_date)}</td>
        <td>${SHIFT_LABELS[row.shift] || row.shift}${meta.timeText ? `<br><span class="muted">${escapeHtml(meta.timeText)}</span>` : ""}</td>
        <td><span class="badge ${row.status}">${STATUS_LABELS[row.status] || row.status}</span></td>
      </tr>
    `;
  }).join("");
}

function getCheckedValues(selector) {
  return Array.from(document.querySelectorAll(selector + ":checked")).map(el => el.value);
}

async function updateSchedules(status) {
  const ids = getCheckedValues(".schedule-check");
  const msg = document.getElementById("adminScheduleMessage");

  if (!ids.length) {
    showMessage(msg, "Chưa chọn yêu cầu nào.", "err");
    return;
  }

  const { error } = await supabase
    .from("schedule_requests")
    .update({
      status,
      reviewed_by: currentUser.id,
      reviewed_at: new Date().toISOString()
    })
    .in("id", ids);

  if (error) {
    showMessage(msg, error.message, "err");
    return;
  }

  showMessage(msg, status === "approved" ? "Đã duyệt lịch đã chọn." : "Đã từ chối lịch đã chọn.", "ok");
  await refreshAll();
}

async function updateLeaves(status) {
  const ids = getCheckedValues(".leave-check");
  const msg = document.getElementById("adminLeaveMessage");

  if (!ids.length) {
    showMessage(msg, "Chưa chọn yêu cầu nghỉ nào.", "err");
    return;
  }

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status,
      reviewed_by: currentUser.id,
      reviewed_at: new Date().toISOString()
    })
    .in("id", ids);

  if (error) {
    showMessage(msg, error.message, "err");
    return;
  }

  showMessage(msg, status === "approved" ? "Đã duyệt nghỉ đã chọn." : "Đã từ chối nghỉ đã chọn.", "ok");
  await refreshAll();
}



function clearPasswordForm() {
  if (currentPasswordInput) currentPasswordInput.value = "";
  if (newPasswordInput) newPasswordInput.value = "";
  if (confirmNewPasswordInput) confirmNewPasswordInput.value = "";
  showMessage(changePasswordMessage, "");
}

function openChangePasswordModal() {
  clearPasswordForm();
  changePasswordModal?.classList.remove("hidden");
  setTimeout(() => currentPasswordInput?.focus(), 50);
}

function closeChangePasswordModal() {
  changePasswordModal?.classList.add("hidden");
  clearPasswordForm();
}

async function submitChangePassword() {
  const currentPassword = currentPasswordInput?.value || "";
  const newPassword = newPasswordInput?.value || "";
  const confirmPassword = confirmNewPasswordInput?.value || "";

  if (!currentPassword || !newPassword || !confirmPassword) {
    showMessage(changePasswordMessage, "Vui lòng nhập đầy đủ thông tin.", "err");
    return;
  }

  if (newPassword.length < 8) {
    showMessage(changePasswordMessage, "Mật khẩu mới cần tối thiểu 8 ký tự.", "err");
    return;
  }

  if (newPassword !== confirmPassword) {
    showMessage(changePasswordMessage, "Mật khẩu mới nhập lại chưa khớp.", "err");
    return;
  }

  if (currentPassword === newPassword) {
    showMessage(changePasswordMessage, "Mật khẩu mới không nên trùng mật khẩu hiện tại.", "err");
    return;
  }

  const email = currentUser?.email || currentProfile?.email;
  if (!email) {
    showMessage(changePasswordMessage, "Không tìm thấy email tài khoản. Vui lòng đăng nhập lại.", "err");
    return;
  }

  showMessage(changePasswordMessage, "Đang xác thực mật khẩu hiện tại...");

  const verifyRes = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword
  });

  if (verifyRes.error) {
    showMessage(changePasswordMessage, "Mật khẩu hiện tại chưa đúng.", "err");
    return;
  }

  showMessage(changePasswordMessage, "Mật khẩu hiện tại đúng. Đang cập nhật mật khẩu mới...");

  const updateRes = await supabase.auth.updateUser({
    password: newPassword
  });

  if (updateRes.error) {
    showMessage(changePasswordMessage, `Không đổi được mật khẩu: ${updateRes.error.message}`, "err");
    return;
  }

  showMessage(changePasswordMessage, "Đổi mật khẩu thành công.", "ok");

  setTimeout(() => {
    closeChangePasswordModal();
  }, 700);
}


function openDeleteScheduleModal() {
  if (!isSuperAdmin()) {
    alert("Chỉ SUPER_ADMIN mới được xóa toàn bộ lịch làm.");
    return;
  }
  showMessage(deleteScheduleMessage, "");
  if (deleteConfirmPassword) deleteConfirmPassword.value = "";
  deleteScheduleModal?.classList.remove("hidden");
  setTimeout(() => deleteConfirmPassword?.focus(), 80);
}

function closeDeleteScheduleModal() {
  deleteScheduleModal?.classList.add("hidden");
  showMessage(deleteScheduleMessage, "");
  if (deleteConfirmPassword) deleteConfirmPassword.value = "";
}

async function confirmDeleteAllSchedules() {
  if (!isSuperAdmin()) {
    showMessage(deleteScheduleMessage, "Chỉ SUPER_ADMIN mới được xóa toàn bộ lịch làm.", "err");
    return;
  }

  const password = deleteConfirmPassword?.value || "";

  if (!password) {
    showMessage(deleteScheduleMessage, "Vui lòng nhập lại mật khẩu admin.", "err");
    return;
  }

  const adminEmail = currentUser?.email || currentProfile?.email;
  showMessage(deleteScheduleMessage, "Đang xác minh mật khẩu...");

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password
  });

  if (authError) {
    showMessage(deleteScheduleMessage, "Mật khẩu chưa đúng. Không thể xóa lịch.", "err");
    return;
  }

  showMessage(deleteScheduleMessage, "Mật khẩu đúng. Đang chuẩn bị gửi thông báo cho nhân sự...");

  const { data: employees, error: employeeError } = await supabase
    .from("profiles")
    .select("id, full_name, employee_code, role_type, status")
    .in("role_type", ["TTS", "NVPT"])
    .eq("status", "active");

  if (employeeError) {
    showMessage(deleteScheduleMessage, `Không tải được danh sách nhân sự: ${employeeError.message}`, "err");
    return;
  }

  const now = new Date().toISOString();
  const notifications = (employees || []).map(employee => ({
    recipient_id: employee.id,
    title: "Lịch làm đã được reset",
    message: "Admin đã xóa toàn bộ lịch làm và các ngày OFF đã nộp. Vui lòng tạo lại bản nháp và nộp lịch tuần mới.",
    type: "warn",
    created_by: currentUser.id,
    created_at: now
  }));

  if (notifications.length) {
    const { error: notifyError } = await supabase
      .from("notifications")
      .insert(notifications);

    if (notifyError) {
      showMessage(deleteScheduleMessage, `Chưa gửi được thông báo. Hãy chạy database/upgrade-v4.sql trước. Chi tiết: ${notifyError.message}`, "err");
      return;
    }
  }

  showMessage(deleteScheduleMessage, "Đã gửi thông báo. Đang xóa dữ liệu lịch làm...");

  const { error: leaveDeleteError } = await supabase
    .from("leave_requests")
    .delete()
    .gte("submitted_at", "1970-01-01");

  if (leaveDeleteError) {
    showMessage(deleteScheduleMessage, `Lỗi xóa yêu cầu xin nghỉ: ${leaveDeleteError.message}`, "err");
    return;
  }

  const { error: scheduleDeleteError } = await supabase
    .from("schedule_requests")
    .delete()
    .gte("submitted_at", "1970-01-01");

  if (scheduleDeleteError) {
    showMessage(deleteScheduleMessage, `Lỗi xóa lịch làm: ${scheduleDeleteError.message}`, "err");
    return;
  }

  const { data: offRows, error: offLoadError } = await supabase
    .from("unavailability")
    .select("id, note")
    .eq("status", "active");

  if (offLoadError) {
    showMessage(deleteScheduleMessage, `Lỗi tải danh sách OFF: ${offLoadError.message}`, "err");
    return;
  }

  const offIds = (offRows || [])
    .filter(row => String(row.note || "").includes(OFF_SUBMITTED_MARKER))
    .map(row => row.id);

  if (offIds.length) {
    const { error: offDeleteError } = await supabase
      .from("unavailability")
      .delete()
      .in("id", offIds);

    if (offDeleteError) {
      showMessage(deleteScheduleMessage, `Lỗi xóa các ngày OFF: ${offDeleteError.message}`, "err");
      return;
    }
  }

  showMessage(deleteScheduleMessage, `Đã xóa toàn bộ lịch làm, ${offIds.length} ngày OFF và gửi thông báo cho ${notifications.length} tài khoản.`, "ok");

  setTimeout(async () => {
    closeDeleteScheduleModal();
    await refreshAll();
  }, 900);
}


function getWeekdayLabel(dateIso) {
  const day = new Date(`${dateIso}T00:00:00`).getDay();
  return ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"][day] || "";
}

function getMonthlyReportRows() {
  return Object.values(adminMonthRowsByDate)
    .flat()
    .filter(row => row && row.work_date)
    .sort((a, b) => {
      const dateCompare = String(a.work_date).localeCompare(String(b.work_date));
      if (dateCompare) return dateCompare;
      const teamCompare = String(a.profiles?.team || "").localeCompare(String(b.profiles?.team || ""));
      if (teamCompare) return teamCompare;
      return String(a.profiles?.employee_code || "").localeCompare(String(b.profiles?.employee_code || ""));
    });
}

function buildExcelTableHtml(title, headers, rows) {
  const headHtml = headers.map(header => `<th>${escapeHtml(header)}</th>`).join("");
  const rowsHtml = rows.map(row => `
    <tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>
  `).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p { margin: 0 0 12px; color: #555; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #999; padding: 7px 8px; mso-number-format: "\\@"; }
    th { background: #741f2b; color: #fff; font-weight: 700; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>Xuất lúc ${escapeHtml(new Date().toLocaleString("vi-VN"))}</p>
  <table>
    <thead><tr>${headHtml}</tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
</body>
</html>`;
}

function downloadExcelHtml(filename, html) {
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportMonthExcel() {
  const btn = document.getElementById("exportMonthExcelBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Đang tải...";
  }

  try {
    await loadMonthSummary();
    const reportRows = getMonthlyReportRows();

    if (!reportRows.length) {
      alert("Chưa có dữ liệu lịch tháng để xuất Excel.");
      return;
    }

    const headers = ["Mã NV", "Họ tên", "Vai trò", "Team", "Ngày", "Thứ", "Ca", "Giờ", "Trạng thái", "Ghi chú"];
    const rows = reportRows.map(row => {
      const profile = row.profiles || {};
      const meta = parseScheduleNote(row.note);
      return [
        profile.employee_code || "",
        displayProfileName(profile),
        profile.role_type || "",
        profile.team || "",
        row.work_date,
        getWeekdayLabel(row.work_date),
        row.is_off ? "OFF" : (SHIFT_LABELS[row.shift] || row.shift || ""),
        meta.timeText || "",
        row.status === "off" ? "OFF" : (STATUS_LABELS[row.status] || row.status || ""),
        meta.cleanNote || ""
      ];
    });

    const year = selectedAdminMonth.getFullYear();
    const month = String(selectedAdminMonth.getMonth() + 1).padStart(2, "0");
    const title = `Báo cáo lịch làm tháng ${month}/${year}`;
    const html = buildExcelTableHtml(title, headers, rows);
    downloadExcelHtml(`unite-lich-lam-thang-${year}-${month}.xls`, html);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Tải Excel tháng";
    }
  }
}

function exportCsv() {
  if (!allSchedules.length) {
    alert("Chưa có dữ liệu để xuất.");
    return;
  }

  const headers = ["Mã NV","Họ tên","Loại","Team","Ngày","Ca","Trạng thái"];
  const rows = allSchedules.map(row => [
    row.profiles?.employee_code || "",
    row.profiles?.full_name || "",
    row.profiles?.role_type || "",
    row.profiles?.team || "",
    row.work_date,
    requireShiftLabel(row),
    STATUS_LABELS[row.status] || row.status
  ]);

  const csv = [headers, ...rows]
    .map(cols => cols.map(v => `"${String(v).replaceAll('"','""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `unite-work-schedule-${toISODate(selectedWeekStart)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "./index.html";
}


function isCompactAdminCalendar() {
  return window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
}

function ensureAdminDayDetailModal() {
  let modal = document.getElementById("adminDayDetailModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "adminDayDetailModal";
  modal.className = "liquid-day-modal hidden";
  modal.innerHTML = `
    <div class="liquid-day-backdrop" data-close-admin-day-detail></div>
    <div class="liquid-day-card">
      <div class="liquid-day-head">
        <div>
          <p class="eyebrow">Chi tiết lịch làm</p>
          <h2 id="adminDayDetailTitle">Ngày</h2>
          <p id="adminDayDetailSub" class="muted"></p>
        </div>
        <button class="liquid-close" type="button" data-close-admin-day-detail>×</button>
      </div>
      <div id="adminDayDetailBody"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-admin-day-detail]").forEach(el => {
    el.addEventListener("click", closeAdminDayDetailModal);
  });
  return modal;
}

function closeAdminDayDetailModal() {
  document.getElementById("adminDayDetailModal")?.classList.add("hidden");
}

function openAdminDayDetailModal(dateIso) {
  const modal = ensureAdminDayDetailModal();
  const rows = adminMonthRowsByDate[dateIso] || [];
  const approved = rows.filter(row => row.status === "approved").length;
  const pending = rows.filter(row => row.status === "pending").length;
  const offCount = rows.filter(row => row.status === "off").length;
  const weeklyOff = new Date(`${dateIso}T00:00:00`).getDay() === 0;

  modal.querySelector("#adminDayDetailTitle").textContent = formatDate(dateIso);
  modal.querySelector("#adminDayDetailSub").textContent = weeklyOff
    ? (rows.length
      ? `Chủ Nhật là ngày nghỉ hàng tuần. Có ${rows.length} dữ liệu cũ trong ngày này cần kiểm tra.`
      : "Chủ Nhật là ngày nghỉ hàng tuần.")
    : (rows.length ? `${rows.length} lựa chọn lịch trong ngày này.` : "Ngày này chưa có lịch đăng ký.");

  const eventsHtml = rows.length
    ? rows.map(row => {
        const profile = row.profiles || {};
        const meta = parseScheduleNote(row.note);
        const statusText = row.status === "off" ? "OFF đã chốt" : (STATUS_LABELS[row.status] || row.status);
        return `
          <div class="liquid-event ${row.status}">
            <strong>${escapeHtml(displayProfileName(profile))}</strong>
            <small>${escapeHtml(profile.role_type || "")}${profile.team ? ` • ${escapeHtml(profile.team)}` : ""}</small><br>
            <small><span class="detail-label">Lịch</span>${escapeHtml(requireShiftLabel(row))}</small><br>
            <small><span class="detail-label">Trạng thái</span>${statusText}</small>
            ${meta.cleanNote ? `<p class="liquid-muted">${escapeHtml(meta.cleanNote)}</p>` : ""}
          </div>
        `;
      }).join("")
    : `<div class="liquid-event"><strong>Trống</strong><small>Chưa có nhân sự đăng ký.</small></div>`;

  modal.querySelector("#adminDayDetailBody").innerHTML = `
    <div class="liquid-stat-grid">
      <div class="liquid-stat"><span>Tổng lựa chọn</span><b>${rows.length}</b></div>
      <div class="liquid-stat"><span>Đã duyệt</span><b>${approved}</b></div>
      <div class="liquid-stat"><span>Chờ duyệt</span><b>${pending}</b></div>
      <div class="liquid-stat"><span>OFF</span><b>${offCount}</b></div>
    </div>
    <div class="liquid-event-list">${eventsHtml}</div>
  `;

  modal.classList.remove("hidden");
}

async function refreshAll() {
  await loadMetrics();
  await loadProfileSettings();
  await loadMonthSummary();
  await loadPendingSchedules();
  await loadPendingLeaves();
  await loadAllSchedules();
}

document.getElementById("logoutBtn")?.addEventListener("click", logout);
document.getElementById("accountMenuBtn")?.addEventListener("click", toggleAccountMenu);
document.getElementById("accountMenu")?.addEventListener("click", event => event.stopPropagation());
document.getElementById("changePasswordBtn")?.addEventListener("click", () => { closeAccountMenu(); openChangePasswordModal(); });
document.addEventListener("click", event => {
  if (!event.target.closest(".account-menu-wrap")) closeAccountMenu();
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeAccountMenu();
});
document.getElementById("submitChangePasswordBtn")?.addEventListener("click", submitChangePassword);
document.querySelectorAll("[data-close-password-modal]").forEach(el => {
  el.addEventListener("click", closeChangePasswordModal);
});
document.getElementById("deleteAllScheduleBtn")?.addEventListener("click", openDeleteScheduleModal);
document.getElementById("confirmDeleteAllScheduleBtn")?.addEventListener("click", confirmDeleteAllSchedules);
document.querySelectorAll("[data-close-delete-modal]").forEach(el => {
  el.addEventListener("click", closeDeleteScheduleModal);
});
document.getElementById("refreshProfilesBtn")?.addEventListener("click", loadProfileSettings);
createAccountBtn?.addEventListener("click", createAccount);
document.getElementById("clearAccountFormBtn")?.addEventListener("click", clearAccountForm);
profileSettingsTable?.addEventListener("click", event => {
  const btn = event.target.closest(".profile-save-btn");
  if (!btn) return;
  updateProfileSetting(btn.dataset.profileId);
});

document.getElementById("adminLoadBtn")?.addEventListener("click", async () => {
  selectedWeekStart = getMonday(new Date(weekStartInput.value + "T00:00:00"));
  weekStartInput.value = toISODate(selectedWeekStart);
  await refreshAll();
});
document.getElementById("adminPrevMonthBtn")?.addEventListener("click", async () => {
  selectedAdminMonth.setMonth(selectedAdminMonth.getMonth() - 1);
  await loadMonthSummary();
});
document.getElementById("adminNextMonthBtn")?.addEventListener("click", async () => {
  selectedAdminMonth.setMonth(selectedAdminMonth.getMonth() + 1);
  await loadMonthSummary();
});
document.getElementById("adminTodayBtn")?.addEventListener("click", async () => {
  selectedAdminMonth = new Date();
  selectedAdminMonth.setDate(1);
  selectedAdminMonth.setHours(0, 0, 0, 0);
  await loadMonthSummary();
});
document.getElementById("approveSelectedBtn")?.addEventListener("click", () => updateSchedules("approved"));
document.getElementById("rejectSelectedBtn")?.addEventListener("click", () => updateSchedules("rejected"));
document.getElementById("approveLeaveSelectedBtn")?.addEventListener("click", () => updateLeaves("approved"));
document.getElementById("rejectLeaveSelectedBtn")?.addEventListener("click", () => updateLeaves("rejected"));
document.getElementById("exportCsvBtn")?.addEventListener("click", exportCsv);

document.getElementById("checkAllSchedule")?.addEventListener("change", e => {
  document.querySelectorAll(".schedule-check").forEach(cb => cb.checked = e.target.checked);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeDeleteScheduleModal();
    closeChangePasswordModal();
    closeProfileSettingsModal();
    closeAdminDayDetailModal();
  }
});

document.getElementById("checkAllLeave")?.addEventListener("change", e => {
  document.querySelectorAll(".leave-check").forEach(cb => cb.checked = e.target.checked);
});


adminMonthSummary?.addEventListener("click", event => {
  const cell = event.target.closest(".admin-calendar-cell");
  if (!cell || cell.classList.contains("is-other-month")) return;
  openAdminDayDetailModal(cell.dataset.date);
});

let adminLongPressTimer = null;
adminMonthSummary?.addEventListener("touchstart", event => {
  const cell = event.target.closest(".admin-calendar-cell");
  if (!cell || cell.classList.contains("is-other-month")) return;
  adminLongPressTimer = setTimeout(() => openAdminDayDetailModal(cell.dataset.date), 420);
}, { passive: true });
adminMonthSummary?.addEventListener("touchend", () => {
  clearTimeout(adminLongPressTimer);
}, { passive: true });
adminMonthSummary?.addEventListener("touchmove", () => {
  clearTimeout(adminLongPressTimer);
}, { passive: true });

(async function init() {
  const ok = await requireAdmin();
  if (!ok) return;

  ensureProfileSettingsModal();
  ensureMonthlyExcelButton();
  weekStartInput.value = toISODate(selectedWeekStart);
  await refreshAll();
  await checkCreateUserFunctionAvailability();
})();
})();
