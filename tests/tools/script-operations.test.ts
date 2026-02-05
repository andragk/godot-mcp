/**
 * Script Operations Tools Tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ScriptOperationsTools } from '../../src/tools/script-operations.js';
import { ValidationError } from '../../src/types/errors.js';

describe('Script Operations Tools', () => {
  let tools: ScriptOperationsTools;
  let testDir: string;

  beforeEach(async () => {
    tools = new ScriptOperationsTools();
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'script-ops-test-'));
    await fs.writeFile(path.join(testDir, 'project.godot'), 'config_version=5\n', 'utf-8');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('creates a script from a template', async () => {
    const result = await tools.createScript({
      projectPath: testDir,
      scriptPath: 'scripts/player.gd',
      template: 'node',
      validate: false,
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(result.scriptPath, 'utf-8');
    expect(content).toContain('extends Node');
    expect(content).toContain('class_name player');
  });

  it('modifies a script with insert and replace', async () => {
    const scriptPath = path.join(testDir, 'scripts', 'weapon.gd');
    await fs.mkdir(path.dirname(scriptPath), { recursive: true });
    await fs.writeFile(scriptPath, 'extends Node\n\nfunc _ready() -> void:\n\tpass\n', 'utf-8');

    const result = await tools.modifyScript({
      projectPath: testDir,
      scriptPath: 'scripts/weapon.gd',
      changes: [
        { type: 'insert', startLine: 2, newContent: '@export var damage: int = 10' },
        { type: 'replace', startLine: 4, endLine: 4, newContent: '\tprint("ready")' },
      ],
      validateAfter: false,
    });

    expect(result.success).toBe(true);
    const updated = await fs.readFile(scriptPath, 'utf-8');
    expect(updated).toContain('@export var damage: int = 10');
    expect(updated).toContain('print("ready")');
  });

  it('rejects invalid script creation when overwrite is false', async () => {
    await tools.createScript({
      projectPath: testDir,
      scriptPath: 'scripts/config.gd',
      template: 'empty',
      validate: false,
    });

    await expect(
      tools.createScript({
        projectPath: testDir,
        scriptPath: 'scripts/config.gd',
        template: 'empty',
        validate: false,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
