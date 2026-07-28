# TrailForge

Routenplaner für **Wandern, Laufen, Rennrad und Mountainbike** auf OpenStreetMap-Basis.

Statt nur Start und Ziel wählt man eine _Präferenz_ — **kürzeste**, **schnellste**, **schönste** oder **ruhigste** Route — und bekommt eine dazu passende Strecke mit Höhenprofil, Oberflächen- und Verkehrs-Kennzahlen sowie GPX-Download.

## Status

In Entwicklung. Siehe [Meilensteine](#meilensteine).

## Datenquellen

Alle genutzten Dienste sind kostenlos und benötigen — bis auf OpenRouteService — keinen API-Key.

| Zweck                | Quelle                                                            |
| -------------------- | ----------------------------------------------------------------- |
| Routing              | [BRouter](https://brouter.de/brouter)                             |
| Rundtouren           | [OpenRouteService](https://openrouteservice.org) (freier Key)     |
| Backup-Engine, Höhen | [Valhalla (FOSSGIS)](https://valhalla1.openstreetmap.de)          |
| Basiskarte           | [OpenFreeMap](https://openfreemap.org)                            |
| Hillshade / Terrain  | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) |
| Wege-Overlay         | [Waymarked Trails](https://waymarkedtrails.org)                   |
| Ortssuche            | [Photon](https://photon.komoot.io)                                |

Kartendaten © [OpenStreetMap](https://www.openstreetmap.org/copyright)-Mitwirkende, ODbL.

## Entwicklung

```bash
pnpm install
pnpm dev
```

Weitere Skripte:

```bash
pnpm test        # Unit-Tests (offline, mit Fixtures)
pnpm test:live   # Contract-Tests gegen die echten APIs
pnpm typecheck
pnpm lint
```

## Aufbau

```
apps/web        Next.js-App (UI + API-Proxy)
packages/core   Routing-Adapter, Metriken, Ranking, GPX — plattformunabhängig
```

`packages/core` enthält keine Browser- oder Node-spezifischen APIs, damit eine spätere iOS-App
dieselbe Logik unverändert verwenden kann.

## Meilensteine

- [x] M0 Repo, Monorepo, Tooling, CI
- [ ] M1 `packages/core`: Routing, Metriken, Ranking, GPX
- [ ] M2 Web-Gerüst: Design-Tokens, i18n, App-Shell
- [ ] M3 Karte und Wegpunkt-Interaktion
- [ ] M4 Routing-Flow und Höhenprofil
- [ ] M5 GPX-Export, Alternativen, teilbare Links
- [ ] M6 Politur, Barrierefreiheit, E2E-Tests
- [ ] M7 Deployment und Dokumentation

## Lizenz

MIT
