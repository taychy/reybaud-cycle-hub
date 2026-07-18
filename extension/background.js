const SUPABASE_URL = "https://tgqfakfloonbunwkdoug.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRncWZha2Zsb29uYnVud2tkb3VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDcwNjcsImV4cCI6MjA4NzUyMzA2N30.wESViBAO2oP0aTSIrgXVkIS8qJXgW4f0GtKWShHuf_o";

async function getSession() {
  const { rb_session } = await chrome.storage.local.get("rb_session");
  return rb_session ?? null;
}

async function saveSession(s) {
  await chrome.storage.local.set({ rb_session: s });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === "GET_SESSION") {
        sendResponse({ session: await getSession() });
      } else if (msg.type === "SEND_OTP") {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON },
          body: JSON.stringify({ email: msg.email, create_user: false }),
        });
        sendResponse({ ok: r.ok, status: r.status, body: await r.text() });
      } else if (msg.type === "VERIFY_OTP") {
        const r = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON },
          body: JSON.stringify({ email: msg.email, token: msg.token, type: "email" }),
        });
        const body = await r.json();
        if (r.ok && body.access_token) {
          await saveSession({ access_token: body.access_token, refresh_token: body.refresh_token, email: msg.email, expires_at: Date.now() + (body.expires_in ?? 3600) * 1000 });
          sendResponse({ ok: true, email: msg.email });
        } else {
          sendResponse({ ok: false, error: body.error_description ?? body.msg ?? "Código inválido" });
        }
      } else if (msg.type === "LOGOUT") {
        await chrome.storage.local.remove("rb_session");
        sendResponse({ ok: true });
      } else if (msg.type === "SAVE_CONTACT") {
        const session = await getSession();
        if (!session?.access_token) return sendResponse({ ok: false, error: "No hay sesión. Ingresá desde el ícono de la extensión." });
        const r = await fetch(`${SUPABASE_URL}/functions/v1/register-whatsapp-contact`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON,
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(msg.payload),
        });
        const body = await r.json();
        sendResponse({ ok: r.ok, status: r.status, body });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message ?? e) });
    }
  })();
  return true; // keep the message channel open for async response
});
