(() => {
  if (window.__reybaud_injected) return;
  window.__reybaud_injected = true;

  // Best-effort: extract phone number from active chat header (WhatsApp Web).
  function extractPhoneFromChat() {
    try {
      // Header title contains name; sometimes phone with country code.
      const headerTitle = document.querySelector('header [role="button"] span[title]');
      const t = headerTitle?.getAttribute("title") ?? "";
      const m = t.match(/\+?\d[\d\s\-\(\)]{7,}\d/);
      if (m) return m[0];
      // Chat URL may include phone
      const chatId = document.querySelector('[data-testid="conversation-info-header"] span[title]');
      const t2 = chatId?.getAttribute("title") ?? "";
      const m2 = t2.match(/\+?\d[\d\s\-\(\)]{7,}\d/);
      if (m2) return m2[0];
      // Fallback: search page for tel: links
      const tel = document.querySelector('a[href^="tel:"]');
      if (tel) return tel.getAttribute("href").replace("tel:", "");
    } catch (_) {}
    return "";
  }

  function extractNameFromChat() {
    try {
      const el = document.querySelector('header span[dir="auto"][title]');
      return el?.getAttribute("title") ?? "";
    } catch (_) { return ""; }
  }

  const panel = document.createElement("div");
  panel.id = "reybaud-panel";
  panel.innerHTML = `
    <h3>Reybaud · Guardar contacto
      <button class="rb-close" title="Ocultar">×</button>
    </h3>
    <label>Nombre</label>
    <input id="rb-nombre" placeholder="María" />
    <label>Apellido</label>
    <input id="rb-apellido" placeholder="Pérez" />
    <label>Email</label>
    <input id="rb-email" type="email" placeholder="ejemplo@mail.com" />
    <label>Teléfono</label>
    <input id="rb-telefono" placeholder="+54 9 11 5555 5555" />
    <label>Notas (interés, consulta, etc.)</label>
    <textarea id="rb-notas" placeholder="Consultó por escuela cuatrimestre"></textarea>
    <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;color:#e2e8f0">
      <input type="checkbox" id="rb-gcontacts" checked style="width:auto;margin:0" />
      Agendar también en Google Contacts (obligatorio)
    </label>
    <button class="rb-save" id="rb-save">Guardar y agendar</button>
    <div class="rb-status" id="rb-status"></div>
    <div class="rb-muted">Se autocompleta desde el chat abierto. Al guardar se descarga una vCard y se abre Google Contacts para importarla.</div>
  `;
  document.body.appendChild(panel);

  const toggle = document.createElement("button");
  toggle.className = "rb-toggle";
  toggle.textContent = "Reybaud";
  toggle.style.display = "none";
  document.body.appendChild(toggle);

  panel.querySelector(".rb-close").addEventListener("click", () => {
    panel.style.display = "none";
    toggle.style.display = "block";
  });
  toggle.addEventListener("click", () => {
    panel.style.display = "block";
    toggle.style.display = "none";
    autofill();
  });

  const $ = (id) => document.getElementById(id);
  const setStatus = (t, cls) => { const s = $("rb-status"); s.textContent = t ?? ""; s.className = "rb-status " + (cls ?? ""); };

  function autofill() {
    const tel = extractPhoneFromChat();
    const name = extractNameFromChat();
    if (tel && !$("rb-telefono").value) $("rb-telefono").value = tel;
    if (name && !$("rb-nombre").value) {
      const parts = name.trim().split(/\s+/);
      if (parts.length > 1) {
        $("rb-nombre").value = parts.slice(0, -1).join(" ");
        $("rb-apellido").value = parts.slice(-1)[0];
      } else {
        $("rb-nombre").value = parts[0];
      }
    }
  }

  // Re-autofill when chat changes (poll every 2s)
  setInterval(() => {
    if (panel.style.display !== "none") autofill();
  }, 2000);

  $("rb-save").addEventListener("click", async () => {
    const payload = {
      nombre: $("rb-nombre").value.trim() || null,
      apellido: $("rb-apellido").value.trim() || null,
      email: $("rb-email").value.trim() || null,
      telefono: $("rb-telefono").value.trim() || null,
      notas: $("rb-notas").value.trim() || null,
    };
    if (!payload.email && !payload.telefono) {
      setStatus("Cargá al menos email o teléfono", "rb-err");
      return;
    }
    $("rb-save").disabled = true;
    setStatus("Guardando…");
    const r = await chrome.runtime.sendMessage({ type: "SAVE_CONTACT", payload });
    $("rb-save").disabled = false;
    if (r?.ok) {
      const status = r.body?.status;
      setStatus(status === "alumno" ? "Guardado y vinculado al alumno ✓" : "Prospecto guardado ✓", "rb-ok");
      $("rb-notas").value = "";
      if ($("rb-gcontacts").checked) {
        downloadVCard(payload);
        setStatus((status === "alumno" ? "Guardado ✓" : "Prospecto guardado ✓") + " · vCard descargada, abrí Google Contacts y arrastrala para importar.", "rb-ok");
        window.open("https://contacts.google.com/", "_blank", "noopener");
      }
    } else {
      const err = r?.body?.error ?? r?.error ?? "Error";
      const errStr = typeof err === "string" ? err : JSON.stringify(err);
      setStatus(errStr, "rb-err");
    }
  });

  function downloadVCard(p) {
    const fn = [p.nombre, p.apellido].filter(Boolean).join(" ") || (p.telefono || p.email || "Contacto Reybaud");
    const last = p.apellido || "";
    const first = p.nombre || fn;
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `N:${last};${first};;;`,
      `FN:${fn}`,
      p.telefono ? `TEL;TYPE=CELL:${p.telefono}` : "",
      p.email ? `EMAIL;TYPE=INTERNET:${p.email}` : "",
      p.notas ? `NOTE:${p.notas.replace(/\n/g, "\\n")}` : "",
      "CATEGORIES:Reybaud",
      "END:VCARD",
    ].filter(Boolean).join("\r\n");
    const blob = new Blob([lines], { type: "text/vcard;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fn.replace(/[^\w\-]+/g, "_")}.vcf`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  autofill();
})();
