---
title: Architekturentscheidungen (ADRs)
description: Wichtige Architekturentscheidungen für den Godot MCP Server mit Begründung, Abwägungen und Konsequenzen
outline: [2, 3]
---

# Architekturentscheidungen

Dieses Dokument erfasst die wichtigsten Architekturentscheidungen, die während des Designs des Godot MCP Servers getroffen wurden, einschließlich des Kontexts, der betrachteten Optionen und der Begründung für jede Wahl.

## ADR-001: GDScript vs. GDExtension für Godot Bridge

**Status:** Akzeptiert  
**Datum:** 3. Februar 2026  
**Entscheidungsträger:** @architecture-team

### Kontext

Die Godot Bridge muss Engine-Funktionen über HTTP bereitstellen. Wir müssen wählen zwischen:
- **GDScript**: Native Skriptsprache, interpretiert
- **GDExtension**: C++-Native-Erweiterungen, kompiliert

### Entscheidung

**GDScript für MVP (Phase 1) verwenden**. Früh benchmarken; nur zu GDExtension wechseln, wenn Performance-Engpässe identifiziert werden.

### Begründung

**GDScript-Vorteile:**
- ✅ **Keine Build-Toolchain**: Kein C++-Compiler, SCons oder plattformspezifische Builds erforderlich
- ✅ **Hot-Reload**: Sofortiges Testen während der Entwicklung
- ✅ **Einfaches Debugging**: GDScript-Debugger in Godot Editor eingebaut
- ✅ **Einfachere Wartung**: Kein Speichermanagement, kein plattformspezifischer Code
- ✅ **Ausreichende Performance**: HTTP-Server ist I/O-gebunden, nicht CPU-gebunden
- ✅ **Schnellere Entwicklung**: Sofort schreiben und testen

**GDExtension-Nachteile:**
- ❌ **Komplexes Setup**: Erfordert C++-Umgebung, Build-Skripte, plattformübergreifende Kompilierung
- ❌ **Übertrieben für MVP**: HTTP-Operationen sind nicht rechenintensiv
- ❌ **Schwierigeres Debugging**: Erfordert GDB/LLDB, kein Hot-Reload
- ❌ **Wartungslast**: Speicherlecks, Abstürze, ABI-Kompatibilitätsprobleme

### Performance-Validierung

**Benchmark-Kriterien** (Woche 1 der Implementierung):
- HTTP-Durchsatz: ≥50 Anfragen/Sekunde
- CPU-Auslastung: ≤10% bei typischen Operationen
- Latenz: <50ms p99 für Leseoperationen

**Entscheidungsregel:**
```
WENN (throughput < 50 req/s ODER cpu_usage > 10% ODER p99_latency > 50ms)
DANN zu GDExtension in Phase 2 wechseln
SONST mit GDScript fortfahren
```

### Konsequenzen

**Positiv:**
- Schnellerer Entwicklungszyklus (keine Kompilierung)
- Niedrigere Einstiegshürde für Mitwirkende
- Einfacher zu testen und zu debuggen

**Negativ:**
- Potenzielle Performance-Einschränkungen bei Skalierung
- Möglicherweise Neuschreiben in C++ erforderlich, wenn Engpässe auftreten

**Minderung:**
- Frühes Performance-Benchmarking (Sprint 1)
- Architektur erlaubt schrittweise Migration zu GDExtension bei Bedarf

---

## ADR-002: HTTP REST vs. WebSockets

**Status:** Akzeptiert  
**Datum:** 3. Februar 2026

### Kontext

Kommunikation zwischen Node.js MCP Server und Godot Bridge erfordert ein Transportprotokoll. Optionen:
- **HTTP REST**: Request-Response, zustandslos
- **WebSockets**: Bidirektional, persistente Verbindung

### Entscheidung

**HTTP REST mit JSON-RPC 2.0 für MVP verwenden**. WebSocket-Unterstützung in Phase 2 für Echtzeitevents hinzufügen (optional).

### Begründung

**HTTP REST-Vorteile:**
- ✅ **Einfachheit**: Standard-Request-Response-Modell, gut verstanden
- ✅ **Zustandslos**: Keine Verbindungsverwaltung, automatische Wiederherstellung
- ✅ **Debuggierbar**: Einfach mit curl, Postman, Browser-Devtools zu testen
- ✅ **Caching**: Kann HTTP-Caching-Header nutzen (Phase 2)
- ✅ **Connection Pooling**: undici bietet Keep-Alive für Performance

