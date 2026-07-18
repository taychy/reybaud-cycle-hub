const $ = (id) => document.getElementById(id);
const msg = $("msg");

function setMsg(text, cls) {
  msg.textContent = text ?? "";
  msg.className = "status " + (cls ?? "");
}

async function refresh() {
  const { session } = await chrome.runtime.sendMessage({ type: "GET_SESSION" });
  if (session?.access_token) {
    $("loggedout").style.display = "none";
    $("loggedin").style.display = "block";
    $("who").textContent = session.email ?? "staff";
  } else {
    $("loggedout").style.display = "block";
    $("loggedin").style.display = "none";
  }
}

$("sendOtp").addEventListener("click", async () => {
  const email = $("email").value.trim().toLowerCase();
  if (!email) return setMsg("Ingresá tu email", "err");
  setMsg("Enviando…");
  const r = await chrome.runtime.sendMessage({ type: "SEND_OTP", email });
  // Aunque devuelva error (rate limit, "user not found"), avanzamos para permitir pegar
  // un código que ya haya llegado por mail. El verify final valida de verdad.
  $("step1").style.display = "none";
  $("step2").style.display = "block";
  if (r.ok) setMsg("Revisá tu mail y pegá el código.", "ok");
  else setMsg("Si ya recibiste un código, pegalo abajo.", "");
});

$("haveCode").addEventListener("click", (e) => {
  e.preventDefault();
  const email = $("email").value.trim().toLowerCase();
  if (!email) return setMsg("Escribí primero tu email", "err");
  $("step1").style.display = "none";
  $("step2").style.display = "block";
  setMsg("Pegá el código que recibiste por mail.", "");
});

$("backStep").addEventListener("click", () => {
  $("step1").style.display = "block";
  $("step2").style.display = "none";
  setMsg("");
});

$("verifyOtp").addEventListener("click", async () => {
  const email = $("email").value.trim().toLowerCase();
  const token = $("otp").value.trim();
  if (!token) return setMsg("Pegá el código", "err");
  setMsg("Verificando…");
  const r = await chrome.runtime.sendMessage({ type: "VERIFY_OTP", email, token });
  if (r.ok) { setMsg("Conectado ✓", "ok"); refresh(); }
  else setMsg(r.error ?? "Código inválido", "err");
});

$("logout").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "LOGOUT" });
  refresh();
});

refresh();
