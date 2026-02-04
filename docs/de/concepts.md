# Kernkonzepte

Die Architektur und Protokolle hinter dem Godot MCP Server verstehen.

---

## Model Context Protocol (MCP)

### Was ist MCP?

Das **Model Context Protocol** ist ein von Anthropic entwickelter offener Standard, der Large Language Models (LLMs) ermöglicht, sicher mit externen Werkzeugen und Datenquellen zu interagieren. Denken Sie daran als standardisierte API, die KI-Assistenten verwenden um:

- **Daten zu lesen** aus Ihren Anwendungen (Szenen, Skripte, Datenbanken)
- **Werkzeuge aufzurufen** um Operationen durchzuführen (Dateien erstellen, Tests ausführen, deployen)
- **Auf Ressourcen zuzugreifen** via strukturierte URIs (godot://scenes/Player.tscn)

### Warum MCP wichtig ist

**Vor MCP**: Jedes KI-Tool brauchte eigene Integrationen. VS Code Copilot, Claude Desktop und Cursor verwendeten alle unterschiedliche Ansätze, was zu Fragmentierung und doppeltem Aufwand führte.

**Mit MCP**: Eine Server-Implementierung funktioniert mit allen MCP-kompatiblen Clients. Einmal erstellen, überall verwenden.

### Kern-MCP-Primitive

#### 1. Werkzeuge

**Werkzeuge** sind Funktionen, die KI aufrufen kann, um Aktionen durchzuführen.

```typescript
// Werkzeugdefinition
{
  name: "read_scene",
  description: "Parse eine Godot-Szenendatei und gib ihre Struktur zurück",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relativer Pfad zur .tscn-Datei" }
    },
    required: ["path"]
  }
}

// Werkzeugaufruf
{
  "method": "tools/call",
  "params": {
    "name": "read_scene",
    "arguments": { "path": "scenes/Player.tscn" }
  }
}

// Werkzeugergebnis
{
  "content": [
    {
      "type": "text",
      "text": "{\"nodes\": [...], \"connections\": [...]}"
    }
  ]
}
```

**Godot MCP Server Werkzeuge** (12+):
- Lesen: `list_scenes`, `read_scene`, `list_scripts`, `read_script`, `get_project_structure`, `search_nodes`
- Schreiben: `create_scene`, `modify_scene`, `create_script`, `modify_script`, `rename_node`
- Hilfsprogramme: `get_node_properties`, `validate_scene`

#### 2. Ressourcen

**Ressourcen** sind Datenobjekte, auf die über URI-Schemas zugegriffen wird.

```typescript
// Ressourcen-URI-Muster
godot://scenes/MainMenu.tscn       // Szenendateien
godot://scripts/Player.gd          // GDScript-Dateien
godot://resources/PlayerStats.tres // Ressourcendateien

// Ressourcenzugriff
{
  "method": "resources/read",
  "params": {
    "uri": "godot://scenes/Player.tscn"
  }
}

// Ressourcen-Metadaten
{
  "uri": "godot://scenes/Player.tscn",
  "mimeType": "application/json",
  "size": 4096,
  "modifiedTime": "2026-02-04T10:30:00Z"
}
```

**Vorteile von Ressourcen**:
- **Caching**: LLMs können häufig aufgerufene Szenen/Skripte cachen
- **Effiziente Updates**: Nur neu lesen wenn sich `modifiedTime` ändert
- **Strukturierter Zugriff**: MIME-Typen ermöglichen korrektes Parsing
- **Auffindbarkeit**: `resources/list` zeigt alle verfügbaren URIs

#### 3. Prompts (Zukünftig)

**Prompts** sind wiederverwendbare Vorlagen für häufige KI-Interaktionen (Phase 2 Feature).

```typescript
// Beispiel Prompt-Vorlage
{
  name: "debug_collision_layers",
  description: "Analysiere Collision-Layer-Konfiguration über alle Szenen",
  arguments: {
    expected_layers: { type: "array", items: { type: "number" } }
  }
}

// KI erweitert dies zu Multi-Step-Workflow:
// 1. list_scenes
// 2. read_scene für jede
// 3. Collision-Eigenschaften analysieren
// 4. Bericht generieren
```

---

## Architektur-Tiefenanalyse

### Systemkomponenten

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Client Layer                        │
│  (VS Code, Claude Desktop, custom MCP clients)              │
└────────────────────────┬────────────────────────────────────┘
                         │ stdio (JSON-RPC über stdin/stdout)
                         │ 
┌────────────────────────▼────────────────────────────────────┐
│                  Node.js MCP Server                         │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ MCP-Protokoll│→ │ Werkzeug-    │→ │ HTTP-Client     │  │
│  │ Adapter      │  │ Handler      │  │ (Brücken-Komm.) │  │
│  │              │  │ (Validierung)│  │                 │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Sidecar Web UI (Port 8080)                │   │
│  │     Express.js + Alpine.js + Tailwind CSS           │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP POST localhost:7777/rpc
                         │ (JSON-RPC 2.0)
┌────────────────────────▼────────────────────────────────────┐
│                 Godot-Brücke (Addon)                        │
│                                                             │
│  ┌─────────────────┐  ┌──────────────────────────────────┐ │
│  │ HTTPServer      │→ │ Werkzeug-Implementierungsschicht │ │
│  │ (Port 7777)     │  │ (SceneManager, ScriptManager)    │ │
│  └─────────────────┘  └──────────────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │ Godot API (FileAccess, DirAccess)
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Godot Engine / Dateisystem                 │
│    (project.godot, *.tscn, *.gd, *.tres, *.res)            │
└─────────────────────────────────────────────────────────────┘
```

### Kommunikationsfluss

#### Beispiel Leseoperation (`read_scene`)

```
┌──────────┐                                     ┌──────────┐
│ Claude   │  1. "Lies Player.tscn"              │ Node.js  │
│ Desktop  │────────────────────────────────────>│ Server   │
└──────────┘    stdio: tools/call                └────┬─────┘
                                                      │
                  2. Anfrage validieren                │
                  3. Zu JSON-RPC transformieren        │
                                                      │
                  ┌───────────────────────────────────┘
                  │  HTTP POST /rpc
                  │  {
                  │    "method": "scene.read",
                  │    "params": {
                  │      "path": "res://scenes/Player.tscn"
                  │    }
                  │  }
                  ▼
           ┌─────────────┐
           │   Godot     │  4. .tscn-Datei parsen
           │   Brücke    │  5. Zu JSON konvertieren
           └──────┬──────┘  6. Ergebnis zurückgeben
                  │
                  │  HTTP 200 OK
                  │  {
                  │    "result": {
                  │      "nodes": [...],
                  │      "connections": [...]
                  │    }
                  │  }
                  ▼
           ┌─────────────┐
           │   Node.js   │  7. Als MCP-Antwort formatieren
           │   Server    │  8. An Client senden
           └──────┬──────┘
                  │
                  │  stdio: result
                  ▼
           ┌─────────────┐
           │   Claude    │  9. Benutzer anzeigen:
           │   Desktop   │  "Die Player-Szene hat..."
           └─────────────┘
```

**Latenzaufschlüsselung**:
- MCP Client ↔ Node.js (stdio): ~5ms
- Node.js ↔ Godot (HTTP): ~10-20ms
- Godot Datei-Parsing: ~15-80ms (abhängig von Dateigröße)
- Gesamt: **45-150ms** (im akzeptablen Bereich für KI-Workflows)

---

## Kommunikationsmuster

### HTTP REST (Aktuelle Implementierung)

**Warum HTTP?**

1. **Native Godot-Unterstützung**: HTTPServer-Node, keine Abhängigkeiten
2. **Debuggierbarkeit**: Einfach zu inspizieren mit curl, Postman, Browser-DevTools
3. **Cross-Platform**: Funktioniert auf Windows, macOS, Linux
4. **Einfachheit**: Standardprotokoll, umfangreiche Tooling
5. **Zustandslos**: Jede Anfrage ist unabhängig, einfach zu skalieren

**JSON-RPC 2.0-Format**:

```json
// Anfrage
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "method": "scene.read",
  "params": {
    "path": "res://scenes/Player.tscn",
    "include_metadata": true
  }
}

