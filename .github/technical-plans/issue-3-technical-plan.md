# Technical Implementation Plan: Issue #3 - Editor Control Tools

**Status:** Phase 1, Sprint 2 (Weeks 3-4)
**Depends On:** Issue #2 (Foundation & Communication Layer)
**Blocks:** Issues #4, #5, #6, #7

---

## 1. Architecture Design

### Component Structure

```
src/
├── tools/
│   └── editor/
│       ├── launch-godot-editor.ts       # Tool: launch_godot_editor
│       ├── run-godot-project.ts         # Tool: run_godot_project
│       ├── stop-godot-execution.ts      # Tool: stop_godot_execution
│       ├── get-godot-version.ts         # Tool: get_godot_version
│       ├── list-godot-projects.ts       # Tool: list_godot_projects
│       ├── analyze-project.ts           # Tool: analyze_project
│       └── executable-detector.ts       # Cross-platform Godot finder
├── types/
│   └── editor-tools.ts                  # TypeScript interfaces
└── utils/
    ├── process-manager.ts               # Process spawning and control
    ├── output-capture.ts                # stdout/stderr streaming
    └── project-parser.ts                # project.godot parser

addons/godot-mcp-bridge/
└── tools/
    └── editor/
        └── (no Godot-side handlers needed - Node.js only)
```

### Key Classes and Responsibilities

#### 1. ExecutableDetector (Node.js)
```typescript
class ExecutableDetector {
    private cachedPath: string | null = null;
    
    async detectGodotExecutable(): Promise<string> {
        if (this.cachedPath) return this.cachedPath;
        
        // Check PATH environment
        const pathExec = await this.findInPath();
        if (pathExec) return this.cachePath(pathExec);
        
        // Check platform-specific default locations
        const platformExec = await this.findPlatformDefault();
        if (platformExec) return this.cachePath(platformExec);
        
        throw new Error('Godot executable not found. Please install Godot or set GODOT_PATH environment variable.');
    }
    
    private async findInPath(): Promise<string | null> {
        const pathDirs = process.env.PATH?.split(path.delimiter) || [];
        for (const dir of pathDirs) {
            const godotPath = path.join(dir, process.platform === 'win32' ? 'godot.exe' : 'godot');
            if (await fs.pathExists(godotPath)) {
                return godotPath;
            }
        }
        return null;
    }
    
    private async findPlatformDefault(): Promise<string | null> {
        const defaults = this.getPlatformDefaults();
        for (const location of defaults) {
            if (await fs.pathExists(location)) {
                return location;
            }
        }
        return null;
    }
    
    private getPlatformDefaults(): string[] {
        switch (process.platform) {
            case 'win32':
                return [
                    'C:\\Program Files\\Godot\\godot.exe',
                    'C:\\Program Files (x86)\\Godot\\godot.exe',
                    'C:\\Program Files\\Steam\\steamapps\\common\\Godot Engine\\godot.exe',
                    path.join(process.env.LOCALAPPDATA || '', 'Godot\\godot.exe')
                ];
            case 'darwin':
                return [
                    '/Applications/Godot.app/Contents/MacOS/Godot',
                    '/Applications/Godot_mono.app/Contents/MacOS/Godot',
                    path.join(process.env.HOME || '', 'Applications/Godot.app/Contents/MacOS/Godot')
                ];
            case 'linux':
                return [
                    '/usr/local/bin/godot',
                    '/usr/bin/godot',
                    '/opt/godot/godot',
                    path.join(process.env.HOME || '', '.local/bin/godot'),
                    // Flatpak
                    '/var/lib/flatpak/exports/bin/org.godotengine.Godot',
                    // Snap
                    '/snap/bin/godot'
                ];
            default:
                return [];
        }
    }
}
```

