---
title: MCP Resources API
description: Resource-URI-Schema, MIME-Typen, Metadaten und Caching für Godot MCP Server Resources
outline: [2, 3]
---

# MCP Resources API

Der Godot MCP Server stellt Godot-Projektdateien als **MCP Resources** mit einem benutzerdefinierten URI-Schema bereit. Resources bieten schreibgeschützten Zugriff auf Projekt-Assets mit Metadaten und MIME-Typ-Informationen.

## Resource-URI-Schema

Alle Resources verwenden das `godot://`-URI-Schema mit folgendem Format:

```
godot://<typ>/<pfad>
```

**Beispiele:**
- `godot://scenes/MainMenu.tscn` - Scene-Datei
- `godot://scripts/Player.gd` - GDScript-Datei
- `godot://resources/PlayerTheme.tres` - Resource-Datei
- `godot://assets/sprites/icon.png` - Asset-Datei
- `godot://project.godot` - Projektkonfiguration

## Resource-Typen

### Scenes

**URI-Muster:** `godot://scenes/<pfad>.tscn`

**MIME-Typ:** `application/x-godot-scene`

**Inhaltsformat:** JSON (geparste Scene-Struktur)

**Beispiel:**
```
URI: godot://scenes/MainMenu.tscn
Content-Type: application/json
Content:
{
  "nodes": [
    {
      "name": "MainMenu",
      "type": "Control",
      "properties": {...},
      "children": [...]
    }
  ],
  "connections": [...]
}
```

### Scripts

**URI-Muster:** `godot://scripts/<pfad>.gd` oder `godot://scripts/<pfad>.cs`

**MIME-Typen:**
- GDScript: `text/x-gdscript`
- C#: `text/x-csharp`

**Inhaltsformat:** Klartext (Script-Quellcode)

**Beispiel:**
```
URI: godot://scripts/Player.gd
Content-Type: text/x-gdscript
Content:
extends CharacterBody2D

class_name Player

@export var speed: float = 200.0

func _physics_process(delta: float) -> void:
    move_and_slide()
```

### Resources

**URI-Muster:** `godot://resources/<pfad>.tres`

**MIME-Typ:** `application/x-godot-resource`

**Inhaltsformat:** JSON (Resource-Properties)

**Beispiel:**
```
URI: godot://resources/PlayerTheme.tres
Content-Type: application/json
Content:
{
  "type": "Theme",
  "properties": {
    "default_font": "res://assets/fonts/main.ttf",
    "default_font_size": 16
  }
}
```

### Assets

**URI-Muster:** `godot://assets/<pfad>.<ext>`

**MIME-Typen:** Aus Dateierweiterung erkannt
- `.png`, `.jpg`: `image/png`, `image/jpeg`
- `.wav`, `.ogg`: `audio/wav`, `audio/ogg`
- `.glb`, `.gltf`: `model/gltf+json`

**Inhaltsformat:** Binär (Base64-kodiert in JSON-Antwort)

:::warning Binäre Asset-Behandlung
Binäre Assets (Bilder, Audio, Modelle) werden Base64-kodiert, wenn über MCP Resources zugegriffen wird. Für große Assets (>1MB) direkten Dateizugriff verwenden.
:::

### Projektkonfiguration

**URI-Muster:** `godot://project.godot`

**MIME-Typ:** `text/plain`

**Inhaltsformat:** INI-Stil-Konfiguration

**Beispiel:**
```
URI: godot://project.godot
Content-Type: text/plain
Content:
config_version=5

[application]
config/name="My Game"
run/main_scene="res://scenes/MainMenu.tscn"
config/features=PackedStringArray("4.6", "Forward Plus")
```

## Resource-Metadaten

Jede Resource enthält Metadaten in den Response-Headern oder JSON-Envelope:

```typescript
interface ResourceMetadata {
  uri: string;                 // "godot://scenes/MainMenu.tscn"
  path: string;                // "scenes/MainMenu.tscn"
  type: "scene" | "script" | "resource" | "asset";
  mimeType: string;            // "application/json"
  size: number;                // Dateigröße in Bytes
  modified: string;            // ISO 8601-Zeitstempel
  checksum: string;            // SHA-256 für Cache-Invalidierung
}
```

**Beispielantwort:**
```json
{
  "uri": "godot://scenes/MainMenu.tscn",
  "mimeType": "application/json",
  "text": "{\"nodes\": [...]}",
  "metadata": {
    "path": "scenes/MainMenu.tscn",
    "type": "scene",
    "size": 4096,
    "modified": "2026-02-03T10:30:00Z",
    "checksum": "a3f5b9c2..."
  }
}
```

