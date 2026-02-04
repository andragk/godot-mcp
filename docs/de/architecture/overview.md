# Architekturübersicht

Systemdesign auf hoher Ebene und Komponenten-Interaktionen.

---

## Systemarchitektur

Der Godot MCP Server verwendet eine **geschichtete Architektur** mit klarer Trennung der Verantwortlichkeiten:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                             │
│  VS Code, Claude Desktop, Custom MCP Clients                    │
└────────────────────────┬────────────────────────────────────────┘
                         │ stdio (MCP-Protokoll)
┌────────────────────────▼────────────────────────────────────────┐
│                    Node.js MCP Server                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Präsentationsschicht  (MCP-Protokoll-Adapter)           │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │  Anwendungsschicht   (Werkzeug-Handler, Validierung)     │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │  Domänenschicht        (Geschäftslogik, Werkzeug-Registry)│  │
│  └────────────────────────┬─────────────────────────────────┘  │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │  Infrastruktur      (HTTP-Client, Cache, Logging)        │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP POST (JSON-RPC 2.0)
                         │ localhost:7777
┌────────────────────────▼────────────────────────────────────────┐
│                  Godot-Brücke (Addon)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  HTTPServer          (Port 7777)                         │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │  Request Router      (JSON-RPC Dispatcher)               │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │  Werkzeug-Manager    (Szenen-, Skript-, Projekt-Ops)     │  │
│  └────────────────────────┬─────────────────────────────────┘  │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │  Godot API           (FileAccess, DirAccess, SceneTree)  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │ Datei-I/O
┌────────────────────────▼────────────────────────────────────────┐
│                  Dateisystem                                    │
│  project.godot, *.tscn, *.gd, *.tres, *.res                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architektonische Prinzipien

### 1. Trennung der Verantwortlichkeiten

Jede Schicht hat eine einzelne, klar definierte Verantwortlichkeit:

- **Präsentation**: Protokollübersetzung (MCP ↔ internes Format)
- **Anwendung**: Anfragen-Orchestrierung, übergreifende Belange
- **Domäne**: Kern-Geschäftslogik, Werkzeug-Implementierungen
- **Infrastruktur**: Externe Integrationen (Godot, Cache, Logs)

**Vorteile**:
- Einfach zu testen (Abhängigkeiten mocken)
- Einfach zu ersetzen (HTTP durch WebSocket austauschen)
- Einfach zu verstehen (klare Grenzen)

### 2. Abhängigkeitsumkehr

Höhere Schichten hängen von Abstraktionen ab, nicht von konkreten Implementierungen:

```typescript
// ❌ Enge Kopplung
class ToolHandler {
  constructor() {
    this.httpClient = new HttpClient();  // Konkrete Abhängigkeit
  }
}

// ✅ Lose Kopplung
interface GodotBridge {
  invoke(method: string, params: any): Promise<any>;
}

class ToolHandler {
  constructor(private bridge: GodotBridge) {}  // Abstrakte Abhängigkeit
}

// Kann HttpBridge, WebSocketBridge oder MockBridge injizieren
```

### 3. Fail-Safe-Standards

Operationen sind standardmäßig sicher, außer explizit anders konfiguriert:

- **Backups**: Standardmäßig für alle Schreibvorgänge aktiviert
- **Validierung**: Alle Eingaben vor Ausführung validiert
- **Nur-Localhost**: Kein Remote-Zugriff ohne `--bind` Flag
- **Nur-Lesen**: Keine Löschoperationen im MVP
- **Timeouts**: Verhindern unbegrenztes Hängen

### 4. Observable by Design

Jede Operation gibt strukturierte Logs und Metriken aus:

```typescript
logger.info('Werkzeug aufgerufen', {
  tool: 'read_scene',
  params: { path: 'scenes/Player.tscn' },
  requestId: 'req-abc123',
  timestamp: new Date().toISOString()
});

// Später...
logger.info('Werkzeug abgeschlossen', {
  tool: 'read_scene',
  requestId: 'req-abc123',
  latencyMs: 45,
  cacheHit: true
});
```

**Vorteile**:
- Einfaches Debugging (Anfragen end-to-end verfolgen)
- Leistungsanalyse (Engpässe identifizieren)
- Audit-Compliance (wer hat was wann gemacht)

---

## Komponenten-Interaktionsmuster

### Request/Response-Fluss

#### Erfolgreiche Leseoperation

```
┌──────────┐
│ KI-Client│  1. "Lies Player.tscn"
└────┬─────┘
     │ stdio: tools/call
     ▼
┌─────────────────────────────────────────────────────────┐
│ Node.js: MCP Server                                     │
│                                                         │
│  2. MCP-Anfrage parsen                                  │
│  3. Werkzeugname & Parameter validieren                 │
│  4. Cache prüfen (miss)                                 │
│  5. Zu JSON-RPC transformieren:                         │
│     {                                                   │
│       "method": "scene.read",                           │
│       "params": {"path": "res://scenes/Player.tscn"}    │
│     }                                                   │
│  6. HTTP POST zu localhost:7777/rpc                     │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP (10-20ms)
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Godot: Brücken-Addon                                    │
│                                                         │
│  7. HTTP-Anfrage empfangen                              │
│  8. JSON-RPC parsen                                     │
│  9. Zu SceneManager.read() routen                       │
│  10. Datei mit FileAccess öffnen                        │
│  11. .tscn-Format parsen                                │
│  12. Zu JSON konvertieren                               │
│  13. JSON-RPC-Antwort zurückgeben                       │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP 200 OK (15-80ms)
                      ▼
┌─────────────────────────────────────────────────────────┐
│ Node.js: MCP Server                                     │
│                                                         │
│  14. Antwort empfangen                                  │
│  15. Ergebnis cachen (5min TTL)                         │
│  16. Zu MCP-Format transformieren                       │
│  17. Über stdio an Client senden                        │
└─────────────────────┬───────────────────────────────────┘
                      │ stdio
                      ▼
┌──────────┐
│ KI-Client│  18. Anzeigen: "Die Player-Szene hat..."
└──────────┘

Gesamtlatenz: 45-150ms
```

