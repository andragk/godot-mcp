# Godot 4.6 MCP Server

**Transformieren Sie Ihre Godot-Entwicklung mit KI-gestützter Unterstützung**

Der Godot 4.6 MCP Server ist eine leichtgewichtige, hochperformante Brücke, die die Funktionen der Godot Engine über das Model Context Protocol (MCP) zugänglich macht. Ermöglichen Sie KI-Assistenten wie Claude und GitHub Copilot, Ihre Godot-Projekte direkt aus VS Code zu lesen, zu erstellen und zu modifizieren.

---

## Was ist MCP?

Das **Model Context Protocol** (MCP) ist ein offener Standard zum Verbinden von KI-Anwendungen mit externen Datenquellen und Werkzeugen. Es ermöglicht Large Language Models (LLMs), auf strukturierte, sichere und erweiterbare Weise mit Ihrer Entwicklungsumgebung zu interagieren.

---

## Warum Godot MCP Server?

### 🚀 KI-gestützte Workflows

- **Szenen erstellen**: "Erstelle ein Platformer-Level mit sammelbaren Münzen"
- **Code-Refactoring**: "Extrahiere diese Bewegungslogik in eine wiederverwendbare Komponente"
- **Debugging**: "Finde alle Nodes mit falsch konfigurierten Collision-Layern"
- **Dokumentation**: "Generiere Kommentare für diese GDScript-Klasse"

### ⚡ Performance zuerst

- **<50ms p99 Latenz** für Leseoperationen
- **<200ms für Schreibvorgänge** mit automatischer Validierung
- **99,9% Verfügbarkeit** mit automatischer Wiederverbindung
- **Minimaler Overhead** (<100MB Node.js + 50MB Godot-Brücke)

### 🛡️ Standardmäßig sicher

- **Path-Traversal-Schutz** verhindert Zugriff außerhalb des Projektverzeichnisses
- **Eingabevalidierung** bei allen Werkzeugaufrufen
- **Atomare Schreibvorgänge** mit automatischen Backups
- **Audit-Logging** für alle Änderungen (optional)

### 🔧 Entwicklerfreundlich

- **Keine Konfiguration** für lokale Entwicklung
- **Sidecar Web UI** zum Überwachen und Testen
- **Umfassende Dokumentation** mit realen Beispielen
- **Open Source** mit aktiver Community-Unterstützung

---

## Schnellstart

### 1. Server installieren

```bash
npm install -g godot-mcp-server
```

### 2. Zu Claude Desktop hinzufügen

Bearbeiten Sie Ihre Claude Desktop-Konfiguration (`~/Library/Application Support/Claude/claude_desktop_config.json` auf macOS):

```json
{
  "mcpServers": {
    "godot": {
      "command": "godot-mcp-server",
      "args": ["--project", "/pfad/zu/ihrem/godot/projekt"]
    }
  }
}
```

### 3. Godot-Brücke installieren

In Ihrem Godot-Projekt:

1. Laden Sie das `godot-mcp-bridge` Addon von den Releases herunter
2. Extrahieren Sie es nach `addons/godot-mcp-bridge/`
3. Aktivieren Sie es unter **Projekt > Projekteinstellungen > Plugins**
4. Starten Sie Godot neu

### 4. Mit Chatten beginnen

In Claude Desktop:

> "Liste alle Szenen in meinem Godot-Projekt auf"

> "Lies das Player.gd Skript und schlage Optimierungen vor"

> "Erstelle eine neue Szene für das Hauptmenü mit Buttons für Start, Optionen und Beenden"

---

## Hauptfunktionen

### 🔍 Szenen- & Skriptoperationen

- **`list_scenes`** / **`read_scene`** - Durchsuchen und Analysieren von Szenenstrukturen
- **`create_scene`** / **`modify_scene`** - Szenen mit Node-Hierarchien generieren und modifizieren
- **`list_scripts`** / **`read_script`** - GDScript/C#-Skripte finden und analysieren
- **`create_script`** / **`modify_script`** - Skripte aus Vorlagen erstellen und bearbeiten
- **`search_nodes`** - Nodes nach Name, Typ, Eigenschaft oder Gruppe finden
- **`get_node_properties`** / **`validate_scene`** - Konfigurationen inspizieren und validieren

### 🎮 Editor- & Projektkontrolle

- **`launch_godot_editor`** - Godot-Editor programmatisch öffnen
- **`run_godot_project`** - Projekte im Debug-Modus mit Ausgabeerfassung ausführen
- **`stop_godot_execution`** - Laufende Instanzen steuern
- **`get_godot_version`** - Installierte Godot-Version prüfen
- **`list_godot_projects`** - Projekte in Verzeichnissen entdecken
- **`analyze_project`** - Tiefenanalyse von Projektstruktur und Abhängigkeiten

