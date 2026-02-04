---
title: Security Architecture
description: Comprehensive security design including threat model, defense controls, authentication, authorization, and incident response procedures
outline: [2, 3]
---

# Security Architecture

Comprehensive security architecture for the Godot MCP Server with defense-in-depth approach, threat modeling, and layered security controls.

---

## Executive Summary

The Godot MCP Server security architecture prioritizes **defense in depth**, **least privilege**, and **secure by default** principles while maintaining developer-friendly ergonomics for localhost development.

**Security Posture**:
- **MVP (Phase 1)**: Localhost-only, no authentication, path traversal protection
- **Phase 2**: Optional API key authentication, rate limiting, audit logging, TLS support
- **Threat Level**: Medium (local development tools, trusted AI clients)
- **Compliance**: OWASP Top 10, CWE/SANS Top 25, Node.js Security Best Practices

**Key Security Objectives**:
1. Prevent unauthorized file system access beyond project directory
2. Protect against malicious tool invocations from compromised AI clients
3. Enable audit logging for forensic analysis
4. Support optional hardening for remote/team deployments

---

## Threat Model

### Asset Inventory

#### Critical Assets

| Asset | Description | Confidentiality | Integrity | Availability |
|-------|-------------|-----------------|-----------|--------------|
| Godot Project Files | `.gd`, `.tscn`, `.tres`, resources | High | High | Medium |
| Project Configuration | `project.godot`, `.godot/` cache | Medium | High | Medium |
| MCP Server Access | Tool invocation capabilities | Low | High | High |
| File System | Host machine file system | High | Critical | High |
| Audit Logs | Security event records (Phase 2) | Medium | Critical | Medium |
| API Keys | Authentication credentials (Phase 2) | Critical | Critical | Low |

#### Asset Risk Classification

- **Critical**: API keys, file system root access
- **High**: Godot source files, project configuration
- **Medium**: Cache files, audit logs, server access
- **Low**: Public documentation, icon files

### Threat Actors

#### Primary Threat Actors

| Actor | Motivation | Capability | Likelihood | Impact |
|-------|-----------|------------|------------|--------|
| **Malicious AI Agent** | Data exfiltration, sabotage | Medium (limited by MCP protocol) | Medium | High |
| **Compromised VS Code Extension** | Persistent access, data theft | High (full IDE access) | Low | Critical |
| **Insider Threat (Developer)** | Accidental misconfiguration | Low (trusted user) | High | Medium |
| **Supply Chain Attack** | npm package compromise | High (dependency access) | Low | Critical |
| **Network Attacker (Phase 2)** | MitM, credential theft | Medium (local network) | Low | High |

#### Malicious AI Agent (Primary Concern)

**Description**: Compromised Claude Desktop/VS Code MCP client sending malicious tool invocations

**Attack Vectors**:
- Path traversal attempts (`../../../etc/passwd`)
- File deletion operations (`delete_scene("important.tscn")`)
- Code injection via GDScript snippets
- Resource exhaustion (infinite file reads)

**Mitigations**: Input validation, path sanitization, operation allowlisting, rate limiting

**Feature Module-Specific Threats**:
- **Physics**: Collision layer name injection, invalid layer indices (>32), physics material exploitation
- **UI**: Control hierarchy injection, theme file tampering, anchor manipulation attacks
- **Animation**: Method track code execution, keyframe timing attacks, AnimationPlayer corruption
- **Settings**: Project.godot tampering, autoload injection, plugin activation attacks
- **Debug**: Log injection attacks, performance profiler DoS, output buffer overflow
- **Documentation**: Path traversal via doc generation, AST parser exploits, output file overwrites
- **UID**: UID collision attacks, cache poisoning, resource hijacking via UID manipulation