## MCP Resource-Anfrage

### Resources auflisten

Alle verfügbaren Resources eines bestimmten Typs auflisten.

**Anfrage:**
```json
{
  "method": "resources/list",
  "params": {
    "uriPrefix": "godot://scenes/"
  }
}
```

**Antwort:**
```json
{
  "resources": [
    {
      "uri": "godot://scenes/MainMenu.tscn",
      "name": "MainMenu",
      "mimeType": "application/x-godot-scene",
      "description": "Hauptmenü-Scene"
    },
    {
      "uri": "godot://scenes/Level1.tscn",
      "name": "Level1",
      "mimeType": "application/x-godot-scene",
      "description": "Erstes Spiel-Level"
    }
  ]
}
```

### Resource lesen

Resource-Inhalt mit Metadaten abrufen.

**Anfrage:**
```json
{
  "method": "resources/read",
  "params": {
    "uri": "godot://scenes/MainMenu.tscn"
  }
}
```

**Antwort:**
```json
{
  "uri": "godot://scenes/MainMenu.tscn",
  "mimeType": "application/json",
  "text": "{\"root_node\": {...}, \"connections\": [...]}",
  "metadata": {
    "size": 4096,
    "modified": "2026-02-03T10:30:00Z"
  }
}
```

### Resource-Änderungen abonnieren (Phase 2)

Benachrichtigungen abonnieren, wenn eine Resource geändert wird.

**Anfrage:**
```json
{
  "method": "resources/subscribe",
  "params": {
    "uri": "godot://scenes/MainMenu.tscn"
  }
}
```

**Benachrichtigung (bei Änderung):**
```json
{
  "method": "notifications/resources/updated",
  "params": {
    "uri": "godot://scenes/MainMenu.tscn",
    "checksum": "b7c9d4e1..."
  }
}
```

## Resource-Caching

Resources werden auf Node.js-Seite mit folgenden Regeln gecacht:

| Resource-Typ | Cache-TTL | Cache-Schlüssel | Invalidierung |
|---------------|-----------|-----------|--------------|
| Scenes | 300s (5min) | `resource:scenes:{path}` | Schreiben in gleiche Scene |
| Scripts | 300s | `resource:scripts:{path}` | Schreiben in gleiches Script |
| Resources | 300s | `resource:resources:{path}` | Schreiben in gleiche Resource |
| Assets | 600s (10min) | `resource:assets:{path}` | Selten invalidiert |
| Projektkonfig | 60s | `resource:project.godot` | Manuelle Invalidierung |

### Cache-Validierung

Resources enthalten Checksums (SHA-256) für Cache-Validierung:

```typescript
// Prüfen, ob gecachte Resource veraltet ist
async function validateCache(uri: string, cached: Resource): Promise<boolean> {
  const metadata = await getResourceMetadata(uri);
  
  // Checksums vergleichen
  if (metadata.checksum !== cached.metadata.checksum) {
    return false; // Veraltet, neu abrufen
  }
  
  return true; // Gültig
}
```

### Cache-Invalidierung

**Automatische Invalidierung:**
- Schreiben in Scene/Script invalidiert dessen Resource-Cache
- Projektstruktur-Änderungen invalidieren `project.godot`-Cache
- Asset-Änderungen müssen manuell invalidiert werden (Phase 2)

**Manuelle Invalidierung:**
```typescript
// Spezifische Resource invalidieren
cache.delete(`resource:scenes:MainMenu.tscn`);

// Alle Resources eines Typs invalidieren
for (const key of cache.keys()) {
  if (key.startsWith('resource:scenes:')) {
    cache.delete(key);
  }
}
```

## Resource-Browser-API

Die Web-UI bietet eine REST-API zum Durchsuchen von Resources:

### GET /api/resources

Alle Resources mit Filterung und Paginierung auflisten.

**Query-Parameter:**
- `type`: Nach Typ filtern (`scene`, `script`, `resource`, `asset`)
- `directory`: Nach Verzeichnis-Präfix filtern
- `page`: Seitennummer (Standard: 1)
- `limit`: Einträge pro Seite (Standard: 50, max: 200)

**Beispiel:**
```http
GET /api/resources?type=scene&directory=scenes/levels&page=1&limit=20
```

