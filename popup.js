const $ = (id) => document.getElementById(id);
let tab;

function setStatus(msg, cls) {
  const s = $("status");
  s.textContent = msg;
  s.className = cls || "";
}

(async () => {
  [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  $("title").value = tab.title || "";
  $("url").textContent = tab.url;

  const s = await browser.storage.local.get([
    "category", "defaultCategory", "serverUrl", "archiveDefault", "contentDefault",
  ]);
  $("category").value = s.category || s.defaultCategory || "";
  if (!s.serverUrl) setStatus("Najpierw skonfiguruj serwer w ustawieniach (⚙).", "err");

  if (isArchivable(tab.url)) {
    $("archive").checked = s.archiveDefault !== false;
  } else {
    $("archive").checked = false;
    $("archive").disabled = true;
    $("archiveNote").textContent = "(strona lokalna/prywatna – archiwizacja niedostępna)";
  }

  if (/^https?:/i.test(tab.url)) {
    $("content").checked = s.contentDefault === true;
  } else {
    $("content").checked = false;
    $("content").disabled = true;
    $("contentNote").textContent = "(niedostępne dla tej karty)";
  }
})();

$("save").addEventListener("click", async () => {
  // prośba o uprawnienia musi być pierwsza (gest użytkownika); gdy już przyznane – bez pytania
  let archive = $("archive").checked && !$("archive").disabled;
  const extra = [];
  if (archive) {
    const granted = await browser.permissions.request({ origins: ARCHIVE_ORIGINS });
    if (!granted) {
      archive = false;
      extra.push("bez archiwizacji – brak zgody na dostęp do web.archive.org");
    }
  }

  const { serverUrl, username, appPassword } = await browser.storage.local.get([
    "serverUrl", "username", "appPassword",
  ]);
  if (!serverUrl || !username || !appPassword) {
    browser.runtime.openOptionsPage();
    return;
  }

  const title = $("title").value.trim() || tab.url;
  const category = $("category").value.trim();
  const comment = $("comment").value.trim();

  $("save").disabled = true;

  // treść strony pobieramy z tej karty (w przeglądarce), zanim cokolwiek pójdzie do tła
  let pageContent = "";
  let usedSelection = false;
  if ($("content").checked && !$("content").disabled) {
    setStatus("Pobieranie treści strony…");
    try {
      const [res] = await browser.tabs.executeScript(tab.id, { file: "extract.js" });
      if (res && res.markdown) {
        pageContent = res.markdown;
        usedSelection = !!res.usedSelection;
        if (res.truncated) extra.push("treść obcięta do limitu");
      } else {
        extra.push("nie znaleziono treści strony");
      }
    } catch (e) {
      extra.push("nie udało się pobrać treści strony");
    }
  }

  setStatus(archive ? "Zapisywanie i archiwizacja (może potrwać do minuty)…" : "Zapisywanie…");

  try {
    const r = await browser.runtime.sendMessage({
      type: "saveNote", title, url: tab.url, category, comment, archive, pageContent, usedSelection,
    });
    if (!r || !r.ok) throw new Error((r && r.error) || "Nieznany błąd");
    await browser.storage.local.set({ category });

    const msgs = {
      fresh: "Zapisano ✔ i zarchiwizowano",
      existing: "Zapisano ✔ (użyto istniejącej kopii archiwalnej)",
      failed: "Zapisano ✔, ale archiwizacja się nie powiodła",
      none: "Zapisano ✔",
    };
    let msg = msgs[r.archive];
    if (pageContent) msg += usedSelection ? " + zaznaczony fragment" : " + treść strony";
    if (extra.length) msg += " (" + extra.join("; ") + ")";
    setStatus(msg, r.archive === "failed" || extra.length ? "err" : "ok");
    setTimeout(() => window.close(), 1800);
  } catch (e) {
    setStatus("Błąd: " + e.message, "err");
    $("save").disabled = false;
  }
});

$("settings").addEventListener("click", (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
  window.close();
});
