# Häufig gestellte Fragen

Häufige Fragen zum Godot MCP Server.

---

## Allgemeine Fragen

### Was ist der Godot MCP Server?

Der Godot MCP Server ist eine leichtgewichtige Brücke, die die Godot Engine mit KI-Assistenten wie Claude und GitHub Copilot über das Model Context Protocol (MCP) verbindet. Er ermöglicht KI, Ihre Godot-Projekte direkt zu lesen, zu erstellen und zu modifizieren.

### Warum sollte ich das verwenden?

**Für schnellere Entwicklung**: KI kann repetitive Aufgaben wie Szenenerstellung, Batch-Updates und Code-Refactoring automatisieren.

**Für bessere Codequalität**: KI kann Ihre Skripte auf Optimierungsmöglichkeiten analysieren, Kollisionsfehlkonfigurationen erkennen und architektonische Verbesserungen vorschlagen.

**Zum Lernen**: Fragen Sie KI, Godot-Muster zu erklären, Dokumentation zu generieren oder neue Features zu erstellen.

### Ist es sicher, KI mein Projekt modifizieren zu lassen?

Ja, mit angemessenen Sicherheitsvorkehrungen:

1. **Automatische Backups**: Alle Schreiboperationen erstellen Backups mit Zeitstempel in `.godot/mcp-backups/`
2. **Pfadvalidierung**: KI kann nicht auf Dateien außerhalb Ihres Projektverzeichnisses zugreifen
3. **Eingabevalidierung**: Alle Werkzeugaufrufe werden gegen strenge Schemas validiert
4. **Menschliche Genehmigung**: Sie überprüfen KI-Vorschläge vor der Ausführung (in den meisten Workflows)
5. **Git-Integration**: Committen Sie immer vor KI-Modifikationen für vollständige Rollback-Fähigkeit

### Funktioniert es offline?

**Teilweise**:
- Der MCP-Server selbst läuft lokal (kein Internet erforderlich)
- Die Godot-Brücke läuft vollständig auf Ihrem Rechner
- **Aber**: KI-Clients (Claude Desktop, Copilot) benötigen Internet für LLM-Inferenz

Sie können die Sidecar Web UI (localhost:3000) verwenden, um Werkzeuge ohne KI-Client zu testen.

### Welche Godot-Versionen werden unterstützt?

- **Vollständig unterstützt**: Godot 4.6+
- **Teilweise Unterstützung**: Godot 4.3-4.5 (einige Features funktionieren möglicherweise nicht)
- **Nicht unterstützt**: Godot 3.x (anderes Szenenformat, API-Inkompatibilität)

### Muss ich mein Godot-Projekt modifizieren?

Minimale Änderungen:

1. `godot-mcp-bridge` Addon in `addons/` installieren
2. In Projekteinstellungen aktivieren
3. Godot neu starten

Ihre Szenen und Skripte bleiben unverändert. Das Addon fügt nur einen HTTP-Server für Kommunikation hinzu.

---

## Installation & Einrichtung

### Der Server startet nicht. Wie debugge ich?

**Schritt 1: Node.js-Version prüfen**

```bash
node --version
# Erforderlich: v20.0.0 oder höher
```

**Schritt 2: Port-Verfügbarkeit prüfen**

```bash
# macOS/Linux
lsof -i :7777
lsof -i :3000

# Windows PowerShell
netstat -ano | findstr :7777
netstat -ano | findstr :3000
```

Falls Ports belegt sind, entweder Prozess beenden oder andere Ports verwenden:

```bash
godot-mcp-server --project . --port 7778 --ui-port 8081
```

**Schritt 3: Logs prüfen**

```bash
# Debug-Logging aktivieren
godot-mcp-server --project . --log-level debug
```

Logs werden geschrieben nach:
- **Konsole** (stdout)
- **Datei**: `~/.godot-mcp-server/logs/server.log`

### Die Godot-Brücke zeigt "Getrennt"

**Ursache 1: Godot läuft nicht**

✅ **Lösung**: Öffnen Sie Ihr Projekt im Godot-Editor

**Ursache 2: Addon nicht aktiviert**