### 🎨 Ressourcen- & Asset-Management

- **`import_asset`** - Texturen, Audio, Modelle mit benutzerdefinierten Einstellungen importieren
- **`create_resource`** - Materialien, Shader und andere Ressourcen generieren
- **`list_project_assets`** - Alle Assets mit Metadaten katalogisieren
- **`configure_import_settings`** - Import-Konfigurationen aktualisieren

### 📡 Signal- & Event-System

- **`create_signal`** - Benutzerdefinierte Signale in Skripten definieren
- **`connect_signal`** - Signalverbindungen mit Validierung einrichten
- **`list_node_signals`** - Verfügbare Signale entdecken
- **`disconnect_signal`** - Signalverbindungen entfernen

### ⚡ Physiksystem (Godot 4.5+)

- **`add_physics_body`** - CharacterBody-, RigidBody-, StaticBody-Nodes erstellen
- **`configure_physics_properties`** - Masse, Reibung, Sprungkraft, Dämpfung einstellen
- **`setup_collision_layers`** - Kollisionsebenen-Masken konfigurieren
- **`create_area`** - Area2D/3D mit automatischer Signalverbindung erstellen

### 🖼️ UI & Animation

- **`create_ui_element`** - Buttons, Labels, Panels, Container generieren
- **`apply_theme`** - Benutzerdefinierte Themes auf UI-Elemente anwenden
- **`setup_container_layout`** - VBox/HBox/Grid-Layouts erstellen
- **`create_menu`** - Komplette Menüs mit Navigation erstellen
- **`create_animation_player`** - AnimationPlayer mit Keyframe-Tracks einrichten
- **`add_animation_keyframe`** - Animations-Keyframes programmatisch hinzufügen
- **`setup_animation_tree`** - AnimationTree-Zustandsmaschinen konfigurieren
- **`add_particle_system`** - GPUParticles2D/3D-Effekte erstellen

### 🐛 Debug & Dokumentation (Godot 4.5+)

- **`run_project_debug`** - Mit vollständiger Ausgabeerfassung und Leistungsmetriken ausführen
- **`capture_debug_output`** / **`get_error_context`** - Logs und Stack-Traces abrufen
- **`analyze_error`** - KI-gestützte Fehleranalyse mit Lösungen
- **`get_class_documentation`** - Auf offizielle Godot-Dokumentation für Klassen zugreifen
- **`search_documentation`** - Methoden, Eigenschaften, Signale, Tutorials durchsuchen
- **`get_method_documentation`** - Detaillierte Methodensignaturen mit Beispielen
- **`get_best_practices`** - Kuratierte Best Practices für Physik, Signale, GDScript, etc.
- **`check_deprecated_features`** - Veraltete APIs und Migrationspfade identifizieren

### 🔑 UID-Verwaltung (Godot 4.4+)

- **`get_file_uid`** - Datei-UIDs abrufen
- **`update_uid_references`** - UID-Referenzen durch erneutes Speichern von Ressourcen aktualisieren

::: tip 60+ Werkzeuge verfügbar
Der MCP Server bietet umfassende Abdeckung des Godot-Entwicklungslebenszyklus mit 60+ spezialisierten Werkzeugen. Siehe die vollständige [API-Werkzeug-Referenz](/en/api/tools) für detaillierte Schemas und Beispiele.
:::

### 📦 MCP-Ressourcen

Zugriff auf Godot-Dateien über URI-Schema:

- `godot://scenes/MainMenu.tscn` - Szenendateien als JSON
- `godot://scripts/Player.gd` - Skriptinhalte
- `godot://resources/PlayerStats.tres` - Ressourcen-Metadaten

### 🖥️ Sidecar Web UI

Besuchen Sie `http://localhost:8080` für umfassende Überwachung und Steuerung:

#### 🔍 **Werkzeug-Exploration & -Aufruf**
- Interaktiver Werkzeugkatalog mit JSON-Schema-Viewer
- Dynamische Formulargenerierung aus Werkzeug-Schemas
- Echtzeit-Werkzeug-Tests mit Ergebnisvorschau
- Ausführungszeiten-Tracking

#### 📚 **Ressourcenverwaltung**
- Alle MCP-Ressourcen durchsuchen (Szenen, Skripte, Assets)
- Volltext-Inhaltsvorschau
- Erweiterte Filterung nach Typ, Größe und Datum
- Schnellsuche über Ressourcen-URIs

#### 📊 **Echtzeit-Logging & Monitoring**
- Live-JSON-RPC-Traffic-Inspektion (Split-View)
- Performance-Metriken (p50/p95/p99 Latenz)
- Fehler-Konsole mit Stack-Traces
- Event-Kategorisierung (debug/info/warn/error)

