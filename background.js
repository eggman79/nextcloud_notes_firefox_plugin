const SNAPSHOT_RE = /^https:\/\/web\.archive\.org\/web\/\d{14}/;
const ARCHIVE_TIMEOUT_MS = 60000;

// Zwraca { url, fresh } albo null
async function archiveUrl(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ARCHIVE_TIMEOUT_MS);
  try {
    const res = await fetch("https://web.archive.org/save/" + url, {
      credentials: "omit",
      cache: "no-store",
      signal: ac.signal,
    });
    const loc = res.headers.get("content-location");
    const candidates = [res.url, loc && new URL(loc, "https://web.archive.org").href];
    for (const c of candidates) {
      if (c && SNAPSHOT_RE.test(c)) return { url: c, fresh: true };
    }
  } catch (e) {
    // timeout / błąd sieci / limit zapytań – próbujemy istniejącej kopii
  } finally {
    clearTimeout(timer);
  }

  try {
    const r = await fetch("https://archive.org/wayback/available?url=" + encodeURIComponent(url), {
      credentials: "omit",
      cache: "no-store",
    });
    const j = await r.json();
    const s = j && j.archived_snapshots && j.archived_snapshots.closest;
    if (s && s.available && s.url) {
      const safe = s.url.replace(/^http:/, "https:");
      if (SNAPSHOT_RE.test(safe)) return { url: safe, fresh: false };
    }
  } catch (e) {}
  return null;
}

function flashBadge(text, color) {
  browser.browserAction.setBadgeText({ text });
  browser.browserAction.setBadgeBackgroundColor({ color });
  setTimeout(() => browser.browserAction.setBadgeText({ text: "" }), 6000);
}

async function saveNote({ title, url, category, comment, archive, pageContent, usedSelection }) {
  const { serverUrl, username, appPassword } = await browser.storage.local.get([
    "serverUrl", "username", "appPassword",
  ]);
  if (!serverUrl || !username || !appPassword) throw new Error("Brak konfiguracji serwera");

  const u = new URL(serverUrl);
  const local = ["localhost", "127.0.0.1"].includes(u.hostname);
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) {
    throw new Error("Wymagany HTTPS – dane logowania nie zostaną wysłane jawnym tekstem");
  }

  let archiveState = "none";
  let snapshot = null;
  if (archive && isArchivable(url)) {
    snapshot = await archiveUrl(url);
    archiveState = snapshot ? (snapshot.fresh ? "fresh" : "existing") : "failed";
  }

  const lines = [title, "", url];
  if (archiveState === "fresh") lines.push("", "Archiwum: " + snapshot.url);
  else if (archiveState === "existing") lines.push("", "Archiwum (starsza kopia): " + snapshot.url);
  else if (archiveState === "failed") lines.push("", "Archiwum: archiwizacja nie powiodła się");
  if (comment) lines.push("", comment);
  if (typeof pageContent === "string" && pageContent.trim()) {
    lines.push("", "---", "", usedSelection ? "## Zaznaczony fragment strony" : "## Treść strony", "",
      pageContent.trim().slice(0, 150000));
  }
  const content = lines.join("\n") + "\n";

  const base = serverUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/index.php/apps/notes/api/v1/notes`, {
    method: "POST",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    headers: {
      "Authorization": "Basic " + basicAuth(username, appPassword),
      "Content-Type": "application/json",
      "OCS-APIRequest": "true",
    },
    body: JSON.stringify({ title, content, category }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  flashBadge(archiveState === "failed" ? "!" : "✔", archiveState === "failed" ? "#d98200" : "#0a7d2c");
  return { ok: true, archive: archiveState };
}

browser.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "saveNote") return undefined;
  return saveNote(msg).catch((e) => {
    flashBadge("✖", "#c0201b");
    return { ok: false, error: e.message };
  });
});