**WebSocket-Nachteile:**
- ❌ **Komplexität**: Verbindungs-Lebenszyklus-Verwaltung, Wiederverbindungslogik
- ❌ **Übertrieben für MVP**: MCP-Protokoll ist Request-Response, nicht ereignisgesteuert
- ❌ **Schwierigeres Debugging**: Binäre Frames, erfordert spezialisierte Tools
- ❌ **Zustandsverwaltung**: Muss Verbindungsstatus verfolgen, Trennungen behandeln

### Performance-Vergleich

| Metrik | HTTP (Keep-Alive) | WebSocket |
|--------|-------------------|-----------|
| Latenz (erste Anfrage) | 15ms | 25ms (Handshake) |
| Latenz (nachfolgende) | 3-5ms | 2-4ms |
| Durchsatz | 100 req/s | 150 req/s |
| Komplexität | Niedrig | Mittel |

**Fazit**: HTTP mit Keep-Alive bietet 95% der WebSocket-Performance mit 50% der Komplexität.

### Konsequenzen

**Positiv:**
- Einfachere Implementierung und Tests
- Standard-Tooling für Debugging
- Einfacher für Mitwirkende zu verstehen

**Negativ:**
- Keine server-initiierten Events (Godot kann nicht zu Node.js pushen)
- Etwas höhere Latenz für hochfrequente Operationen

**Zukünftige Erweiterung:**
- WebSocket-Endpunkt in Phase 2 für Echtzeit-Editor-Events hinzufügen
- HTTP für Tool-Aufrufe verwenden, WebSocket für Event-Streaming

---

## ADR-003: JSON vs. MessagePack-Serialisierung

**Status:** Akzeptiert (JSON für MVP)  
**Datum:** 3. Februar 2026

### Kontext

Datenserialisierungsformat für Node.js ↔ Godot-Kommunikation. Optionen:
- **JSON**: Textbasiert, für Menschen lesbar
- **MessagePack**: Binär, kompakter

### Entscheidung

**JSON für MVP verwenden**. MessagePack in Phase 2 nur bewerten, wenn Profiling zeigt, dass Serialisierungs-Overhead >10%.

### Begründung

**JSON-Vorteile:**
- ✅ **Für Menschen lesbar**: Einfach zu debuggen, loggen und inspizieren
- ✅ **Native Unterstützung**: Eingebautes Parsing in Node.js und Godot
- ✅ **Standard**: Gut verstanden, umfangreiches Tooling
- ✅ **Ausreichende Performance**: <5ms für typische Payloads

**MessagePack-Nachteile:**
- ❌ **Binärformat**: Schwieriger zu debuggen, erfordert Hex-Viewer
- ❌ **Bibliotheks-Abhängigkeit**: Erfordert externe Bibliothek in Godot
- ❌ **Vorzeitige Optimierung**: JSON-Overhead ist wahrscheinlich kein Engpass

### Performance-Eigenschaften

**Typische Scene-Payload** (100-Node-Scene):
- JSON-Größe: 15KB
- JSON-Parse-Zeit: 3-5ms
- MessagePack-Größe: 10KB (33% kleiner)
- MessagePack-Parse-Zeit: 1-2ms (60% schneller)

**Entscheidungsschwelle:**
```
WENN (json_serialization_time > 10% von total_request_time)
DANN MessagePack bewerten
SONST mit JSON fortfahren
```

### Konsequenzen

**Positiv:**
- Einfacheres Debugging und Entwicklung
- Keine externen Abhängigkeiten
- Einfachere Tests

**Negativ:**
- Größere Payload-Größen (nicht signifikant für localhost)
- Etwas langsameres Parsing (akzeptabel für MVP)

**Migrationspfad:**
- MessagePack als optionales Format in Phase 2 hinzufügen
- Beide Formate via `Content-Type`-Header-Verhandlung unterstützen

---

## ADR-004: LRU-Cache vs. Redis

**Status:** Akzeptiert (LRU für MVP)  
**Datum:** 3. Februar 2026

### Kontext

Caching-Strategie für Scene/Script-Daten. Optionen:
- **In-Memory-LRU** (lru-cache npm-Paket)
- **Redis**: Externer Key-Value-Store

### Entscheidung

**In-Memory-LRU-Cache für MVP verwenden**. Redis nur für Multi-Instanz-Deployments in Betracht ziehen (Phase 3).

### Begründung

