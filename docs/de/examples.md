# Praxisbeispiele

Praktische KI-gestützte Godot-Entwicklungs-Workflows mit dem MCP Server.

---

## Beispiel 1: KI-gestützte Szenenerstellung

### Szenario

Sie entwickeln einen 2D-Platformer und müssen mehrere Level-Szenen mit konsistenter Struktur erstellen.

### Workflow

**1. Erste Anfrage**

> "Erstelle eine Platformer-Level-Szene namens Level2 mit einer TileMap für Plattformen, einem Player-Spawn-Punkt, sammelbaren Münzen und einer Ausgangstür. Verwende die gleiche Struktur wie Level1."

**KI-Aktionen**:

```
1. read_scene("scenes/Level1.tscn")
   → Struktur und Muster analysieren
   
2. create_scene("scenes/Level2.tscn", {
     nodes: [
       {
         name: "Level2",
         type: "Node2D",
         children: [
           {name: "TileMap", type: "TileMap", ...},
           {name: "PlayerSpawn", type: "Marker2D", position: {x: 100, y: 400}},
           {name: "Coins", type: "Node2D", children: [...]},
           {name: "ExitDoor", type: "Area2D", ...}
         ]
       }
     ]
   })
```

**Ergebnis**:

```
✅ scenes/Level2.tscn erstellt mit:

• TileMap (Tileset: res://tilesets/platformer.tres)
• PlayerSpawn (Marker2D bei x:100, y:400)
• Coins Container (5 Coin-Instanzen)
• ExitDoor (Area2D mit Kollisionserkennung)

Die Szene folgt der gleichen Struktur wie Level1. 
Möchten Sie, dass ich:
1. Gegner hinzufüge?
2. Einen Hintergrund-Parallax-Layer erstelle?
3. Level-Grenzen einrichte?
```

**Eingesparte Zeit**: 10-15 Minuten manueller Szenen-Setup

---

## Beispiel 2: Code-Refactoring & Optimierung

### Szenario

Ihr `Player.gd`-Skript ist auf über 300 Zeilen angewachsen. Sie möchten die Bewegungslogik in eine wiederverwendbare Komponente extrahieren.

### Workflow

**1. Analyseanfrage**

> "Analysiere Player.gd und schlage vor, wie die Bewegungslogik in eine wiederverwendbare Komponente extrahiert werden kann"

**KI-Aktionen**:

```
1. read_script("scripts/Player.gd")
   → Struktur parsen, Bewegungscode identifizieren
   
2. KI-Analyse:
   "Ihr Player.gd hat Bewegungslogik in den Zeilen 45-120, die in ein 
   MovementComponent extrahiert werden könnte. Dies umfasst:
   
   • Input-Handling (_process)
   • Geschwindigkeitsberechnungen
   • Kollisionserkennung
   • Animations-Zustandsänderungen
   
   Vorteile:
   - Wiederverwendbar für Gegner und NPCs
   - Einfacher zu testen
   - Folgt Composition-Pattern
   
   Vorgeschlagene Struktur:
   
   Player.gd (vereinfacht)
   ├── MovementComponent (verwaltet Physik)
   ├── HealthComponent (existiert bereits)
   └── InputComponent (neu - verwaltet Input)"
```

**2. Implementierungsanfrage**

> "Erstelle das MovementComponent-Skript und aktualisiere Player.gd, um es zu verwenden"

**Eingesparte Zeit**: 30-45 Minuten manuelles Refactoring

---

## Beispiel 3: Kollisionsprobleme debuggen

### Szenario

Spieler berichten, dass Münzen in einigen Levels nicht eingesammelt werden. Sie müssen falsch konfigurierte Collision-Layer finden.

### Workflow

**Anfrage**

> "Finde alle Area2D-Nodes in meinem Projekt und prüfe, ob ihre Collision-Layer der erwarteten Konfiguration entsprechen: Player auf Layer 1, Collectibles auf Layer 4"

**KI-Bericht**:

```
🔍 Collision-Layer-Analyse abgeschlossen

✅ Korrekt konfiguriert (12 Nodes):
• scenes/Level1.tscn → Coins/Coin1 (Layer: 4, Maske: 1)
• scenes/Level1.tscn → Coins/Coin2 (Layer: 4, Maske: 1)
• ...

❌ Probleme gefunden (3 Nodes):

1. scenes/Level3.tscn → Coins/Coin5
   Problem: collision_layer = 1 (sollte 4 sein)
   Lösung: collision_layer auf 4 setzen

2. scenes/Level4.tscn → Coins/Coin1
   Problem: collision_mask = 0 (sollte 1 sein)
   Lösung: collision_mask auf 1 setzen

3. scenes/bonus/SecretArea.tscn → ExitDoor
   Problem: collision_layer = 3 (sollte 4 sein)
   Lösung: collision_layer auf 4 setzen

Soll ich diese automatisch beheben?
```

**Folge-Anfrage**

> "Ja, behebe alle Kollisionsprobleme"

**Ergebnis**:

```
✅ 3 Collision-Layer-Probleme behoben:

Modifizierte Szenen:
• scenes/Level3.tscn (Coin5: Layer 1→4)
• scenes/Level4.tscn (Coin1: Maske 0→1)
• scenes/bonus/SecretArea.tscn (ExitDoor: Layer 3→4)

Alle Area2D-Nodes entsprechen jetzt der erwarteten Konfiguration.
Testen Sie im Spiel, ob das Münzensammeln funktioniert.
```