---

## Kommunikationsprotokoll

### JSON-RPC 2.0-Spezifikation

**Anfrage-Format**:

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "method": "category.operation",
  "params": {
    "param1": "value1",
    "param2": "value2"
  }
}
```

**Erfolgsantwort**:

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "result": {
    "data": "...",
    "metadata": {...}
  }
}
```

**Fehlerantwort**:

```json
{
  "jsonrpc": "2.0",
  "id": "unique-request-id",
  "error": {
    "code": -32602,
    "message": "Ungültige Parameter",
    "data": {
      "field": "path",
      "reason": "Muss relativer Pfad sein"
    }
  }
}
```

**Standard-Fehlercodes**:

| Code | Bedeutung | Verwendung |
|------|---------|-------|
| -32700 | Parse-Fehler | Fehlerhaftes JSON |
| -32600 | Ungültige Anfrage | Fehlende erforderliche Felder |
| -32601 | Methode nicht gefunden | Unbekanntes Werkzeug/Operation |
| -32602 | Ungültige Parameter | Validierung fehlgeschlagen |
| -32603 | Interner Fehler | Serverseitige Exception |
| -32001 | Datei nicht gefunden | Ressource existiert nicht |
| -32002 | Zugriff verweigert | Pfadvalidierung fehlgeschlagen |
| -32003 | Timeout | Operation überschritt Limit |

---

## Sicherheitsmodell

### Bedrohungs-Mitigation

#### 1. Path-Traversal-Schutz

**Bedrohung**: Bösartige KI versucht `/etc/passwd` oder `C:\Windows\System32\` zu lesen

**Mitigation**:
```typescript
function validatePath(inputPath: string, projectRoot: string): boolean {
  // 1. Zu absolutem Pfad auflösen
  const absolute = path.resolve(projectRoot, inputPath);
  
  // 2. Normalisieren (../, ./ etc. entfernen)
  const normalized = path.normalize(absolute);
  
  // 3. Sicherstellen innerhalb Projektverzeichnis
  if (!normalized.startsWith(projectRoot)) {
    throw new Error("Path-Traversal-Versuch erkannt");
  }
  
  // 4. Auf Symlinks prüfen (folgen und neu validieren)
  const real = fs.realpathSync(normalized);
  if (!real.startsWith(projectRoot)) {
    throw new Error("Symlink zeigt außerhalb des Projekts");
  }
  
  return true;
}
```

#### 2. Eingabevalidierung

Alle Werkzeugeingaben gegen JSON Schema validiert:

```typescript
const readSceneSchema = {
  type: "object",
  properties: {
    path: {
      type: "string",
      pattern: "^[a-zA-Z0-9_/-]+\\.tscn$", // Nur .tscn-Dateien
      maxLength: 255
    },
    include_metadata: {
      type: "boolean"
    }
  },
  required: ["path"],
  additionalProperties: false // Unbekannte Felder ablehnen
};
```

---

## Design-Entscheidungen

### Warum HTTP statt WebSocket?

**HTTP (Aktuell)**:
- ✅ Einfacher zu debuggen (curl, Postman)
- ✅ Native Godot-Unterstützung (HTTPServer-Node)
- ✅ Zustandslos (kein Verbindungsmanagement)
- ❌ Höhere Latenz (~10-20ms Overhead)
- ❌ Unidirektional (nur Request/Response)

**WebSocket (Phase 2)**:
- ✅ Geringere Latenz (1-5ms)
- ✅ Bidirektional (Godot kann Events pushen)
- ❌ Komplexer zu debuggen
- ❌ Erfordert GDExtension oder Addon

**Entscheidung**: HTTP für MVP (Einfachheit), WebSocket für Phase 2 (Performance).

### Warum Node.js statt Python/Rust?

**Node.js**:
- ✅ Native Async-I/O (perfekt für MCP)
- ✅ Großes Ökosystem (MCP SDK, HTTP-Clients)
- ✅ Schnelle Iteration (TypeScript)
- ✅ Einfach zu deployen (npm, Docker)

**Python**:
- ❌ GIL begrenzt Nebenläufigkeit
- ✅ Stark im KI/ML-Bereich
- ❌ Langsamere Async-Performance

**Rust**:
- ✅ Maximale Performance
- ❌ Längere Entwicklungszeit
- ❌ Kleineres Ökosystem für MCP

**Entscheidung**: Node.js für MVP (Geschwindigkeit), Rust-Neuentwicklung wenn Performance kritisch wird.

---

## Nächste Schritte

- [Praxisbeispiele ansehen](./examples.md) - KI-gestützte Workflows
- [API-Referenz erkunden](./api/tools.md) - Alle verfügbaren Werkzeuge
- [Bewährte Verfahren lernen](./best-practices.md) - Produktionsoptimierungs-Tipps

---

::: tip Architektur-Philosophie
Der Godot MCP Server folgt dem **KISS-Prinzip** (Keep It Simple, Stupid):

1. Standard-Protokolle verwenden (HTTP, JSON-RPC)
2. Abhängigkeiten minimieren
3. Einfach zu debuggen machen
4. Für häufige Fälle optimieren
5. Nicht für zukünftige Bedürfnisse über-engineeren

Komplexität wird inkrementell hinzugefügt, wenn Bedürfnisse validiert werden.
:::
