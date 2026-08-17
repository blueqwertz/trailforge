# TrailForge

Routenplaner für **Wandern, Laufen, Rennrad und Mountainbike** auf OpenStreetMap-Basis.

Statt nur Start und Ziel wählt man eine _Präferenz_ — **kürzeste**, **schnellste**, **schönste** oder **ruhigste** Route — und bekommt eine dazu passende Strecke mit Höhenprofil, Oberflächen- und Verkehrs-Kennzahlen sowie GPX-Download.

```
pnpm install
pnpm dev
```

## Wie die Präferenz funktioniert

Der interessante Teil steckt nicht im Routing, sondern davor und danach.

**Davor** wird jede Kombination aus Sportart und Präferenz auf mehrere konkrete
BRouter-Anfragen abgebildet: verschiedene Profile, verschiedene Parameter,
verschiedene Ausweichrouten. BRouter hat für jeden Weg Wald-, Fluss-, Lärm- und
Verkehrsklassen vorberechnet, die sich über Parameter wie `consider_forest` oder
`avoid_unsafe` gewichten lassen. Welches Profil welchen Schalter kennt, ist
nicht einheitlich — `trekking` kennt 30, das ältere `hiking-beta` benennt
dieselben Ideen anders. Deshalb wird die Fähigkeitstabelle aus den echten
Profildateien erzeugt (`pnpm --filter @trailforge/core profiles:sync`) und kein
Parameter geschickt, den ein Profil nicht auswerten kann.

**Danach** werden die Kandidaten gemessen. Jede BRouter-Antwort enthält zu jedem
Wegstück dessen OSM-Tags. Daraus entstehen ohne einen einzigen weiteren
Netzwerkaufruf: Oberflächen-Mix, Verkehrsbelastung, Anteil an Naturwegen, Anteil
an ausgeschilderten Routen, Steigungsverteilung und Schwierigkeit. Erst diese
Zahlen entscheiden, welcher Kandidat gewinnt — und sie stehen im Bedienfeld, wo
sich nachsehen lässt, ob „ruhigste" tatsächlich weniger Verkehr bedeutet.

Zwei Regeln haben sich beim Messen als notwendig erwiesen:

- **Die Zeit wird selbst geschätzt.** BRouters Fahrzeit stammt aus dem
  kinematischen Modell des jeweiligen Profils. Für dieselben zwei Punkte meldet
  `shortest` 251 Minuten und `trekking` 64 — ein Vergleich wäre unsinnig.
  Stattdessen rechnet ein Modell für alle Kandidaten: Tobler zu Fuß,
  exponentiell auf dem Rad, jeweils mit Untergrund- und Steigungsfaktor.
- **Eignung ist keine Abwägung.** Die ruhigste Rennradroute führte anfangs zu
  37 Prozent über Feldwege, weil dort kein Verkehr ist. Kandidaten mit mehr als
  20 Prozent unbefestigtem Anteil fallen für das Rennrad deshalb heraus, nicht
  ins Gewicht.

## Datenquellen

Alle genutzten Dienste sind kostenlos und benötigen keinen API-Schlüssel.

| Zweck               | Quelle                                                            |
| ------------------- | ----------------------------------------------------------------- |
| Routing             | [BRouter](https://brouter.de/brouter)                             |
| Basiskarte          | [OpenFreeMap](https://openfreemap.org)                            |
| Hillshade / Terrain | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) |
| Wege-Overlay        | [Waymarked Trails](https://waymarkedtrails.org)                   |

Kartendaten © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende, ODbL.

### Fairer Umgang

`brouter.de` wird ehrenamtlich betrieben, und eine Anfrage der Oberfläche löst
bis zu vier Anfragen dorthin aus. Deshalb: alle Aufrufe laufen serverseitig über
`/api/route`, werden eine Stunde lang zwischengespeichert (Schlüssel sind die
auf einen Meter gerundeten Wegpunkte), sind pro Absender begrenzt und tragen
einen sprechenden User-Agent. Für den Dauerbetrieb gehört ein eigener
BRouter dahinter — siehe [docs/self-hosting.md](docs/self-hosting.md).

## Aufbau

```
apps/web        Next.js-App: Oberfläche und Routing-Proxy
packages/core   Routing-Adapter, Metriken, Ranking, GPX — plattformunabhängig
```

`packages/core` enthält keine Browser- oder Node-spezifischen APIs und wird als
TypeScript-Quelle eingebunden. Eine spätere iOS-App kann dieselbe Logik
unverändert verwenden und gegen denselben Endpunkt sprechen.

## Entwicklung

```bash
pnpm dev          # Entwicklungsserver
pnpm test         # Unit-Tests, offline mit echten BRouter-Antworten als Fixtures
pnpm typecheck
pnpm lint
```

Zwei Testarten laufen bewusst **nicht** in der CI, weil sie die freiwillig
betriebenen Dienste belasten:

```bash
pnpm test:live                        # Contract-Tests gegen brouter.de
pnpm --filter @trailforge/web test:e2e # Playwright gegen den Produktionsbau
```

Die Live-Tests beantworten die Frage, die Fixtures nicht beantworten können: Hat
sich die API verändert — und bewirkt die Präferenz noch etwas? Sie prüfen unter
anderem, dass die ruhigste Route messbar weniger Verkehr hat als die schnellste.

## Deployment

Die App läuft ohne Datenbank und ohne Konten; der Zustand steht in der
Adresszeile. Für Vercel genügt:

```bash
vercel --cwd apps/web
```

Wichtig dabei: der Zwischenspeicher und die Zugriffsbremse halten ihren Zustand
im Arbeitsspeicher und gelten damit je Instanz. Für mehr als eine Instanz gehört
dort ein gemeinsamer Speicher hin — und spätestens dann ein eigener BRouter.

## Lizenz

MIT