**Feature Module-Specific Threats**:
- **Physics**: Collision layer name injection, invalid layer indices, physics material exploitation
- **UI**: Control hierarchy injection, theme file tampering, anchor manipulation attacks
- **Animation**: Method track code execution, keyframe timing attacks, AnimationPlayer corruption
- **Settings**: Project.godot tampering, autoload injection, plugin activation attacks
- **Debug**: Log injection attacks, performance profiler DoS, output buffer overflow
- **Documentation**: Path traversal via doc generation, AST parser exploits, output file overwrites
- **UID**: UID collision attacks, cache poisoning, resource hijacking via UID manipulation

### Attack Vectors

#### Path Traversal (CWE-22)

**Severity**: Critical

**Attack Scenario**:
```typescript
// Malicious tool invocation
read_file({
  path: "../../../../../../etc/passwd"
})
```

**Exploitation Flow**:
1. AI client sends MCP tool request with `../` sequences
2. Node.js server resolves path relative to project root
3. Server reads sensitive system files outside project directory
4. Data exfiltrated via MCP response

**Mitigations**:
- Path normalization (`path.resolve()`, `path.normalize()`)
- Allowlist validation (must start with project root)
- Reject paths with `../`, `..\\`, symlinks
- Filesystem jail via `chroot` simulation

#### Arbitrary File Write/Delete (CWE-73)

**Severity**: Critical

**Attack Scenario**:
```typescript
// Malicious deletion
delete_file({
  path: "res://important_scene.tscn"
})

// Arbitrary write
write_scene({
  path: "res://autoload/backdoor.gd",
  content: "OS.execute('malicious_command', [])"
})

// Physics module abuse - malicious collision layers
configurePhysicsLayers({
  layers: [{ index: 1, name: "../../../autoload/backdoor" }]  // Path injection
})

// Settings module abuse - project.godot tampering
updateProjectSettings({
  category: "autoload",
  settings: { "malicious": "res://backdoor.gd" }  // Autoload injection
})
```

**Mitigations**:
- Confirmation prompts for destructive operations
- Write operation allowlist (no `autoload/` or `addons/`)
- File extension validation (only `.gd`, `.tscn`, `.tres`)
- Backup/restore capability
- Dry-run mode for destructive operations
- **Physics Module**: Validate layer names (no path separators, max 32 chars)
- **Settings Module**: Block autoload/plugin modification via MCP
- **UID Module**: Prevent UID tampering (read-only after assignment)

#### Code Injection via GDScript (CWE-94)

**Severity**: High

**Attack Scenarios**:
```typescript
// UI module - malicious Control script injection
createUIElement({
  type: "Button",
  script: "extends Button\nfunc _ready(): OS.execute('rm', ['-rf', '/'])"
})

// Animation module - method track code execution
createAnimation({
  tracks: [{
    type: "method",
    path: ".",
    keyframes: [{ time: 0, method: "queue_free" }]  // Malicious deletion
  }]
})

// Documentation module - script parsing exploitation
generateDocumentation({
  paths: ["res://../../../etc/passwd"]  // Path traversal via doc generation
})
```

**Mitigations**:
- Static analysis of generated GDScript (detect `OS.execute`, `HTTPRequest`)
- Developer review requirement for all script creation
- Sandbox Godot process (no network access by default)
- Content Security Policy for generated code
- **UI Module**: Validate Control node types against ClassDB allowlist
- **Animation Module**: Restrict method track targets (no OS/File/HTTP methods)
- **Debug Module**: Sanitize log output (prevent log injection attacks)

#### Resource Exhaustion (CWE-400)

**Severity**: Medium

**Mitigations**:
- Rate limiting (max 100 requests/minute per client)
- Request size limits (max 10MB per request)
- Timeout enforcement (10s per tool invocation)
- Circuit breaker pattern (halt after 10 errors)

### Risk Assessment Matrix

