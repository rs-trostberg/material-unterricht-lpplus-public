// Folienraster: alle Folien als kleine Vorschaubilder, eine antippen springt
// dorthin — im Menü der Präsentationsseite und auf der Fernbedienung.
// S. vorlagen/web/README.md.

// feld: Element, das das Raster aufnimmt; bild(n): Adresse des Vorschaubilds;
// wahl(n): Rückruf beim Antippen. Gibt eine Funktion markiere(n) zurück, die
// die aktuelle Folie hervorhebt.
function baueRaster(feld, anzahl, bild, wahl) {
  feld.textContent = "";
  const knoepfe = [];
  for (let n = 1; n <= anzahl; n++) {
    const k = document.createElement("button");
    k.type = "button";
    k.className = "raster-folie";
    k.setAttribute("aria-label", `Folie ${n}`);
    const img = document.createElement("img");
    img.loading = "lazy";
    img.alt = "";
    img.src = bild(n);
    const nr = document.createElement("span");
    nr.textContent = n;
    k.append(img, nr);
    k.addEventListener("click", (e) => { e.stopPropagation(); wahl(n); });
    feld.append(k);
    knoepfe.push(k);
  }
  return function markiere(aktuell, sichtbar) {
    knoepfe.forEach((k, i) => k.classList.toggle("aktuell", i + 1 === aktuell));
    const k = knoepfe[aktuell - 1];
    if (k && sichtbar) k.scrollIntoView({ block: "center" });
  };
}
