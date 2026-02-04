# Erste Schritte

In unter 10 Minuten mit Godot MCP Server einsatzbereit.

---

## Voraussetzungen

### Erforderliche Software

- **Node.js 20+** ([Download](https://nodejs.org/))
- **Godot 4.6+** ([Download](https://godotengine.org/download))
- **VS Code** oder **Claude Desktop** (MCP-Client)

### Wissensanforderungen

- Grundkenntnisse mit Godot Engine
- Kommandozeilen-Fähigkeiten (npm, Terminal-Navigation)
- Verständnis von JSON und REST APIs (hilfreich, aber nicht erforderlich)

---

## Installation

### Schritt 1: Node.js MCP Server installieren

Global via npm installieren:

```bash
npm install -g godot-mcp-server
```

Oder npx verwenden (keine Installation):

```bash
npx godot-mcp-server --version
```

Installation überprüfen:

```bash
godot-mcp-server --version
# Ausgabe: godot-mcp-server v1.0.0
```

### Schritt 2: Godot-Brücken-Addon installieren

1. **Herunterladen** der neuesten `godot-mcp-bridge.zip` von [Releases](https://github.com/your-org/godot-mcp-server/releases)

2. **Extrahieren** in das `addons/`-Verzeichnis Ihres Projekts:

```
ihr-godot-projekt/
├── addons/
│   └── godot-mcp-bridge/
│       ├── plugin.cfg
│       ├── http_server.gd
│       ├── tool_manager.gd
│       └── ...
├── scenes/
├── scripts/
└── project.godot
```

3. **Aktivieren** des Plugins in Godot:
   - Öffnen Sie **Projekt > Projekteinstellungen > Plugins**
   - Aktivieren Sie das Kontrollkästchen neben "Godot MCP Bridge"
   - Klicken Sie auf "Aktivieren"

4. **Godot neu starten** um den HTTP-Server zu aktivieren

### Schritt 3: Ihren MCP-Client konfigurieren

#### Für Claude Desktop (Empfohlen)

Bearbeiten Sie die Konfigurationsdatei:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Fügen Sie den Godot-Server hinzu:

```json
{
  "mcpServers": {
    "godot": {
      "command": "godot-mcp-server",
      "args": [
        "--project",
        "/absoluter/pfad/zu/ihrem/godot/projekt",
        "--log-level",
        "info"
      ],
      "env": {
        "GODOT_PORT": "7777"
      }
    }
  }
}
```

#### Für VS Code mit MCP-Erweiterung

Installieren Sie die [MCP-Erweiterung](https://marketplace.visualstudio.com/items?itemName=modelcontextprotocol.mcp-vscode)

Fügen Sie zu `.vscode/settings.json` hinzu:

```json
{
  "mcp.servers": {
    "godot": {
      "command": "godot-mcp-server",
      "args": [
        "--project",
        "${workspaceFolder}",
        "--port",
        "7777"
      ]
    }
  }
}
```

---

## Überprüfung

### 1. Serverstatus prüfen

Öffnen Sie die Sidecar Web UI:

```
http://localhost:8080
```

Sie sollten sehen:
- ✅ **Serverstatus**: Läuft
- ✅ **Godot-Verbindung**: Verbunden
- ✅ **Betriebszeit**: 0h 0m 15s

### 2. Health-Endpunkt testen

```bash
curl http://localhost:7777/health
```

Erwartete Antwort:

```json
{
  "status": "healthy",
  "uptime_seconds": 42,
  "godot_version": "4.6.0",
  "bridge_version": "1.0.0"
}
```

### 3. Erster Werkzeugaufruf

In Claude Desktop oder VS Code versuchen Sie:

> "Liste alle Szenen in meinem Godot-Projekt auf"

Erwartete Antwort:

```
Ich habe 8 Szenen in Ihrem Projekt gefunden:

• scenes/MainMenu.tscn
• scenes/levels/Level1.tscn
• scenes/levels/Level2.tscn
• scenes/characters/Player.tscn
• scenes/characters/Enemy.tscn
• scenes/ui/HUD.tscn
• scenes/ui/PauseMenu.tscn
• scenes/ui/GameOverScreen.tscn
```

---

## Ihre ersten Workflows

### Eine Szene lesen

> "Lies die Player.tscn-Szene und beschreibe ihre Struktur"

Die KI wird `read_scene` aufrufen und eine Zusammenfassung liefern:

```
Die Player-Szene hat folgende Struktur:

Root: Player (CharacterBody2D)
├── Sprite2D (Textur: player_sprite.png)
├── CollisionShape2D (Form: CapsuleShape2D)
├── Camera2D (Zoom: 2.0)
├── AnimationPlayer
└── HealthComponent (Skript: health_component.gd)

Haupteigenschaften:
- Position: (100, 200)
- Bewegungsmodus: Grounded
- Geschwindigkeit: Vector2(0, 0)
- Max. Geschwindigkeit: 300
- Sprungkraft: -600

Angehängtes Skript: res://scripts/player.gd
```

### Code analysieren

> "Lies Player.gd und schlage Performance-Verbesserungen vor"

Die KI wird `read_script` aufrufen und eine Analyse liefern:

```
Ich habe Ihr Player.gd-Skript überprüft. Hier einige Optimierungsvorschläge:

1. Zeile 45: Cache `get_node("Sprite2D")` in _ready() anstatt 
   es jeden Frame in _process() aufzurufen

2. Zeile 78: Verwenden Sie `move_and_slide()` statt manueller 
   Kollisionsberechnungen für bessere Performance

3. Zeilen 120-135: Die Angriffslogik könnte in eine separate 
   State Machine extrahiert werden für bessere Wartbarkeit

Möchten Sie, dass ich eine dieser Änderungen implementiere?
```

### Neuen Inhalt erstellen

> "Erstelle eine einfache sammelbare Münzen-Szene mit Rotationsanimation"

Die KI wird `create_scene` aufrufen:

```
Ich habe scenes/items/Coin.tscn mit folgender Struktur erstellt:

Struktur:
- Coin (Area2D)
  ├── Sprite2D (Platzhalter-Textur)
  ├── CollisionShape2D (kreisförmig)
  └── AnimationPlayer (rotate_loop)

Funktionen:
- Rotationsanimation (360° über 2 Sekunden)
- Kollisionserkennung auf Area2D Layer 4
- Bereit für benutzerdefiniertes Skript

Die Szene ist gespeichert und einsatzbereit. Möchten Sie, dass ich:
1. Ein Skript für die Sammellogik erstelle?
2. Partikeleffekte beim Sammeln hinzufüge?
3. Einen CoinManager zur Verfolgung der Sammlung erstelle?
```

---

## Befehlszeilenoptionen

### Grundlegende Verwendung

```bash
godot-mcp-server --project /pfad/zu/projekt
```

### Alle Optionen

| Option | Beschreibung | Standard |
|--------|-------------|----------|
| `--project <pfad>` | Pfad zum Godot-Projekt-Root (erforderlich) | - |
| `--port <nummer>` | Godot-Brücke HTTP-Port | `7777` |
| `--ui-port <nummer>` | Sidecar Web UI Port | `8080` |
| `--log-level <level>` | Logging-Verbosity (debug/info/warn/error) | `info` |
| `--cache-ttl <sekunden>` | Ressourcen-Cache TTL | `300` |
| `--max-cache-size <mb>` | Maximale Cache-Größe in MB | `50` |
| `--auth-key <schlüssel>` | API-Schlüssel für Authentifizierung (Phase 2) | - |
| `--no-ui` | Sidecar Web UI deaktivieren | `false` |
| `--backup-dir <pfad>` | Verzeichnis für Schreiboperations-Backups | `.godot/mcp-backups` |

### Beispiele

**Entwicklung mit Debug-Logging**:

```bash
godot-mcp-server \
  --project ~/dev/mein-spiel \
  --log-level debug \
  --ui-port 3000
```

**Produktion mit Caching**:

```bash
godot-mcp-server \
  --project /var/www/spiel-projekt \
  --cache-ttl 600 \
  --max-cache-size 100 \
  --auth-key $MCP_AUTH_KEY \
  --no-ui
```

---

## Fehlerbehebung

### Server startet nicht

**Symptom**: `Error: EADDRINUSE: address already in use`

**Ursache**: Port 7777 oder 8080 bereits in Verwendung

**Lösung**:

```bash
# Prüfen, was den Port verwendet (macOS/Linux)
lsof -i :7777

# Prozess beenden oder andere Ports verwenden
godot-mcp-server --project . --port 7778 --ui-port 8081
```

### Godot-Verbindung fehlgeschlagen

**Symptom**: Web UI zeigt "Getrennt"-Status

**Ursachen & Lösungen**:

1. **Godot läuft nicht**
   - Öffnen Sie Ihr Godot-Projekt im Editor
   - Stellen Sie sicher, dass das Addon in den Projekteinstellungen aktiviert ist

2. **Falscher Projektpfad**
   - Überprüfen Sie, dass `--project` auf das Verzeichnis mit `project.godot` zeigt
   - Verwenden Sie absolute Pfade für Zuverlässigkeit

3. **Firewall blockiert localhost**
   - Prüfen Sie Firewall-Einstellungen
   - Versuchen Sie, sie vorübergehend zum Testen zu deaktivieren

4. **Port-Konflikt**
   - Prüfen Sie, ob eine andere Anwendung Port 7777 verwendet
   - Ändern Sie den Port sowohl in der Server-Konfiguration als auch in den Godot-Addon-Einstellungen

### Werkzeugaufrufe langsam

**Symptom**: Operationen dauern >5 Sekunden

**Lösungen**:

1. **Caching aktivieren**:
   ```bash
   godot-mcp-server --project . --cache-ttl 300
   ```

2. **Godot-Performance prüfen**:
   - Schließen Sie unnötige Editor-Tabs
   - Reduzieren Sie Viewport-/Inspector-Komplexität
   - Prüfen Sie Systemressourcen (CPU/RAM)

3. **Netzwerkdiagnose**:
   ```bash
   # Localhost-Latenz testen
   curl -w "@curl-format.txt" http://localhost:7777/health
   ```

### Berechtigungsfehler

**Symptom**: `Error: EACCES: permission denied`

**Lösungen**:

1. **Projektverzeichnis-Berechtigungen**:
   ```bash
   # Lese-/Schreibzugriff sicherstellen
   chmod -R u+rw /pfad/zu/projekt
   ```

2. **Backup-Verzeichnis**:
   ```bash
   # Backup-Verzeichnis manuell erstellen
   mkdir -p .godot/mcp-backups
   chmod u+w .godot/mcp-backups
   ```

---

## Nächste Schritte

✅ **Server installiert und verifiziert**

Setzen Sie Ihre Reise fort:

- [MCP-Konzepte verstehen](./concepts.md) - Lernen Sie, wie das Protokoll funktioniert
- [Beispiele erkunden](./examples.md) - Echte KI-gestützte Workflows
- [API-Dokumentation lesen](./api/tools.md) - Meistern Sie alle verfügbaren Werkzeuge
- [Bewährte Verfahren überprüfen](./best-practices.md) - Produktions-Tipps

---

::: tip Schnelltestbefehl
Überprüfen Sie, ob alles mit einem Befehl funktioniert:

```bash
curl -X POST http://localhost:7777/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "health.check",
    "params": {}
  }'
```
:::

::: warning Häufiger Fehler
Vergessen Sie nicht, Godot nach dem Aktivieren des Addons neu zu starten! Der HTTP-Server startet erst nach dem Neustart von Godot.
:::
