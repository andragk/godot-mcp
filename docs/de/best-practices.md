# Bewährte Verfahren

Produktionsreife Muster und Optimierungsstrategien für den Godot MCP Server.

---

## Performance-Optimierung

### Ressourcen-Caching aktivieren

**Warum**: Reduziert wiederholte Datei-I/O und Parsing um 50-70%

**Wie**:

```bash
godot-mcp-server \
  --project /pfad/zu/projekt \
  --cache-ttl 300 \          # 5 Minuten
  --max-cache-size 100       # 100MB
```

**Wann Cache erhöhen**:
- Große Projekte (500+ Dateien)
- Häufige KI-Abfragen für gleiche Szenen
- CI/CD-Pipelines (Validierungs-Workflows)

**Wann Cache deaktivieren**:
- Aktive Entwicklung (schnelle Dateiänderungen)
- Speicherbeschränkte Umgebungen
- Cache-Invalidierungs-Probleme debuggen

### Szenenstruktur optimieren

**Problem**: Szenen mit 500+ Nodes sind langsam zu parsen und serialisieren

**Lösung 1: In Subscenes aufteilen**

❌ **Vorher** (monolithisch, 800 Nodes):

```
Level1.tscn
├── TileMap (500 Tiles)
├── Enemies (100 Instanzen)
├── Collectibles (150 Münzen)
└── Decorations (50 Props)
```

✅ **Nachher** (modular, 4×<200 Nodes):

```
Level1.tscn (50 Nodes)
├── TileMap → [Instanziert: environments/Platforms.tscn]
├── Enemies → [Instanziert: spawns/EnemyWaves.tscn]
├── Collectibles → [Instanziert: items/CoinLayout.tscn]
└── Decorations → [Instanziert: props/DecorationSet.tscn]
```

**Vorteile**:
- 3-5x schnellere Szenen-Lesevorgänge
- Bessere Wiederverwendbarkeit
- Einfachere KI-Analyse
- Reduzierte Merge-Konflikte

**Lösung 2: Gruppen für Batch-Abfragen verwenden**

Statt einzelne Nodes abzufragen, Godot-Gruppen verwenden:

```gdscript
# Gegner zu Gruppe in _ready() hinzufügen
add_to_group("enemies")

# KI kann jetzt effizient abfragen
search_nodes({ group: "enemies" })
```

### Verbindungs-Pooling

**Standard**: Bereits aktiviert mit 10 gleichzeitigen Verbindungen

**Für High-Throughput-Szenarien** (CI/CD, Batch-Operationen):

```typescript
// Benutzerdefinierte Server-Konfiguration
{
  "httpClient": {
    "connections": 20,      // Pool-Größe erhöhen
    "pipelining": 10,       // Mehr Anfragen pro Verbindung
    "keepAliveTimeout": 120000  // 2 Minuten
  }
}
```

### Parallele Werkzeugaufrufe

**Ineffizient** (sequenziell):

> "Lies Player.tscn, dann lies Enemy.tscn, dann lies Boss.tscn"

**Effizient** (parallel):

> "Lies Player.tscn, Enemy.tscn und Boss.tscn"

Die KI wird Werkzeuge automatisch parallel aufrufen, wenn möglich.

---

## Bewährte Sicherheitsverfahren

### Pfadvalidierung

**Immer relative Pfade verwenden** vom Projektstamm:

✅ **Korrekt**:
```
read_scene({ path: "scenes/Player.tscn" })
```

❌ **Absolute Pfade vermeiden**:
```
read_scene({ path: "/home/user/project/scenes/Player.tscn" })
```

**Warum**: Absolute Pfade brechen Portabilität und können Sicherheitsvalidierungs-Fehler auslösen.

### Backup vor Modifikationen

**Automatische Backups** sind standardmäßig aktiviert in `.godot/mcp-backups/`:

```
.godot/mcp-backups/
├── 2026-02-04_10-30-00_Player.tscn.bak
├── 2026-02-04_10-32-15_Enemy.gd.bak
└── 2026-02-04_10-35-42_MainMenu.tscn.bak
```

**Benutzerdefiniertes Backup-Verzeichnis**:

```bash
godot-mcp-server \
  --project . \
  --backup-dir /mnt/backups/godot-mcp
```

**Aufbewahrungsrichtlinie** (manuelle Bereinigung empfohlen):

```bash
# Backups älter als 7 Tage löschen
find .godot/mcp-backups -name "*.bak" -mtime +7 -delete
```

### Git-Integration

**Immer vor KI-Modifikationen committen**:

```bash
# Checkpoint erstellen
git add .
git commit -m "Vor KI-Refactoring: Bewegungskomponente extrahieren"

# KI modifizieren lassen
# ... KI-Operationen ...

# Änderungen überprüfen
git diff

# Falls zufrieden:
git add .
git commit -m "Nach KI-Refactoring: Bewegungskomponente extrahiert"

# Falls nicht zufrieden:
git reset --hard HEAD
```

**Pre-Commit-Validierung** (optional):

```bash
# .git/hooks/pre-commit
#!/bin/bash

# Alle Szenen vor Commit validieren
curl -s -X POST http://localhost:7777/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"scene.validate_all","params":{}}' \
  | jq -e '.result.valid' > /dev/null

if [ $? -ne 0 ]; then
  echo "❌ Szenenvalidierung fehlgeschlagen. Fehler vor Commit beheben."
  exit 1
fi

echo "✅ Szenenvalidierung bestanden"
```

### API-Schlüssel-Authentifizierung (Phase 2)

**Für Remote-/Team-Deployments**:

```bash
# Sicheren Schlüssel generieren (32 Bytes)
export MCP_AUTH_KEY=$(openssl rand -hex 32)

# Server mit Auth starten
godot-mcp-server \
  --project . \
  --auth-key $MCP_AUTH_KEY \
  --bind 0.0.0.0  # Remote-Verbindungen erlauben
```

**Client-Konfiguration**:

```json
{
  "mcpServers": {
    "godot": {
      "command": "godot-mcp-server",
      "args": ["--project", "/pfad/zu/projekt"],
      "env": {
        "MCP_AUTH_KEY": "ihr-geheimer-schlüssel-hier"
      }
    }
  }
}
```

**Sicherheits-Checkliste**:
- ✅ HTTPS für Remote-Verbindungen verwenden (nicht HTTP)
- ✅ Schlüssel alle 90 Tage rotieren
- ✅ Niemals Schlüssel zu Git committen (Umgebungsvariablen verwenden)
- ✅ Audit-Logging aktivieren (`--audit-log /var/log/mcp-audit.log`)
- ✅ KI-Clients rate-limitieren (`--rate-limit 100`)

---

## Zuverlässigkeitsmuster

### Gesundheitsüberwachung

**Automatisierte Gesundheitschecks**:

```bash
# Cron-Job (alle 5 Minuten)
*/5 * * * * curl -f http://localhost:7777/health || systemctl restart godot-mcp-server
```

**Gesundheitscheck-Antwort**:

```json
{
  "status": "healthy",
  "uptime_seconds": 3600,
  "godot_connected": true,
  "godot_version": "4.6.0",
  "bridge_version": "1.0.0",
  "cache_size_mb": 23.5,
  "request_count": 1247,
  "error_count": 3,
  "p99_latency_ms": 45
}
```

### Graceful Shutdown

**Sauberes Beenden sicherstellen**:

```bash
# SIGTERM senden (nicht SIGKILL)
kill -TERM $(pgrep -f godot-mcp-server)

# Server wird:
# 1. Keine neuen Anfragen akzeptieren
# 2. Laufende Operationen beenden
# 3. Cache auf Disk flushen
# 4. Godot-Verbindung schließen
# 5. Mit Code 0 beenden
```

**Vermeiden**:

```bash
# ❌ Force kill (kann Cache korrumpieren)
kill -9 $(pgrep -f godot-mcp-server)
```

---

## Entwicklungs-Workflow

### Lokale Entwicklung

**Empfohlenes Setup**:

```bash
# Terminal 1: Godot starten
godot --path /pfad/zu/projekt

# Terminal 2: MCP-Server mit Debug-Logging starten
godot-mcp-server \
  --project /pfad/zu/projekt \
  --log-level debug

# Terminal 3: Logs in Echtzeit überwachen
tail -f ~/.godot-mcp-server/logs/server.log

# Browser: Sidecar UI öffnen
open http://localhost:3000
```