| Threat | Likelihood | Impact | Risk Level | Priority | Status |
|--------|------------|--------|------------|----------|--------|
| Path Traversal | High | Critical | **Critical** | P0 | MVP |
| Arbitrary File Deletion | Medium | Critical | **High** | P0 | MVP |
| Code Injection (GDScript) | Medium | High | **High** | P1 | MVP |
| Resource Exhaustion | Medium | Medium | **Medium** | P2 | Phase 2 |
| Supply Chain Attack | Low | Critical | **High** | P1 | MVP |
| MitM (Remote Access) | Low | High | **Medium** | P2 | Phase 2 |
| Compromised VS Code Ext | Low | Critical | **High** | P2 | Phase 2 |
| Credential Theft | Low | High | **Medium** | P2 | Phase 2 |

**Risk Scoring**: `Risk Level = Likelihood × Impact`

---

## Security Controls (MVP - Phase 1)

### Network Binding Restrictions

#### Localhost-Only Binding

**Control ID**: SEC-NET-001

**Implementation**:
```typescript
// src/config/server.config.ts
export const SERVER_CONFIG = {
  host: '127.0.0.1',  // MUST NOT be '0.0.0.0' in MVP
  port: 3000,
  allowedOrigins: ['http://localhost:*'],
} as const;

// src/server.ts
const server = http.createServer(app);
server.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => {
  console.log(`[SECURITY] Server bound to ${SERVER_CONFIG.host}:${SERVER_CONFIG.port} (localhost only)`);
});

// Runtime validation
if (SERVER_CONFIG.host === '0.0.0.0' && process.env.NODE_ENV === 'production') {
  throw new Error('SECURITY VIOLATION: 0.0.0.0 binding not allowed in production');
}
```

**Rationale**: Prevents external network access to MCP server, limiting attack surface to local machine.

**Verification**:
```bash
# Verify binding (should only show 127.0.0.1)
netstat -an | grep 3000
# Expected: tcp4  0  0  127.0.0.1.3000  *.*  LISTEN
```

### Input Validation & Sanitization

#### Zod Schema Validation

**Control ID**: SEC-VAL-001

```typescript
// src/validation/schemas.ts
import { z } from 'zod';
import path from 'path';

// Project root detection
const PROJECT_ROOT = process.cwd();

// Path validation schema
export const SafePathSchema = z.string()
  .trim()
  .min(1, 'Path cannot be empty')
  .max(4096, 'Path exceeds maximum length')
  .refine(
    (p) => !p.includes('\0'),
    'Path contains null bytes'
  )
  .refine(
    (p) => !/\.\.[/\\]/.test(p) && !/[/\\]\.\./.test(p),
    'Path contains traversal sequences (..)'
  )
  .refine(
    (p) => {
      const normalized = path.normalize(p);
      const resolved = path.resolve(PROJECT_ROOT, normalized);
      return resolved.startsWith(PROJECT_ROOT);
    },
    'Path escapes project directory'
  )
  .transform((p) => {
    // Convert res:// to absolute path
    if (p.startsWith('res://')) {
      return path.join(PROJECT_ROOT, p.slice(6));
    }
    return path.resolve(PROJECT_ROOT, p);
  });
```

#### Path Sanitization Pipeline

**Control ID**: SEC-VAL-002

```typescript
// src/security/path-sanitizer.ts
export class PathSanitizer {
  constructor(private readonly projectRoot: string) {}

  /**
   * Sanitize and validate file path
   * @throws {SecurityError} if path is unsafe
   */
  async sanitize(unsafePath: string): Promise<string> {
    // 1. Remove null bytes
    if (unsafePath.includes('\0')) {
      throw new SecurityError('Path contains null bytes', 'SEC-VAL-002');
    }

    // 2. Normalize path separators
    const normalized = path.normalize(unsafePath);

    // 3. Resolve to absolute path
    const resolved = path.resolve(this.projectRoot, normalized);

    // 4. Verify path is within project root
    if (!resolved.startsWith(this.projectRoot)) {
      throw new SecurityError(
        `Path traversal detected: ${unsafePath} resolves outside project root`,
        'SEC-VAL-002'
      );
    }

    // 5. Check for symbolic links (prevent symlink attacks)
    try {
      const realPath = await fs.realpath(resolved);
      if (!realPath.startsWith(this.projectRoot)) {
        throw new SecurityError(
          `Symlink traversal detected: ${resolved} -> ${realPath}`,
          'SEC-VAL-002'
        );
      }
    } catch (error) {
      // File doesn't exist yet (e.g., write operation) - allow
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return resolved;
  }

  validateExtension(filePath: string, allowedExtensions: string[]): void {
    const ext = path.extname(filePath).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      throw new SecurityError(
        `File extension ${ext} not allowed`,
        'SEC-VAL-002'
      );
    }
  }
}
```

