const {
  supabase,
  SHIFT_LABELS,
  STATUS_LABELS,
  REASON_LABELS,
  formatDate,
  toISODate,
  addDays,
  getCurrentUserAndProfile,
  showMessage
} = window.UWS;

let currentUser = null;
let currentProfile = null;

let selectedMonth = new Date();
selectedMonth.setDate(1);
selectedMonth.setHours(0, 0, 0, 0);

let monthSchedules = [];
let monthLeaves = [];
let monthUnavailable = [];
let monthCounts = [];

let activeRegisterDate = null;
let remoteNotifications = [];

const DEFAULT_MAX_STAFF = 8;
const TIME_META_REGEX = /\[\[UWS_TIME:(\d{2}:\d{2})-(\d{2}:\d{2})\]\]\s*/;

const welcomeName = document.getElementById("welcomeName");
const profileLine = document.getElementById("profileLine");
const profileModal = document.getElementById("profileModal");
const profileFullNameInput = document.getElementById("profileFullNameInput");
const profilePhoneInput = document.getElementById("profilePhoneInput");
const profileMessage = document.getElementById("profileMessage");

const approvedDaysEl = document.getElementById("approvedDays");
const pendingDaysEl = document.getElementById("pendingDays");
const leaveDaysEl = document.getElementById("leaveDays");
const targetDaysEl = document.getElementById("targetDays");
const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");

const monthTitle = document.getElementById("monthTitle");
const monthCalendar = document.getElementById("monthCalendar");
const calendarMessage = document.getElementById("calendarMessage");

const registerModal = document.getElementById("registerModal");
const registerModalTitle = document.getElementById("registerModalTitle");
const registerModalMeta = document.getElementById("registerModalMeta");
const modalApprovedCount = document.getElementById("modalApprovedCount");
const modalPendingCount = document.getElementById("modalPendingCount");
const modalStaffStatus = document.getElementById("modalStaffStatus");
const registerNote = document.getElementById("registerNote");
const registerMessage = document.getElementById("registerMessage");
const registerStartTime = document.getElementById("registerStartTime");
const registerEndTime = document.getElementById("registerEndTime");
const registerStartPreview = document.getElementById("registerStartPreview");
const registerEndPreview = document.getElementById("registerEndPreview");

const leaveModal = document.getElementById("leaveModal");
const leaveModalTitle = document.getElementById("leaveModalTitle");
const leaveScheduleSelect = document.getElementById("leaveScheduleSelect");
const leaveType = document.getElementById("leaveType");
const leaveNote = document.getElementById("leaveNote");
const leaveMessage = document.getElementById("leaveMessage");

const notificationModal = document.getElementById("notificationModal");
const notificationList = document.getElementById("notificationList");
const notificationBadge = document.getElementById("notificationBadge");

const changePasswordModal = document.getElementById("changePasswordModal");
const currentPasswordInput = document.getElementById("currentPasswordInput");
const newPasswordInput = document.getElementById("newPasswordInput");
const confirmNewPasswordInput = document.getElementById("confirmNewPasswordInput");
const changePasswordMessage = document.getElementById("changePasswordMessage");

const myScheduleTable = document.getElementById("myScheduleTable");

function showToast(message, type = "ok", duration = 3000) {
  const host = document.getElementById("toastHost");
  if (!host) return;

  const item = document.createElement("div");
  item.className = `toast-item ${type}`;
  item.textContent = message;
  host.appendChild(item);

  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(-8px)";
    item.style.transition = "all .18s ease";
    setTimeout(() => item.remove(), 220);
  }, duration);
}

function notificationStorageKey() {
  return `uws_notifications_${currentUser?.id || "guest"}`;
}

function readNotifications() {
  try {
    return JSON.parse(localStorage.getItem(notificationStorageKey()) || "[]");
  } catch {
    return [];
  }
}

function writeNotifications(list) {
  localStorage.setItem(notificationStorageKey(), JSON.stringify(list));
}

function addNotification(payload) {
  const items = readNotifications();
  if (payload.refKey && items.some(item => item.refKey === payload.refKey)) return;

  items.unshift({
    id: payload.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    refKey: payload.refKey || null,
    title: payload.title || "Thông báo",
    message: payload.message || "",
    type: payload.type || "ok",
    createdAt: payload.createdAt || new Date().toISOString(),
    isRead: false
  });

  writeNotifications(items.slice(0, 80));
  renderNotifications();
  updateNotificationBadge();
}

async function markNotificationsAsRead() {
  const items = readNotifications().map(item => ({ ...item, isRead: true }));
  writeNotifications(items);

  const unreadRemoteIds = remoteNotifications
    .filter(item => !item.read_at)
    .map(item => item.id);

  if (unreadRemoteIds.length) {
    const readAt = new Date().toISOString();
    await supabase
      .from("notifications")
      .update({ read_at: readAt })
      .in("id", unreadRemoteIds);

    remoteNotifications = remoteNotifications.map(item => (
      unreadRemoteIds.includes(item.id) ? { ...item, read_at: readAt } : item
    ));
  }

  renderNotifications();
  updateNotificationBadge();
}