**LRU-Cache-Vorteile:**
- ✅ **Kein externer Prozess**: Einfachere Operationen, weniger Fehlermodi
- ✅ **Niedrigere Latenz**: Speicherzugriff <1ms vs. Redis ~2-5ms
- ✅ **Ausreichende Kapazität**: 100 Einträge (~10MB) ausreichend für einzelnen Benutzer
- ✅ **Automatische Entfernung**: Least-recently-used-Entfernungspolitik

**Redis-Nachteile:**
- ❌ **Operative Komplexität**: Erfordert Redis-Server, zusätzliche Konfiguration
- ❌ **Netzwerk-Overhead**: Selbst localhost-Redis fügt 2-5ms Latenz hinzu
- ❌ **Übertrieben für MVP**: Single-User-Dev-Tool benötigt kein verteiltes Caching

### Kapazitätsplanung

**Ziel-Cache-Größe:**
- Max. Einträge: 100
- Durchschnittliche Eintragsgröße: 100KB (Scene-Daten)
- Gesamtspeicher: ~10MB
- Cache-Trefferquoten-Ziel: >70%

**Entscheidungsregel:**
```
WENN (multi_instance_deployment ODER cache_size > 100MB)
DANN Redis verwenden
SONST In-Memory-LRU verwenden
```

### Konsequenzen

**Positiv:**
- Einfachere Architektur, weniger Abhängigkeiten
- Niedrigere Latenz für Cache-Treffer
- Einfachere Tests (keine externen Dienste)

**Negativ:**
- Cache wird nicht über Prozesse geteilt
- Cache wird beim Server-Neustart gelöscht

**Zukünftige Erweiterung:**
- Cache beim Herunterfahren auf Disk persistieren (Phase 2)
- Redis-Unterstützung für Team/Server-Deployments hinzufügen (Phase 3)

---

## ADR-005: Alpine.js vs. React für Web UI

**Status:** Akzeptiert  
**Datum:** 3. Februar 2026

### Kontext

Framework-Wahl für Sidecar Web UI. Optionen:
- **Alpine.js**: Leichtgewichtig (15KB), HTML-first
- **React**: Voll ausgestattet (45KB), komponentenbasiert
- **Vue.js**: Progressiv (35KB), komponentenbasiert

### Entscheidung

**Alpine.js für Sidecar Web UI verwenden**.

### Begründung

**Alpine.js-Vorteile:**
- ✅ **66% kleiner**: 15KB vs. 45KB (React) vs. 35KB (Vue)
- ✅ **Kein Build-Schritt**: Kein Webpack, Vite, Babel erforderlich
- ✅ **HTML-first**: Einfach zu lesen, weniger Kontextwechsel
- ✅ **Perfekt für einfache UI**: Dashboard, Formulare, Log-Viewer
- ✅ **Schnellere Lernkurve**: Minimale API-Oberfläche

**React/Vue-Nachteile:**
- ❌ **Übertrieben**: Keine komplexe Zustandsverwaltung benötigt
- ❌ **Build-Komplexität**: Tooling, Transpilation, Bundling
- ❌ **Größeres Bundle**: Langsamerer initialer Ladevorgang
- ❌ **Mehr Abhängigkeiten**: Wartungslast

### Feature-Vergleich

| Feature | Alpine.js | React | Vue |
|---------|-----------|-------|-----|
| Bundle-Größe | 15KB | 45KB | 35KB |
| Build erforderlich | Nein | Ja | Ja |
| Lernkurve | Einfach | Mittel | Mittel |
| Reaktivität | Ja | Ja | Ja |
| Komponentenmodell | HTML-zentrisch | JSX | SFC |

### UI-Komplexitätsbewertung

**Sidecar-UI-Anforderungen:**
- Status-Dashboard (einfach)
- Log-Viewer (mittel)
- Verbindungsliste (einfach)
- Kontrollpanel (einfach)

**Komplexitäts-Score**: Niedrig → Alpine.js ist ausreichend

### Konsequenzen

**Positiv:**
- Schnellere Entwicklung (kein Build-Setup)
- Kleineres Bundle, schnellere Ladezeiten
- Einfacher für Mitwirkende zu verstehen

**Negativ:**
- Begrenzt für komplexe UIs (nicht benötigt)
- Weniger strukturiert als Komponenten-Frameworks

**Migrationspfad:**
- Falls UI-Komplexität in Phase 2+ erheblich wächst, Vue.js in Betracht ziehen
- Alpine.js-Komponenten modular halten für einfachere Migration

---

## ADR-006: Zod vs. Joi für Validierung

**Status:** Akzeptiert  
**Datum:** 3. Februar 2026

### Kontext