✅ **Lösung**: 
1. Öffnen Sie Projekt → Projekteinstellungen → Plugins
2. Aktivieren Sie "Godot MCP Bridge"
3. Starten Sie Godot neu

**Ursache 3: Falscher Projektpfad**

✅ **Lösung**: Überprüfen Sie, dass `--project` auf das Verzeichnis mit `project.godot` zeigt:

```bash
# ✅ Korrekt
godot-mcp-server --project ~/dev/mein-spiel

# ❌ Falsch (zeigt auf Unterverzeichnis)
godot-mcp-server --project ~/dev/mein-spiel/scenes
```

**Ursache 4: Port-Mismatch**

✅ **Lösung**: Stellen Sie sicher, dass Server und Addon den gleichen Port verwenden:

```bash
# Server-Konfiguration
godot-mcp-server --port 7777

# Addon-Konfiguration (addons/godot-mcp-bridge/plugin.gd)
const HTTP_PORT = 7777  # Muss übereinstimmen
```

### Kann ich mehrere Godot-Projekte gleichzeitig verwenden?

**Derzeit nicht** (MVP-Einschränkung). Der MCP-Server verbindet sich jeweils mit einer Godot-Instanz.

**Workaround**:
1. Separate MCP-Server-Instanzen auf verschiedenen Ports ausführen
2. Separate MCP-Clients für jedes Projekt konfigurieren

**Phase 2 Feature**: Multi-Projekt-Unterstützung mit Projekt-Wechsel

### Wie deinstalliere ich?

**Node.js-Server**:

```bash
npm uninstall -g godot-mcp-server
```

**Godot-Addon**:

1. `addons/godot-mcp-bridge/` Verzeichnis löschen
2. Aus Projekteinstellungen → Plugins entfernen
3. Godot neu starten

**Client-Konfiguration**:

Entfernen Sie den `"godot"`-Eintrag aus Ihrer MCP-Client-Konfiguration (Claude Desktop, VS Code).

---

## Performance & Zuverlässigkeit

### Operationen sind langsam (>5 Sekunden)

**Ursache 1: Große Szenen**

Szenen mit 500+ Nodes brauchen länger zum Parsen.

✅ **Lösung**: 
- Caching aktivieren: `--cache-ttl 300`
- Große Szenen in kleinere instanzierte Szenen aufteilen

**Ursache 2: Kein Caching**

Wiederholte Lesevorgänge ohne Caching parsen Dateien jedes Mal neu.

✅ **Lösung**:

```bash
godot-mcp-server --project . --cache-ttl 300 --max-cache-size 100
```

**Ursache 3: Godot-Editor-Lag**

Hohe Editor-Last (viele offene Tabs, große Viewport) verlangsamt Brücken-Antwort.

✅ **Lösung**:
- Unnötige Editor-Tabs schließen
- Viewport vereinfachen (2D/3D-Komplexität)
- Godot-Editor neu starten

### Der Server stürzt häufig ab

**Ursache 1: Speichermangel**

Große Projekte mit vielen gecachten Ressourcen können Speicher erschöpfen.

✅ **Lösung**:

```bash
# Cache-Größe begrenzen
godot-mcp-server --project . --max-cache-size 50

# Node.js Heap erhöhen
NODE_OPTIONS="--max-old-space-size=4096" godot-mcp-server --project .
```

---

## Features & Fähigkeiten

### Kann KI mein Spiel ausführen oder Builds exportieren?

**Nicht im MVP**. Phase 2 wird hinzufügen:
- `run_scene` Werkzeug (Szene in headless Godot ausführen)
- `export_project` Werkzeug (Godot-Export auslösen)
- `run_tests` Werkzeug (GUT Unit-Tests)

**Aktueller Workaround**: KI kann Build-Skripte generieren:

> "Erstelle ein Bash-Skript zum Exportieren meines Spiels für Windows, macOS und Linux"

KI generiert das Skript, Sie führen es manuell aus.

### Kann KI binäre Ressourcen modifizieren (.res, .import)?

**Lesen**: Ja, nur Metadaten (Dateigröße, Typ, Abhängigkeiten)  
**Schreiben**: Nein (Binärformat zu komplex)

**Workaround**: KI kann das entsprechende Textformat (.tres) modifizieren und Sie konvertieren zu Binär in Godot.