**Antwort:**
```json
{
  "resources": [
    {
      "uri": "godot://scenes/levels/Level1.tscn",
      "name": "Level1",
      "type": "scene",
      "mimeType": "application/x-godot-scene",
      "metadata": {
        "size": 8192,
        "modified": "2026-02-03T10:00:00Z"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "pages": 3
  }
}
```

### GET /api/resources/:uri

Metadaten für eine bestimmte Resource abrufen.

**Beispiel:**
```http
GET /api/resources/godot%3A%2F%2Fscenes%2FMainMenu.tscn
```

**Antwort:**
```json
{
  "uri": "godot://scenes/MainMenu.tscn",
  "name": "MainMenu",
  "type": "scene",
  "mimeType": "application/x-godot-scene",
  "metadata": {
    "path": "scenes/MainMenu.tscn",
    "size": 4096,
    "modified": "2026-02-03T10:30:00Z",
    "checksum": "a3f5b9c2...",
    "dependencies": [
      "res://scripts/main_menu.gd",
      "res://assets/sprites/logo.png"
    ]
  }
}
```

## MIME-Typ-Mapping

| Dateierweiterung | MIME-Typ | Kategorie |
|----------------|-----------|----------|
| `.tscn` | `application/x-godot-scene` | Scene |
| `.scn` | `application/x-godot-binary-scene` | Binäre Scene |
| `.gd` | `text/x-gdscript` | Script |
| `.cs` | `text/x-csharp` | Script |
| `.tres` | `application/x-godot-resource` | Resource |
| `.res` | `application/x-godot-binary-resource` | Binäre Resource |
| `.godot` | `text/plain` | Konfiguration |
| `.png` | `image/png` | Asset |
| `.jpg`, `.jpeg` | `image/jpeg` | Asset |
| `.svg` | `image/svg+xml` | Asset |
| `.wav` | `audio/wav` | Asset |
| `.ogg` | `audio/ogg` | Asset |
| `.mp3` | `audio/mpeg` | Asset |
| `.glb` | `model/gltf-binary` | Asset |
| `.gltf` | `model/gltf+json` | Asset |

## Fehlerbehandlung

### Resource nicht gefunden

**Fehlercode:** `RESOURCE_NOT_FOUND`

**Antwort:**
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Resource not found: godot://scenes/Missing.tscn",
    "uri": "godot://scenes/Missing.tscn"
  }
}
```

### Ungültige URI

**Fehlercode:** `INVALID_RESOURCE_URI`

**Antwort:**
```json
{
  "error": {
    "code": "INVALID_RESOURCE_URI",
    "message": "Invalid resource URI format",
    "uri": "invalid://path"
  }
}
```

### Zugriff verweigert

**Fehlercode:** `RESOURCE_ACCESS_DENIED`

**Antwort:**
```json
{
  "error": {
    "code": "RESOURCE_ACCESS_DENIED",
    "message": "Access denied: Resource outside project directory",
    "uri": "godot://../../etc/passwd"
  }
}
```

## Performance-Überlegungen

**Lese-Latenz:**
- Gecachte Resource: <5ms
- Nicht-gecachte Scene: 30-60ms (Parsing)
- Nicht-gecachtes Script: 10-20ms (Textlesen)
- Binäres Asset: 50-200ms (abhängig von Größe)

**Optimierungstipps:**
1. **Aggressiv cachen**: Die meisten Resources ändern sich nicht häufig
2. **Checksums verwenden**: Cache ohne erneutes Lesen von Dateien validieren
3. **Batch-Anfragen**: Mehrere Resources in einem MCP-Aufruf abrufen (Phase 2)
4. **Lazy Load**: Nur Resources bei Bedarf abrufen, nicht im Voraus
5. **Große Assets komprimieren**: gzip für textbasierte Resources verwenden

:::tip Best Practices
- Immer Metadaten-Anfragen einschließen, um `modified`-Zeitstempel zu prüfen
- `godot://`-URIs konsistent über Tools und Resources verwenden
- Resource-Änderungen abonnieren (Phase 2) für Echtzeit-Updates
- MIME-Typen beim Konsumieren von Resource-Inhalten respektieren
:::

## Verwandte Dokumentation

- [Tools-API](/de/api/tools) - MCP-Tool-Spezifikationen
- [Godot Bridge-API](/de/api/godot-bridge) - JSON-RPC-Endpunkte
- [Datenfluss-Architektur](/de/architecture/data-flow) - Details zur Caching-Strategie