### File Operation Validation

#### Read Operations

**Control ID**: SEC-FILE-001

```typescript
const ALLOWED_READ_EXTENSIONS = [
  '.gd', '.tscn', '.tres', '.godot', '.import',
  '.md', '.txt', '.json', '.cfg', '.xml',
  '.png', '.jpg', '.svg', '.wav', '.ogg'
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function readFileTool(args: ReadFileInput): Promise<ReadFileOutput> {
  const sanitizer = new PathSanitizer(PROJECT_ROOT);
  
  // 1. Sanitize path
  const safePath = await sanitizer.sanitize(args.path);
  
  // 2. Validate extension
  sanitizer.validateExtension(safePath, ALLOWED_READ_EXTENSIONS);
  
  // 3. Check file exists and is readable
  const stat = await fs.stat(safePath);
  if (!stat.isFile()) {
    throw new SecurityError(`Path is not a file: ${args.path}`, 'SEC-FILE-001');
  }
  
  // 4. Check file size
  if (stat.size > MAX_FILE_SIZE) {
    throw new SecurityError(
      `File size ${stat.size} exceeds limit ${MAX_FILE_SIZE}`,
      'SEC-FILE-001'
    );
  }
  
  // 5. Read file with explicit encoding
  const content = await fs.readFile(safePath, args.encoding);
  
  // 6. Audit log
  auditLog({
    action: 'file_read',
    path: safePath,
    size: stat.size,
    timestamp: new Date(),
  });
  
  return { content, path: safePath, size: stat.size };
}
```

#### Write Operations

**Control ID**: SEC-FILE-002

```typescript
const ALLOWED_WRITE_EXTENSIONS = ['.gd', '.tscn', '.tres', '.md', '.json', '.cfg'];
const BLOCKED_WRITE_PATHS = [
  'autoload/',      // Prevent autoload injection
  'addons/',        // Prevent plugin injection
  '.godot/',        // Prevent cache tampering
];

export async function writeFileTool(args: WriteFileInput): Promise<WriteFileOutput> {
  const sanitizer = new PathSanitizer(PROJECT_ROOT);
  
  // 1. Sanitize path
  const safePath = await sanitizer.sanitize(args.path);
  
  // 2. Validate extension
  sanitizer.validateExtension(safePath, ALLOWED_WRITE_EXTENSIONS);
  
  // 3. Check blocked paths
  const relativePath = path.relative(PROJECT_ROOT, safePath);
  for (const blockedPath of BLOCKED_WRITE_PATHS) {
    if (relativePath.startsWith(blockedPath)) {
      throw new SecurityError(
        `Write operation blocked: ${blockedPath} is protected`,
        'SEC-FILE-002'
      );
    }
  }
  
  // 4. Create backup if file exists
  if (args.createBackup) {
    try {
      const backupPath = `${safePath}.backup.${Date.now()}`;
      await fs.copyFile(safePath, backupPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
  
  // 5. Write file atomically
  const tempPath = `${safePath}.tmp.${process.pid}`;
  await fs.writeFile(tempPath, args.content, 'utf8');
  await fs.rename(tempPath, safePath);
  
  return { path: safePath, size: args.content.length };
}
```

### Error Handling

#### Safe Error Responses

**Control ID**: SEC-ERR-001