### Unterstützt es C#-Skripte?

**Lesen**: Ja, vollständige Unterstützung (auflisten, lesen, Struktur analysieren)  
**Schreiben**: Teilweise (Text erstellen/modifizieren, aber keine C#-Kompilierungsvalidierung)

**Einschränkung**: KI kann C#-Syntax-Korrektheit nicht verifizieren. Immer im Godot-Editor testen.

---

## Sicherheit & Datenschutz

### Auf welche Daten greift der Server zu?

**Zugänglich**:
- Dateien innerhalb Ihres Godot-Projektverzeichnisses
- Projektkonfiguration (`project.godot`)
- Godot-Editor-Zustand (via Brücken-Addon)

**Nicht zugänglich**:
- Dateien außerhalb des Projektverzeichnisses
- Systemkonfiguration
- Andere Anwendungen
- Netzwerkressourcen (außer Sie aktivieren es explizit)

### Sendet es Daten an externe Server?

**MCP-Server**: Nein. Läuft vollständig auf localhost, keine externen Verbindungen.

**KI-Clients**: Ja. Claude Desktop, GitHub Copilot senden Werkzeugergebnisse zu ihren Cloud-Services für LLM-Inferenz.

**Datenschutzbedenken**: Ihr Code/Szenen werden zum KI-Anbieter zur Analyse gesendet.

**Abhilfe**:
- Lokale LLMs verwenden (Phase 2: Ollama-Integration)
- Keine KI für sensible/proprietäre Projekte verwenden
- Datenschutzrichtlinien des KI-Anbieters überprüfen

### Kann KI Dateien löschen?

**Nicht standardmäßig**. Die MVP-Werkzeuge enthalten keine Löschoperationen.

**Phase 2**: Explizites `delete_file` Werkzeug mit zusätzlicher Bestätigung:

```typescript
// Erfordert explizite Bestätigung
delete_file({
  path: "scenes/old_level.tscn",
  confirm: true,
  create_backup: true
})
```

**Backups**: Selbst mit Löschwerkzeugen werden Backups in `.godot/mcp-backups/` erstellt.

---

## Hilfe erhalten

### Wo kann ich Bugs melden?

**GitHub Issues**: [https://github.com/your-org/godot-mcp-server/issues](https://github.com)

Enthalten Sie:
- OS und Versionen (Node.js, Godot, MCP-Client)
- Minimale Reproduktionsschritte
- Logs (`~/.godot-mcp-server/logs/server.log`)
- Beispielprojekt (falls zutreffend)

### Wo kann ich Fragen stellen?

- **GitHub Discussions**: Architektur, Design, bewährte Verfahren
- **Discord**: Echtzeit-Chat, Community-Support
- **Stack Overflow**: Mit `godot-mcp-server` taggen

### Wie kann ich beitragen?

Siehe [CONTRIBUTING.md](https://github.com) für:
- Dev-Umgebung einrichten
- Code-Style-Leitfaden
- Pull-Request-Prozess
- Test-Anforderungen

Bereiche, die Hilfe benötigen:
- Zusätzliche Werkzeuge (Export, Debugging, Profiling)
- Performance-Optimierung
- Dokumentationsverbesserungen
- Beispielprojekte

---

::: tip Pro-Tipp
Erstellen Sie eine `.godot-mcp-server.json` Konfigurationsdatei in Ihrem Projektstamm für persistente Einstellungen:

```json
{
  "port": 7777,
  "uiPort": 3000,
  "logLevel": "info",
  "cacheTTL": 300,
  "maxCacheSize": 50
}
```

Dann starten Sie den Server ohne Flags:

```bash
godot-mcp-server --project .
```
:::

::: warning Bekannte Einschränkungen
1. **Einzelprojekt**: Nur ein Godot-Projekt gleichzeitig
2. **Keine Löschungen**: MVP enthält keine Löschoperationen
3. **Nur Textformate**: Binär .scn, .res nicht editierbar
4. **Keine C#-Kompilierung**: Kann C#-Text modifizieren, aber keine Syntaxvalidierung
5. **Nur Localhost**: Kein Remote-Zugriff im MVP

Phase 2 behebt die meisten dieser Einschränkungen.
:::