function clearNotifications() {
  writeNotifications([]);
  renderNotifications();
  updateNotificationBadge();
}

function getCombinedNotifications() {
  const localItems = readNotifications().map(item => ({
    id: `local:${item.id}`,
    title: item.title,
    message: item.message,
    type: item.type || "ok",
    createdAt: item.createdAt,
    isRead: !!item.isRead
  }));

  const remoteItems = remoteNotifications.map(item => ({
    id: `remote:${item.id}`,
    title: item.title,
    message: item.message,
    type: item.type || "info",
    createdAt: item.created_at,
    isRead: !!item.read_at
  }));

  return [...remoteItems, ...localItems]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 100);
}

function updateNotificationBadge() {
  const localUnread = readNotifications().filter(item => !item.isRead).length;
  const remoteUnread = remoteNotifications.filter(item => !item.read_at).length;
  const unread = localUnread + remoteUnread;
  if (!notificationBadge) return;
  notificationBadge.textContent = unread;
  notificationBadge.classList.toggle("hidden", unread === 0);
}

async function loadRemoteNotifications() {
  if (!currentUser?.id) return;

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    remoteNotifications = [];
    return;
  }

  remoteNotifications = data || [];
}

function formatDateTime(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleString("vi-VN");
}

function renderNotifications() {
  if (!notificationList) return;
  const items = getCombinedNotifications();

  if (!items.length) {
    notificationList.innerHTML = `<div class="empty-row">Chưa có thông báo nào.</div>`;
    return;
  }

  notificationList.innerHTML = items.map(item => `
    <article class="notification-item ${item.isRead ? "" : "unread"}">
      <div class="notification-dot ${item.type}"></div>
      <div class="notification-content">
        <div class="notification-topline">
          <h3>${item.title}</h3>
          <time>${formatDateTime(item.createdAt)}</time>
        </div>
        <p>${item.message || ""}</p>
      </div>
    </article>
  `).join("");
}

async function openNotificationModal() {
  await loadRemoteNotifications();
  renderNotifications();
  notificationModal?.classList.remove("hidden");
  await markNotificationsAsRead();
}

function getMonthStart() {
  return new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
}

function getMonthEnd() {
  return new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
}

