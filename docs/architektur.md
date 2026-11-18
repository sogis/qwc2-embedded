# Architekturprüfung E0

Referenzen: wgc-embedded `42baa98`, sogis-qwc2-app (2026-lts) `fc0e440`, qgis/qwc2 (2026-lts) `8a1eb79`, qwc2-e2e-tests `15ccedb`. Der Kartenkatalog bezieht Konfiguration, Ebenendefinitionen und Kartendienste live von geo.so.ch. Dessen feste Upstream-Adressen, anonymen Requests und explizite Endpunktfreigabe genügen auch hier. Der Java-Katalog, die Suche und der Entwicklungsproxy entfallen.

## Machbarkeitsnachweis und Varianten

- **A, fertiges Image.** Registry-Tags `v2026.13-lts` bis `v2026.15-lts` sind Linux/amd64. Für Chromium wurden die Webdateien aus `sourcepole/sogis-map-viewer:v2026.15-lts@sha256:81baa4ed02cf3a8379d4b3d171b8699c95ac381db5278699242cacaed3861ae5` unter `/qwc2` extrahiert. Sie enthalten `assets`, `dist`, `translations`, HTML und Basiskonfiguration. Das Original-HTML startet Matomo. Eine eigene HTML-Seite lieferte die Assets unter dem Embed-Pfad mit Live-Konfiguration und nur Map/Identify aus. Die vom Bootstrap vorgesehene Markierung `config:autologin=1` übersprang `/auth/info` und wurde anschliessend entfernt. Chromium lud Orthofoto-Kacheln, das dynamische WMS der Erdwärmesonden und dessen HTML-Resultat. Grundstücks-Identify erzeugte aus `featurereport` einen Objektblatt-Link.
- **Grenze von A.** Mit dem externen WMS aus dem Alt-README stellte Chromium erfolgreich `GetMap` dar. Beim Klick stellte derselbe Build zudem eine externe `GetFeatureInfo`-Anfrage und übernahm deren Ergebnis in die Identify-Ansicht. Der Stock-Restorer übernimmt `queryable` aus Capabilities. Identify hat gemäss Quellcode keine Einstellung, um externe Ebenen auszuschliessen. Der Restorer setzt ausserdem lesbare Capabilities (XHR/CORS) voraus, während der Vorgänger externe WMS direkt als Bildquelle verwendet. Die URL-Rückgabe im Prototyp ergänzte beim externen Endpunkt `?&`. Ein Umbau der externen Ebenen als künstliche Theme-Layer oder Manipulation des fertigen Bundles würde über eine kleine Konfigurationsanpassung hinausgehen.
- **B, Minimal-Build.** Vorschlag für das Gate. `qwc2-lts@2026.0.30` entspricht der Abhängigkeit der SO!GIS-Referenz. Ein kleiner Bootstrap registriert Map und Identify sowie den vorhandenen SO!GIS-Restorer. Der QWC2-Hook `externalLayerRestorer` liefert aus `wms:URL#Layer` eine normale, nicht abfragbare QWC2-WMS-Definition an die vorhandene Ebenenverwaltung. Das erhält bildbasierte WMS-Anfragen ohne Capabilities. Es setzt weder Änderungen am QWC2-Code noch einen allgemeinen WMS-Proxy voraus. Die HTML-Einstiegsseite enthält den Vollkartenlink. Ein Node-Server liefert gebaute Dateien und adaptiert die öffentliche Live-Konfiguration. Die erlaubten SO!GIS-Lesedienste werden unter dem Embed-Präfix anonym weitergeleitet.
- **Grösse.** Das Image startet mit 5'643'689 Byte JavaScript (gzip lokal 1'549'569 Byte). Die drei Hauptdateien aus dem alten Viewer messen zusammen 1'052'540 Byte unkomprimiert. Einschliesslich des vom Loader geladenen GWT-Moduls sind es 1'102'953 Byte. Die Grösse ist kein eigenständiges Ausschlusskriterium für A.