### Änderungen testen

**Vor dem Deployen von KI-Modifikationen**:

1. **KI schlägt Änderungen vor** → Im Chat überprüfen
2. **Operationen genehmigen** → KI führt Werkzeuge aus
3. **Godot-Editor öffnen** → Output-Panel auf Fehler prüfen
4. **Modifizierte Szene öffnen** → Struktur überprüfen
5. **Szene ausführen (F6)** → Verhalten testen
6. **Falls Probleme gefunden** → KI bitten zu beheben oder zurücksetzen

**Rollback-Prozedur**:

```bash
# Option 1: Aus MCP-Backup wiederherstellen
cp .godot/mcp-backups/2026-02-04_10-30-00_Player.tscn.bak scenes/Player.tscn

# Option 2: Git revert
git checkout HEAD -- scenes/Player.tscn

# Option 3: Interaktive Wiederherstellung
> "Mache die letzte Modifikation an Player.tscn rückgängig"
```

---

## Monitoring & Observability

### Strukturiertes Logging

**Log-Level**:

- `debug`: Alle Operationen, Request/Response-Payloads
- `info`: Werkzeugaufrufe, Verbindungszustandsänderungen (Standard)
- `warn`: Wiederholungsversuche, Cache-Evictions, behebbare Fehler
- `error`: Fehlgeschlagene Operationen, unbehandelte Exceptions

**Log-Format (JSON)**:

```json
{
  "timestamp": "2026-02-04T10:30:00.123Z",
  "level": "info",
  "message": "Werkzeug aufgerufen",
  "tool": "read_scene",
  "params": {"path": "scenes/Player.tscn"},
  "latency_ms": 45,
  "request_id": "req-abc123"
}
```

**Logs abfragen**:

```bash
# Alle Fehler der letzten Stunde finden
jq 'select(.level == "error" and (.timestamp | fromdateiso8601) > (now - 3600))' \
  ~/.godot-mcp-server/logs/server.log

# Durchschnittliche Latenz für read_scene berechnen
jq -s 'map(select(.tool == "read_scene")) | map(.latency_ms) | add/length' \
  ~/.godot-mcp-server/logs/server.log
```

---

## Fehlerbehebungs-Checkliste

### Vor Meldung von Problemen

1. ✅ Logs prüfen: `~/.godot-mcp-server/logs/server.log`
2. ✅ Godot-Verbindung verifizieren: `curl http://localhost:7777/health`
3. ✅ Mit minimalem Projekt testen (Reproduktionsfall)
4. ✅ Auf neueste Version aktualisieren: `npm update -g godot-mcp-server`
5. ✅ Cache löschen: `rm -rf ~/.godot-mcp-server/cache`
6. ✅ Systemressourcen prüfen (CPU, RAM, Disk)
7. ✅ Godot Output-Panel auf Fehler überprüfen
8. ✅ Ohne KI-Client testen (direkte HTTP-Anfragen)

---

::: tip Produktions-Checkliste
Vor Deployment in Produktion:

- [ ] Caching mit angemessener TTL aktivieren
- [ ] Authentifizierung konfigurieren (bei Remote-Zugriff)
- [ ] Gesundheitsüberwachung einrichten (cron/systemd)
- [ ] Audit-Logging aktivieren
- [ ] Backup-Aufbewahrungsrichtlinie konfigurieren
- [ ] Wiederherstellungsprozeduren dokumentieren
- [ ] Failover-Szenarien testen
- [ ] Performance-Baselines etablieren
- [ ] Alerting einrichten (Email/Slack)
- [ ] Godot-Versions-Upgrades planen
:::

::: warning Performance vs. Sicherheits-Abwägungen
**Hohe Performance** (Entwicklung):
```bash
godot-mcp-server --project . --cache-ttl 600 --no-backup
```

**Hohe Sicherheit** (Produktion):
```bash
godot-mcp-server --project . --cache-ttl 60 --backup-dir /mnt/backups --audit-log /var/log/mcp
```

Wählen Sie basierend auf Ihrer Risikotoleranz.
:::
