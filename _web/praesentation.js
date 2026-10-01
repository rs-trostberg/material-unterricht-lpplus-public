// Präsentationsseite: zeigt die Folien einer Stunde als SVG, eine nach der
// anderen, im Vollbild. Konfiguration kommt aus window.FOLIEN (vom Generator
// scripts/web-folien.py in die index.html geschrieben). S. vorlagen/web/README.md.
//
// Weiterblättern: Tippen rechts / Wischen nach links / Pfeil rechts, Bild ab,
// Leertaste, Eingabe — damit funktionieren auch Bluetooth-Presenter, die sich
// als Tastatur melden. Zurück: Tippen links / Wischen nach rechts / Pfeil
// links, Bild auf. Dazu iPhone und Apple Watch über relay.js; das Menü und
// die Fernbedienung springen über das Folienraster (raster.js) direkt.

(function () {
  const cfg = window.FOLIEN;
  const img = document.getElementById("folie");
  const zaehler = document.getElementById("zaehler");
  const balken = document.getElementById("fortschritt");
  const punkt = document.getElementById("verbindung");
  const menue = document.getElementById("menue");
  const body = document.body;

  let aktuell = 1;
  let kanal = null;
  let fbGefragt = 0;             // wann eine Fernbedienung zuletzt nach dem Stand fragte
  let standZeit;
  const vorgeladen = new Map();

  const nummer = (n) => String(n).padStart(cfg.stellen, "0");
  const pfad = (n) => cfg.muster.replace("{n}", nummer(n));
  const vorschau = (n) => cfg.vorschau.replace("{n}", nummer(n));

  function vorladen(n) {
    if (n < 1 || n > cfg.anzahl || vorgeladen.has(n)) return;
    const bild = new Image();
    bild.src = pfad(n);
    vorgeladen.set(n, bild);
  }

  function zeige(n) {
    n = Math.max(1, Math.min(cfg.anzahl, n | 0));
    aktuell = n;
    const ziel = pfad(n);
    // Erst dekodieren, dann tauschen — sonst blitzt beim Blättern kurz Weiß auf.
    const bild = vorgeladen.get(n) || Object.assign(new Image(), { src: ziel });
    vorgeladen.set(n, bild);
    const tausch = () => { if (aktuell === n) img.src = ziel; };
    (bild.decode ? bild.decode() : Promise.resolve()).then(tausch, tausch);
    zaehler.textContent = `${n} / ${cfg.anzahl}`;
    balken.style.width = `${(100 * n) / cfg.anzahl}%`;
    history.replaceState(null, "", `#${n}`);
    vorladen(n + 1); vorladen(n + 2); vorladen(n - 1);
    if (markiere) markiere(n, menue.classList.contains("offen"));
    meldeStand();
  }

  // ---------- Stand an die Fernbedienung melden ----------
  // Nur, solange eine Fernbedienung in den letzten zwei Stunden gefragt hat;
  // kurz gesammelt, damit schnelles Blättern nicht jede Zwischenfolie schickt.
  function meldeStand(sofort) {
    if (!kanal || Date.now() - fbGefragt > 2 * 3600 * 1000) return;
    clearTimeout(standZeit);
    standZeit = setTimeout(() => sendeStand(kanal, {
      n: aktuell, anzahl: cfg.anzahl, stellen: cfg.stellen, titel: cfg.titel || document.title,
      pfad: location.pathname.replace(/[^/]*$/, ""), vorschau: cfg.vorschau,
    }), sofort ? 0 : 300);
  }

  const weiter = () => zeige(aktuell + 1);
  const zurueck = () => zeige(aktuell - 1);

  // ---------- Befehle von Fernbedienung und Uhr ----------
  function befehl(text) {
    const b = deuteBefehl(text);
    if (!b) return;
    if (b.art === "frage") { fbGefragt = Date.now(); meldeStand(true); }
    else if (b.art === "weiter") weiter();
    else if (b.art === "zurueck") zurueck();
    else if (b.art === "gehe") zeige(b.nr);
  }

  function verbinde() {
    kanal = holeKanal();
    try {
      hoere(kanal, befehl, (z) => { punkt.className = "verbindung " + z; });
    } catch (e) {
      punkt.className = "verbindung getrennt";
    }
  }

  // ---------- Tastatur und Presenter ----------
  document.addEventListener("keydown", (e) => {
    if (menue.classList.contains("offen")) {
      // Ein Presenter hat nur Vor/Zurück — sein erster Druck schließt das Startfenster.
      if (["Escape", "ArrowRight", "PageDown", "ArrowLeft", "PageUp"].includes(e.key)) {
        schliesseMenue();
        e.preventDefault();
      }
      return;
    }
    const k = e.key;
    if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter", "n"].includes(k)) { weiter(); e.preventDefault(); }
    else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace", "p"].includes(k)) { zurueck(); e.preventDefault(); }
    else if (k === "Home") zeige(1);
    else if (k === "End") zeige(cfg.anzahl);
    else if (k === "f") vollbild();
    wecke();
  });

  // ---------- Tippen und Wischen ----------
  let start = null;
  const buehne = document.getElementById("buehne");
  buehne.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    start = { x: t.clientX, y: t.clientY, zeit: Date.now() };
  }, { passive: true });
  // Waagrechtes Wischen gehört uns — sonst deutet der Browser es als „Zurück"
  // im Verlauf und verlässt die Präsentation.
  buehne.addEventListener("touchmove", (e) => {
    if (!start) return;
    const t = e.changedTouches[0];
    if (Math.abs(t.clientX - start.x) > Math.abs(t.clientY - start.y)) e.preventDefault();
  }, { passive: false });
  buehne.addEventListener("touchend", (e) => {
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    const wisch = Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy);
    if (wisch) (dx < 0 ? weiter : zurueck)();
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) tippe(t.clientX);
    start = null;
    e.preventDefault();          // kein zusätzlicher click hinterher
    wecke();
  });
  buehne.addEventListener("click", (e) => { tippe(e.clientX); wecke(); });

  // linkes Drittel zurück, sonst weiter — die meisten Tipper wollen weiter
  function tippe(x) { (x < window.innerWidth / 3 ? zurueck : weiter)(); }

  // ---------- Bedienelemente aus- und einblenden ----------
  let ruhe;
  function wecke() {
    body.classList.remove("still");
    clearTimeout(ruhe);
    ruhe = setTimeout(() => body.classList.add("still"), 2500);
  }
  document.addEventListener("mousemove", wecke);

  // ---------- Vollbild ----------
  function vollbild() {
    const el = document.documentElement;
    const an = el.requestFullscreen || el.webkitRequestFullscreen;
    if (an && !(document.fullscreenElement || document.webkitFullscreenElement)) {
      try { an.call(el); } catch (e) {}
    }
  }

  // ---------- Menü ----------
  function oeffneMenue() {
    menue.classList.add("offen");
    zeigeKopplung();
  }
  function schliesseMenue() { menue.classList.remove("offen"); wecke(); }

  function fbAdresse() {
    return new URL(`${cfg.wurzel}fernbedienung.html#kanal=${kanal}`, location.href).href;
  }

  function zeigeKopplung() {
    const adresse = fbAdresse();
    document.getElementById("fb-link").textContent = adresse;
    document.getElementById("fb-link").href = adresse;
    document.getElementById("uhr-url").textContent = uhrAdresse(kanal, "weiter");
    const qrFeld = document.getElementById("qr");
    try {
      const q = qrcode(0, "M");
      q.addData(adresse);
      q.make();
      qrFeld.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (e) {
      qrFeld.textContent = "";
    }
  }

  document.getElementById("menueknopf").addEventListener("click", (e) => { e.stopPropagation(); oeffneMenue(); });
  document.getElementById("los").addEventListener("click", () => { vollbild(); schliesseMenue(); });
  document.getElementById("zu").addEventListener("click", schliesseMenue);
  document.getElementById("neuer-kanal").addEventListener("click", () => {
    kanal = neuerKanal();
    location.reload();
  });
  menue.addEventListener("click", (e) => { if (e.target === menue) schliesseMenue(); });

  // ---------- Alle Folien im Menü ----------
  let markiere = null;
  const alle = document.getElementById("alle-folien");
  if (alle) {
    markiere = baueRaster(document.getElementById("raster"), cfg.anzahl, vorschau, (n) => {
      zeige(n);
      schliesseMenue();
    });
    alle.addEventListener("toggle", () => { if (alle.open) markiere(aktuell, true); });
  }

  // ---------- Start ----------
  const ausAdresse = parseInt(location.hash.slice(1), 10);
  verbinde();
  zeige(Number.isFinite(ausAdresse) ? ausAdresse : 1);
  oeffneMenue();                 // Startfenster mit Titel, Vollbild und Kopplung
})();
