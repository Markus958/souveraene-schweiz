const fs = require('fs');
const path = require('path');
const BASE = 'c:/Claude/Paket-CH-EU/ch-eu';

const GOAT = '<script data-goatcounter="https://souveraene-schweiz.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>';

const SIDEBAR = `    <div class="sidebar-box">
      <div class="sidebar-box-title">Alle CH&ndash;EU Themen</div>
      <ul class="sidebar-nav">
        <li><a href="mra.html">&#x1F3ED; MRA / Binnenmarkt</a></li>
        <li><a href="luftverkehr.html">&#x2708;&#xFE0F; Luftverkehr</a></li>
        <li><a href="personenfreizuegigkeit.html">&#x1F465; Personenfreiz&uuml;gigkeit</a></li>
        <li><a href="landwirtschaft.html">&#x1F33E; Landwirtschaft</a></li>
        <li><a href="landverkehr.html">&#x1F682; Landverkehr</a></li>
        <li><a href="eu-programme.html">&#x1F52C; EU-Programme / Horizon</a></li>
        <li><a href="weltraum.html">&#x1F6F0;&#xFE0F; Weltraum</a></li>
        <li><a href="schweizer-beitrag.html">&#x1F91D; Schweizer Beitrag</a></li>
        <li><a href="strom.html">&#x26A1; Strom</a></li>
        <li><a href="lebensmittelsicherheit.html">&#x1F957; Lebensmittelsicherheit</a></li>
        <li><a href="gesundheit.html">&#x1F3E5; Gesundheit</a></li>
        <li><a href="querschnitt.html">&#x2696;&#xFE0F; Querschnittsthemen</a></li>
        <li><a href="finanzen.html">&#x1F4B0; Finanzen &amp; Koh&auml;sion</a></li>
        <li><a href="timeline.html">&#x1F4C5; Zeitlinie</a></li>
      </ul>
    </div>
    <div class="sidebar-box">
      <div class="sidebar-box-title">Auf X</div>
      <ul class="sidebar-nav"><li><a href="https://x.com/mllw58" target="_blank">@mllw58 folgen &rarr;</a></li></ul>
    </div>`;

const NAV = `<nav>
  <a href="../index.html" class="nav-logo"><span class="kreuz"></span>Souver&auml;ne Schweiz</a>
  <ul class="nav-links">
    <li><a href="index.html" class="aktiv">Paket CH&ndash;EU</a></li>
    <li><a href="../10mio/index.html">10 Mio Schweiz</a></li>
    <li><a href="../faktenchecks.html">Faktenchecks</a></li>
    <li><a href="../reaktionen.html">Reaktionen</a></li>
    <li><a href="../ueber.html">&Uuml;ber</a></li>
  </ul>
  <a href="https://x.com/mllw58" target="_blank" rel="noopener" class="nav-x">
    <svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>@mllw58
  </a>
  <button class="hamburger" onclick="toggleMenu()"><span></span><span></span><span></span></button>
</nav>
<div class="mobile-menu" id="mobileMenu">
  <a href="index.html" onclick="toggleMenu()">&larr; Paket CH&ndash;EU</a>
  <a href="../10mio/index.html" onclick="toggleMenu()">10 Mio Schweiz</a>
  <a href="../faktenchecks.html" onclick="toggleMenu()">Faktenchecks</a>
  <a href="../reaktionen.html" onclick="toggleMenu()">Reaktionen</a>
  <a href="../ueber.html" onclick="toggleMenu()">&Uuml;ber</a>
  <a href="https://x.com/mllw58" target="_blank" rel="noopener">@mllw58 auf X &rarr;</a>
</div>`;

const FOOTER = `<footer>
  <div class="footer-logo">Souver&auml;ne Schweiz</div>
  <ul class="footer-links">
    <li><a href="../index.html">Start</a></li>
    <li><a href="index.html">Paket CH&ndash;EU</a></li>
    <li><a href="../10mio/index.html">10 Mio Schweiz</a></li>
    <li><a href="https://x.com/mllw58" target="_blank">X / @mllw58</a></li>
    <li><a href="../impressum.html">Impressum</a></li>
  </ul>
  <div class="footer-copy">&copy; 2026 souveraene-schweiz.ch</div>
</footer>
<script>
  function toggleMenu() { document.getElementById('mobileMenu').classList.toggle('open'); }
  document.addEventListener('click', function(e) {
    const m = document.getElementById('mobileMenu');
    if (m.classList.contains('open') && !m.contains(e.target) && !document.querySelector('.hamburger').contains(e.target)) m.classList.remove('open');
  });
</script>
${GOAT}`;