```typescript
export class ErrorHandler {
  static sanitizeError(error: Error): MCPErrorResponse {
    // Development mode: Full error details
    if (process.env.NODE_ENV === 'development') {
      return {
        code: 'INTERNAL_ERROR',
        message: error.message,
        details: {
          stack: error.stack,
          name: error.name,
        },
      };
    }

    // Production mode: Generic error messages
    if (error instanceof SecurityError) {
      return {
        code: error.code,
        message: 'Security policy violation',
        // DO NOT expose details (path, user, system info)
      };
    }

    // Generic error (hide internal details)
    return {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      // DO NOT expose stack traces, file paths, or system info
    };
  }
}
```

---

## Security Controls (Phase 2)

### API Key Authentication

#### API Key Format & Storage

**Control ID**: SEC-AUTH-001

```typescript
// API Key Format: godot-mcp-<version>-<random>-<checksum>
// Example: godot-mcp-v1-a7f3c9e2d8b1-4f8e

export class APIKeyManager {
  generateAPIKey(): string {
    const version = 'v1';
    const random = crypto.randomBytes(16).toString('hex');
    const checksum = crypto
      .createHash('sha256')
      .update(random)
      .digest('hex')
      .slice(0, 4);
    
    return `godot-mcp-${version}-${random}-${checksum}`;
  }

  validateKeyFormat(key: string): boolean {
    const pattern = /^godot-mcp-(v\d+)-([a-f0-9]{32})-([a-f0-9]{4})$/;
    const match = key.match(pattern);
    
    if (!match) return false;
    
    const [, version, random, checksum] = match;
    const expectedChecksum = crypto
      .createHash('sha256')
      .update(random)
      .digest('hex')
      .slice(0, 4);
    
    return checksum === expectedChecksum;
  }

  hashKey(key: string): string {
    return crypto
      .pbkdf2Sync(key, process.env.API_KEY_SALT!, 100000, 64, 'sha512')
      .toString('hex');
  }
}
```

#### Authentication Middleware

**Control ID**: SEC-AUTH-003

```typescript
export function authenticateAPIKey(req: Request, res: Response, next: NextFunction): void {
  // Skip auth if disabled (MVP mode)
  if (!process.env.REQUIRE_API_KEY) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Missing or invalid Authorization header',
      code: 'UNAUTHORIZED',
    });
  }

  const apiKey = authHeader.slice(7);
  
  // Validate format
  if (!keyManager.validateKeyFormat(apiKey)) {
    return res.status(401).json({
      error: 'Invalid API key format',
      code: 'INVALID_API_KEY',
    });
  }

  // Verify key against database
  const keyHash = keyManager.hashKey(apiKey);
  const keyRecord = await keyStore.findByHash(keyHash);
  
  if (!keyRecord || keyRecord.revokedAt) {
    auditLog({
      action: 'auth_failed',
      reason: keyRecord?.revokedAt ? 'revoked' : 'not_found',
      timestamp: new Date(),
    });
    return res.status(401).json({
      error: 'Invalid or revoked API key',
      code: 'UNAUTHORIZED',
    });
  }

  req.apiKey = keyRecord;
  next();
}
```

### Rate Limiting

#### Per-Client Rate Limiting

**Control ID**: SEC-RATE-001

```typescript
import rateLimit from 'express-rate-limit';

// Global rate limiter
export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  keyGenerator: (req) => {
    return req.apiKey?.id || req.ip;
  },
});

// Per-tool rate limiting
export const toolRateLimiter = {
  read: rateLimit({
    windowMs: 60 * 1000,
    max: 60, // 60 reads per minute
  }),
  
  write: rateLimit({
    windowMs: 60 * 1000,
    max: 20, // 20 writes per minute
  }),
  
  delete: rateLimit({
    windowMs: 60 * 1000,
    max: 5, // 5 deletions per minute
  }),
};
```

### Audit Logging

#### Comprehensive Audit Trail

**Control ID**: SEC-AUDIT-001