#### 2. ProcessManager (Node.js)
```typescript
interface ManagedProcess {
    pid: number;
    command: string;
    args: string[];
    startTime: Date;
    stdout: Readable;
    stderr: Readable;
    exitCode: number | null;
}

class ProcessManager {
    private processes: Map<number, ManagedProcess> = new Map();
    
    spawn(command: string, args: string[], options?: SpawnOptions): ManagedProcess {
        const child = spawn(command, args, {
            shell: false, // Security: no shell injection
            stdio: ['ignore', 'pipe', 'pipe'],
            ...options
        });
        
        const managed: ManagedProcess = {
            pid: child.pid!,
            command,
            args,
            startTime: new Date(),
            stdout: child.stdout,
            stderr: child.stderr,
            exitCode: null
        };
        
        this.processes.set(child.pid!, managed);
        
        child.on('exit', (code) => {
            managed.exitCode = code;
            Logger.info('ProcessManager', `Process ${child.pid} exited with code ${code}`);
        });
        
        return managed;
    }
    
    async terminate(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<boolean> {
        const process = this.processes.get(pid);
        if (!process) {
            throw new Error(`Process ${pid} not found`);
        }
        
        // Send signal
        try {
            process.kill(signal);
        } catch (error) {
            Logger.error('ProcessManager', `Failed to kill process ${pid}: ${error}`);
            return false;
        }
        
        // Wait for exit (5 seconds)
        const exitPromise = new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => {
                // Force kill if not exited
                try {
                    process.kill('SIGKILL');
                    resolve(true);
                } catch {
                    resolve(false);
                }
            }, 5000);
            
            process.once('exit', () => {
                clearTimeout(timeout);
                resolve(true);
            });
        });
        
        const success = await exitPromise;
        if (success) {
            this.processes.delete(pid);
        }
        return success;
    }
    
    getProcess(pid: number): ManagedProcess | undefined {
        return this.processes.get(pid);
    }
    
    listProcesses(): ManagedProcess[] {
        return Array.from(this.processes.values());
    }
}
```

#### 3. OutputCapture (Node.js)
```typescript
interface OutputLine {
    timestamp: Date;
    level: 'stdout' | 'stderr';
    text: string;
}

class OutputCapture {
    private buffer: OutputLine[] = [];
    private readonly maxLines = 10000;
    private readonly maxBytes = 10 * 1024 * 1024; // 10MB
    private currentBytes = 0;
    
    captureStream(stream: Readable, level: 'stdout' | 'stderr', callback?: (line: OutputLine) => void): void {
        const lineReader = readline.createInterface({ input: stream });
        
        lineReader.on('line', (text) => {
            const line: OutputLine = {
                timestamp: new Date(),
                level,
                text
            };
            
            this.addLine(line);
            
            if (callback) {
                callback(line);
            }
            
            // Broadcast to Web UI via SSE
            WebUIServer.getInstance().broadcastLog({
                timestamp: line.timestamp.toISOString(),
                level: level === 'stderr' ? 'error' : 'info',
                component: 'GodotProcess',
                message: line.text
            });
        });
    }
    
    private addLine(line: OutputLine): void {
        // Add to buffer
        this.buffer.push(line);
        this.currentBytes += Buffer.byteLength(line.text);
        
        // Evict oldest lines if over limits
        while (this.buffer.length > this.maxLines || this.currentBytes > this.maxBytes) {
            const removed = this.buffer.shift();
            if (removed) {
                this.currentBytes -= Buffer.byteLength(removed.text);
            }
        }
    }
    
    getLines(limit: number = 1000): OutputLine[] {
        return this.buffer.slice(-limit);
    }
    
    clear(): void {
        this.buffer = [];
        this.currentBytes = 0;
    }
}
```

