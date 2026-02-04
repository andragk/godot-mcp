/**
 * Backup Manager Tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BackupManager } from '../../src/utils/backup-manager.js';
import { mkdir, writeFile, rm, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

describe('BackupManager', () => {
  let testDir: string;
  let backupManager: BackupManager;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = join(tmpdir(), `backup-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    backupManager = new BackupManager({
      maxBackupsPerFile: 3,
    });
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('createBackup', () => {
    it('should create a backup and metadata file', async () => {
      // Create test file
      const testFile = 'test.tscn';
      const testPath = join(testDir, testFile);
      const content = '[gd_scene load_steps=1 format=3]\n[node name="Root" type="Node"]';
      await writeFile(testPath, content, 'utf-8');

      // Create backup
      const metadata = await backupManager.createBackup(
        testDir,
        testFile,
        'modify_scene'
      );

      expect(metadata).toBeDefined();
      expect(metadata.originalPath).toBe(testFile);
      expect(metadata.operation).toBe('modify_scene');
      expect(metadata.fileHash).toBeTruthy();
      expect(metadata.fileSize).toBeGreaterThan(0);

      // Verify backup files exist
      const backupDir = join(testDir, '.godot', 'mcp-backups');
      const files = await readdir(backupDir);
      
      const backupFiles = files.filter(f => f.endsWith('.backup'));
      const metaFiles = files.filter(f => f.endsWith('.meta.json'));
      
      expect(backupFiles).toHaveLength(1);
      expect(metaFiles).toHaveLength(1);
    });

    it('should include parameters in metadata', async () => {
      const testFile = 'scene.tscn';
      const testPath = join(testDir, testFile);
      await writeFile(testPath, 'test content', 'utf-8');

      const params = { nodeCount: 5, addedNodes: ['Player', 'Enemy'] };
      const metadata = await backupManager.createBackup(
        testDir,
        testFile,
        'add_node',
        params
      );

      expect(metadata.parameters).toEqual(params);
    });

    it('should create nested backup directories', async () => {
      const testFile = 'scenes/levels/level1.tscn';
      const testPath = join(testDir, testFile);
      await mkdir(join(testDir, 'scenes', 'levels'), { recursive: true });
      await writeFile(testPath, 'content', 'utf-8');

      await backupManager.createBackup(testDir, testFile, 'test');

      const backupDir = join(testDir, '.godot', 'mcp-backups', 'scenes', 'levels');
      const files = await readdir(backupDir);
      expect(files.length).toBeGreaterThan(0);
    });

    it('should generate unique backup filenames with timestamps', async () => {
      const testFile = 'test.tscn';
      const testPath = join(testDir, testFile);
      await writeFile(testPath, 'content', 'utf-8');

      // Create multiple backups
      const metadata1 = await backupManager.createBackup(testDir, testFile, 'op1');
      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait 1.1s
      const metadata2 = await backupManager.createBackup(testDir, testFile, 'op2');

      expect(metadata1.backupPath).not.toBe(metadata2.backupPath);
      expect(metadata1.timestamp.getTime()).toBeLessThan(metadata2.timestamp.getTime());
    });
  });

  describe('restoreBackup', () => {
    it('should restore file from backup', async () => {
      const testFile = 'test.tscn';
      const testPath = join(testDir, testFile);
      const originalContent = 'original content';
      await writeFile(testPath, originalContent, 'utf-8');

      // Create backup
      const metadata = await backupManager.createBackup(testDir, testFile, 'test');

      // Modify original file
      const modifiedContent = 'modified content';
      await writeFile(testPath, modifiedContent, 'utf-8');

      // Verify file was modified
      const afterModification = await readFile(testPath, 'utf-8');
      expect(afterModification).toBe(modifiedContent);

      // Restore backup
      await backupManager.restoreBackup(testDir, metadata.backupPath);

      // Verify restoration
      const restoredContent = await readFile(testPath, 'utf-8');
      expect(restoredContent).toBe(originalContent);
    });

    it('should throw error if backup hash does not match', async () => {
      const testFile = 'test.tscn';
      const testPath = join(testDir, testFile);
      await writeFile(testPath, 'content', 'utf-8');

      const metadata = await backupManager.createBackup(testDir, testFile, 'test');

      // Corrupt backup file
      const backupPath = join(testDir, metadata.backupPath);
      await writeFile(backupPath, 'corrupted content', 'utf-8');

      // Attempt restore should fail
      await expect(
        backupManager.restoreBackup(testDir, metadata.backupPath)
      ).rejects.toThrow('integrity check failed');
    });

    it('should restore to nested paths', async () => {
      const testFile = 'scenes/level.tscn';
      const testPath = join(testDir, testFile);
      await mkdir(join(testDir, 'scenes'), { recursive: true });
      await writeFile(testPath, 'original', 'utf-8');

      const metadata = await backupManager.createBackup(testDir, testFile, 'test');

      // Delete original
      await rm(testPath);

      // Restore
      await backupManager.restoreBackup(testDir, metadata.backupPath);

      // Verify restoration
      const content = await readFile(testPath, 'utf-8');
      expect(content).toBe('original');
    });
  });

  describe('listBackups', () => {
    it('should return empty array if no backups exist', async () => {
      const backups = await backupManager.listBackups(testDir, 'nonexistent.tscn');
      expect(backups).toEqual([]);
    });

    it('should list all backups for a file', async () => {
      const testFile = 'test.tscn';
      const testPath = join(testDir, testFile);
      await writeFile(testPath, 'content', 'utf-8');

      // Create multiple backups
      await backupManager.createBackup(testDir, testFile, 'op1');
      await new Promise(resolve => setTimeout(resolve, 1100));
      await backupManager.createBackup(testDir, testFile, 'op2');
      await new Promise(resolve => setTimeout(resolve, 1100));
      await backupManager.createBackup(testDir, testFile, 'op3');

      const backups = await backupManager.listBackups(testDir, testFile);
      expect(backups).toHaveLength(3);
    });

    it('should return backups sorted by timestamp (newest first)', async () => {
      const testFile = 'test.tscn';
      const testPath = join(testDir, testFile);
      await writeFile(testPath, 'content', 'utf-8');

      const m1 = await backupManager.createBackup(testDir, testFile, 'op1');
      await new Promise(resolve => setTimeout(resolve, 1100));
      const m2 = await backupManager.createBackup(testDir, testFile, 'op2');
      await new Promise(resolve => setTimeout(resolve, 1100));
      const m3 = await backupManager.createBackup(testDir, testFile, 'op3');

      const backups = await backupManager.listBackups(testDir, testFile);
      
      expect(backups[0].timestamp.getTime()).toBeGreaterThanOrEqual(m3.timestamp.getTime());
      expect(backups[2].timestamp.getTime()).toBeLessThanOrEqual(m1.timestamp.getTime());
    });

    it('should only list backups for specific file', async () => {
      await mkdir(join(testDir, 'scenes'), { recursive: true });
      
      const file1 = 'test1.tscn';
      const file2 = 'test2.tscn';
      
      await writeFile(join(testDir, file1), 'content1', 'utf-8');
      await writeFile(join(testDir, file2), 'content2', 'utf-8');

      await backupManager.createBackup(testDir, file1, 'op');
      await backupManager.createBackup(testDir, file2, 'op');

      const backups1 = await backupManager.listBackups(testDir, file1);
      const backups2 = await backupManager.listBackups(testDir, file2);

      expect(backups1).toHaveLength(1);
      expect(backups2).toHaveLength(1);
      expect(backups1[0].originalPath).toBe(file1);
      expect(backups2[0].originalPath).toBe(file2);
    });
  });

  describe('cleanupOldBackups', () => {
    it('should keep only the most recent N backups', async () => {
      const testFile = 'test.tscn';
      const testPath = join(testDir, testFile);
      await writeFile(testPath, 'content', 'utf-8');

      // Create 5 backups (max is 3)
      for (let i = 0; i < 5; i++) {
        await backupManager.createBackup(testDir, testFile, `op${i}`);
        await new Promise(resolve => setTimeout(resolve, 1100));
      }

      const backups = await backupManager.listBackups(testDir, testFile);
      expect(backups).toHaveLength(3); // Should have already cleaned up during creation
    }, 10000); // 10 second timeout

    it('should delete oldest backups first', async () => {
      const testFile = 'test.tscn';
      const testPath = join(testDir, testFile);
      await writeFile(testPath, 'content', 'utf-8');

      const timestamps: number[] = [];
      for (let i = 0; i < 5; i++) {
        const metadata = await backupManager.createBackup(testDir, testFile, `op${i}`);
        timestamps.push(metadata.timestamp.getTime());
        await new Promise(resolve => setTimeout(resolve, 1100));
      }

      const backups = await backupManager.listBackups(testDir, testFile);
      
      // Should keep the 3 newest
      const remainingTimestamps = backups.map(b => b.timestamp.getTime());
      expect(remainingTimestamps).toContain(timestamps[4]);
      expect(remainingTimestamps).toContain(timestamps[3]);
      expect(remainingTimestamps).toContain(timestamps[2]);
      expect(remainingTimestamps).not.toContain(timestamps[0]);
      expect(remainingTimestamps).not.toContain(timestamps[1]);
    }, 10000); // 10 second timeout

    it('should return deleted count', async () => {
      const testFile = 'test.tscn';
      const testPath = join(testDir, testFile);
      await writeFile(testPath, 'content', 'utf-8');

      // Create 5 backups
      for (let i = 0; i < 5; i++) {
        await backupManager.createBackup(testDir, testFile, `op${i}`);
        await new Promise(resolve => setTimeout(resolve, 1100));
      }

      // Manual cleanup
      const deletedCount = await backupManager.cleanupOldBackups(testDir, testFile, 2);
      expect(deletedCount).toBe(1); // 3 existed after auto-cleanup, now keeping 2, so delete 1
    }, 10000); // 10 second timeout

    it('should not delete if count is within limit', async () => {
      const testFile = 'test.tscn';
      const testPath = join(testDir, testFile);
      await writeFile(testPath, 'content', 'utf-8');

      await backupManager.createBackup(testDir, testFile, 'op1');
      await new Promise(resolve => setTimeout(resolve, 1100));
      await backupManager.createBackup(testDir, testFile, 'op2');

      const deletedCount = await backupManager.cleanupOldBackups(testDir, testFile);
      expect(deletedCount).toBe(0);
    });
  });

  describe('getBackupDirectory', () => {
    it('should return root backup directory without file path', () => {
      const dir = backupManager.getBackupDirectory(testDir);
      expect(dir).toContain('.godot');
      expect(dir).toContain('mcp-backups');
    });

    it('should return file-specific backup directory with file path', () => {
      const dir = backupManager.getBackupDirectory(testDir, 'scenes/level.tscn');
      expect(dir).toContain('.godot');
      expect(dir).toContain('mcp-backups');
      expect(dir).toContain('scenes');
    });
  });
});
