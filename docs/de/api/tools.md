# API-Werkzeug-Referenz

Vollständige Spezifikation für alle verfügbaren MCP-Werkzeuge.

---

## Werkzeugkategorien

- [Szenenoperationen](#szenenoperationen) - Szenen lesen, erstellen, modifizieren
- [Skriptoperationen](#skriptoperationen) - Skripte lesen, erstellen, modifizieren
- [Projektoperationen](#projektoperationen) - Projektstruktur und Suche
- [Node-Operationen](#node-operationen) - Node-Inspektion und Abfragen
- [Editoroperationen](#editoroperationen) - Editor starten, Projekte ausführen, Ausführung steuern
- [Ressourcenoperationen](#ressourcenoperationen) - Assets importieren, Ressourcen erstellen
- [Signaloperationen](#signaloperationen) - Signale erstellen, verbinden, auflisten, trennen
- [Physikoperationen](#physikoperationen) - Physikobjekte, Kollision, Bereiche (Godot 4.5+)
- [UI-Operationen](#ui-operationen) - UI-Elemente erstellen, Themes, Layouts
- [Animationsoperationen](#animationsoperationen) - Animation Player, Keyframes, Trees
- [Debug-Operationen](#debug-operationen) - Ausgabe erfassen, Fehleranalyse
- [Dokumentationsoperationen](#dokumentationsoperationen) - Klasseninformationen, Methoden, Best Practices (Godot 4.5+)
- [UID-Operationen](#uid-operationen) - UIDs abrufen/aktualisieren (Godot 4.4+)
- [Validierungswerkzeuge](#validierungswerkzeuge) - Szenen- und Projektvalidierung

---

## Szenenoperationen

### list_scenes

Listet alle Szenendateien im Projekt auf.

**Eingabe-Schema**:

```json
{
  "directory": {
    "type": "string",
    "description": "Optionales Unterverzeichnis zum Durchsuchen (z.B. 'scenes/levels')",
    "default": ""
  },
  "recursive": {
    "type": "boolean",
    "description": "Unterverzeichnisse rekursiv durchsuchen",
    "default": true
  },
  "include_metadata": {
    "type": "boolean",
    "description": "Dateigröße, Änderungszeit einschließen",
    "default": false
  }
}
```

**Ausgabe**:

```json
{
  "scenes": [
    {
      "path": "scenes/MainMenu.tscn",
      "size": 4096,
      "modified": "2026-02-04T10:30:00Z"
    },
    {
      "path": "scenes/levels/Level1.tscn",
      "size": 8192,
      "modified": "2026-02-03T15:45:00Z"
    }
  ],
  "count": 2
}
```

**Beispiel**:

```typescript
list_scenes({
  directory: "scenes/levels",
  recursive: true,
  include_metadata: true
})
```

**Fehler**:
- `-32001`: Verzeichnis nicht gefunden
- `-32002`: Zugriff verweigert

---

### read_scene

Parst eine Szenendatei und gibt ihre Struktur zurück.

**Eingabe-Schema**:

```json
{
  "path": {
    "type": "string",
    "description": "Relativer Pfad zur .tscn-Datei (z.B. 'scenes/Player.tscn')",
    "required": true,
    "pattern": "^[^./][^/]*(/[^/]+)*\\.tscn$"
  },
  "include_metadata": {
    "type": "boolean",
    "description": "Datei-Metadaten und Abhängigkeiten einschließen",
    "default": true
  },
  "include_scripts": {
    "type": "boolean",
    "description": "Skriptinhalt für angehängte Skripte einschließen",
    "default": false
  }
}
```

**Ausgabe**:

```json
{
  "metadata": {
    "path": "scenes/Player.tscn",
    "format": 3,
    "uid": "uid://abcdef123",
    "modified": "2026-02-04T10:30:00Z",
    "size": 4096,
    "dependencies": [
      "res://scripts/Player.gd",
      "res://assets/player.png"
    ]
  },
  "nodes": [
    {
      "name": "Player",
      "type": "CharacterBody2D",
      "parent": null,
      "properties": {
        "script": "res://scripts/Player.gd",
        "position": {"x": 100, "y": 200},
        "velocity": {"x": 0, "y": 0}
      },
      "children": [
        {
          "name": "Sprite2D",
          "type": "Sprite2D",
          "properties": {
            "texture": "res://assets/player.png"
          }
        }
      ]
    }
  ],
  "connections": [
    {
      "signal": "body_entered",
      "from": "Player",
      "to": "Player",
      "method": "_on_body_entered"
    }
  ]
}
```

**Fehler**:
- `-32001`: Datei nicht gefunden
- `-32602`: Ungültiger Pfad (Path-Traversal, falsche Erweiterung)
- `-32603`: Parse-Fehler (fehlerhafte .tscn)

---

### create_scene

Erstellt eine neue Szenendatei.

**Eingabe-Schema**:

```json
{
  "path": {
    "type": "string",
    "description": "Pfad für neue Szene (z.B. 'scenes/NewLevel.tscn')",
    "required": true,
    "pattern": "^[^./][^/]*(/[^/]+)*\\.tscn$"
  },
  "root_node": {
    "type": "object",
    "description": "Root-Node-Konfiguration",
    "required": true,
    "properties": {
      "name": {"type": "string", "required": true},
      "type": {"type": "string", "required": true},
      "properties": {"type": "object"},
      "children": {"type": "array"}
    }
  },
  "overwrite": {
    "type": "boolean",
    "description": "Überschreiben, wenn Datei existiert",
    "default": false
  }
}
```

**Ausgabe**:

```json
{
  "path": "scenes/NewLevel.tscn",
  "created": true,
  "backup": null
}
```

**Beispiel**:

```typescript
create_scene({
  path: "scenes/TestLevel.tscn",
  root_node: {
    name: "TestLevel",
    type: "Node2D",
    properties: {},
    children: [
      {
        name: "TileMap",
        type: "TileMap",
        properties: {
          tile_set: "res://tilesets/platformer.tres"
        }
      }
    ]
  },
  overwrite: false
})
```

**Fehler**:
- `-32001`: Datei existiert bereits (und overwrite=false)
- `-32002`: Zugriff verweigert
- `-32602`: Ungültige Node-Struktur

---

### modify_scene

Modifiziert eine existierende Szenendatei.

**Eingabe-Schema**:

```json
{
  "path": {
    "type": "string",
    "description": "Pfad zur zu modifizierenden Szene",
    "required": true
  },
  "operations": {
    "type": "array",
    "description": "Liste der Modifikationsoperationen",
    "required": true,
    "items": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "type": {"enum": ["add_node"]},
            "parent": {"type": "string"},
            "node": {"type": "object"}
          }
        },
        {
          "type": "object",
          "properties": {
            "type": {"enum": ["remove_node"]},
            "node_path": {"type": "string"}
          }
        },
        {
          "type": "object",
          "properties": {
            "type": {"enum": ["update_property"]},
            "node_path": {"type": "string"},
            "property": {"type": "string"},
            "value": {}
          }
        }
      ]
    }
  },
  "create_backup": {
    "type": "boolean",
    "default": true
  }
}
```

**Ausgabe**:

```json
{
  "path": "scenes/Player.tscn",
  "modified": true,
  "backup": ".godot/mcp-backups/2026-02-04_10-30-00_Player.tscn.bak",
  "operations_applied": 3
}
```

**Beispiel**:

```typescript
modify_scene({
  path: "scenes/Player.tscn",
  operations: [
    {
      type: "add_node",
      parent: "Player",
      node: {
        name: "HealthComponent",
        type: "Node",
        properties: {
          script: "res://scripts/components/HealthComponent.gd",
          max_health: 100
        }
      }
    },
    {
      type: "update_property",
      node_path: "Player/Sprite2D",
      property: "modulate",
      value: {"r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0}
    }
  ],
  create_backup: true
})
```

**Fehler**:
- `-32001`: Datei nicht gefunden
- `-32602`: Ungültige Operationsstruktur
- `-32603`: Operation fehlgeschlagen (z.B. Parent nicht gefunden)

---

## Skriptoperationen

### list_scripts

Listet alle Skriptdateien im Projekt auf.

**Eingabe-Schema**:

```json
{
  "directory": {
    "type": "string",
    "default": ""
  },
  "recursive": {
    "type": "boolean",
    "default": true
  },
  "language": {
    "type": "string",
    "enum": ["GDScript", "CSharp", "all"],
    "default": "all"
  }
}
```

**Ausgabe**:

```json
{
  "scripts": [
    {
      "path": "scripts/Player.gd",
      "language": "GDScript",
      "size": 2048,
      "modified": "2026-02-04T10:30:00Z"
    }
  ],
  "count": 1
}
```

---

### read_script

Liest eine Skriptdatei und gibt ihren Inhalt und Struktur zurück.

**Eingabe-Schema**:

```json
{
  "path": {
    "type": "string",
    "description": "Relativer Pfad zum Skript (z.B. 'scripts/Player.gd')",
    "required": true,
    "pattern": "^[^./][^/]*(/[^/]+)*\\.(gd|cs)$"
  },
  "parse_structure": {
    "type": "boolean",
    "description": "Klassenname, Funktionen, Signale extrahieren",
    "default": true
  }
}
```

**Ausgabe**:

```json
{
  "metadata": {
    "path": "scripts/Player.gd",
    "language": "GDScript",
    "modified": "2026-02-04T10:30:00Z",
    "size": 2048,
    "line_count": 120
  },
  "content": "class_name Player\nextends CharacterBody2D\n...",
  "structure": {
    "class_name": "Player",
    "extends": "CharacterBody2D",
    "signals": [
      {
        "name": "health_changed",
        "params": [{"name": "new_health", "type": "int"}]
      }
    ],
    "constants": [
      {"name": "MAX_SPEED", "type": "int", "value": "300"}
    ],
    "variables": [
      {"name": "max_health", "type": "int", "export": true, "default": "100"}
    ],
    "functions": [
      {
        "name": "_ready",
        "return_type": "void",
        "params": [],
        "line_start": 15,
        "line_end": 17
      }
    ]
  }
}
```

---

### create_script

Erstellt eine neue Skriptdatei.

**Eingabe-Schema**:

```json
{
  "path": {
    "type": "string",
    "required": true
  },
  "content": {
    "type": "string",
    "description": "Skriptinhalt",
    "required": true
  },
  "template": {
    "type": "string",
    "enum": ["empty", "node", "character_body_2d", "area_2d"],
    "description": "Vordefinierte Vorlage verwenden (überschreibt content)"
  }
}
```

---

### modify_script

Modifiziert eine existierende Skriptdatei.

**Eingabe-Schema**:

```json
{
  "path": {
    "type": "string",
    "required": true
  },
  "changes": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "type": {"enum": ["replace", "insert", "delete"]},
        "start_line": {"type": "number"},
        "end_line": {"type": "number"},
        "new_content": {"type": "string"}
      }
    }
  }
}
```

---

## Projektoperationen

### get_project_structure

Gibt vollständigen Projektverzeichnisbaum zurück.

**Eingabe-Schema**:

```json
{
  "include_hidden": {
    "type": "boolean",
    "description": ".godot/, .import/ Ordner einschließen",
    "default": false
  },
  "max_depth": {
    "type": "number",
    "description": "Maximale Verzeichnistiefe (-1 für unbegrenzt)",
    "default": -1
  }
}
```

**Ausgabe**:

```json
{
  "project_path": "/pfad/zu/projekt",
  "project_name": "Mein Spiel",
  "godot_version": "4.6.0",
  "tree": {
    "name": "project_root",
    "type": "directory",
    "children": [
      {
        "name": "scenes",
        "type": "directory",
        "children": [...]
      },
      {
        "name": "scripts",
        "type": "directory",
        "children": [...]
      }
    ]
  }
}
```

---

### search_nodes

Findet Nodes über Szenen nach Kriterien.

**Eingabe-Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "description": "Spezifische Szene zum Durchsuchen (weglassen für alle Szenen)"
  },
  "node_name": {
    "type": "string",
    "description": "Nach Node-Name suchen (unterstützt Wildcards)"
  },
  "node_type": {
    "type": "string",
    "description": "Nach Node-Typ filtern (z.B. 'Area2D')"
  },
  "property": {
    "type": "object",
    "description": "Nach Eigenschaftswert suchen",
    "properties": {
      "name": {"type": "string"},
      "value": {}
    }
  },
  "group": {
    "type": "string",
    "description": "Nach Godot-Gruppe filtern"
  }
}
```

**Ausgabe**:

```json
{
  "results": [
    {
      "scene": "scenes/Level1.tscn",
      "node_path": "Level1/Enemies/Enemy1",
      "node_type": "CharacterBody2D",
      "properties": {...}
    }
  ],
  "count": 15
}
```

**Beispiel**:

```typescript
// Alle Area2D-Nodes auf Collision-Layer 4 finden
search_nodes({
  node_type: "Area2D",
  property: {
    name: "collision_layer",
    value: 4
  }
})
```

---

## Node-Operationen

### get_node_properties

Gibt detaillierte Eigenschaften eines spezifischen Nodes zurück.

**Eingabe-Schema**:

```json
{
  "scene_path": {
    "type": "string",
    "required": true
  },
  "node_path": {
    "type": "string",
    "description": "Pfad zum Node innerhalb der Szene (z.B. 'Player/Sprite2D')",
    "required": true
  },
  "properties": {
    "type": "array",
    "description": "Spezifische Eigenschaften zum Abrufen (weglassen für alle)",
    "items": {"type": "string"}
  }
}
```

**Ausgabe**:

```json
{
  "scene": "scenes/Player.tscn",
  "node_path": "Player/Sprite2D",
  "node_type": "Sprite2D",
  "properties": {
    "texture": "res://assets/player.png",
    "centered": true,
    "offset": {"x": 0, "y": 0},
    "flip_h": false,
    "flip_v": false,
    "modulate": {"r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0}
  }
}
```

---

## Validierungswerkzeuge

### validate_scene

Validiert eine Szenendatei auf Fehler.

**Eingabe-Schema**:

```json
{
  "path": {
    "type": "string",
    "required": true
  },
  "checks": {
    "type": "array",
    "description": "Spezifische Prüfungen auszuführen",
    "items": {
      "enum": [
        "syntax",
        "missing_dependencies",
        "broken_paths",
        "circular_dependencies"
      ]
    },
    "default": ["syntax", "missing_dependencies", "broken_paths"]
  }
}
```

**Ausgabe**:

```json
{
  "path": "scenes/Player.tscn",
  "valid": false,
  "errors": [
    {
      "type": "missing_dependency",
      "message": "Skript nicht gefunden: res://scripts/MissingScript.gd",
      "line": 5
    }
  ],
  "warnings": [
    {
      "type": "deprecated_property",
      "message": "Eigenschaft 'motion_mode' ist in Godot 4.6 veraltet",
      "line": 12
    }
  ]
}
```

---

## Fehlerbehandlung

Alle Werkzeuge folgen konsistenten Fehlermustern:

**Häufige Fehlercodes**:

| Code | Name | Beschreibung |
|------|------|-------------|
| -32001 | Datei nicht gefunden | Angeforderte Datei existiert nicht |
| -32002 | Zugriff verweigert | Pfadvalidierung fehlgeschlagen (Traversal, Symlink) |
| -32003 | Timeout | Operation überschritt Zeitlimit |
| -32600 | Ungültige Anfrage | Fehlende erforderliche Felder |
| -32602 | Ungültige Parameter | Parametervalidierung fehlgeschlagen |
| -32603 | Interner Fehler | Serverseitige Exception |

**Fehlerantwort-Format**:

```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "error": {
    "code": -32602,
    "message": "Ungültige Parameter",
    "data": {
      "field": "path",
      "reason": "Pfad muss relativ und innerhalb des Projektverzeichnisses sein",
      "provided": "../../../etc/passwd"
    }
  }
}
```

---

## Performance-Charakteristiken

| Werkzeug | Typische Latenz | Cache-Hit-Rate | Hinweise |
|------|----------------|----------------|-------|
| `list_scenes` | 20-50ms | 60% | Abhängig von Projektgröße |
| `read_scene` | 15-80ms | 70% | Abhängig von Szenenkomplexität |
| `create_scene` | 50-150ms | N/A | Inkl. Validierung |
| `modify_scene` | 80-200ms | N/A | Inkl. Backup |
| `list_scripts` | 15-40ms | 65% | Schneller als Szenen |
| `read_script` | 10-50ms | 75% | Nur Text, kein Parsing |
| `get_project_structure` | 30-100ms | 85% | Aggressiv gecacht |
| `search_nodes` | 50-500ms | 40% | Abhängig vom Suchbereich |

---

::: tip Werkzeug-Komposition
KI-Assistenten verketten Werkzeuge automatisch für komplexe Abfragen:

> "Finde alle Gegner in Level1 und erhöhe ihre Gesundheit um 20%"

1. `read_scene("scenes/Level1.tscn")`
2. `search_nodes({scene_path: "...", node_type: "Enemy"})`
3. Für jeden Gegner: `modify_scene({operations: [{type: "update_property", ...}]})`
:::

::: warning Rate-Limiting
In Produktion (Phase 2) sind Werkzeuge rate-limited auf 100 req/min pro Client. Batch-Operationen sind effizienter als sequenzielle Aufrufe.
:::

---

::: info Vollständige Werkzeugdokumentation
Diese deutsche Übersetzung enthält die Kerndokumentation. Für die vollständige Dokumentation aller 60+ Werkzeuge (einschließlich Editoroperationen, Ressourcenverwaltung, Signalsystem, Physiksystem, UI-Operationen, Animationssystem, Debug-Operationen, Dokumentationsoperationen und UID-Verwaltung) siehe die [englische API-Werkzeug-Referenz](/en/api/tools).

**Verfügbare Werkzeugkategorien:**
- ✅ Szenen- und Skriptoperationen (vollständig dokumentiert)
- ✅ Projekt- und Node-Operationen (vollständig dokumentiert)
- ⚡ Editoroperationen: Editor starten, Projekte ausführen, Debug-Ausgabe erfassen
- 🎨 Ressourcenoperationen: Assets importieren, Ressourcen erstellen, Import-Einstellungen
- 📡 Signaloperationen: Signale erstellen, verbinden, auflisten, trennen
- ⚡ Physikoperationen (Godot 4.5+): Physikobjekte hinzufügen, Kollisionsebenen konfigurieren
- 🖼️ UI-Operationen: UI-Elemente erstellen, Themes anwenden, Layouts einrichten
- 🎞️ Animationsoperationen: AnimationPlayer, Keyframes, AnimationTree, Partikelsysteme
- 🐛 Debug-Operationen: Debugging mit Ausgabeerfassung und Fehleranalyse
- 📚 Dokumentationsoperationen (Godot 4.5+): Zugriff auf offizielle Godot-Dokumentation
- 🔑 UID-Operationen (Godot 4.4+): UID-Verwaltung für Godot-Ressourcen
:::
