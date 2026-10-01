// Vermittlung zwischen Fernbedienung und Präsentationsseite — s. vorlagen/web/README.md.
//
// Präsentationsseite (iPad am Beamer) und Fernbedienung (iPhone, Apple Watch)
// kennen sich nicht und liegen in keinem gemeinsamen Netz. Sie treffen sich in
// einem „Kanal" bei einem öffentlichen Nachrichtendienst: Die Fernbedienung
// schickt „weiter" oder „zurueck" dorthin, die Präsentationsseite hört mit.
//
// Dienst: ntfy.sh — kostenlos, ohne Konto, mit CORS für Browser. Wer den
// Kanalnamen kennt, kann mitblättern; deshalb ist er zufällig und lang, und er
// gehört einer Lehrkraft (bleibt im Browser gespeichert), nicht einer Stunde.
// Anonyme Nachrichten sind bei ntfy.sh je IP-Adresse und Tag begrenzt — für den
// Betrieb im ganzen Kollegium hinter einer gemeinsamen Schul-IP ist ein eigener
// Dienst die bessere Wahl; dann nur RELAY ändern.

const RELAY = "https://ntfy.sh";
const KANAL_SPEICHER = "folien-kanal";

// Kanal aus der Adresse (#kanal=…) oder aus dem Speicher des Browsers, sonst neu.
function holeKanal({ neuErlaubt = true } = {}) {
  const ausAdresse = new URLSearchParams(location.hash.slice(1)).get("kanal");
  if (ausAdresse && /^[A-Za-z0-9_-]{12,64}$/.test(ausAdresse)) {
    speichere(ausAdresse);
    return ausAdresse;
  }
  let k = lies();
  if (!k && neuErlaubt) {
    const z = new Uint8Array(12);
    crypto.getRandomValues(z);
    k = "rst-" + Array.from(z, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
    speichere(k);
  }
  return k;
}

function neuerKanal() {
  try { localStorage.removeItem(KANAL_SPEICHER); } catch (e) {}
  return holeKanal();
}

function lies() {
  try { return localStorage.getItem(KANAL_SPEICHER); } catch (e) { return null; }
}
function speichere(k) {
  try { localStorage.setItem(KANAL_SPEICHER, k); } catch (e) {}
}

// Befehl senden. Gibt ein Promise zurück, das bei Erfolg true liefert.
function sende(kanal, text) {
  return fetch(`${RELAY}/${encodeURIComponent(kanal)}`, { method: "POST", body: text })
    .then((r) => r.ok)
    .catch(() => false);
}

// Adresse, die einen Befehl per einfachem Aufruf (GET) sendet — für den
// Kurzbefehl auf der Apple Watch, der dann nur „Inhalte von URL abrufen“ braucht
// (ntfy nimmt Nachrichten auch als …/publish?message=… entgegen).
function uhrAdresse(kanal, text) {
  return `${RELAY}/${encodeURIComponent(kanal)}/publish?message=${encodeURIComponent(text)}`;
}

// Auf Befehle hören. rueckruf(text) für jede Nachricht, status(zustand) mit
// "an" | "getrennt". EventSource verbindet sich nach Abbrüchen selbst neu.
function hoere(kanal, rueckruf, status) {
  const quelle = new EventSource(`${RELAY}/${encodeURIComponent(kanal)}/sse`);
  quelle.onopen = () => status && status("an");
  quelle.onerror = () => status && status("getrennt");
  quelle.onmessage = (e) => {
    let d;
    try { d = JSON.parse(e.data); } catch (err) { return; }
    if (d && d.event === "message" && typeof d.message === "string") rueckruf(d.message);
  };
  return quelle;
}

// Stand der Präsentation — die Präsentationsseite meldet ihn, damit die
// Fernbedienung Vorschaubilder zeigen und Folien direkt anspringen kann:
//   Fernbedienung → "stand?"      Präsentationsseite → "stand {json}"
// Gemeldet wird nur, solange eine Fernbedienung danach gefragt hat — die Uhr
// allein löst keine zusätzlichen Nachrichten aus (ntfy.sh zählt jede).
const STAND_FRAGE = "stand?";

function sendeStand(kanal, stand) {
  return sende(kanal, "stand " + JSON.stringify(stand));
}

// {n, anzahl, stellen, pfad, vorschau, titel} oder null
function deuteStand(text) {
  if (typeof text !== "string" || !text.startsWith("stand {")) return null;
  let s;
  try { s = JSON.parse(text.slice(6)); } catch (e) { return null; }
  const ok = s && Number.isInteger(s.n) && Number.isInteger(s.anzahl) && s.anzahl > 0
    && Number.isInteger(s.stellen) && typeof s.pfad === "string" && typeof s.vorschau === "string";
  return ok ? s : null;
}

// Adresse eines Vorschaubilds — nur auf dem eigenen Server, damit niemand über
// den Kanal fremde Adressen unterschieben kann.
function vorschauAdresse(stand, n) {
  if (!stand || n < 1 || n > stand.anzahl) return null;
  const datei = stand.vorschau.replace("{n}", String(n).padStart(stand.stellen, "0"));
  if (!stand.pfad.startsWith("/") || stand.pfad.startsWith("//") || /[:?#]/.test(datei)) return null;
  const u = new URL(stand.pfad + datei, location.origin);
  return u.origin === location.origin ? u.href : null;
}

// Befehlswörter — großzügig, weil sie auch aus einem Kurzbefehl auf der Uhr kommen.
function deuteBefehl(text) {
  const t = (text || "").trim().toLowerCase();
  if (t === STAND_FRAGE) return { art: "frage" };
  if (["weiter", "vor", "next", "n", "+"].includes(t)) return { art: "weiter" };
  if (["zurueck", "zurück", "back", "prev", "p", "-"].includes(t)) return { art: "zurueck" };
  const m = t.match(/^(?:gehe|folie|goto)[:\s]+(\d+)$/);
  if (m) return { art: "gehe", nr: parseInt(m[1], 10) };
  return null;
}