function getGridDates() {
  const start = getMonthStart();
  const end = getMonthEnd();

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

function getMonthLabel() {
  return `Tháng ${selectedMonth.getMonth() + 1}/${selectedMonth.getFullYear()}`;
}

function normalizeDate(dateString) {
  return dateString ? String(dateString).slice(0, 10) : "";
}

function sameMonth(date) {
  return date.getMonth() === selectedMonth.getMonth() &&
         date.getFullYear() === selectedMonth.getFullYear();
}

function isToday(date) {
  const now = new Date();
  return date.getDate() === now.getDate() &&
         date.getMonth() === now.getMonth() &&
         date.getFullYear() === now.getFullYear();
}

function formatHour(value) {
  const n = Number(value);
  return `${String(n).padStart(2, "0")}:00`;
}

function parseScheduleNote(note) {
  const raw = String(note || "");
  const match = raw.match(TIME_META_REGEX);
  if (!match) {
    return { start: "", end: "", cleanNote: raw.trim(), timeText: "" };
  }
  const cleanNote = raw.replace(TIME_META_REGEX, "").trim();
  return {
    start: match[1],
    end: match[2],
    cleanNote,
    timeText: `${match[1]} - ${match[2]}`
  };
}

function buildScheduleNote(userNote, start, end) {
  const meta = `[[UWS_TIME:${start}-${end}]]`;
  return userNote ? `${meta} ${userNote}` : meta;
}

function getSelectedRegisterShift() {
  const selected = document.querySelector('input[name="registerShift"]:checked');
  return selected?.value || "morning";
}

function applyShiftPreset(shift) {
  const presets = {
    morning: [8, 12],
    afternoon: [13, 18],
    full_day: [9, 18]
  };
  const [start, end] = presets[shift] || presets.morning;
  registerStartTime.value = String(start);
  registerEndTime.value = String(end);
  syncRegisterTimePreview();
}

function syncRegisterTimePreview() {
  let start = Number(registerStartTime.value || 0);
  let end = Number(registerEndTime.value || 0);

  if (end <= start) {
    end = Math.min(24, start + 1);
    registerEndTime.value = String(end);
  }

  if (start >= end) {
    start = Math.max(0, end - 1);
    registerStartTime.value = String(start);
  }

  registerStartPreview.textContent = formatHour(start);
  registerEndPreview.textContent = formatHour(end);
}

function getSelectedTimeRange() {
  syncRegisterTimePreview();
  return {
    start: formatHour(registerStartTime.value),
    end: formatHour(registerEndTime.value)
  };
}

function getCountForDate(dateIso) {
  const rows = monthCounts.filter(row => normalizeDate(row.work_date) === dateIso);
  const approved = rows.reduce((sum, row) => sum + Number(row.approved_count || 0), 0);
  const pending = rows.reduce((sum, row) => sum + Number(row.pending_count || 0), 0);
  const total = rows.reduce((sum, row) => sum + Number(row.total_count || 0), 0);
  return { approved, pending, total };
}

function getStaffStatus(approvedCount) {
  if (approvedCount <= 2) return { label: "Đang mở", className: "staff-missing" };
  if (approvedCount >= DEFAULT_MAX_STAFF) return { label: "Đông", className: "staff-crowded" };
  return { label: "Ổn", className: "staff-ok" };
}

function getSchedulesForDate(dateIso) {
  return monthSchedules.filter(row => normalizeDate(row.work_date) === dateIso);
}

function getLeavesForDate(dateIso) {
  return monthLeaves.filter(row => normalizeDate(row.leave_date) === dateIso);
}

function getUnavailableForDate(dateIso) {
  return monthUnavailable.filter(row => normalizeDate(row.unavailable_date) === dateIso && row.status === "active");
}

function shiftText(rows) {
  if (!rows.length) return "";
  const shifts = [...new Set(rows.map(row => row.shift))];
  if (shifts.includes("full_day")) return "Cả ngày";
  return shifts.map(shift => SHIFT_LABELS[shift] || shift).join(", ");
}

function getPersonalStatus(dateIso) {
  const schedules = getSchedulesForDate(dateIso);
  const leaves = getLeavesForDate(dateIso);

  const leaveApproved = leaves.filter(row => row.status === "approved");
  const leavePending = leaves.filter(row => row.status === "pending");

  if (leaveApproved.length) {
    return { code: "leave", label: "Nghỉ đã duyệt", className: "personal-leave", detail: shiftText(leaveApproved) };
  }

  if (leavePending.length) {
    return { code: "leave-pending", label: "Chờ duyệt nghỉ", className: "personal-leave", detail: shiftText(leavePending) };
  }

  const approved = schedules.filter(row => row.status === "approved");
  const pending = schedules.filter(row => row.status === "pending");
  const rejected = schedules.filter(row => row.status === "rejected");
  const cancelled = schedules.filter(row => row.status === "cancelled");

  if (approved.length) {
    return { code: "approved", label: "Đã duyệt", className: "personal-approved", detail: shiftText(approved) };
  }

  if (pending.length) {
    return { code: "pending", label: "Chờ duyệt", className: "personal-pending", detail: shiftText(pending) };
  }

  if (rejected.length) {
    return { code: "rejected", label: "Từ chối", className: "personal-rejected", detail: "Có thể đăng ký lại" };
  }

  if (cancelled.length) {
    return { code: "cancelled", label: "Đã hủy", className: "personal-none", detail: "Có thể đăng ký lại" };
  }

  return { code: "none", label: "", className: "personal-empty", detail: "" };
}

function getCellStatusClass(dateIso) {
  const personalStatus = getPersonalStatus(dateIso);
  const unavailableRows = getUnavailableForDate(dateIso);

  if (personalStatus.code === "approved") return "status-approved";
  if (personalStatus.code === "pending") return "status-pending";
  if (personalStatus.code === "leave") return "status-leave";
  if (personalStatus.code === "leave-pending") return "status-leave-pending";
  if (unavailableRows.length) return "status-busy";
  return "status-none";
}

function renderMonthStats() {
  const approvedDates = new Set(monthSchedules.filter(row => row.status === "approved").map(row => normalizeDate(row.work_date)));
  const pendingDates = new Set(monthSchedules.filter(row => row.status === "pending").map(row => normalizeDate(row.work_date)));
  const leaveDates = new Set(monthLeaves.filter(row => row.status !== "rejected").map(row => normalizeDate(row.leave_date)));

  const target = Number(currentProfile?.min_days_per_month || 0);
  const approvedCount = approvedDates.size;
  const percent = target > 0 ? Math.min(100, Math.round((approvedCount / target) * 100)) : 0;

  approvedDaysEl.textContent = approvedCount;
  pendingDaysEl.textContent = pendingDates.size;
  leaveDaysEl.textContent = leaveDates.size;
  targetDaysEl.textContent = target;

  progressText.textContent = `${approvedCount} / ${target} ngày`;
  progressFill.style.width = `${percent}%`;
}

function renderCalendar() {
  monthTitle.textContent = getMonthLabel();
  const dates = getGridDates();
  monthCalendar.innerHTML = "";

  dates.forEach(date => {
    const iso = toISODate(date);
    const counts = getCountForDate(iso);
    const staffStatus = getStaffStatus(counts.approved);
    const personalStatus = getPersonalStatus(iso);
    const unavailableRows = getUnavailableForDate(iso);

    const isOtherMonth = !sameMonth(date);
    const todayClass = isToday(date) ? "is-today" : "";
    const otherMonthClass = isOtherMonth ? "is-other-month" : "";
    const statusClass = getCellStatusClass(iso);

    const unavailableHtml = unavailableRows.length
      ? `<div class="mini-chip busy-chip">Bạn bận: ${shiftText(unavailableRows)}</div>`
      : "";

    let actionHtml = "";

    if (!isOtherMonth) {
      if (personalStatus.code === "approved") {
        actionHtml = `<button class="day-action leave" data-action="leave" data-date="${iso}" type="button">Xin nghỉ</button>`;
      } else if (personalStatus.code === "pending") {
        actionHtml = `<button class="day-action disabled" type="button" disabled>Đang chờ duyệt</button>`;
      } else if (personalStatus.code === "leave" || personalStatus.code === "leave-pending") {
        actionHtml = `<button class="day-action disabled" type="button" disabled>Đã gửi nghỉ</button>`;
      } else {
        actionHtml = `<button class="day-action register" data-action="register" data-date="${iso}" type="button">Đăng ký</button>`;
      }
    }

    const personalStatusHtml = personalStatus.code === "none"
      ? `<div class="personal-status empty"></div>`
      : `<div class="personal-status ${personalStatus.className}">
          <span>${personalStatus.label}</span>
          ${personalStatus.detail ? `<small>${personalStatus.detail}</small>` : ""}
        </div>`;

    const card = document.createElement("div");
    card.className = `calendar-cell ${statusClass} ${todayClass} ${otherMonthClass}`;
    card.dataset.date = iso;
    card.innerHTML = `
      <div class="cell-top">
        <div>
          <div class="date-number">${date.getDate()}</div>
          <div class="date-small">${formatDate(iso)}</div>
        </div>
        <div class="people-count" title="Số người đã duyệt">${counts.approved}/${DEFAULT_MAX_STAFF}</div>
      </div>

      <div class="staff-status ${staffStatus.className}">${staffStatus.label}</div>
      ${personalStatusHtml}
      ${unavailableHtml}
      <div class="cell-actions">${actionHtml}</div>
    `;

    monthCalendar.appendChild(card);
  });
}


function isCompactCalendar() {
  return window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
}

function ensureEmployeeDayDetailModal() {
  let modal = document.getElementById("employeeDayDetailModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "employeeDayDetailModal";
  modal.className = "liquid-day-modal hidden";
  modal.innerHTML = `
    <div class="liquid-day-backdrop" data-close-day-detail></div>
    <div class="liquid-day-card">
      <div class="liquid-day-head">
        <div>
          <p class="eyebrow">Chi tiết ngày</p>
          <h2 id="employeeDayDetailTitle">Ngày</h2>
          <p id="employeeDayDetailSub" class="muted"></p>
        </div>
        <button class="liquid-close" type="button" data-close-day-detail>×</button>
      </div>
      <div id="employeeDayDetailBody"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-close-day-detail]").forEach(el => {
    el.addEventListener("click", closeEmployeeDayDetailModal);
  });
  modal.addEventListener("click", event => {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    const date = actionButton.dataset.date;
    closeEmployeeDayDetailModal();
    if (action === "register") openRegisterModal(date);
    if (action === "leave") openLeaveModal(date);
  });
  return modal;
}

function closeEmployeeDayDetailModal() {
  document.getElementById("employeeDayDetailModal")?.classList.add("hidden");
}

function openEmployeeDayDetailModal(dateIso) {
  const modal = ensureEmployeeDayDetailModal();
  const counts = getCountForDate(dateIso);
  const personalStatus = getPersonalStatus(dateIso);
  const schedules = getSchedulesForDate(dateIso);
  const leaves = getLeavesForDate(dateIso);
  const unavailableRows = getUnavailableForDate(dateIso);

  const title = modal.querySelector("#employeeDayDetailTitle");
  const sub = modal.querySelector("#employeeDayDetailSub");
  const body = modal.querySelector("#employeeDayDetailBody");

  title.textContent = formatDate(dateIso);
  sub.textContent = "Chạm vào thao tác bên dưới để đăng ký hoặc xin nghỉ.";

  const scheduleHtml = schedules.length
    ? schedules.map(row => {
        const meta = parseScheduleNote(row.note);
        return `
          <div class="liquid-event">
            <strong>${STATUS_LABELS[row.status] || row.status}</strong>
            <small>${SHIFT_LABELS[row.shift] || row.shift}${meta.timeText ? ` • ${meta.timeText}` : ""}</small>
            ${meta.cleanNote ? `<p class="liquid-muted">${meta.cleanNote}</p>` : ""}
          </div>
        `;
      }).join("")
    : `<div class="liquid-event"><strong>Ngày trống</strong><small>Chưa có lịch đăng ký.</small></div>`;

  const leaveHtml = leaves.length
    ? leaves.map(row => `
        <div class="liquid-event">
          <strong>Xin nghỉ: ${STATUS_LABELS[row.status] || row.status}</strong>
          <small>${SHIFT_LABELS[row.shift] || row.shift}</small>
          ${row.reason_note ? `<p class="liquid-muted">${row.reason_note}</p>` : ""}
        </div>
      `).join("")
    : "";

  const busyHtml = unavailableRows.length
    ? unavailableRows.map(row => `
        <div class="liquid-event">
          <strong>Lịch bận</strong>
          <small>${SHIFT_LABELS[row.shift] || row.shift}</small>
          ${row.note ? `<p class="liquid-muted">${row.note}</p>` : ""}
        </div>
      `).join("")
    : "";

  let actionHtml = "";
  if (personalStatus.code === "approved") {
    actionHtml = `<button class="btn danger" data-action="leave" data-date="${dateIso}" type="button">Xin nghỉ ngày này</button>`;
  } else if (personalStatus.code === "pending") {
    actionHtml = `<button class="btn ghost" type="button" disabled>Đang chờ duyệt</button>`;
  } else if (personalStatus.code === "leave" || personalStatus.code === "leave-pending") {
    actionHtml = `<button class="btn ghost" type="button" disabled>Đã gửi yêu cầu nghỉ</button>`;
  } else {
    actionHtml = `<button class="btn primary" data-action="register" data-date="${dateIso}" type="button">Đăng ký ngày này</button>`;
  }

  body.innerHTML = `
    <div class="liquid-stat-grid">
      <div class="liquid-stat"><span>Đã duyệt</span><b>${counts.approved}</b></div>
      <div class="liquid-stat"><span>Chờ duyệt</span><b>${counts.pending}</b></div>
      <div class="liquid-stat"><span>Trạng thái</span><b>${personalStatus.label || "Trống"}</b></div>
    </div>
    <div class="liquid-event-list">
      ${scheduleHtml}
      ${leaveHtml}
      ${busyHtml}
    </div>
    <div class="liquid-day-actions">${actionHtml}</div>
  `;

  modal.classList.remove("hidden");
}

function renderMyScheduleTable() {
  const rows = [...monthSchedules].sort((a, b) => {
    const dateCompare = String(a.work_date).localeCompare(String(b.work_date));
    if (dateCompare !== 0) return dateCompare;
    return String(a.shift).localeCompare(String(b.shift));
  });

  if (!rows.length) {
    myScheduleTable.innerHTML = `<tr><td colspan="4" class="empty-row">Chưa có lịch đăng ký trong tháng này.</td></tr>`;
    return;
  }

  myScheduleTable.innerHTML = rows.map(row => {
    const noteMeta = parseScheduleNote(row.note);
    const shiftLabel = `${SHIFT_LABELS[row.shift] || row.shift}${noteMeta.timeText ? ` • ${noteMeta.timeText}` : ""}`;
    return `
      <tr>
        <td>${formatDate(row.work_date)}</td>
        <td>${shiftLabel}</td>
        <td><span class="badge ${row.status}">${STATUS_LABELS[row.status] || row.status}</span></td>
        <td>${noteMeta.cleanNote || ""}</td>
      </tr>
    `;
  }).join("");
}

function clearRegisterModal() {
  registerNote.value = "";
  showMessage(registerMessage, "");
  document.getElementById("regMorning").checked = true;
  applyShiftPreset("morning");
}

function openRegisterModal(dateIso) {
  activeRegisterDate = dateIso;
  clearRegisterModal();

  const counts = getCountForDate(dateIso);
  const staffStatus = getStaffStatus(counts.approved);

  registerModalTitle.textContent = `Đăng ký ngày ${formatDate(dateIso)}`;
  registerModalMeta.textContent = `Số người đã duyệt hiện tại: ${counts.approved}/${DEFAULT_MAX_STAFF}`;
  modalApprovedCount.textContent = counts.approved;
  modalPendingCount.textContent = counts.pending;
  modalStaffStatus.textContent = staffStatus.label;

  registerModal.classList.remove("hidden");
}

function openLeaveModal(dateIso) {
  showMessage(leaveMessage, "");
  leaveNote.value = "";

  const approvedRows = getSchedulesForDate(dateIso).filter(row => row.status === "approved");

  if (!approvedRows.length) {
    showToast("Ngày này chưa có lịch được duyệt nên chưa thể xin nghỉ.", "warn");
    return;
  }

  leaveModalTitle.textContent = `Xin nghỉ ngày ${formatDate(dateIso)}`;
  leaveScheduleSelect.innerHTML = approvedRows.map(row => {
    const meta = parseScheduleNote(row.note);
    return `
      <option value="${row.id}" data-date="${row.work_date}" data-shift="${row.shift}">
        ${formatDate(row.work_date)} - ${SHIFT_LABELS[row.shift] || row.shift}${meta.timeText ? ` • ${meta.timeText}` : ""}
      </option>
    `;
  }).join("");

  leaveModal.classList.remove("hidden");
}

function renderProfileHeader() {
  const displayName = String(currentProfile?.full_name || "").trim()
    || currentProfile?.employee_code
    || currentProfile?.email
    || "bạn";

  if (welcomeName) welcomeName.textContent = `Xin chào, ${displayName}`;
  if (profileLine) {
    profileLine.textContent = `${currentProfile?.employee_code || "Chưa có mã"} • ${currentProfile?.role_type || ""} • ${currentProfile?.team || "Chưa có team"}`;
  }
  if (targetDaysEl) targetDaysEl.textContent = currentProfile?.min_days_per_month || 0;
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

function openProfileModal() {
  if (profileFullNameInput) profileFullNameInput.value = currentProfile?.full_name || "";
  if (profilePhoneInput) profilePhoneInput.value = currentProfile?.phone || "";
  showMessage(profileMessage, "");
  profileModal?.classList.remove("hidden");
  setTimeout(() => profileFullNameInput?.focus(), 50);
}

async function submitProfileUpdate() {
  const fullName = profileFullNameInput?.value.trim() || "";
  const phone = profilePhoneInput?.value.trim() || "";

  if (!fullName || fullName.length < 2) {
    showMessage(profileMessage, "Vui lòng nhập họ tên hợp lệ.", "err");
    return;
  }

  showMessage(profileMessage, "Đang lưu hồ sơ...");

  const { data, error } = await supabase.rpc("update_my_profile", {
    p_full_name: fullName,
    p_phone: phone || null
  });

  if (error) {
    showMessage(profileMessage, `Không lưu được hồ sơ. Hãy chạy database/upgrade-v6.sql trước. Chi tiết: ${error.message}`, "err");
    return;
  }

  currentProfile = {
    ...currentProfile,
    full_name: data?.full_name || fullName,
    phone: data?.phone || phone
  };

  renderProfileHeader();
  addNotification({
    title: "Đã cập nhật hồ sơ",
    message: "Tên hiển thị của bạn đã được cập nhật.",
    type: "ok"
  });
  showMessage(profileMessage, "Đã lưu hồ sơ.", "ok");
  showToast("Đã cập nhật tên hiển thị.", "ok");

  setTimeout(() => {
    closeModals();
  }, 700);
}

function closeModals() {
  registerModal.classList.add("hidden");
  leaveModal.classList.add("hidden");
  notificationModal?.classList.add("hidden");
  profileModal?.classList.add("hidden");
  changePasswordModal?.classList.add("hidden");
  closeEmployeeDayDetailModal();
  activeRegisterDate = null;
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

  addNotification({
    title: "Đã đổi mật khẩu",
    message: "Mật khẩu tài khoản của bạn vừa được cập nhật thành công.",
    type: "ok"
  });

  showMessage(changePasswordMessage, "Đổi mật khẩu thành công.", "ok");
  showToast("Đổi mật khẩu thành công.", "ok");

  setTimeout(() => {
    closeModals();
    clearPasswordForm();
  }, 700);
}


async function submitRegister() {
  if (!activeRegisterDate) return;

  const shift = getSelectedRegisterShift();
  const { start, end } = getSelectedTimeRange();

  const existing = getSchedulesForDate(activeRegisterDate)
    .filter(row => ["pending", "approved"].includes(row.status));

  if (existing.length) {
    showMessage(registerMessage, "Ngày này bạn đã có lịch đăng ký hoặc đã được duyệt.", "err");
    showToast("Ngày này đã có lịch đăng ký hoặc đã được duyệt.", "warn");
    return;
  }

  const payload = {
    employee_id: currentUser.id,
    work_date: activeRegisterDate,
    shift,
    status: "pending",
    note: buildScheduleNote(registerNote.value.trim(), start, end)
  };

  showMessage(registerMessage, "Đang gửi đăng ký...");

  const { error } = await supabase.from("schedule_requests").insert(payload);

  if (error) {
    showMessage(registerMessage, `Lỗi gửi lịch: ${error.message}`, "err");
    showToast(`Lỗi gửi lịch: ${error.message}`, "err");
    return;
  }

  addNotification({
    title: "Đã gửi đăng ký lịch",
    message: `${formatDate(activeRegisterDate)} • ${SHIFT_LABELS[shift]} • ${start} - ${end}. Yêu cầu đang chờ duyệt.`,
    type: "ok"
  });

  showMessage(registerMessage, "Đã gửi đăng ký lịch. Vui lòng chờ admin duyệt.", "ok");
  showToast("Đã gửi đăng ký lịch. Vui lòng chờ admin duyệt.", "ok");

  setTimeout(async () => {
    closeModals();
    await loadMonthData();
  }, 500);
}

async function submitLeave() {
  const selectedOption = leaveScheduleSelect.options[leaveScheduleSelect.selectedIndex];

  if (!selectedOption) {
    showMessage(leaveMessage, "Vui lòng chọn lịch đã duyệt.", "err");
    showToast("Vui lòng chọn lịch đã duyệt.", "warn");
    return;
  }

  const scheduleId = selectedOption.value;
  const leaveDate = selectedOption.dataset.date;
  const shift = selectedOption.dataset.shift;

  const now = new Date();
  const leaveDateTime = new Date(`${leaveDate}T09:00:00`);
  const hoursDiff = (leaveDateTime - now) / 36e5;
  const isLate = hoursDiff < 24;

  showMessage(leaveMessage, "Đang gửi yêu cầu xin nghỉ...");

  const { error } = await supabase.from("leave_requests").insert({
    employee_id: currentUser.id,
    schedule_request_id: scheduleId,
    leave_date: leaveDate,
    shift,
    leave_type: leaveType.value,
    reason_note: leaveNote.value.trim() || null,
    status: "pending",
    is_late_notice: isLate
  });

  if (error) {
    showMessage(leaveMessage, `Lỗi xin nghỉ: ${error.message}`, "err");
    showToast(`Lỗi xin nghỉ: ${error.message}`, "err");
    return;
  }

  addNotification({
    title: "Đã gửi yêu cầu xin nghỉ",
    message: `${formatDate(leaveDate)} • ${SHIFT_LABELS[shift] || shift}. Yêu cầu xin nghỉ đang chờ duyệt.`,
    type: "warn"
  });

  showMessage(leaveMessage, "Đã gửi yêu cầu xin nghỉ. Vui lòng chờ admin duyệt.", "ok");
  showToast("Đã gửi yêu cầu xin nghỉ. Vui lòng chờ admin duyệt.", "ok");

  setTimeout(async () => {
    closeModals();
    await loadMonthData();
  }, 500);
}

async function saveUnavailable() {
  const date = document.getElementById("unavailableDate").value;
  const shift = document.getElementById("unavailableShift").value;
  const reason = document.getElementById("unavailableReason").value;
  const note = document.getElementById("unavailableNote").value.trim();
  const msg = document.getElementById("unavailableMessage");

  if (!date) {
    showMessage(msg, "Vui lòng chọn ngày bận.", "err");
    showToast("Vui lòng chọn ngày bận.", "warn");
    return;
  }

  const { error } = await supabase.from("unavailability").insert({
    employee_id: currentUser.id,
    unavailable_date: date,
    shift,
    reason_type: reason,
    note: note || null,
    status: "active"
  });

  if (error) {
    showMessage(msg, `Lỗi lưu lịch bận: ${error.message}`, "err");
    showToast(`Lỗi lưu lịch bận: ${error.message}`, "err");
    return;
  }

  addNotification({
    title: "Đã lưu lịch học / lịch bận",
    message: `${formatDate(date)} • ${SHIFT_LABELS[shift] || shift} • ${REASON_LABELS[reason] || reason}`,
    type: "ok"
  });

  showMessage(msg, "Đã lưu lịch học/lịch bận.", "ok");
  showToast("Đã lưu lịch học/lịch bận.", "ok");

  document.getElementById("unavailableNote").value = "";
  await loadMonthData();
}

function syncStatusNotifications() {
  monthSchedules.forEach(row => {
    if (!row.reviewed_at || !["approved", "rejected", "cancelled"].includes(row.status)) return;
    const meta = parseScheduleNote(row.note);
    const titleMap = {
      approved: "Lịch làm đã được duyệt",
      rejected: "Lịch làm bị từ chối",
      cancelled: "Lịch làm đã hủy"
    };
    addNotification({
      refKey: `schedule:${row.id}:${row.status}`,
      title: titleMap[row.status] || "Cập nhật lịch làm",
      message: `${formatDate(row.work_date)} • ${SHIFT_LABELS[row.shift] || row.shift}${meta.timeText ? ` • ${meta.timeText}` : ""}`,
      type: row.status === "approved" ? "ok" : "warn",
      createdAt: row.reviewed_at
    });
  });

  monthLeaves.forEach(row => {
    if (!row.reviewed_at || !["approved", "rejected"].includes(row.status)) return;
    const titleMap = {
      approved: "Yêu cầu nghỉ đã được duyệt",
      rejected: "Yêu cầu nghỉ bị từ chối"
    };
    addNotification({
      refKey: `leave:${row.id}:${row.status}`,
      title: titleMap[row.status] || "Cập nhật xin nghỉ",
      message: `${formatDate(row.leave_date)} • ${SHIFT_LABELS[row.shift] || row.shift}`,
      type: row.status === "approved" ? "ok" : "warn",
      createdAt: row.reviewed_at
    });
  });
}

async function loadMonthData() {
  showMessage(calendarMessage, "Đang tải lịch tháng...");

  const monthStart = getMonthStart();
  const monthEnd = getMonthEnd();
  const startIso = toISODate(monthStart);
  const endIso = toISODate(monthEnd);

  const [countsRes, schedulesRes, leavesRes, unavailableRes] = await Promise.all([
    supabase.rpc("get_schedule_counts", { p_start: startIso, p_end: endIso }),
    supabase.from("schedule_requests").select("*").eq("employee_id", currentUser.id).gte("work_date", startIso).lte("work_date", endIso),
    supabase.from("leave_requests").select("*").eq("employee_id", currentUser.id).gte("leave_date", startIso).lte("leave_date", endIso),
    supabase.from("unavailability").select("*").eq("employee_id", currentUser.id).gte("unavailable_date", startIso).lte("unavailable_date", endIso)
  ]);

  if (countsRes.error) {
    showMessage(calendarMessage, `Lỗi tải tổng quan lịch: ${countsRes.error.message}`, "err");
    showToast(`Lỗi tải tổng quan lịch: ${countsRes.error.message}`, "err");
    return;
  }

  if (schedulesRes.error) {
    showMessage(calendarMessage, `Lỗi tải lịch cá nhân: ${schedulesRes.error.message}`, "err");
    showToast(`Lỗi tải lịch cá nhân: ${schedulesRes.error.message}`, "err");
    return;
  }

  if (leavesRes.error) {
    showMessage(calendarMessage, `Lỗi tải xin nghỉ: ${leavesRes.error.message}`, "err");
    showToast(`Lỗi tải xin nghỉ: ${leavesRes.error.message}`, "err");
    return;
  }

  if (unavailableRes.error) {
    showMessage(calendarMessage, `Lỗi tải lịch bận: ${unavailableRes.error.message}`, "err");
    showToast(`Lỗi tải lịch bận: ${unavailableRes.error.message}`, "err");
    return;
  }

  monthCounts = countsRes.data || [];
  monthSchedules = schedulesRes.data || [];
  monthLeaves = leavesRes.data || [];
  monthUnavailable = unavailableRes.data || [];

  await loadRemoteNotifications();
  syncStatusNotifications();
  renderMonthStats();
  renderCalendar();
  renderMyScheduleTable();
  renderNotifications();
  updateNotificationBadge();

  showMessage(calendarMessage, "");
}

async function requireLogin() {
  const result = await getCurrentUserAndProfile();
  currentUser = result.user;
  currentProfile = result.profile;

  if (!currentUser || !currentProfile) {
    window.location.href = "./index.html";
    return false;
  }

  renderProfileHeader();
  targetDaysEl.textContent = currentProfile.min_days_per_month || 0;

  return true;
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "./index.html";
}

function bindEvents() {
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("accountMenuBtn")?.addEventListener("click", toggleAccountMenu);
  document.getElementById("accountMenu")?.addEventListener("click", event => event.stopPropagation());
  document.getElementById("editProfileBtn")?.addEventListener("click", () => { closeAccountMenu(); openProfileModal(); });
  document.getElementById("submitProfileBtn")?.addEventListener("click", submitProfileUpdate);
  document.getElementById("changePasswordBtn")?.addEventListener("click", () => { closeAccountMenu(); openChangePasswordModal(); });
  document.getElementById("submitChangePasswordBtn")?.addEventListener("click", submitChangePassword);
  document.getElementById("notificationBtn")?.addEventListener("click", () => openNotificationModal());
  document.getElementById("clearNotificationsBtn")?.addEventListener("click", clearNotifications);

  document.getElementById("prevMonthBtn")?.addEventListener("click", async () => {
    selectedMonth.setMonth(selectedMonth.getMonth() - 1);
    showToast("Đã chuyển sang tháng trước.", "ok", 1600);
    await loadMonthData();
  });

  document.getElementById("nextMonthBtn")?.addEventListener("click", async () => {
    selectedMonth.setMonth(selectedMonth.getMonth() + 1);
    showToast("Đã chuyển sang tháng sau.", "ok", 1600);
    await loadMonthData();
  });

  document.getElementById("todayBtn")?.addEventListener("click", async () => {
    selectedMonth = new Date();
    selectedMonth.setDate(1);
    selectedMonth.setHours(0, 0, 0, 0);
    showToast("Đã quay về tháng hiện tại.", "ok", 1600);
    await loadMonthData();
  });

  document.getElementById("monthCalendar")?.addEventListener("click", event => {
    const actionButton = event.target.closest("button[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      const date = actionButton.dataset.date;

      if (action === "register") openRegisterModal(date);
      if (action === "leave") openLeaveModal(date);
      return;
    }

    const cell = event.target.closest(".calendar-cell");
    if (!cell || cell.classList.contains("is-other-month")) return;

    if (isCompactCalendar()) {
      openEmployeeDayDetailModal(cell.dataset.date);
      return;
    }

    document.querySelectorAll(".calendar-cell.is-open").forEach(item => {
      if (item !== cell) item.classList.remove("is-open");
    });

    cell.classList.toggle("is-open");
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".calendar-cell") && !event.target.closest(".topbar-actions") && !event.target.closest(".uws-modal-card")) {
      document.querySelectorAll(".calendar-cell.is-open").forEach(item => item.classList.remove("is-open"));
    }

    if (!event.target.closest(".account-menu-wrap")) {
      closeAccountMenu();
    }
  });

  document.getElementById("submitRegisterBtn")?.addEventListener("click", submitRegister);
  document.getElementById("submitLeaveBtn")?.addEventListener("click", submitLeave);
  document.getElementById("saveUnavailableBtn")?.addEventListener("click", saveUnavailable);
  document.getElementById("refreshMineBtn")?.addEventListener("click", async () => {
    await loadMonthData();
    showToast("Đã làm mới lịch của tôi.", "ok", 1600);
  });

  document.querySelectorAll("[data-close-modal]").forEach(el => {
    el.addEventListener("click", closeModals);
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeModals();
      closeAccountMenu();
    }
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;

      document.querySelectorAll(".tab-btn").forEach(item => item.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(item => item.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById(tabId)?.classList.add("active");
    });
  });

  document.querySelectorAll('input[name="registerShift"]').forEach(input => {
    input.addEventListener("change", () => applyShiftPreset(input.value));
  });

  registerStartTime?.addEventListener("input", syncRegisterTimePreview);
  registerEndTime?.addEventListener("input", syncRegisterTimePreview);
}

(async function init() {
  const ok = await requireLogin();
  if (!ok) return;

  bindEvents();
  renderNotifications();
  updateNotificationBadge();
  document.getElementById("unavailableDate").value = toISODate(new Date());
  syncRegisterTimePreview();
  await loadMonthData();
  showToast("Đã tải lịch tháng.", "ok", 1600);
})();
