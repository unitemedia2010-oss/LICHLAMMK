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

const weekStartInput = document.getElementById("adminWeekStart");
const adminMonthTitle = document.getElementById("adminMonthTitle");
const adminMonthSummary = document.getElementById("adminMonthSummary");
let adminMonthRowsByDate = {};
const profileSettingsTable = document.getElementById("profileSettingsTable");
const profileSettingsMessage = document.getElementById("profileSettingsMessage");
const createAccountMessage = document.getElementById("createAccountMessage");
const accountAdminPanel = document.getElementById("accountAdminPanel");
const dangerZonePanel = document.getElementById("dangerZonePanel");
const TIME_META_REGEX = /\[\[UWS_TIME:(\d{2}:\d{2})-(\d{2}:\d{2})\]\]\s*/;
const deleteScheduleModal = document.getElementById("deleteScheduleModal");
const deleteConfirmPassword = document.getElementById("deleteConfirmPassword");
const deleteScheduleMessage = document.getElementById("deleteScheduleMessage");

const changePasswordModal = document.getElementById("changePasswordModal");
const currentPasswordInput = document.getElementById("currentPasswordInput");
const newPasswordInput = document.getElementById("newPasswordInput");
const confirmNewPasswordInput = document.getElementById("confirmNewPasswordInput");
const changePasswordMessage = document.getElementById("changePasswordMessage");

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

