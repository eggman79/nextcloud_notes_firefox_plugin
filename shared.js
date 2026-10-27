const ARCHIVE_ORIGINS = ["https://web.archive.org/*", "https://archive.org/*"];

function basicAuth(user, pass) {
  const bytes = new TextEncoder().encode(`${user}:${pass}`);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

// Archiwizujemy tylko publiczne strony http(s); lokalne/prywatne adresy i adresy z loginem pomijamy
function isArchivable(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  if (u.username || u.password) return false;
  const h = u.hostname;
  if (!h.includes(".")) return false;                                   // localhost, hosty z sieci lokalnej
  if (h.startsWith("[")) return false;                                  // literały IPv6
  if (/\.(local|lan|internal|home|localdomain|intranet)$/i.test(h)) return false;
  if (/^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
  return true;
}
