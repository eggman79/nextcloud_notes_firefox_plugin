const $ = (id) => document.getElementById(id);
const FIELDS = ["serverUrl", "username", "appPassword", "defaultCategory"];

function setStatus(msg, cls) {
  const s = $("status");
  s.textContent = msg;
  s.className = cls || "";
}

function parseServer() {
  let url;
  try {
    url = new URL($("serverUrl").value.trim());
  } catch {
    throw new Error("Niepoprawny adres serwera");
  }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Adres musi zaczynać się od https://");
  }
  return url;
}

function baseOf(url) {
  return url.origin + url.pathname.replace(/\/+$/, "");
}

// musi być wywołane jako pierwsze w obsłudze kliknięcia (gest użytkownika)
async function ensurePermission(url) {
  const origins = [url.origin + "/*"];
  if ($("archiveDefault").checked) origins.push(...ARCHIVE_ORIGINS);
  const granted = await browser.permissions.request({ origins });
  if (!granted) throw new Error("Brak zgody na dostęp do serwera");
}

(async () => {
  const s = await browser.storage.local.get([...FIELDS, "archiveDefault", "contentDefault"]);
  FIELDS.forEach((f) => ($(f).value = s[f] || ""));
  $("archiveDefault").checked = s.archiveDefault !== false;
  $("contentDefault").checked = s.contentDefault === true;
})();

$("test").addEventListener("click", async () => {
  setStatus("Testowanie…");
  try {
    const url = parseServer();
    await ensurePermission(url);
    const user = $("username").value.trim();
    const pass = $("appPassword").value;
    if (!user || !pass) throw new Error("Podaj użytkownika i hasło aplikacji");

    const res = await fetch(`${baseOf(url)}/index.php/apps/notes/api/v1/settings`, {
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      headers: {
        "Authorization": "Basic " + basicAuth(user, pass),
        "OCS-APIRequest": "true",
      },
    });
    if (res.status === 401) throw new Error("Błędny login lub hasło aplikacji (401)");
    if (res.status === 404) throw new Error("Nie znaleziono aplikacji Notes – sprawdź adres i czy Notes jest zainstalowane (404)");
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    setStatus("Połączono ✔ – Notes odpowiada, dane logowania poprawne", "ok");
  } catch (e) {
    setStatus("Błąd: " + e.message, "err");
  }
});

$("save").addEventListener("click", async () => {
  try {
    const url = parseServer();
    await ensurePermission(url);
    await browser.storage.local.set({
      serverUrl: baseOf(url),
      username: $("username").value.trim(),
      appPassword: $("appPassword").value,
      defaultCategory: $("defaultCategory").value.trim(),
      archiveDefault: $("archiveDefault").checked,
      contentDefault: $("contentDefault").checked,
    });
    $("serverUrl").value = baseOf(url);
    setStatus("Zapisano ✔", "ok");
  } catch (e) {
    setStatus("Błąd: " + e.message, "err");
  }
});