// Erfolgsantwort
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "result": {
    "path": "res://scenes/Player.tscn",
    "nodes": [...],
    "metadata": {...}
  }
}

// Fehlerantwort
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "error": {
    "code": -32602,
    "message": "Datei nicht gefunden",
    "data": {
      "path": "res://scenes/Player.tscn",
      "errno": "ENOENT"
    }
  }
}
```

**Latenzprofil**:
- **p50**: 15ms (Median)
- **p95**: 35ms (95. Perzentil)
- **p99**: 50ms (99. Perzentil)
- **Max**: ~150ms (große Szenen)

### WebSocket (Phase 2 Erweiterung)

**Zukünftige bidirektionale Kommunikation** für:
- **Echtzeit-Events**: Godot → Node.js (Szene modifiziert, Build abgeschlossen)
- **Geringere Latenz**: 1-5ms persistente Verbindung
- **Streaming**: Große Dateiübertragungen, progressives Szenen-Parsing
- **Push-Benachrichtigungen**: KI kann Godot-Events abonnieren

---

## Nächste Schritte

- [Praxisbeispiele ansehen](./examples.md) - KI-gestützte Workflows
- [API-Referenz erkunden](./api/tools.md) - Alle verfügbaren Werkzeuge und Schemas
- [Bewährte Verfahren lernen](./best-practices.md) - Produktionsoptimierungs-Tipps

---

::: tip MCP vs REST verstehen
MCP ist ein **Protokoll** (wie Clients und Server kommunizieren).  
HTTP REST ist der **Transport** (wie Node.js mit Godot spricht).  

MCP definiert, welche Werkzeuge/Ressourcen existieren.  
HTTP trägt die tatsächlichen Anfragen/Antworten.
:::

::: warning Performance-Überlegung
Die 45-150ms Latenz ist **akzeptabel** für KI-Workflows, weil:
1. LLMs 1-5 Sekunden für Antworten benötigen
2. Der Flaschenhals ist KI-Inferenz, nicht MCP-Kommunikation
3. Caching reduziert wiederholte Lesevorgänge um 50-70%

Für Echtzeitanwendungen wird Phase 2 WebSocket-Unterstützung hinzufügen (1-5ms Latenz).
:::