#### 4. ProjectParser (Node.js)
```typescript
interface ProjectInfo {
    name: string;
    version: string;
    godotVersion: string;
    mainScene: string | null;
    autoloadScripts: { name: string; path: string }[];
    plugins: string[];
    scenes: number;
    scripts: number;
    totalSize: number;
}

class ProjectParser {
    async parseProjectFile(projectPath: string): Promise<ProjectInfo> {
        const configPath = path.join(projectPath, 'project.godot');
        
        if (!await fs.pathExists(configPath)) {
            throw new Error(`project.godot not found at ${projectPath}`);
        }
        
        const content = await fs.readFile(configPath, 'utf-8');
        const config = this.parseGodotConfig(content);
        
        // Extract project info
        const name = config['application']?.['config/name'] || path.basename(projectPath);
        const version = config['application']?.['config/version'] || '1.0.0';
        const godotVersion = config['']?.['config_version'] || 'unknown';
        const mainScene = config['application']?.['run/main_scene'] || null;
        
        // Parse autoloads
        const autoloadScripts = this.parseAutoloads(config);
        
        // Find plugins
        const plugins = await this.findPlugins(projectPath);
        
        // Count resources
        const { scenes, scripts, totalSize } = await this.countResources(projectPath);
        
        return {
            name,
            version,
            godotVersion,
            mainScene,
            autoloadScripts,
            plugins,
            scenes,
            scripts,
            totalSize
        };
    }
    
    private parseGodotConfig(content: string): Record<string, Record<string, string>> {
        const sections: Record<string, Record<string, string>> = {};
        let currentSection = '';
        
        for (const line of content.split('\n')) {
            const sectionMatch = line.match(/^\[(.+)\]$/);
            if (sectionMatch) {
                currentSection = sectionMatch[1];
                sections[currentSection] = {};
                continue;
            }
            
            const keyValueMatch = line.match(/^(\w+\/\w+)="?(.+?)"?$/);
            if (keyValueMatch && currentSection) {
                sections[currentSection][keyValueMatch[1]] = keyValueMatch[2].replace(/^"|"$/g, '');
            }
        }
        
        return sections;
    }
    
    private parseAutoloads(config: Record<string, Record<string, string>>): { name: string; path: string }[] {
        const autoloadSection = config['autoload'] || {};
        return Object.entries(autoloadSection).map(([name, path]) => ({
            name,
            path: path.replace(/^\*/, '') // Remove * prefix for enabled autoloads
        }));
    }
    
    private async findPlugins(projectPath: string): Promise<string[]> {
        const addonsPath = path.join(projectPath, 'addons');
        if (!await fs.pathExists(addonsPath)) {
            return [];
        }
        
        const entries = await fs.readdir(addonsPath, { withFileTypes: true });
        const plugins: string[] = [];
        
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const pluginCfg = path.join(addonsPath, entry.name, 'plugin.cfg');
                if (await fs.pathExists(pluginCfg)) {
                    plugins.push(entry.name);
                }
            }
        }
        
        return plugins;
    }
    
    private async countResources(projectPath: string): Promise<{ scenes: number; scripts: number; totalSize: number }> {
        let scenes = 0;
        let scripts = 0;
        let totalSize = 0;
        
        const walk = async (dir: string) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                // Skip internal folders
                if (entry.isDirectory() && ['.godot', '.import', '.mono', 'build'].includes(entry.name)) {
                    continue;
                }
                
                if (entry.isDirectory()) {
                    await walk(fullPath);
                } else {
                    const stats = await fs.stat(fullPath);
                    totalSize += stats.size;
                    
                    if (entry.name.endsWith('.tscn')) scenes++;
                    if (entry.name.endsWith('.gd') || entry.name.endsWith('.cs')) scripts++;
                }
            }
        };
        
        await walk(projectPath);
        
        return { scenes, scripts, totalSize };
    }
}
```

### Data Flow

**launch_godot_editor Flow:**
```
1. MCP Client → "launch_godot_editor" tool call
2. ExecutableDetector.detectGodotExecutable()
3. Validate project path exists
4. ProcessManager.spawn('godot', ['--path', projectPath, ...args])
5. OutputCapture.captureStream(stdout, 'stdout')
6. OutputCapture.captureStream(stderr, 'stderr')
7. Return { pid, executable, projectPath, startTime }
```

**get_godot_version Flow:**
```
1. MCP Client → "get_godot_version" tool call
2. ExecutableDetector.detectGodotExecutable()
3. ProcessManager.spawn('godot', ['--version'])
4. Capture stdout (one line output)
5. Parse: "4.6.0.stable.official [some-hash]"
6. Return { version: "4.6.0", stability: "stable", mono: false, hash: "..." }
```

**list_godot_projects Flow:**
```
1. MCP Client → "list_godot_projects" tool call (directories: ["/path/to/scan"])
2. Recursively scan directories (max depth: 3)
3. Find all "project.godot" files
4. For each: ProjectParser.parseProjectFile()
5. Extract: name, path, version, mainScene
6. Return array of ProjectInfo
```

---

## 2. Technology Stack

### New Dependencies