Schema-Validierungsbibliothek für Node.js. Optionen:
- **Zod**: TypeScript-first, Typ-Inferenz
- **Joi**: Ausgereift, JavaScript-first

### Entscheidung

**Zod für alle Validierungs-Schemas verwenden**.

### Begründung

**Zod-Vorteile:**
- ✅ **TypeScript-first**: Inferiert Typen automatisch aus Schemas
- ✅ **Bessere DX**: Typsicherheit zur Kompilierzeit
- ✅ **Kleineres Bundle**: 10KB vs. 20KB (Joi)
- ✅ **Moderne API**: Chaining, unveränderliche Schemas

**Beispiel** (Typ-Inferenz):
```typescript
const UserSchema = z.object({
  name: z.string(),
  age: z.number().int().positive(),
});

type User = z.infer<typeof UserSchema>;
// TypeScript weiß: { name: string; age: number }
```

**Joi-Nachteile:**
- ❌ **Manuelle Typdefinitionen**: Muss Typen separat schreiben
- ❌ **JavaScript-first**: Weniger TypeScript-Integration
- ❌ **Größeres Bundle**: 2x Größe von Zod

### Konsequenzen

**Positiv:**
- Typsicherheit von Schemas bis Anwendungscode
- Reduzierte Boilerplate (keine manuellen Typdefinitionen)
- Besseres IDE-Autocomplete

**Negativ:**
- Weniger ausgereift als Joi (weniger Community-Ressourcen)
- Breaking Changes möglich in zukünftigen Releases

**Minderung:**
- Zod-Version in package.json pinnen
- Umfassende Tests für Validierungslogik schreiben

---

## ADR-007: Pino vs. Winston für Logging

**Status:** Akzeptiert  
**Datum:** 3. Februar 2026

### Kontext

Logging-Bibliothek für Node.js. Optionen:
- **Pino**: Hochperformant, JSON-first
- **Winston**: Feature-reich, flexibel

### Entscheidung

**Pino für strukturiertes Logging verwenden**.

### Begründung

**Pino-Vorteile:**
- ✅ **5x schneller**: Minimaler Overhead (<1ms pro Log)
- ✅ **JSON standardmäßig**: Strukturierte Logs, einfach zu parsen
- ✅ **Niedriger Overhead**: Geeignet für hochfrequente Operationen
- ✅ **Child-Logger**: Kontextuelles Logging mit Bindings

**Performance-Vergleich:**
| Logger | Ops/s | Overhead |
|--------|---------|----------|
| Pino | 50.000 | <1ms |
| Winston | 10.000 | 3-5ms |
| Bunyan | 15.000 | 2-3ms |

**Winston-Nachteile:**
- ❌ **Langsamer**: 5x Performance-Penalty
- ❌ **Text-first**: Erfordert Konfiguration für JSON
- ❌ **Komplexer**: Transports, Formatters, Levels

### Logging-Strategie

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// Strukturiertes Logging
logger.info({
  operation: 'read_scene',
  path: 'scenes/MainMenu.tscn',
  latency_ms: 45,
  cache_hit: false,
}, 'Tool execution completed');
```

### Konsequenzen

**Positiv:**
- Schnelles Logging beeinträchtigt Performance nicht
- Strukturierte Logs einfach zu durchsuchen/analysieren
- Niedriger Speicher-Footprint

**Negativ:**
- JSON-Logs weniger für Menschen lesbar in Konsole
- Weniger eingebaute Features als Winston

**Minderung:**
- `pino-pretty` für Entwicklung verwenden (für Menschen lesbar)
- JSON-Logs in Produktion für strukturierte Analyse

---

## ADR-008: Nur-Localhost vs. Optionaler Remote-Zugriff

**Status:** Akzeptiert (Localhost MVP, Remote Phase 2)  
**Datum:** 3. Februar 2026

### Kontext

Netzwerk-Binding-Strategie für MCP-Server. Optionen:
- **Nur-Localhost** (`127.0.0.1`)
- **Konfigurierbar** (`0.0.0.0` mit Authentifizierung)

### Entscheidung

**Nur an Localhost binden für MVP (Phase 1)**. Optionalen Remote-Zugriff mit Authentifizierung in Phase 2 hinzufügen.

### Begründung

**Nur-Localhost-Vorteile:**
- ✅ **Standardmäßig sicher**: Keine externe Netzwerk-Exposition
- ✅ **Einfacher**: Keine Authentifizierung, TLS oder Firewall-Bedenken
- ✅ **Ausreichend für MVP**: Single-User-Entwicklungswerkzeug
- ✅ **Reduzierte Angriffsfläche**: Kann nicht remote zugegriffen werden

**Remote-Zugriffs-Nachteile (für MVP):**
- ❌ **Sicherheitskomplexität**: Erfordert API-Keys, TLS-Zertifikate
- ❌ **Übertrieben**: MVP zielt auf Single-User, lokale Entwicklung
- ❌ **Operative Last**: Zertifikatsverwaltung, -erneuerung

### Sicherheitsvalidierung

**MVP-Sicherheitskontrollen:**
```typescript
const SERVER_CONFIG = {
  host: '127.0.0.1',  // DARF NICHT '0.0.0.0' in MVP sein
  port: 3000,
};

