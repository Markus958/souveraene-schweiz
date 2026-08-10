# -*- coding: utf-8 -*-
"""Wertet bemerkungen_aktualisiert.md aus und erzeugt strukturierte Zusatzdaten.

  NGO/daten/bemerkungen_aktualisiert.md
      -> NGO/ausgabe/ngo-redaktion.json

Uebernommen werden nur Abschnitte, die sich einer Organisation zuordnen lassen:

  * Fuehrungsmodell   aus «Organisationen ohne klassische Fuehrungsspitze»
  * Fuehrungswechsel  aus der Tabelle «Laufende Fuehrungswechsel»
  * Verbindungsnotiz  aus «Personalunionen und Netzwerkknoten» (nur Text)

Wichtig (Regel 6): Aus der Bemerkungsdatei entsteht **keine aktuelle**
Verbindung. Verbindungstypen kommen aus verbindungstypen.json und werden hier
gegen die Flatfile geprueft. Nur was durch strukturierte Rollen gedeckt ist,
wird zur Verbindung; alles andere landet als «redaktioneller Hinweis»
(Ebene D) in der Ausgabe — sichtbar, aber ausdruecklich nicht als aktuelle
Verbindung und nie in den Kennzahlen mitgezaehlt.

Aufruf:  python NGO/build/erzeuge_redaktion_json.py
"""

import io
import json
import os
import re
import sys

BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MD = os.path.join(BASIS, "daten", "bemerkungen_aktualisiert.md")
FLATFILE = os.path.join(BASIS, "daten", "NGO_Fuehrungsnetz_Flatfile.json")
TYPEN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "verbindungstypen.json")
ZIEL = os.path.join(BASIS, "ausgabe", "ngo-redaktion.json")

AKTUELL = ("reported_current", "current_with_announced_change")


def lade(pfad):
    with io.open(pfad, encoding="utf-8") as f:
        return json.load(f)


def abschnitt(text, ueberschrift):
    """Gibt den Text zwischen einer ##-Ueberschrift und der naechsten zurueck."""
    muster = re.compile(r"^##\s+" + re.escape(ueberschrift) + r"\s*$(.*?)(?=^##\s|\Z)",
                        re.S | re.M)
    treffer = muster.search(text)
    return treffer.group(1) if treffer else ""


class Zuordnung(object):
    """Ordnet Organisationsnamen aus der Bemerkungsdatei einer NGO-ID zu."""

    def __init__(self, organisationen):
        self.nach_name = {}
        for org in organisationen:
            for variante in (org.get("name"), org.get("shortName")):
                if variante:
                    self.nach_name[self._schluessel(variante)] = org["id"]
        self.organisationen = organisationen

    @staticmethod
    def _schluessel(name):
        name = name.lower().strip()
        name = re.sub(r"\s*\(.*?\)\s*", " ", name)
        name = re.sub(r"[^a-z0-9äöüéèàç]+", " ", name)
        return re.sub(r"\s+", " ", name).strip()

    def finde(self, name):
        s = self._schluessel(name)
        if s in self.nach_name:
            return self.nach_name[s]
        # Praefix-Treffer, z. B. «Amnesty International Schweizer Sektion»
        for kandidat, ngo_id in self.nach_name.items():
            if kandidat.startswith(s) or s.startswith(kandidat):
                if min(len(kandidat), len(s)) >= 5:
                    return ngo_id
        # Enthaltensein, z. B. «Bankiervereinigung» in «Schweizerische Bankiervereinigung».
        # Mindestlaenge gegen Zufallstreffer.
        if len(s) >= 8:
            for kandidat, ngo_id in self.nach_name.items():
                if s in kandidat or kandidat in s:
                    return ngo_id
        return None


def lies_fuehrungswechsel(text, zuordnung, unbekannt):
    ergebnis = {}
    for zeile in abschnitt(text, "Laufende Führungswechsel (Datum beachten)").splitlines():
        zeile = zeile.strip()
        if not zeile.startswith("|") or set(zeile) <= set("|- "):
            continue
        teile = [t.strip() for t in zeile.strip("|").split("|")]
        if len(teile) != 2 or teile[0].lower() == "organisation":
            continue
        ngo_id = zuordnung.finde(teile[0])
        if not ngo_id:
            unbekannt.append(("Führungswechsel", teile[0]))
            continue
        ergebnis[ngo_id] = teile[1]
    return ergebnis


def lies_fuehrungsmodell(text, zuordnung, unbekannt):
    ergebnis = {}
    roh = abschnitt(text, "Organisationen ohne klassische Führungsspitze")
    for treffer in re.finditer(r"^-\s+\*\*(.+?)\*\*\s*:?\s*(.+)$", roh, re.M):
        name, beschreibung = treffer.group(1), treffer.group(2).strip()
        ngo_id = zuordnung.finde(name)
        if not ngo_id:
            unbekannt.append(("Führungsmodell", name))
            continue
        ergebnis[ngo_id] = beschreibung
    return ergebnis


def lies_verbindungsnotizen(text, personen_nach_name, unbekannt):
    """Freitext je Person aus «Personalunionen und Netzwerkknoten»."""
    ergebnis = {}
    roh = abschnitt(text, "Personalunionen und Netzwerkknoten")
    for treffer in re.finditer(r"^-\s+\*\*(.+?)\*\*\s*(.*)$", roh, re.M):
        name = treffer.group(1).strip()
        notiz = treffer.group(2).strip().lstrip(":").strip()
        notiz = notiz.replace("**", "")
        person_id = personen_nach_name.get(name.lower())
        if not person_id:
            unbekannt.append(("Personalunion", name))
            continue
        ergebnis[person_id] = notiz
    return ergebnis