```json
{
  "fs-extra": "^11.2.0",      // Enhanced file system operations
  "glob": "^10.3.0",          // Pattern matching for file search
  "which": "^4.0.0"           // Find executables in PATH
}
```

### Godot Version Requirements

- **Minimum:** Godot 4.0
- **Recommended:** Godot 4.6+
- **Compatibility:** All tools compatible with Godot 4.x series

---

## 3. Implementation Approach

### Step-by-Step Implementation Sequence

**Day 1-2: Executable Detection & Version Check**

1. Implement ExecutableDetector class
   - Platform detection logic
   - PATH scanning
   - Default location checking
   - Caching mechanism
2. Implement get_godot_version tool
   - Spawn `godot --version`
   - Parse version string
   - Handle different output formats (4.0, 4.6, mono variants)
3. Unit tests for both components
4. Manual testing on Windows, macOS, Linux

**Day 3-4: Process Management & Editor Launch**

1. Implement ProcessManager class
   - spawn() method with security constraints
   - terminate() with graceful shutdown
   - Process registry
2. Implement OutputCapture class
   - Stream handling
   - Ring buffer implementation
   - SSE integration
3. Implement launch_godot_editor tool
   - Validate project path
   - Detect executable
   - Spawn editor process
   - Return process info
4. Implement run_godot_project tool
   - Support --headless flag
   - Support --scene parameter
   - Capture game output
5. Implement stop_godot_execution tool
   - SIGTERM → wait 5s → SIGKILL
   - Process cleanup
6. Integration tests

**Day 5: Project Discovery & Analysis**

1. Implement ProjectParser class
   - Godot config parser
   - Autoload extraction
   - Plugin detection
   - Resource counting
2. Implement list_godot_projects tool
   - Recursive directory scan
   - project.godot detection
   - Depth limit enforcement
3. Implement analyze_project tool
   - Parse project configuration
   - Count scenes/scripts
   - Calculate total size
   - List dependencies
4. Performance testing (1000-file projects)

**Day 6: Integration & Documentation**

1. Register all 6 tools with MCPServer
2. Create JSON Schemas for each tool
3. Write comprehensive unit tests
4. Write integration tests (spawn real Godot processes)
5. Update VitePress documentation
6. Create usage examples

### Critical Path Items

**P0 (Blocking):**
1. ExecutableDetector working on all platforms
2. ProcessManager can spawn and terminate Godot
3. launch_godot_editor tool functional

**P1 (Essential):**
4. get_godot_version for compatibility checking
5. OutputCapture streaming to Web UI
6. run_godot_project with output capture

**P2 (Nice-to-Have):**
7. list_godot_projects for discovery
8. analyze_project for project insights

### Module Boundaries and Interfaces

**Tool Interface (All Tools):**
```typescript
interface EditorTool {
    name: string;
    description: string;
    inputSchema: ZodSchema;
    execute(params: unknown): Promise<unknown>;
}
```

**launch_godot_editor Schema:**
```typescript
const LaunchEditorSchema = z.object({
    project_path: z.string().min(1).describe('Absolute path to Godot project directory'),
    editor_executable: z.string().optional().describe('Optional custom Godot executable path'),
    additional_args: z.array(z.string()).optional().describe('Additional command-line arguments'),
});

type LaunchEditorParams = z.infer<typeof LaunchEditorSchema>;
```

**Output Types:**
```typescript
interface ProcessInfo {
    pid: number;
    command: string;
    projectPath: string;
    startTime: string; // ISO 8601
    status: 'running' | 'exited';
}

interface GodotVersion {
    version: string;        // "4.6.0"
    stability: string;      // "stable" | "beta" | "rc"
    mono: boolean;
    hash: string | null;
    executable: string;
}

interface ProjectInfo {
    name: string;
    path: string;
    version: string;
    godotVersion: string;
    mainScene: string | null;
    autoloads: number;
    plugins: string[];
    scenes: number;
    scripts: number;
    totalSize: number; // bytes
}
```

### Error Handling

**Executable Not Found:**
```typescript
class GodotNotFoundError extends Error {
    constructor() {
        super('Godot executable not found. Install Godot or set GODOT_PATH environment variable.');
        this.name = 'GodotNotFoundError';
    }
}
```

