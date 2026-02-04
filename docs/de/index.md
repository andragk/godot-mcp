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

### 🔍 Leseoperationen

- **`list_scenes`** - Durchsucht Projekt nach allen .tscn-Dateien
- **`read_scene`** - Analysiert Szenenstruktur, Nodes, Eigenschaften
- **`list_scripts`** - Findet alle GDScript- und C#-Skripte
- **`read_script`** - Liest Skriptinhalte mit Metadaten
- **`get_project_structure`** - Vollständiger Verzeichnisbaum
- **`search_nodes`** - Findet Nodes nach Name, Typ oder Eigenschaft
- **`get_node_properties`** - Inspiziert spezifische Node-Konfiguration

### ✏️ Schreiboperationen

- **`create_scene`** - Generiert neue Szenen aus Vorlagen
- **`modify_scene`** - Fügt Nodes hinzu/entfernt sie, aktualisiert Eigenschaften
- **`create_script`** - Erstellt neue GDScript-Klassen
- **`modify_script`** - Bearbeitet Skriptinhalt mit Validierung
- **`rename_node`** - Benennt Nodes sicher über Szenen hinweg um

### 📦 MCP-Ressourcen

Zugriff auf Godot-Dateien über URI-Schema:

- `godot://scenes/MainMenu.tscn` - Szenendateien als JSON
- `godot://scripts/Player.gd` - Skriptinhalte
- `godot://resources/PlayerStats.tres` - Ressourcen-Metadaten

### 🖥️ Sidecar Web UI

Besuchen Sie `http://localhost:8080` um:

- Serverstatus und Verbindungsgesundheit zu überwachen
- Echtzeit-Request/Response-Logs anzuzeigen
- Verfügbare Werkzeuge und Schemas zu durchsuchen
- Werkzeuge mit interaktiven Formularen zu testen
- Leistungsmetriken zu verfolgen (Latenz, Fehlerraten)

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
