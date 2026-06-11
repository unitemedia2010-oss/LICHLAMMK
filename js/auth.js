if (!window.UWS) {
  const loginMessage = document.getElementById("loginMessage");
  if (loginMessage) {
    loginMessage.textContent = "config.js chưa chạy. Kiểm tra lại file index.html và CDN Supabase.";
    loginMessage.className = "message err";
  }
  throw new Error("window.UWS is not available");
}

const { supabase, ADMIN_ROLES, showMessage } = window.UWS;

const form = document.getElementById("loginForm");
const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const msg = document.getElementById("loginMessage");

console.log("auth.js loaded");

async function redirectIfLoggedIn() {
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_type")
    .eq("id", data.user.id)
    .single();

  if (profile && ADMIN_ROLES.includes(profile.role_type)) {
    window.location.href = "./admin.html";
  } else if (profile) {
    window.location.href = "./employee.html";
  }
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const email = emailEl.value.trim();
  const password = passwordEl.value;

  showMessage(msg, "Đang đăng nhập...");

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showMessage(msg, "Đăng nhập không thành công: " + error.message, "err");
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (profileError || !profile) {
      showMessage(msg, "Tài khoản đã có trong Auth nhưng chưa có hồ sơ trong bảng profiles.", "err");
      return;
    }

    showMessage(msg, "Đăng nhập thành công. Đang chuyển trang...", "ok");

    setTimeout(() => {
      if (ADMIN_ROLES.includes(profile.role_type)) {
        window.location.href = "./admin.html";
      } else {
        window.location.href = "./employee.html";
      }
    }, 500);
  } catch (err) {
    console.error(err);
    showMessage(msg, "Lỗi JavaScript: " + err.message, "err");
  }
});

redirectIfLoggedIn();