**Invalid Project Path:**
```typescript
class InvalidProjectError extends Error {
    constructor(path: string) {
        super(`Invalid Godot project: project.godot not found at ${path}`);
        this.name = 'InvalidProjectError';
    }
}
```

**Process Spawn Failure:**
```typescript
class ProcessSpawnError extends Error {
    constructor(command: string, reason: string) {
        super(`Failed to spawn process '${command}': ${reason}`);
        this.name = 'ProcessSpawnError';
    }
}
```

---

## 4. Performance Considerations

### Executable Caching
- Cache detected Godot path for 1 hour
- Invalidate on explicit request
- Per-session caching (not persisted)

### Process Limits
- Max 5 concurrent Godot processes
- Enforce via ProcessManager semaphore
- Reject new spawns when limit reached

### Output Buffer Management
- Ring buffer: 10,000 lines max
- 10MB memory limit
- Automatic eviction (FIFO)

### Project Scanning Optimization
- Max depth: 3 levels (configurable)
- Skip large directories (>10,000 files)
- Parallel scanning (10 concurrent workers)

---

## 5. Security Design

### Command Injection Prevention

**Whitelisted Arguments Only:**
```typescript
const ALLOWED_GODOT_ARGS = [
    '--version',
    '--headless',
    '--path',
    '--scene',
    '--export',
    '--debug',
    '--verbose',
    '--quit'
];

function validateArgs(args: string[]): void {
    for (const arg of args) {
        const argName = arg.split('=')[0];
        if (!ALLOWED_GODOT_ARGS.includes(argName)) {
            throw new SecurityError(`Disallowed argument: ${argName}`);
        }
    }
}
```

**No Shell Execution:**
```typescript
// ❌ NEVER do this
spawn('godot --path ' + userInput, { shell: true });

// ✅ ALWAYS do this
spawn('godot', ['--path', userInput], { shell: false });
```

### Path Traversal Prevention

**Absolute Path Validation:**
```typescript
function validateProjectPath(userPath: string): string {
    // Resolve to absolute path
    const absolutePath = path.resolve(userPath);
    
    // Check if path is within allowed directories
    const allowedRoots = [
        process.env.PROJECTS_DIR || process.cwd(),
        os.homedir()
    ];
    
    const isAllowed = allowedRoots.some(root => 
        absolutePath.startsWith(path.resolve(root))
    );
    
    if (!isAllowed) {
        throw new SecurityError('Path outside allowed directories');
    }
    
    return absolutePath;
}
```

### Input Validation (Zod)

**All Tools:**
```typescript
// launch_godot_editor
const LaunchEditorSchema = z.object({
    project_path: z.string()
        .min(1, 'Project path required')
        .max(500, 'Path too long')
        .refine(p => !p.includes('..'), 'Path traversal not allowed'),
    editor_executable: z.string().max(500).optional(),
    additional_args: z.array(z.string().max(100)).max(10).optional()
});

// run_godot_project
const RunProjectSchema = z.object({
    project_path: z.string().min(1).max(500),
    headless: z.boolean().default(false),
    scene: z.string().max(500).optional(),
    timeout: z.number().min(0).max(3600).default(300) // 5min default, 1h max
});

// stop_godot_execution
const StopExecutionSchema = z.object({
    pid: z.number().int().positive(),
    force: z.boolean().default(false).describe('Use SIGKILL immediately')
});
```

---

## 6. Testing Strategy

### Unit Tests

**ExecutableDetector Tests:**
```typescript
describe('ExecutableDetector', () => {
    let detector: ExecutableDetector;
    
    beforeEach(() => {
        detector = new ExecutableDetector();
    });
    
    test('finds Godot in PATH', async () => {
        process.env.PATH = `/usr/bin:${process.env.PATH}`;
        // Mock fs.pathExists to return true for /usr/bin/godot
        jest.spyOn(fs, 'pathExists').mockResolvedValue(true);
        
        const path = await detector.detectGodotExecutable();
        expect(path).toContain('godot');
    });
    
    test('finds platform-specific default location', async () => {
        // Test varies by platform
        if (process.platform === 'win32') {
            jest.spyOn(fs, 'pathExists').mockImplementation(async (p) => 
                p.toString().includes('Program Files\\Godot')
            );
            
            const path = await detector.detectGodotExecutable();
            expect(path).toContain('Godot');
        }
    });
    
    test('throws error when not found', async () => {
        jest.spyOn(fs, 'pathExists').mockResolvedValue(false);
        
        await expect(detector.detectGodotExecutable()).rejects.toThrow('Godot executable not found');
    });
});
```

