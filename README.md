# QWC2 Embedded

Anonymer SO!GIS-Kartenviewer für iframes. Der Einstieg bleibt `/api/embed/v2/index.html`.

## Lokal starten

```sh
docker compose up -d --build
```

Die Karte ist unter `http://localhost:8080/api/embed/v2/index.html` erreichbar. Mit `EMBED_PORT=8081` lässt sich der lokale Port wechseln. Der Container benötigt ausgehenden HTTPS-Zugriff auf `geo.so.ch`.

```html
<iframe
  title="SO!GIS-Karte"
  src="http://localhost:8080/api/embed/v2/index.html?bl=ch.so.agi.hintergrundkarte_ortho&amp;l=ch.so.agi.av.grundstuecke&amp;c=2607739,1228426&amp;s=2000"
  width="600" height="390">
</iframe>
```

## URL-Parameter

| Parameter | Funktion |
| --- | --- |
| `bl` | Hintergrundkarte `ch.so.agi.hintergrundkarte_sw`, `ch.so.agi.hintergrundkarte_farbig` oder `ch.so.agi.hintergrundkarte_ortho`. QWC2 akzeptiert auch die Kennungen ohne `ch.so.agi.`. Standard ist die graue Karte. |
| `l` | WMS-Layer von unten nach oben, durch Kommas getrennt. `layer[50]` bedeutet 50 % Transparenz. `layer!` bleibt in der URL und ist unsichtbar. Externe Layer verwenden `wms:URL#Layer`, etwa `wms%3Ahttps%3A%2F%2Fwfs.geodienste.ch%2Fav_0%2Fdeu%23Hoheitsgrenzen%5B35%5D`. `&` ist in externen Endpunkten auch kodiert ausgeschlossen. |
| `c` | Mittelpunkt in EPSG:2056, standardmässig `2616500,1237000`. |
| `s` | Massstabsnenner, standardmässig `378000`. Ein gesetztes `c` oder `s` wirkt unabhängig vom jeweils anderen Wert. |

QWC2 aktualisiert die URL bei Kartenbewegungen. **In geo.so.ch/map ansehen** überträgt den Ausschnitt und die Ebenen. Ein Kartenklick fragt die sichtbaren, abfragbaren SO!GIS-Ebenen ab. Im kleinen iframe sind längere Ergebnisse scrollbar. Objektblätter des SO!GIS-Dokumentdiensts werden als PDF heruntergeladen.

Der historische Parameter `z` hatte im Vorgänger keine aktive Wirkung. Externe WMS müssen direkt vom Browser als WMS-1.3.0-Kartenbild für EPSG:2056 erreichbar sein. Identify und Capabilities-Anfragen entfallen für externe WMS. In einem HTTPS-iframe kann der Browser einen HTTP-Bildendpunkt auf HTTPS umstellen oder blockieren.

## Entwicklung und Tests

```sh
npm ci
npx playwright install chromium --only-shell
npm test
```

Die Tests erwarten den laufenden Container. `EMBED_ORIGIN=http://localhost:8081 npm test` wählt einen anderen Port. Für die Entwicklung ohne Docker stehen unter Node.js 22 `npm run build` und `npm start` zur Verfügung. Der Server liest den Port aus `PORT`.

Die Tests nutzen Live-Kartenbilder, dynamische Layer, den Geodienste-WMS, Identify und den PDF-Dienst. Sie prüfen zudem die fremde iframe-Origin, den Vollkartenlink, abgewiesene Proxy-Anfragen und simulierte Konfigurationsausfälle. Ausfälle der öffentlichen Dienste können Live-Tests fehlschlagen lassen.

## Integration

Der einzelne Container bündelt `qwc2-lts` mit Map und Identify. Er passt die öffentliche Konfiguration zur Laufzeit an und leitet nur die benötigten Lesepfade an `https://geo.so.ch` weiter. Browser-Cookies und Authorization-Header werden upstream verworfen. Die [Architekturentscheidung und Phasenreviews](docs/architektur.md) dokumentieren den Vergleich mit dem veröffentlichten SO!GIS-Image.

Bei einer späteren Umschaltung muss der HTTPS-Ingress den **gesamten** Präfix `/api/embed/v2/` unverändert an den Dienst weiterleiten. Für nginx lautet die Regel beispielsweise:

```nginx
location ^~ /api/embed/v2/ {
    proxy_pass http://embed:8080;
}
```

Die Route erlaubt fremde iframe-Origins über `frame-ancestors *`. Ein vom Ingress ergänztes `X-Frame-Options` oder restriktiveres `frame-ancestors` kann solche Einbettungen blockieren. Ein `sandbox`-Attribut auf dem iframe muss Skripte und die eigene Origin zulassen. Für den Vollkartenlink und den PDF-Download muss es auch Popups beziehungsweise Downloads zulassen.