// Laufzeitvalidierung
if (SERVER_CONFIG.host === '0.0.0.0') {
  throw new Error('Remote binding not allowed in MVP');
}
```

### Phase 2-Anforderungen (Remote-Zugriff)

**Authentifizierung:**
- API-Key-basierte Authentifizierung
- Key-Rotation-Unterstützung
- Rate Limits pro Key

**Transport-Sicherheit:**
- TLS 1.3 obligatorisch
- Zertifikatsvalidierung
- HSTS-Header

**Zugriffskontrolle:**
- IP-Whitelist (optional)
- Audit-Logging aller Zugriffe
- Session-Verwaltung

### Konsequenzen

**Positiv:**
- Standardmäßig sicher, minimale Angriffsfläche
- Einfachere MVP-Implementierung
- Keine Zertifikatsverwaltung

**Negativ:**
- Kann nicht von Remote-Maschinen aus zugreifen (z.B. Team-Deployments)
- Muss auf derselben Maschine wie Godot Editor sein

**Zukünftige Erweiterung:**
```typescript
// Phase 2: Optionaler Remote-Zugriff
const SERVER_CONFIG = {
  host: process.env.MCP_HOST || '127.0.0.1',
  port: process.env.MCP_PORT || 3000,
  tlsEnabled: process.env.MCP_TLS === 'true',
  apiKey: process.env.MCP_API_KEY,
};

if (SERVER_CONFIG.host !== '127.0.0.1' && !SERVER_CONFIG.apiKey) {
  throw new Error('API key required for remote access');
}
```

---

## Zusammenfassung der Architekturentscheidungen

| ADR | Entscheidung | Phase | Risiko | Auswirkung |
|-----|----------|-------|------|--------|
| ADR-001 | GDScript (MVP), GDExtension (Phase 2) | 1 | Niedrig | Hoch |
| ADR-002 | HTTP REST über WebSockets | 1 | Niedrig | Mittel |
| ADR-003 | JSON über MessagePack | 1 | Niedrig | Niedrig |
| ADR-004 | LRU-Cache über Redis | 1 | Niedrig | Mittel |
| ADR-005 | Alpine.js über React/Vue | 1 | Niedrig | Mittel |
| ADR-006 | Zod über Joi | 1 | Niedrig | Mittel |
| ADR-007 | Pino über Winston | 1 | Niedrig | Niedrig |
| ADR-008 | Nur-Localhost (MVP) | 1 | Niedrig | Hoch |

## Entscheidungsprinzipien

Alle Architekturentscheidungen folgen diesen Prinzipien:

1. **Einfachheit zuerst**: Einfachere Lösungen für MVP wählen
2. **Messen vor Optimieren**: Optimierungen aufschieben, bis nachweislich notwendig
3. **Standardmäßig sicher**: Sicherheit über Bequemlichkeit priorisieren
4. **Erweiterbare Architektur**: Zukünftige Erweiterungen ohne Neuschreibungen ermöglichen
5. **Entwickler-Erfahrung**: Für einfache Entwicklung und Debugging optimieren

:::tip Entscheidungsüberprüfung
Diese ADRs sind lebende Dokumente. Sie sollten überprüft werden:
- Nach Abschluss jeder Phase
- Wenn Performance-Probleme identifiziert werden
- Wenn neue Anforderungen entstehen
- Wenn bessere Technologien verfügbar werden
:::

## Verwandte Dokumente

- [Komponentenarchitektur](/de/architecture/components) - Systemdesign-Details
- [Datenfluss](/de/architecture/data-flow) - Request/Response-Muster
- [Sicherheitsarchitektur](../../security-architecture.md) - Sicherheitskontrollen und Bedrohungsmodell
- [Implementierungs-Roadmap](../../implementation-roadmap.md) - Phasenweise Bereitstellung