**ProcessManager Tests:**
```typescript
describe('ProcessManager', () => {
    let manager: ProcessManager;
    
    beforeEach(() => {
        manager = new ProcessManager();
    });
    
    test('spawns process and tracks it', () => {
        const proc = manager.spawn('echo', ['test']);
        
        expect(proc.pid).toBeGreaterThan(0);
        expect(proc.command).toBe('echo');
        expect(manager.getProcess(proc.pid)).toBeDefined();
    });
    
    test('terminates process gracefully', async () => {
        const proc = manager.spawn('sleep', ['10']);
        const success = await manager.terminate(proc.pid);
        
        expect(success).toBe(true);
        expect(proc.exitCode).not.toBeNull();
    });
    
    test('force kills after timeout', async () => {
        const proc = manager.spawn('sleep', ['100']);
        const success = await manager.terminate(proc.pid, 'SIGTERM');
        
        expect(success).toBe(true);
        // Should have been force killed after 5s
    });
});
```

### Integration Tests

**Real Godot Process:**
```typescript
describe('launch_godot_editor Integration', () => {
    let tool: LaunchGodotEditorTool;
    let testProjectPath: string;
    
    beforeAll(async () => {
        tool = new LaunchGodotEditorTool();
        testProjectPath = path.join(__dirname, 'fixtures', 'test-project');
        
        // Create minimal test project
        await fs.ensureDir(testProjectPath);
        await fs.writeFile(
            path.join(testProjectPath, 'project.godot'),
            '[application]\nconfig/name="Test"\n'
        );
    });
    
    afterAll(async () => {
        // Cleanup
        await fs.remove(testProjectPath);
    });
    
    test('launches Godot editor for valid project', async () => {
        const result = await tool.execute({
            project_path: testProjectPath
        });
        
        expect(result).toHaveProperty('pid');
        expect(result.status).toBe('running');
        
        // Stop process
        const stopTool = new StopGodotExecutionTool();
        await stopTool.execute({ pid: result.pid });
    }, 30000); // 30s timeout
    
    test('returns error for invalid project', async () => {
        await expect(tool.execute({
            project_path: '/nonexistent/path'
        })).rejects.toThrow('Invalid Godot project');
    });
});
```

### Manual Testing Scenarios

**Scenario 1: Launch Editor**
1. Open Claude Desktop
2. Ask: "Launch Godot editor for project at /path/to/my-game"
3. Verify: Godot opens with project loaded
4. Ask: "What is the PID of the Godot process?"
5. Verify: PID returned matches Task Manager/Activity Monitor

**Scenario 2: Run Headless Game**
1. Ask: "Run Godot project at /path/to/my-game in headless mode"
2. Verify: Game output streams to Web UI logs in real-time
3. Ask: "Stop the running Godot process"
4. Verify: Process terminates gracefully (exit code 0)

**Scenario 3: Version Detection**
1. Ask: "What version of Godot is installed?"
2. Verify: Returns correct version (e.g., "4.6.0.stable")
3. Test with multiple Godot versions if available

**Scenario 4: Project Discovery**
1. Ask: "List all Godot projects in /path/to/projects"
2. Verify: All projects found with correct names
3. Ask: "Analyze project at /path/to/projects/my-game"
4. Verify: Accurate count of scenes, scripts, plugins

### Target Coverage

- **editor/ folder:** 90%
- **process-manager.ts:** 95%
- **executable-detector.ts:** 90%
- **project-parser.ts:** 85%

---

## 7. Documentation Impact

### New API Reference Pages