function requireShiftLabel(row) {
  const meta = parseScheduleNote(row.note);
  return `${SHIFT_LABELS[row.shift] || row.shift}${meta.timeText ? ` • ${meta.timeText}` : ""}`;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function requireAdmin() {
  const result = await getCurrentUserAndProfile();
  currentUser = result.user;
  currentProfile = result.profile;

  if (!currentUser || !currentProfile) {
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

async function loadProfileSettings() {
  if (!profileSettingsTable || !isSuperAdmin()) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, employee_code, full_name, email, phone, role_type, team, status, min_days_per_month")
    .in("role_type", ["TTS", "NVPT", "LEADER", "ADMIN", "SUPER_ADMIN"])
    .order("role_type", { ascending: true })
    .order("employee_code", { ascending: true });

  if (error) {
    profileSettingsTable.innerHTML = `<tr><td colspan="8" class="empty-row">${error.message}</td></tr>`;
    return;
  }

  if (!data?.length) {
    profileSettingsTable.innerHTML = `<tr><td colspan="8" class="empty-row">Chưa có tài khoản để cấu hình.</td></tr>`;
    return;
  }

  profileSettingsTable.innerHTML = data.map(profile => `
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

function clearAccountForm() {
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
  showMessage(createAccountMessage, "");
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

  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/admin-create-user`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message = json.message || json.error || `${res.status} ${res.statusText}`;
      showMessage(createAccountMessage, `Không tạo được tài khoản: ${message}`, "err");
      return;
    }

    showMessage(createAccountMessage, "Đã tạo tài khoản và hồ sơ nhân sự.", "ok");
    clearAccountForm();
    await refreshAll();
  } catch (err) {
    showMessage(createAccountMessage, `Không gọi được Edge Function. Hãy deploy admin-create-user trước. Chi tiết: ${err.message}`, "err");
  }
}

async function loadMonthSummary() {
  const startIso = toISODate(getAdminMonthStart());
  const endIso = toISODate(getAdminMonthEnd());

  const { data, error } = await supabase
    .from("schedule_requests")
    .select("id, work_date, shift, status, note, profiles:employee_id(full_name, employee_code, team, email)")
    .gte("work_date", startIso)
    .lte("work_date", endIso)
    .in("status", ["pending", "approved"])
    .order("work_date", { ascending: true })
    .order("submitted_at", { ascending: true });

  if (error) {
    adminMonthSummary.innerHTML = `<div class="empty-row">${error.message}</div>`;
    return;
  }

  adminMonthTitle.textContent = `Tháng ${selectedAdminMonth.getMonth() + 1}/${selectedAdminMonth.getFullYear()}`;

  const byDate = {};
  (data || []).forEach(row => {
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
    const isOtherMonth = !sameAdminMonth(date) ? "is-other-month" : "";
    const isTodayClass = isToday(date) ? "is-today" : "";
    const eventClass = rows.length ? "has-events" : "";
    const pendingClass = pending ? "has-pending" : "";
    const approvedClass = approved ? "has-approved" : "";

    const eventsHtml = rows.length
      ? rows.map(row => `
          <div class="admin-event ${row.status}">
            <div class="admin-event-name">${displayProfileName(row.profiles)}</div>
            <div class="admin-event-meta">${requireShiftLabel(row)}</div>
          </div>
        `).join("")
      : `<div class="admin-empty-cell">Trống</div>`;

    return `
      <div class="calendar-cell admin-calendar-cell ${isOtherMonth} ${isTodayClass} ${eventClass} ${pendingClass} ${approvedClass}" data-date="${iso}">
        <div class="cell-top">
          <div>
            <div class="date-number">${date.getDate()}</div>
            <div class="date-small">${formatDate(iso)}</div>
          </div>
          <div class="admin-day-stats">
            <span class="admin-chip ok">Duyệt ${approved}</span>
            <span class="admin-chip pending">Chờ ${pending}</span>
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
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">${error.message}</td></tr>`;
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
        <td><b>${displayProfileName(row.profiles)}</b><br><span class="muted">${row.profiles?.employee_code || ""}</span></td>
        <td>${row.profiles?.role_type || ""}</td>
        <td>${row.profiles?.team || ""}</td>
        <td>${formatDate(row.work_date)}</td>
        <td>${SHIFT_LABELS[row.shift] || row.shift}${meta.timeText ? `<br><span class="muted">${meta.timeText}</span>` : ""}</td>
        <td>${meta.cleanNote || ""}</td>
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
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">${error.message}</td></tr>`;
    return;
  }

  if (!data?.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Không có yêu cầu xin nghỉ chờ duyệt.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(row => `
    <tr>
      <td><input type="checkbox" class="leave-check" value="${row.id}" /></td>
      <td><b>${displayProfileName(row.profiles)}</b><br><span class="muted">${row.profiles?.employee_code || ""}</span></td>
      <td>${formatDate(row.leave_date)}</td>
      <td>${SHIFT_LABELS[row.shift] || row.shift}</td>
      <td>${REASON_LABELS[row.leave_type] || row.leave_type}</td>
      <td>${row.is_late_notice ? '<span class="badge rejected">Sát giờ</span>' : '<span class="badge approved">Bình thường</span>'}</td>
      <td>${row.reason_note || ""}</td>
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
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">${error.message}</td></tr>`;
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
        <td><b>${displayProfileName(row.profiles)}</b><br><span class="muted">${row.profiles?.employee_code || ""}</span></td>
        <td>${row.profiles?.role_type || ""}</td>
        <td>${row.profiles?.team || ""}</td>
        <td>${formatDate(row.work_date)}</td>
        <td>${SHIFT_LABELS[row.shift] || row.shift}${meta.timeText ? `<br><span class="muted">${meta.timeText}</span>` : ""}</td>
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
    message: "Admin đã xóa toàn bộ lịch làm trên hệ thống. Vui lòng đăng ký lại lịch làm mới nếu cần.",
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

  showMessage(deleteScheduleMessage, `Đã xóa toàn bộ lịch làm và gửi thông báo cho ${notifications.length} tài khoản.`, "ok");

  setTimeout(async () => {
    closeDeleteScheduleModal();
    await refreshAll();
  }, 900);
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

  modal.querySelector("#adminDayDetailTitle").textContent = formatDate(dateIso);
  modal.querySelector("#adminDayDetailSub").textContent = rows.length
    ? `${rows.length} lịch đăng ký trong ngày này.`
    : "Ngày này chưa có lịch đăng ký.";

  const eventsHtml = rows.length
    ? rows.map(row => {
        const profile = row.profiles || {};
        const meta = parseScheduleNote(row.note);
        return `
          <div class="liquid-event ${row.status}">
            <strong>${displayProfileName(profile)}</strong>
            <small>${profile.role_type || ""}${profile.team ? ` • ${profile.team}` : ""}</small><br>
            <small><span class="detail-label">Ca làm</span>${SHIFT_LABELS[row.shift] || row.shift}${meta.timeText ? ` • ${meta.timeText}` : ""}</small><br>
            <small><span class="detail-label">Trạng thái</span>${STATUS_LABELS[row.status] || row.status}</small>
            ${meta.cleanNote ? `<p class="liquid-muted">${meta.cleanNote}</p>` : ""}
          </div>
        `;
      }).join("")
    : `<div class="liquid-event"><strong>Trống</strong><small>Chưa có nhân sự đăng ký.</small></div>`;

  modal.querySelector("#adminDayDetailBody").innerHTML = `
    <div class="liquid-stat-grid">
      <div class="liquid-stat"><span>Tổng lịch</span><b>${rows.length}</b></div>
      <div class="liquid-stat"><span>Đã duyệt</span><b>${approved}</b></div>
      <div class="liquid-stat"><span>Chờ duyệt</span><b>${pending}</b></div>
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
document.getElementById("createAccountBtn")?.addEventListener("click", createAccount);
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

  weekStartInput.value = toISODate(selectedWeekStart);
  await refreshAll();
})();