def pruefe_verbindungstypen(eintraege, flat, zuordnung, personen_nach_name):
    """Regel 6: jeder Eintrag muss durch strukturierte Rollen gedeckt sein."""
    rollen_nach_person = {}
    for rolle in flat["roles"]:
        rollen_nach_person.setdefault(rolle.get("personId"), []).append(rolle)

    geprueft = []
    hinweise = []
    fehler = []

    def hinweis(eintrag, grund, person_id=None, ids=None):
        """Ebene D: sichtbar, aber ausdruecklich nicht als aktuelle Verbindung."""
        hinweise.append({
            "personId": person_id,
            "person": eintrag["person"],
            "organisationA": (ids or [None, None])[0],
            "organisationB": (ids or [None, None])[1] if ids and len(ids) > 1 else None,
            "organisationenRoh": eintrag["organisationen"],
            "typ": eintrag["typ"],
            "beleg": eintrag.get("beleg", ""),
            "belegstaerke": "nur_redaktionell",
            "grund": grund,
        })
        fehler.append("%s: %s" % (eintrag["person"], grund))

    for eintrag in eintraege:
        person_id = personen_nach_name.get(eintrag["person"].lower())
        if not person_id:
            hinweis(eintrag, "Person steht nicht in der Flatfile")
            continue
        ids = []
        unbekannte_org = []
        for name in eintrag["organisationen"]:
            ngo_id = zuordnung.finde(name)
            if not ngo_id:
                unbekannte_org.append(name)
            else:
                ids.append(ngo_id)
        if unbekannte_org:
            hinweis(eintrag, "nicht im Datenbestand: %s" % ", ".join(unbekannte_org), person_id, ids)
            continue
        if len(ids) != 2:
            hinweis(eintrag, "kein eindeutiges Organisationspaar", person_id, ids)
            continue

        rollen = rollen_nach_person.get(person_id, [])
        belegt = {r["organisationId"] for r in rollen}
        fehlend = [i for i in ids if i not in belegt]
        if fehlend:
            hinweis(eintrag, "keine strukturierte Rolle bei %s" % ", ".join(fehlend), person_id, ids)
            continue

        if eintrag["typ"] == "aktuelle_doppelfunktion":
            nicht_aktuell = [r["organisationId"] for r in rollen
                             if r["organisationId"] in ids and r["temporalStatus"] not in AKTUELL]
            if nicht_aktuell:
                hinweis(eintrag, "als aktuell deklariert, aber Rolle bei %s ist nicht aktuell"
                        % ", ".join(nicht_aktuell), person_id, ids)
                continue

        geprueft.append({
            "personId": person_id,
            "person": eintrag["person"],
            "organisationA": ids[0],
            "organisationB": ids[1],
            "typ": eintrag["typ"],
            "beleg": eintrag.get("beleg", ""),
            "belegstaerke": "strukturell_belegt",
        })
    return geprueft, hinweise, fehler


def main():
    for pfad in (MD, FLATFILE, TYPEN):
        if not os.path.exists(pfad):
            sys.exit("Datei fehlt: %s" % pfad)

    text = io.open(MD, encoding="utf-8").read()
    flat = lade(FLATFILE)
    zuordnung = Zuordnung(flat["organisations"])
    personen_nach_name = {p["name"].lower(): p["id"] for p in flat["persons"]}

    unbekannt = []
    fuehrungswechsel = lies_fuehrungswechsel(text, zuordnung, unbekannt)
    fuehrungsmodell = lies_fuehrungsmodell(text, zuordnung, unbekannt)
    notizen = lies_verbindungsnotizen(text, personen_nach_name, unbekannt)

    typen_datei = lade(TYPEN)
    verbindungen, hinweise, fehler = pruefe_verbindungstypen(
        typen_datei.get("verbindungen", []), flat, zuordnung, personen_nach_name)

    raus = {
        "quelle": os.path.basename(MD),
        "stand": flat["metadata"].get("dataAsOf"),
        "fuehrungsmodell": fuehrungsmodell,
        "fuehrungswechsel": fuehrungswechsel,
        "verbindungsnotizen": notizen,
        "typBeschreibungen": typen_datei.get("typen", {}),
        "verbindungstypen": verbindungen,
        "redaktionelleHinweise": hinweise,
    }
    os.makedirs(os.path.dirname(ZIEL), exist_ok=True)
    with io.open(ZIEL, "w", encoding="utf-8", newline="\n") as f:
        json.dump(raus, f, ensure_ascii=False, separators=(",", ":"))

    print("Geschrieben: %s" % ZIEL)
    print("  %d Führungsmodelle, %d Führungswechsel, %d Verbindungsnotizen"
          % (len(fuehrungsmodell), len(fuehrungswechsel), len(notizen)))
    print("  %d Verbindungstypen übernommen, %d als redaktioneller Hinweis (Ebene D)"
          % (len(verbindungen), len(hinweise)))
    if unbekannt:
        print("  nicht zugeordnet (bleibt unberücksichtigt):")
        for bereich, name in unbekannt:
            print("    %-16s %s" % (bereich, name))
    if fehler:
        print("  nicht als Verbindung erzeugt (Regel 6), stattdessen Hinweis:")
        for f in fehler:
            print("    %s" % f)


if __name__ == "__main__":
    main()