**[docs/en/api/tools/editor-control.md](docs/en/api/tools/editor-control.md):**
```markdown
# Editor Control Tools

## launch_godot_editor

Launches the Godot editor for a specified project.

**Parameters:**
- `project_path` (string, required): Absolute path to project directory
- `editor_executable` (string, optional): Custom Godot executable path
- `additional_args` (string[], optional): Extra command-line arguments

**Returns:**
```json
{
  "pid": 12345,
  "executable": "/usr/bin/godot",
  "project_path": "/home/user/my-game",
  "start_time": "2026-02-04T10:30:00Z",
  "status": "running"
}
```

**Example:**
```
User: Launch Godot editor for my project at /home/user/my-platformer
Assistant: I'll launch the Godot editor for your project.
[Calls launch_godot_editor with project_path="/home/user/my-platformer"]
The editor is now running (PID: 54321).
```

## run_godot_project

Executes a Godot project in headless or normal mode.

**Parameters:**
- `project_path` (string, required): Project directory path
- `headless` (boolean, default: false): Run without rendering
- `scene` (string, optional): Specific scene to run
- `timeout` (number, default: 300): Max execution time in seconds

**Returns:** Same as launch_godot_editor

**Example:**
```
User: Run my game in headless mode to test the AI
Assistant: I'll run your game in headless mode.
[Calls run_godot_project with project_path="...", headless=true]
Game output will stream to the Web UI logs.
```
```

### Tutorial Updates

**[docs/en/getting-started.md](docs/en/getting-started.md):**
Add section:
```markdown
## Launching Your First Project

1. **Verify Godot Installation**
   Ask Claude: "What version of Godot is installed?"
   
2. **List Available Projects**
   Ask Claude: "List all Godot projects in ~/Documents/Godot"
   
3. **Open a Project**
   Ask Claude: "Launch Godot editor for project at ~/Documents/Godot/my-platformer"
   
4. **Run Your Game**
   Ask Claude: "Run the project in headless mode"
   
5. **Monitor Output**
   Open Web UI at http://localhost:8080 to see real-time logs
```

---

## 8. MCP Server Usage

### Required: Yes

### Tools Implemented

1. **launch_godot_editor**
   - Spawns Godot editor process
   - Returns process ID for tracking
   - Captures stdout/stderr

2. **run_godot_project**
   - Executes project (headless or normal)
   - Optional scene parameter
   - Timeout protection

3. **stop_godot_execution**
   - Graceful shutdown (SIGTERM)
   - Force kill fallback (SIGKILL)
   - Process cleanup

4. **get_godot_version**
   - Detects installed Godot version
   - Checks for mono build
   - Returns executable path

5. **list_godot_projects**
   - Scans directories recursively
   - Finds project.godot files
   - Returns project metadata

6. **analyze_project**
   - Parses project configuration
   - Counts resources (scenes, scripts)
   - Lists plugins and autoloads

### Resources: None

---

## 9. Estimated Effort

**Total: 7 days (1 week + 2 days buffer)**

**Breakdown:**
- Executable detection & version: 2 days
- Process management & launch tools: 3 days
- Project discovery & analysis: 1 day
- Testing & documentation: 1 day

---

## 10. Critical Path

**Dependencies:**
- ✅ Issue #2: Foundation & Communication Layer

**Blocks:**
- Issue #4: Read Tools (needs project context)
- Issue #5: Node Operations (needs running Godot)
- Issue #6: Write Tools - Scene Operations (needs project access)
- Issue #7: Write Tools - Script Operations (needs project access)

**Milestones:**
1. Day 2: Godot executable detection working
2. Day 4: Editor launch and process control functional
3. Day 7: All 6 tools implemented and tested

**Risks:**
- **Platform compatibility:** Different Godot install locations per OS
  - Mitigation: Extensive default location list + environment variable fallback
- **Process zombie:** Godot crashes leave orphaned processes
  - Mitigation: Timeout enforcement + cleanup on server shutdown
- **Output flooding:** Game generates massive stdout
  - Mitigation: Ring buffer with size limits (10MB max)

---

## Acceptance Criteria Checklist

- [ ] All 6 tools implemented and functional
- [ ] Cross-platform executable detection (Windows, macOS, Linux)
- [ ] Process spawning, monitoring, and termination working
- [ ] Output streaming to Web UI via SSE
- [ ] Error handling for missing Godot installations
- [ ] Timeout protection (5min default, configurable)
- [ ] All tools validated on 2+ platforms
- [ ] Unit test coverage >90%
- [ ] Integration tests with real Godot processes
- [ ] Documentation complete with examples