```typescript
interface AuditEvent {
  timestamp: Date;
  action: string;
  actorId?: string;
  actorIP?: string;
  resourceType?: string;
  resourcePath?: string;
  outcome: 'success' | 'failure';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details?: Record<string, unknown>;
}

export const auditLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: 'audit-%DATE%.log',
      dirname: path.join(os.homedir(), '.godot-mcp', 'logs'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '90d',
      maxSize: '100m',
    }),
  ],
});

export function auditLog(event: Partial<AuditEvent>): void {
  const fullEvent: AuditEvent = {
    timestamp: new Date(),
    action: event.action || 'unknown',
    outcome: event.outcome || 'success',
    severity: event.severity || 'LOW',
    ...event,
  };

  // Never log sensitive data
  if (fullEvent.details) {
    delete fullEvent.details.apiKey;
    delete fullEvent.details.password;
    delete fullEvent.details.token;
  }

  auditLogger.info(fullEvent);
}
```

### TLS/HTTPS for Remote Access

#### TLS Configuration

**Control ID**: SEC-TLS-001

```typescript
export function createSecureServer(app: Express): https.Server {
  // Require TLS if not localhost
  if (SERVER_CONFIG.host !== '127.0.0.1' && !process.env.TLS_CERT_PATH) {
    throw new Error('TLS certificate required for non-localhost binding');
  }

  const tlsOptions: https.ServerOptions = {
    key: fs.readFileSync(process.env.TLS_KEY_PATH!),
    cert: fs.readFileSync(process.env.TLS_CERT_PATH!),
    
    // Strong TLS configuration
    minVersion: 'TLSv1.3',
    ciphers: [
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_128_GCM_SHA256',
    ].join(':'),
    
    requestCert: process.env.REQUIRE_CLIENT_CERT === 'true',
    rejectUnauthorized: process.env.REQUIRE_CLIENT_CERT === 'true',
  };

  return https.createServer(tlsOptions, app);
}
```

---

## Authorization Model

### Permission-Based Access Control

**Control ID**: SEC-AUTHZ-001

```typescript
export enum Permission {
  // Read permissions
  READ_FILE = 'file:read',
  READ_SCENE = 'scene:read',
  READ_PROJECT = 'project:read',
  
  // Write permissions
  WRITE_FILE = 'file:write',
  WRITE_SCENE = 'scene:write',
  
  // Delete permissions
  DELETE_FILE = 'file:delete',
  DELETE_SCENE = 'scene:delete',
  
  // Admin permissions
  MANAGE_KEYS = 'admin:keys',
  VIEW_AUDIT_LOGS = 'admin:audit',
}

// Pre-defined roles
export const ROLES = {
  READONLY: [
    Permission.READ_FILE,
    Permission.READ_SCENE,
    Permission.READ_PROJECT,
  ],
  
  DEVELOPER: [
    Permission.READ_FILE,
    Permission.READ_SCENE,
    Permission.READ_PROJECT,
    Permission.WRITE_FILE,
    Permission.WRITE_SCENE,
  ],
  
  ADMIN: Object.values(Permission),
} as const;
```

### Authorization Middleware

**Control ID**: SEC-AUTHZ-002

```typescript
export function authorize(...requiredPermissions: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const keyRecord = req.apiKey;
    
    for (const permission of requiredPermissions) {
      if (!keyRecord.permissions.includes(permission)) {
        auditLog({
          action: 'authorization_failed',
          actorId: keyRecord.id,
          requiredPermission: permission,
          severity: 'MEDIUM',
          timestamp: new Date(),
        });
        
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
        });
      }
    }
    
    next();
  };
}

// Usage
app.post('/tools/read_file', 
  authenticateAPIKey,
  authorize(Permission.READ_FILE),
  handleReadFile
);
```

---

## Secure Coding Practices

### Secrets Management

#### Never Log Secrets

**Control ID**: SEC-CODE-001

```typescript
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /password/i,
  /token/i,
  /secret/i,
  /credential/i,
];

const REDACTED = '[REDACTED]';

export function sanitizeLogData(data: any): any {
  if (typeof data === 'object' && data !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
        sanitized[key] = REDACTED;
      } else {
        sanitized[key] = sanitizeLogData(value);
      }
    }
    return sanitized;
  }
  return data;
}
```

