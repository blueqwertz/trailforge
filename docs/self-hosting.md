# Eigener BRouter

Für den Dauerbetrieb sollte TrailForge nicht gegen `brouter.de` laufen. Der
Dienst wird ehrenamtlich betrieben, und eine Nutzeranfrage erzeugt dort bis zu
vier Routenberechnungen. Ein eigener BRouter kostet einen kleinen Server und
nimmt gleichzeitig die Antwortzeit deutlich herunter.

## Was BRouter braucht

BRouter rechnet auf vorbereiteten Kacheln, den `.rd5`-Segmenten. Ein Segment
deckt 5° × 5° ab und ist je nach Region 30 bis 300 MB groß. Für Deutschland,
Österreich und die Schweiz genügen wenige Dateien; weltweit sind es etwa 60 GB.

Die Segmente liegen unter <https://brouter.de/brouter/segments4/> zum Herunterladen
bereit. Die Dateinamen folgen der Süd-West-Ecke, `E5_N45.rd5` deckt also den
Alpenraum ab.

## Mit Docker

```bash
mkdir -p brouter/segments4 brouter/profiles2

# Alpenraum und südliches Deutschland
curl -o brouter/segments4/E5_N45.rd5  https://brouter.de/brouter/segments4/E5_N45.rd5
curl -o brouter/segments4/E10_N45.rd5 https://brouter.de/brouter/segments4/E10_N45.rd5

# Die Profile, die TrailForge verwendet
for p in trekking fastbike fastbike-lowtraffic fastbike-verylowtraffic \
         racebike-verylowtraffic shortest hiking-beta hiking-mountain \
         mtb MTB_SB_light gravel; do
  curl -o "brouter/profiles2/$p.brf" "https://brouter.de/brouter/profiles2/$p.brf"
done

docker run -d --name brouter -p 17777:17777 \
  -v "$PWD/brouter/segments4:/segments4" \
  -v "$PWD/brouter/profiles2:/profiles2" \
  ghcr.io/abrensch/brouter:latest
```

Danach antwortet der eigene Dienst unter `http://localhost:17777/brouter`.

## In TrailForge einstellen

Der Adapter nimmt die Basisadresse entgegen; sie wird über eine
Umgebungsvariable gesetzt:

```bash
BROUTER_BASE_URL=http://localhost:17777/brouter
```

Ohne diese Variable bleibt es bei `https://brouter.de/brouter`.

## Segmente aktuell halten

Die Segmente werden regelmäßig neu erzeugt. Ein wöchentlicher Abgleich genügt:

```bash
curl -z brouter/segments4/E5_N45.rd5 -o brouter/segments4/E5_N45.rd5 \
  https://brouter.de/brouter/segments4/E5_N45.rd5
```

`-z` lädt nur, wenn die Datei auf dem Server neuer ist. BRouter erkennt geänderte
Segmente im laufenden Betrieb.

## Profile prüfen

Nach einem Wechsel auf eigene Profile sollte die Fähigkeitstabelle neu erzeugt
werden, damit TrailForge keine Parameter schickt, die es dort nicht gibt:

```bash
pnpm --filter @trailforge/core profiles:sync
pnpm test
```