#### ⚙️ **Konfiguration & Sicherheit**
- Umgebungsvariablen-Editor (mit Neustart-Erkennung)
- Aktive Client-Zugriffskontrolle
- Prompt-Vorlagen-Galerie mit Testing
- Rate-Limiting und Rechteverwaltung

#### 🔌 **Verbindungs- & Session-Management**
- Aktive Client-Liste mit Verbindungsmetadaten
- Session-Dauer und Leerlaufzeit-Tracking
- Anfrage-Erfolgs-/Fehlerquoten pro Client
- Zwangsverbindungstrennung (Kill-Switch) für hängende Clients

#### 🏥 **Service-Status & Lebenszyklus-Steuerung**
- Visuelle Statusanzeigen (🟢 gesund, 🟡 degradiert, 🔴 fehler)
- Umfassende Gesundheitschecks (Godot, Event-Loop, Speicher, Festplatte)
- Prozesssteuerung (starten/stoppen/neustarten/neu laden)
- Zustandsübergangs-Historie

#### 🧰 **Erweiterte Protokollierung & Observability**
- Split-View Traffic-Inspektor (Client ↔ Server)
- Auto-Scroll und Einfrieren-Steuerungen für Log-Inspektion
- Mehrstufige Filterung (debug/info/warn/error)
- Logs exportieren (JSON/CSV/TXT) mit Zeitbereichsfilterung

**Zugriff:** Browser öffnen unter `http://localhost:8080`, während der MCP-Server läuft.

---

## Architekturübersicht

```
┌──────────────┐
│  VS Code /   │  stdio
│ Claude App   ├────────────┐
└──────────────┘            │
                            ▼
                  ┌──────────────────┐
                  │   Node.js MCP    │
                  │     Server       │
                  └────────┬─────────┘
                           │ HTTP POST
                           │ localhost:7777
                           ▼
                  ┌──────────────────┐
                  │  Godot-Brücke    │
                  │  (GDScript HTTP  │
                  │     Server)      │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  Godot Engine    │
                  │  Dateisystem     │
                  └──────────────────┘
```

**Kommunikationsfluss**:

1. KI-Client sendet Werkzeuganfrage via stdio (MCP-Protokoll)
2. Node.js-Server validiert und transformiert zu JSON-RPC
3. HTTP POST zur Godot-Brücke auf localhost:7777
4. GDScript führt Operation auf Engine/Dateisystem aus
5. Antwort fließt durch die Kette zurück

**Latenzbudget**: 45-150ms gesamt (innerhalb der KI-Workflow-Erwartungen)

---

## Nächste Schritte

<div class="next-steps">

### 📚 Neu bei MCP?

Beginnen Sie mit [Erste Schritte](./getting-started.md) für Installation und Ihren ersten Werkzeugaufruf.

### 🧠 Konzepte verstehen

Verstehen Sie [MCP-Protokoll & Architektur](./concepts.md) um zu sehen, wie alles zusammenarbeitet.

### 💡 In Aktion sehen

Erkunden Sie [Praxisbeispiele](./examples.md) von KI-gestützten Spieleentwicklungs-Workflows.

### 🏗️ Selbst erstellen

Folgen Sie der [Implementierungsanleitung](./implementation/setup.md) um Ihren eigenen MCP-Server zu erstellen.

### 🔐 Produktions-Deployment

Überprüfen Sie [Bewährte Verfahren](./best-practices.md) für Sicherheit, Performance und Zuverlässigkeit.

</div>

---

## Community & Support

- **GitHub**: [github.com/your-org/godot-mcp-server](https://github.com) (Sterne willkommen!)
- **Discord**: [Treten Sie unserer Community bei](https://discord.gg/example)
- **Issues**: Melden Sie Bugs oder fordern Sie Features auf GitHub an
- **Diskussionen**: Stellen Sie Fragen, teilen Sie Workflows

---

## Lizenz

MIT-Lizenz - Frei verwendbar in persönlichen und kommerziellen Projekten.

---

::: tip Performance-Tipp
Aktivieren Sie Ressourcen-Caching in Produktion für 50% schnellere wiederholte Lesevorgänge:

```bash
godot-mcp-server --project /pfad/zu/projekt --cache-ttl 300
```
:::

::: warning Sicherheitshinweis
Standardmäßig akzeptiert der Server nur Verbindungen von localhost. Für Remote-/Team-Deployments aktivieren Sie Authentifizierung:

```bash
godot-mcp-server --project /pfad/zu/projekt --auth-key ihr-geheimer-schlüssel
```
:::