### Dependency Management

#### Dependency Pinning

**Control ID**: SEC-CODE-004

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.0.0",
    "express": "4.18.2",
    "zod": "3.22.4"
  },
  "scripts": {
    "audit": "npm audit --audit-level=moderate",
    "audit:fix": "npm audit fix"
  }
}
```

---

## Security Testing

### Penetration Testing Scenarios

**Test Suite: Path Traversal**

```typescript
describe('Path Traversal Prevention', () => {
  test('should reject ../ sequences', async () => {
    const response = await client.callTool('read_file', {
      path: '../../../etc/passwd',
    });
    
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe('SEC-VAL-002');
  });

  test('should reject null byte injection', async () => {
    const response = await client.callTool('read_file', {
      path: 'legitimate.gd\0../../../etc/passwd',
    });
    
    expect(response.error).toBeDefined();
  });

  test('should reject symlink traversal', async () => {
    await fs.symlink('/etc/passwd', path.join(PROJECT_ROOT, 'link'));
    
    const response = await client.callTool('read_file', {
      path: 'res://link',
    });
    
    expect(response.error).toBeDefined();
  });
});
```

---

## Incident Response

### Security Monitoring

**Control ID**: SEC-IR-001

```typescript
export class SecurityMonitor {
  private readonly alertThresholds = {
    failedAuthAttempts: 5,
    pathTraversalAttempts: 3,
    errorRate: 0.5,
    requestRate: 1000,
  };

  async monitorSecurityEvents(): Promise<void> {
    const interval = 60 * 1000;
    
    setInterval(async () => {
      const events = await this.getRecentEvents(interval);
      
      await this.detectBruteForce(events);
      await this.detectPathTraversal(events);
      await this.detectDataExfiltration(events);
    }, interval);
  }