## Paritätsmatrix

| Status im Vorgänger | Verhalten | Zielprüfung |
| --- | --- | --- |
| Dokumentiert und implementiert | Öffentlicher Einstieg `/api/embed/v2/index.html`, drei WMTS-Karten `sw`, `farbig`, `ortho` mit Titeln `ch.so.agi.hintergrundkarte_*` | Dieselbe Browseradresse, alle drei Kachelsätze. QWC2 verwendet die kurze Kennung. |
| Dokumentiert und implementiert | `l`: Listeneinträge werden unten nach oben gezeichnet, `[n]` ist Prozent Transparenz, `!` blendet aus | Reihenfolge in WMS und URL, tatsächliche Transparenz, ausgeblendete Ebene bleibt in URL. |
| Dokumentiert und implementiert | `wms:URL#Layer` lädt direkt ein WMS-1.3.0-Bild. Kein Identify. `&` im externen Endpunkt ist ausgeschlossen. | Reale Antwort des README-WMS, direkter Bildrequest, kein externer Identify, unveränderte URL nach Bewegung. |
| Dokumentiert und implementiert | `c` und `s` sind unabhängig. Zentrum 2616500,1237000 und Auflösung 100 m/px sind Defaults. `ViewManager` rechnet mit 3780 px/m. | Start, beide Kombinationen einzelner Werte, beide Werte gemeinsam, sowie einen Zwischenmassstab anhand realer WMS-BBOX prüfen. |
| Implementiert und produktiv beobachtet | URL-Aktualisierung bei Kartenbewegung, Zustandsübernahme für Vollkarte | Pan/Zoom und tatsächlich geöffneten Link im Browser prüfen. |
| Implementiert | Sichtbare interne Layer bei Klick, mehrere HTML-Ergebnisse und Objektblatt per `featurereport` | Dynamisches Grundstückslayer, Layerüberschrift, HTML-Inhalt, PDF-Ziel, schliessen, kleines iframe. |
| Implementiert, ohne aktive Auswirkung | Parser liest `z`, aber MapComponent hat keinen aktiven Subscriber | `z` ist historisch. |
| Historisch/auskommentiert | `z`-Schreiblogik sowie früherer Link mit Favicon-Ressource | Aktuellen Textlink verwenden. |
| Bekannte Einschränkung | Ohne `bl` blieb die alte produktive Karte leer. Der Vollkartenlink konnte ohne initiale Kartenbewegung auf `undefined` zeigen. | Graue Live-Standardkarte und von Beginn an verwendbarer Vollkartenlink. |
| Bekannte Einschränkung | Identify des Vorgängers zählt nur `HtmlContent`; Live-Format und Layout der XML-Antwort haben sich geändert. | Reale HTML-Antwort durch QWC2 anzeigen und Layernamen/Reports prüfen. |

Die alten `config*.json`-Varianten wechseln WMS/WMTS/Identify/Dokument- und Vollkarten-Hosts zwischen den Umgebungen. Dieses Projekt nutzt die produktiven öffentlichen Dienste. Das Default-Thema enthält derzeit keine fachlichen Sublayer. Der Solothurn-Restorer liest sie bei Bedarf über `weblayers?filter=…`.

## Phasenreviews

Alle Reviews laufen unabhängig mit OpenCode 2.0.28 und `deepseek/deepseek-flash` am angegebenen Commit.

| Phase | Commit | Ergebnis |
| --- | --- | --- |
| E0 | `1cd60a663847f015f61dcde83c4535754d96ca3c` | **PASS.** Die unabhängigen Browserproben bestätigten externe Identify-Anfragen und die veränderte externe URL beim fertigen Image. Der Review verlangte eine feste Proxy-Allowlist, den Callback mit der Platzhalter-ID und die Legacy-Startwerte im Bootstrap. |