function gen(shortTitle, label, h1, lead, breadcrumb) {
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${shortTitle} | Paket CH&ndash;EU | Souver&auml;ne Schweiz</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Source+Sans+3:wght@300;400;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../style.css" />
</head>
<body>
${NAV}
<nav class="breadcrumb">
  <a href="../index.html">Start</a><span>/</span>
  <a href="index.html">Paket CH&ndash;EU</a><span>/</span>
  <strong>${breadcrumb}</strong>
</nav>
<div class="page-hero">
  <div class="page-label">${label}</div>
  <h1>${h1}</h1>
  <p class="lead">${lead}</p>
</div>
<hr class="divider" />
<div class="content-wrap">
  <div class="article-body">
    <h3>Worum geht es?</h3>
    <div class="placeholder-block"><strong>&#x1F4DD; Platzhalter &ndash; Text wird noch erg&auml;nzt</strong><br>Hintergrund, Geschichte und Ziele dieses Abkommens.</div>
    <h3>Vorteile f&uuml;r die Schweiz</h3>
    <div class="placeholder-block"><strong>&#x1F4DD; Platzhalter &ndash; Text wird noch erg&auml;nzt</strong><br>Welche Branchen, Unternehmen oder Bev&ouml;lkerungsgruppen profitieren? Mit Zahlen und Quellen.</div>
    <h3>Nachteile und Risiken</h3>
    <div class="placeholder-block"><strong>&#x1F4DD; Platzhalter &ndash; Text wird noch erg&auml;nzt</strong><br>Welche Risiken entstehen? Was kritisieren Gegner des Abkommens?</div>
    <h3>Kosten und Nutzen</h3>
    <div class="placeholder-block"><strong>&#x1F4DD; Platzhalter &ndash; Text wird noch erg&auml;nzt</strong><br>Finanzielle Auswirkungen, Sch&auml;tzungen und Vergleichszahlen.</div>
    <h3>Auswirkungen auf die Souver&auml;nit&auml;t</h3>
    <div class="placeholder-block"><strong>&#x1F4DD; Platzhalter &ndash; Text wird noch erg&auml;nzt</strong><br>Welche Kompetenzen gibt die Schweiz ab? Was bleibt in eigener Hand?</div>
    <h3>Detailanalyse</h3>
    <div class="placeholder-block"><strong>&#x1F4DD; Platzhalter &ndash; PDF folgt</strong><br><span style="color:var(--mittel);">Detailanalyse als PDF &ndash; wird hier verlinkt sobald verf&uuml;gbar.</span></div>
  </div>
  <aside class="sidebar">
${SIDEBAR}
  </aside>
</div>
${FOOTER}
</body>
</html>`;
}

const pages = [
  ['mra.html','MRA – Gegenseitige Anerkennung','Binnenmarktabkommen','&#x1F3ED; MRA &ndash; Gegenseitige Anerkennung','Das MRA (Mutual Recognition Agreement) erm&ouml;glicht Schweizer Unternehmen den Marktzugang zur EU ohne doppelte Zertifizierung &ndash; ein zentraler Standortvorteil f&uuml;r Exporteure.','MRA &ndash; Gegenseitige Anerkennung'],
  ['luftverkehr.html','Luftverkehr','Binnenmarktabkommen','&#x2708;&#xFE0F; Luftverkehr','Das Luftverkehrsabkommen regelt den Zugang Schweizer Fluggesellschaften zum europ&auml;ischen Luftraum. Es ist eines der &auml;ltesten Bilateralen &ndash; und steht unter neuem Anpassungsdruck.','Luftverkehr'],
  ['personenfreizuegigkeit.html','Personenfreizügigkeit & Lohnschutz','Binnenmarktabkommen','&#x1F465; Personenfreiz&uuml;gigkeit &amp; Lohnschutz','Das Personenfreiz&uuml;gigkeitsabkommen ist das politisch sensibelste Dossier. Es bestimmt den Zugang zum Schweizer Arbeitsmarkt und steht in direktem Zusammenhang mit den flankierenden Massnahmen.','Personenfreiz&uuml;gigkeit &amp; Lohnschutz'],
  ['landwirtschaft.html','Landwirtschaft','Binnenmarktabkommen','&#x1F33E; Landwirtschaft','Das Landwirtschaftsabkommen regelt den Handel mit Agrarprodukten zwischen der Schweiz und der EU &ndash; von Z&ouml;llen &uuml;ber Veterin&auml;rvorschriften bis zu Ursprungsbezeichnungen.','Landwirtschaft'],
  ['landverkehr.html','Landverkehr / Schiene','Binnenmarktabkommen','&#x1F682; Landverkehr / Schiene','Der Landverkehrsvertrag betrifft den Strassen- und Schienenverkehr durch die Schweiz. Er definiert Transitrechte, Kabotage und die Regulierungskompetenz.','Landverkehr / Schiene'],
  ['eu-programme.html','EU-Programme (Horizon, Erasmus+)','Weiteres Abkommen','&#x1F52C; EU-Programme (Horizon, Erasmus+)','Die Schweiz m&ouml;chte sich an EU-Programmen wie Horizon Europe und Erasmus+ assoziieren. Der Zugang ist an politische Bedingungen gekn&uuml;pft und war zeitweise eingeschr&auml;nkt.','EU-Programme (Horizon, Erasmus+)'],
  ['weltraum.html','Weltraum','Weiteres Abkommen','&#x1F6F0;&#xFE0F; Weltraum','Das Weltraumabkommen er&ouml;ffnet der Schweiz die Teilnahme an europ&auml;ischen Raumfahrtprogrammen wie Copernicus und Galileo &ndash; mit wirtschaftlicher und sicherheitspolitischer Relevanz.','Weltraum'],
  ['schweizer-beitrag.html','Schweizer Beitrag (Kohäsion)','Weiteres Abkommen','&#x1F91D; Schweizer Beitrag (Koh&auml;sion)','Der Schweizer Beitrag an die EU-Koh&auml;sion ist Teil des Pakets &ndash; die Schweiz zahlt f&uuml;r den Abbau wirtschaftlicher Ungleichgewichte in der EU. Ein politisch heikles Dossier.','Schweizer Beitrag (Koh&auml;sion)'],
  ['strom.html','Stromabkommen','Weiterentwicklung','&#x26A1; Stromabkommen','Das Stromabkommen regelt den Zugang der Schweiz zum europ&auml;ischen Energiebinnenmarkt. Es geht um Versorgungssicherheit, Marktregeln und die Frage der Energiehoheit.','Stromabkommen'],
  ['lebensmittelsicherheit.html','Lebensmittelsicherheit','Weiterentwicklung','&#x1F957; Lebensmittelsicherheit','Das Abkommen &uuml;ber Lebensmittelsicherheit harmonisiert Schweizer und EU-Standards &ndash; vom Cassis-de-Dijon-Prinzip bis zur Kennzeichnung. Mit direkten Auswirkungen f&uuml;r Konsumenten.','Lebensmittelsicherheit'],
  ['gesundheit.html','Gesundheit','Weiterentwicklung','&#x1F3E5; Gesundheit','Das Gesundheitsabkommen betrifft die Zusammenarbeit bei Arzneimittelzulassung, Swissmedic vs. EMA und die Harmonisierung des Gesundheitsrechts.','Gesundheit'],
  ['querschnitt.html','Querschnittsthemen','Systemfragen','&#x2696;&#xFE0F; Querschnittsthemen','Hinter den einzelnen Vertr&auml;gen stehen systemische Fragen, die das gesamte Paket pr&auml;gen: Wie werden Streitigkeiten gel&ouml;st? Wie viel Rechts&uuml;bernahme ist akzeptabel? Was bedeutet das f&uuml;r die direkte Demokratie?','Querschnittsthemen'],
  ['finanzen.html','Finanzen & Kohäsion','Finanzen','&#x1F4B0; Finanzen &amp; Koh&auml;sion','Das Paket hat eine finanzielle Dimension, die oft untergeht: Koh&auml;sionsbeitr&auml;ge, Marktzugangspramien und die Frage, ob die Schweiz f&uuml;r den Binnenmarktzugang netto zahlt oder profitiert.','Finanzen &amp; Koh&auml;sion'],
  ['binnenmarkt.html','Binnenmarkt & technische Vorschriften','Vertrag','&#x1F3ED; Binnenmarkt &amp; technische Vorschriften','Das Abkommen &uuml;ber die gegenseitige Anerkennung technischer Vorschriften (MRA) erm&ouml;glicht Schweizer Unternehmen den Marktzugang zur EU ohne doppelte Zertifizierung.','Binnenmarkt &amp; technische Vorschriften'],
  ['forschung.html','Forschung / Horizon','Vertrag','&#x1F52C; Forschung / Horizon','Die Assoziierung der Schweiz an das EU-Forschungsprogramm Horizon Europe ist f&uuml;r Universit&auml;ten und Forschungsinstitute existenziell wichtig &ndash; und an politische Bedingungen gekn&uuml;pft.','Forschung / Horizon'],
];

for (const [filename, shortTitle, label, h1, lead, breadcrumb] of pages) {
  const filepath = path.join(BASE, filename);
  fs.writeFileSync(filepath, gen(shortTitle, label, h1, lead, breadcrumb), 'utf8');
  console.log('Written:', filename);
}
console.log('Done.');