**Eingesparte Zeit**: 15-20 Minuten manuelle Inspektion über mehrere Szenen

---

## Beispiel 4: Batch-Szenen-Updates

### Szenario

Sie haben Ihr Spieler-Gesundheitssystem neu gestaltet. Jetzt müssen Sie die Player-Szene in allen 15 Levels aktualisieren, um das neue HealthComponent zu verwenden.

### Workflow

**Anfrage**

> "Finde alle Szenen, die Player.tscn instanzieren und aktualisiere sie, um das neue Gesundheitssystem-Skript zu verwenden"

**Ergebnis**:

```
✅ 15 Szenen aktualisiert:

• scenes/Level1.tscn → Player-Gesundheitssystem aktualisiert
• scenes/Level2.tscn → Player-Gesundheitssystem aktualisiert
• scenes/Level3.tscn → Player-Gesundheitssystem aktualisiert
...
• scenes/Level15.tscn → Player-Gesundheitssystem aktualisiert

Alle Player-Instanzen verwenden jetzt:
• HealthComponentV2.gd (neues Skript)
• regen_rate: 5.0 (neue Eigenschaft)

Rückwärtskompatibilität für Saves/Replays beibehalten.
```

**Eingesparte Zeit**: 20-30 Minuten repetitiver Szenenbearbeitung

---

## Beispiel 5: Dokumentationsgenerierung

### Szenario

Sie müssen alle öffentlichen Signale und Funktionen in Ihren Kern-Spielsystemen dokumentieren.

### Workflow

**Anfrage**

> "Generiere Dokumentation für alle Skripte im Verzeichnis scripts/systems/"

**KI-Ausgabe**:

````markdown
# Spielsysteme-Dokumentation

## GameManager (scripts/systems/GameManager.gd)

**Erweitert**: Node

### Signale

- `game_started()` - Wird ausgelöst, wenn ein neues Spiel beginnt
- `game_over(score: int)` - Wird ausgelöst, wenn das Spiel endet
- `level_changed(level_index: int)` - Wird bei Level-Übergang ausgelöst

### Öffentliche Eigenschaften

- `current_level: int` - Der aktive Level-Index (Standard: 0)
- `max_lives: int` - Maximale Spielerleben (Standard: 3, exportiert)

### Öffentliche Methoden

#### start_game() → void
Initialisiert eine neue Spielsitzung und lädt das erste Level.

#### load_level(level_index: int) → void
Lädt das angegebene Level. Löst `level_changed`-Signal aus.

**Parameter**:
- `level_index`: Null-basierter Level-Index

**Wirft**: `ERR_FILE_NOT_FOUND` wenn Level nicht existiert
````

**Eingesparte Zeit**: 1-2 Stunden manuelle Dokumentationsarbeit

---

## Bewährte Verfahren aus Beispielen

### 1. Breit beginnen, dann eingrenzen

✅ "Alle Szenen auflisten" → "Level1 lesen" → "Level2 modifizieren"  
❌ "Level2 modifizieren" sofort (KI fehlt Kontext)

### 2. KI-Analyse nutzen

✅ "Player.gd analysieren und Verbesserungen vorschlagen"  
✅ "Kollisionsprobleme über alle Szenen finden"  
❌ "Player.gd besser machen" (zu vage)

### 3. Inkrementell iterieren

✅ Szene erstellen → Testen → Gegner hinzufügen → Testen → Hintergrund hinzufügen  
❌ "Erstelle ein vollständiges Level mit allem" (schwer zu debuggen)

### 4. Batch-Operationen weise verwenden

✅ "Gesundheitskomponente in allen Levels aktualisieren" (konsistente Änderung)  
⚠️ "Alle Levels lustiger machen" (subjektiv, erfordert menschliches Urteil)

### 5. KI-Ausgabe überprüfen

Testen Sie immer KI-generierte Szenen und Skripte in Godot vor dem Commit:

```bash
# Schneller Verifizierungs-Workflow
1. KI erstellt/modifiziert Dateien
2. Szene im Godot-Editor öffnen
3. Im Output-Panel auf Fehler prüfen
4. Szene mit F6 ausführen
5. Genehmigen oder Änderungen anfordern
```

---

## Nächste Schritte

- [API-Referenz überprüfen](./api/tools.md) - Alle verfügbaren Werkzeuge verstehen
- [Bewährte Verfahren lernen](./best-practices.md) - Workflows optimieren
- [FAQ lesen](./faq.md) - Häufige Fragen und Lösungen

---

::: tip Workflow-Optimierung
Kombinieren Sie mehrere Werkzeuge in einer Anfrage:

> "Liste alle Szenen auf, lies Player.tscn und prüfe, ob andere Szenen es instanzieren"

Die KI wird die Werkzeuge automatisch effizient sequenzieren.
:::

::: warning Datenverlust-Prävention
Committen Sie Ihr Projekt immer zu Git vor KI-Modifikationen:

```bash
git add .
git commit -m "Vor KI-Refactoring"
```

Falls etwas schief geht, erstellt der MCP-Server Backups in `.godot/mcp-backups/`, aber Git bietet vollständigen Verlauf.
:::
