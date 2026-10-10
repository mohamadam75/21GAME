/* 21Game authentication UI. The public anon key is safe only with the database RLS policies enabled. */
(function () {
  const byId = id => document.getElementById(id);
  let isSignup = false;
  let client = null;
  let profile = null;

  function status(message, error) {
    const el = byId("authStatus");
    if (!el) return;
    el.textContent = message || "";
    el.style.color = error ? "#ff9a9a" : "#b5e8cb";
  }

  function setMode(signup) {
    isSignup = signup;
    byId("authHeading").textContent = signup ? "ساخت حساب کاربری" : "ورود به بازی ۲۱";
    byId("authIntro").textContent = signup
      ? "حساب بسازید تا بتوانید وارد لابی بازی شوید."
      : "برای انتخاب میز و بازی با دیگران وارد حساب خود شوید.";
    byId("usernameLabel").classList.toggle("hidden", !signup);
    byId("authUsername").classList.toggle("hidden", !signup);
    byId("authUsername").required = signup;
    byId("authPassword").autocomplete = signup ? "new-password" : "current-password";
    byId("authSubmit").textContent = signup ? "ثبت‌نام" : "ورود";
    byId("authModeToggle").textContent = signup ? "قبلاً حساب دارید؟ وارد شوید" : "حساب ندارید؟ ثبت‌نام کنید";
    status("");
  }

  function setWallet(value) {
    const n = Number(value || 0);
    const el = byId("wallet");
    if (el) el.textContent = n.toLocaleString("fa-IR");
    if (typeof window.setAuthenticatedWallet === "function") window.setAuthenticatedWallet(n);
  }

  async function loadProfile(user) {
    const { data, error } = await client.from("profiles")
      .select("id,username,display_name,role,demo_chips")
      .eq("id", user.id).single();
    if (error) throw error;
    profile = data;
    window.current21GameUser = { id:user.id, email:user.email, ...data };
    byId("signedInName").textContent = data.display_name || data.username;
    byId("signOutBtn").classList.remove("hidden");
    byId("authGate").classList.add("auth-hidden");
    setWallet(data.demo_chips);
    window.dispatchEvent(new CustomEvent("21game:authenticated", { detail: window.current21GameUser }));
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (!client) return status("ابتدا تنظیمات Supabase را در supabase-config.js وارد کنید.", true);
    const email = byId("authEmail").value.trim();
    const password = byId("authPassword").value;
    byId("authSubmit").disabled = true;
    status(isSignup ? "در حال ساخت حساب..." : "در حال ورود...");
    try {
      if (isSignup) {
        const username = byId("authUsername").value.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,24}$/.test(username)) throw new Error("نام کاربری باید ۳ تا ۲۴ حرف انگلیسی، عدد یا زیرخط باشد.");
        const { data, error } = await client.auth.signUp({
          email, password,
          options: { data: { username, display_name: username } }
        });
        if (error) throw error;
        if (!data.session) {
          status("حساب ساخته شد. ایمیل تأیید را بررسی کنید؛ سپس وارد شوید.");
          return;
        }
        await loadProfile(data.user);
      } else {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await loadProfile(data.user);
      }
    } catch (e) {
      status(e.message || "ورود انجام نشد.", true);
    } finally {
      byId("authSubmit").disabled = false;
    }
  }

  async function init() {
    const url = window.SUPABASE_URL;
    const key = window.SUPABASE_ANON_KEY;
    if (!window.supabase || !url || !key || url.includes("YOUR_SUPABASE") || key.includes("YOUR_SUPABASE")) {
      status("تنظیم Supabase هنوز انجام نشده است. فایل SUPABASE_SETUP.md را دنبال کنید.", true);
      return;
    }
    client = window.supabase.createClient(url, key);
    window.supabase21Game = client;
    byId("authForm").addEventListener("submit", handleAuth);
    byId("authModeToggle").addEventListener("click", () => setMode(!isSignup));
    byId("signOutBtn").addEventListener("click", async () => {
      await client.auth.signOut();
      profile = null;
      window.current21GameUser = null;
      byId("signedInName").textContent = "مهمان";
      byId("signOutBtn").classList.add("hidden");
      setWallet(0);
      byId("authGate").classList.remove("auth-hidden");
      setMode(false);
    });
    client.auth.onAuthStateChange(async (_event, session) => {
      if (!session) return;
      try { await loadProfile(session.user); }
      catch (e) { status("ورود انجام شد اما پروفایل آماده نیست: " + e.message, true); }
    });
    const { data, error } = await client.auth.getSession();
    if (error) return status(error.message, true);
    if (data.session) {
      try { await loadProfile(data.session.user); }
      catch (e) { status("پروفایل پیدا نشد. ابتدا schema.sql را در Supabase اجرا کنید.", true); }
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    byId("authForm").addEventListener("submit", handleAuth);
    byId("authModeToggle").addEventListener("click", () => setMode(!isSignup));
    init();
  });
})();
