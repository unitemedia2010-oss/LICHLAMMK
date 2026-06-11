const {
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
const TIME_META_REGEX = /\[\[UWS_TIME:(\d{2}:\d{2})-(\d{2}:\d{2})\]\]\s*/;
const deleteScheduleModal = document.getElementById("deleteScheduleModal");
const deleteConfirmPassword = document.getElementById("deleteConfirmPassword");
const deleteScheduleMessage = document.getElementById("deleteScheduleMessage");

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

async function loadMonthSummary() {
  const startIso = toISODate(getAdminMonthStart());
  const endIso = toISODate(getAdminMonthEnd());

  const { data, error } = await supabase
    .from("schedule_requests")
    .select("id, work_date, shift, status, note, profiles:employee_id(full_name, employee_code, team)")
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

  const dates = getAdminGridDates();
  adminMonthSummary.innerHTML = dates.map(date => {
    const iso = toISODate(date);
    const rows = byDate[iso] || [];
    const approved = rows.filter(row => row.status === "approved").length;
    const pending = rows.filter(row => row.status === "pending").length;
    const isOtherMonth = !sameAdminMonth(date) ? "is-other-month" : "";
    const isTodayClass = isToday(date) ? "is-today" : "";

    const eventsHtml = rows.length
      ? rows.map(row => `
          <div class="admin-event ${row.status}">
            <div class="admin-event-name">${row.profiles?.full_name || row.profiles?.employee_code || "Nhân sự"}</div>
            <div class="admin-event-meta">${requireShiftLabel(row)}</div>
          </div>
        `).join("")
      : `<div class="admin-empty-cell">Trống</div>`;

    return `
      <div class="calendar-cell admin-calendar-cell ${isOtherMonth} ${isTodayClass}">
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
        <td><b>${row.profiles?.full_name || ""}</b><br><span class="muted">${row.profiles?.employee_code || ""}</span></td>
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
      <td><b>${row.profiles?.full_name || ""}</b><br><span class="muted">${row.profiles?.employee_code || ""}</span></td>
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
        <td><b>${row.profiles?.full_name || ""}</b><br><span class="muted">${row.profiles?.employee_code || ""}</span></td>
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


function openDeleteScheduleModal() {
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

async function refreshAll() {
  await loadMetrics();
  await loadMonthSummary();
  await loadPendingSchedules();
  await loadPendingLeaves();
  await loadAllSchedules();
}

document.getElementById("logoutBtn")?.addEventListener("click", logout);
document.getElementById("deleteAllScheduleBtn")?.addEventListener("click", openDeleteScheduleModal);
document.getElementById("confirmDeleteAllScheduleBtn")?.addEventListener("click", confirmDeleteAllSchedules);
document.querySelectorAll("[data-close-delete-modal]").forEach(el => {
  el.addEventListener("click", closeDeleteScheduleModal);
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
  if (event.key === "Escape") closeDeleteScheduleModal();
});

document.getElementById("checkAllLeave")?.addEventListener("change", e => {
  document.querySelectorAll(".leave-check").forEach(cb => cb.checked = e.target.checked);
});

(async function init() {
  const ok = await requireAdmin();
  if (!ok) return;

  weekStartInput.value = toISODate(selectedWeekStart);
  await refreshAll();
})();
