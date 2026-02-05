/**
 * Backup Manager
 * Manages automatic backups for files before modifications
 */
import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { dirname, basename, join, relative } from 'path';
import { createHash } from 'crypto';
import { logger } from './logger.js';
import { validatePath } from './path-validator.js';
/**
 * Default backup configuration
 */
const DEFAULT_CONFIG = {
    maxBackupsPerFile: 10,
    backupDirectory: '.godot/mcp-backups',
};
/**
 * Calculate MD5 hash of file content
 */
function calculateHash(content) {
    return createHash('md5').update(content).digest('hex');
}
/**
 * Format timestamp for backup filename
 */
function formatTimestamp(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}
/**
 * Backup Manager class
 */
export class BackupManager {
    config;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Create a backup of a file
     */
    async createBackup(projectPath, filePath, operation, parameters) {
        await validatePath(projectPath, { mustExist: true, allowAbsolute: true });
        const fullFilePath = join(projectPath, filePath);
        await validatePath(fullFilePath, { mustExist: true, baseDir: projectPath, allowAbsolute: true });
        // Read original file
        const content = await readFile(fullFilePath, 'utf-8');
        const fileStats = await stat(fullFilePath);
        const fileHash = calculateHash(content);
        // Generate backup path
        const timestamp = new Date();
        const timestampStr = formatTimestamp(timestamp);
        const originalName = basename(filePath);
        const relativePath = relative(projectPath, dirname(fullFilePath));
        const backupDir = join(projectPath, this.config.backupDirectory, relativePath);
        const backupFileName = `${timestampStr}_${originalName}.backup`;
        const backupPath = join(backupDir, backupFileName);
        // Create backup directory
        await mkdir(backupDir, { recursive: true });
        // Write backup file
        await writeFile(backupPath, content, 'utf-8');
        // Create metadata
        const metadata = {
            originalPath: filePath,
            backupPath: relative(projectPath, backupPath),
            timestamp,
            operation,
            fileHash,
            fileSize: fileStats.size,
            parameters,
        };
        // Write metadata file
        const metadataPath = `${backupPath}.meta.json`;
        await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
        logger.info('Backup created', {
            originalPath: filePath,
            backupPath: metadata.backupPath,
            operation,
            fileSize: fileStats.size,
        });
        // Cleanup old backups
        await this.cleanupOldBackups(projectPath, filePath);
        return metadata;
    }
    /**
     * Restore a file from backup
     */
    async restoreBackup(projectPath, backupPath) {
        await validatePath(projectPath, { mustExist: true, allowAbsolute: true });
        const fullBackupPath = join(projectPath, backupPath);
        await validatePath(fullBackupPath, { mustExist: true, baseDir: projectPath, allowAbsolute: true });
        // Read metadata
        const metadataPath = `${fullBackupPath}.meta.json`;
        const metadataContent = await readFile(metadataPath, 'utf-8');
        const metadata = JSON.parse(metadataContent);
        // Read backup content
        const backupContent = await readFile(fullBackupPath, 'utf-8');
        // Verify hash
        const backupHash = calculateHash(backupContent);
        if (backupHash !== metadata.fileHash) {
            throw new Error('Backup file integrity check failed: hash mismatch');
        }
        // Restore to original location
        const originalFullPath = join(projectPath, metadata.originalPath);
        const originalDir = dirname(originalFullPath);
        await mkdir(originalDir, { recursive: true });
        await writeFile(originalFullPath, backupContent, 'utf-8');
        logger.info('Backup restored', {
            backupPath,
            originalPath: metadata.originalPath,
            timestamp: metadata.timestamp,
        });
    }
    /**
     * List all backups for a file
     */
    async listBackups(projectPath, filePath) {
        await validatePath(projectPath, { mustExist: true, allowAbsolute: true });
        const relativePath = relative(projectPath, dirname(join(projectPath, filePath)));
        const backupDir = join(projectPath, this.config.backupDirectory, relativePath);
        try {
            const files = await readdir(backupDir);
            const originalName = basename(filePath);
            // Filter for backup files of this specific file
            const backupFiles = files.filter(f => f.endsWith(`_${originalName}.backup`));
            // Read metadata for each backup
            const backups = [];
            for (const backupFile of backupFiles) {
                try {
                    const metadataPath = join(backupDir, `${backupFile}.meta.json`);
                    const metadataContent = await readFile(metadataPath, 'utf-8');
                    const metadata = JSON.parse(metadataContent);
                    // Convert timestamp string to Date object
                    metadata.timestamp = new Date(metadata.timestamp);
                    backups.push(metadata);
                }
                catch (error) {
                    logger.warn('Failed to read backup metadata', { backupFile, error });
                }
            }
            // Sort by timestamp (newest first)
            backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            return backups;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return []; // No backups directory exists yet
            }
            throw error;
        }
    }
    /**
     * Cleanup old backups, keeping only the most recent N
     */
    async cleanupOldBackups(projectPath, filePath, keepCount) {
        const maxToKeep = keepCount ?? this.config.maxBackupsPerFile;
        const backups = await this.listBackups(projectPath, filePath);
        if (backups.length <= maxToKeep) {
            return 0; // Nothing to cleanup
        }
        const toDelete = backups.slice(maxToKeep);
        let deletedCount = 0;
        for (const backup of toDelete) {
            try {
                const fullBackupPath = join(projectPath, backup.backupPath);
                const metadataPath = `${fullBackupPath}.meta.json`;
                await unlink(fullBackupPath);
                await unlink(metadataPath);
                deletedCount++;
                logger.debug('Deleted old backup', { backupPath: backup.backupPath });
            }
            catch (error) {
                logger.warn('Failed to delete backup', {
                    backupPath: backup.backupPath,
                    error
                });
            }
        }
        if (deletedCount > 0) {
            logger.info('Cleaned up old backups', {
                filePath,
                deletedCount,
                remainingCount: backups.length - deletedCount,
            });
        }
        return deletedCount;
    }
    /**
     * Get backup directory path
     */
    getBackupDirectory(projectPath, filePath) {
        if (filePath) {
            const relativePath = relative(projectPath, dirname(join(projectPath, filePath)));
            return join(projectPath, this.config.backupDirectory, relativePath);
        }
        return join(projectPath, this.config.backupDirectory);
    }
}
//# sourceMappingURL=backup-manager.js.map