  private async detectDataExfiltration(events: AuditEvent[]): Promise<void> {
    const readOperations = events.filter(e => e.action === 'file_read');
    const totalBytesRead = readOperations.reduce((sum, e) => sum + (e.details?.size || 0), 0);
    
    if (totalBytesRead > 100 * 1024 * 1024) {
      await this.createSecurityAlert({
        type: 'POTENTIAL_DATA_EXFILTRATION',
        severity: 'HIGH',
        details: { bytesRead: totalBytesRead },
      });
    }
  }
}
```

### Emergency Shutdown

**Control ID**: SEC-IR-003

```typescript
export class MCPServer {
  async emergencyShutdown(reason: string): Promise<void> {
    auditLog({
      action: 'emergency_shutdown',
      severity: 'CRITICAL',
      details: { reason },
      timestamp: new Date(),
    });

    // Stop accepting connections
    this.httpServer.close();

    // Revoke all sessions
    await sessionManager.revokeAllSessions();

    // Flush logs
    await auditLogger.end();

    process.exit(1);
  }
}
```

---

## Compliance & Standards

### OWASP Top 10 Coverage

| OWASP Risk | Relevance | Mitigation | Status |
|------------|-----------|------------|--------|
| A01:2021 Broken Access Control | High | Path validation, permission system | ✅ MVP |
| A02:2021 Cryptographic Failures | Medium | TLS, encrypted key storage | 🟡 Phase 2 |
| A03:2021 Injection | Medium | Input validation, Zod schemas | ✅ MVP |
| A04:2021 Insecure Design | Medium | Threat modeling, secure architecture | ✅ MVP |
| A05:2021 Security Misconfiguration | High | Localhost binding, secure defaults | ✅ MVP |
| A06:2021 Vulnerable Components | Medium | Dependency scanning, pinning | ✅ MVP |
| A07:2021 Auth Failures | Medium | API key auth, rate limiting | 🟡 Phase 2 |
| A08:2021 Software & Data Integrity | High | Dependency verification, audit logs | ✅ MVP |
| A09:2021 Logging Failures | Low | Comprehensive audit logging | ✅ MVP |
| A10:2021 SSRF | Low | Network isolation (localhost only) | ✅ MVP |

**Legend**: ✅ Implemented, 🟡 Planned

### CWE/SANS Top 25 Coverage

- ✅ **CWE-22**: Path Traversal → Sanitization, validation
- ✅ **CWE-73**: External Control of File Name → Allowlisting
- ✅ **CWE-94**: Code Injection → GDScript static analysis
- ✅ **CWE-200**: Information Exposure → Error sanitization
- ✅ **CWE-400**: Resource Exhaustion → Rate limiting
- 🟡 **CWE-287**: Improper Authentication → API keys (Phase 2)
- 🟡 **CWE-352**: CSRF → CSRF tokens (Phase 2)

---

## Defense in Depth Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 7: Application                      │
│  • Input validation (Zod schemas)                            │
│  • Path sanitization (traversal prevention)                  │
│  • Output sanitization (no internal paths)                   │
│  • Rate limiting (per-client throttling)                     │
│  • Circuit breaker (failure protection)                      │
└─────────────────────────────────────────────────────────────┘
                             │
┌─────────────────────────────────────────────────────────────┐
│                  Layer 6: Authentication                     │
│  MVP: No authentication (localhost trust)                    │
│  Phase 2: API key authentication                             │
│           - PBKDF2 hashed storage                            │
│           - Encrypted keys file (AES-256)                    │
└─────────────────────────────────────────────────────────────┘
                             │
┌─────────────────────────────────────────────────────────────┐
│                    Layer 5: Transport                        │
│  MVP: HTTP (localhost only)                                  │
│  Phase 2: HTTPS (TLS 1.3, strong ciphers)                    │
│           - HSTS headers                                     │
│           - Certificate validation                           │
└─────────────────────────────────────────────────────────────┘
                             │
┌─────────────────────────────────────────────────────────────┐
│                     Layer 4: Network                         │
│  • Localhost binding (127.0.0.1 only)                        │
│  • Firewall validation                                       │
│  • No 0.0.0.0 binding in MVP                                 │
└─────────────────────────────────────────────────────────────┘
                             │
┌─────────────────────────────────────────────────────────────┐
│                    Layer 3: Monitoring                       │
│  • Audit logging (all operations)                            │
│  • Security monitoring (attack detection)                    │
│  • Anomaly detection (behavioral analysis)                   │
└─────────────────────────────────────────────────────────────┘
                             │
┌─────────────────────────────────────────────────────────────┐
│                  Layer 2: Incident Response                  │
│  • Circuit breaker (automatic failure recovery)              │
│  • Emergency shutdown (critical incidents)                   │
│  • Backup & restore (data recovery)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Checklist

### MVP Deployment

- [ ] Verify `HOST=127.0.0.1` in production config
- [ ] Run `npm audit` before deployment
- [ ] Enable audit logging (`ENABLE_AUDIT_LOGGING=true`)
- [ ] Test path traversal protection
- [ ] Verify error messages don't leak internal paths
- [ ] Configure log rotation (90 days retention)
- [ ] Document backup/restore procedure
- [ ] Set up security monitoring alerts
- [ ] Review all tool permissions
- [ ] Test circuit breaker behavior

### Phase 2 Deployment

- [ ] Generate and securely store API keys
- [ ] Configure TLS certificates (if non-localhost)
- [ ] Enable rate limiting
- [ ] Test API key authentication
- [ ] Verify authorization middleware
- [ ] Configure HSTS headers
- [ ] Test emergency shutdown procedure
- [ ] Validate audit log analysis pipeline
- [ ] Perform penetration testing
- [ ] Document security incident response plan

---

## See Also

- [System Architecture Overview](./overview.md) - Overall system design
- [API Tools Reference](../api/tools.md) - Tool specifications and validation
- [Best Practices](../best-practices.md) - Security best practices for users
- [Implementation Guide](../implementation/setup.md) - Secure development setup
