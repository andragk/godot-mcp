/**
 * Backup metadata
 */
export interface BackupMetadata {
    originalPath: string;
    backupPath: string;
    timestamp: Date;
    operation: string;
    fileHash: string;
    fileSize: number;
    agent?: string;
    parameters?: Record<string, unknown>;
}
/**
 * Backup configuration
 */
export interface BackupConfig {
    maxBackupsPerFile: number;
    backupDirectory: string;
}
/**
 * Backup Manager class
 */
export declare class BackupManager {
    private config;
    constructor(config?: Partial<BackupConfig>);
    /**
     * Create a backup of a file
     */
    createBackup(projectPath: string, filePath: string, operation: string, parameters?: Record<string, unknown>): Promise<BackupMetadata>;
    /**
     * Restore a file from backup
     */
    restoreBackup(projectPath: string, backupPath: string): Promise<void>;
    /**
     * List all backups for a file
     */
    listBackups(projectPath: string, filePath: string): Promise<BackupMetadata[]>;
    /**
     * Cleanup old backups, keeping only the most recent N
     */
    cleanupOldBackups(projectPath: string, filePath: string, keepCount?: number): Promise<number>;
    /**
     * Get backup directory path
     */
    getBackupDirectory(projectPath: string, filePath?: string): string;
}
//# sourceMappingURL=backup-manager.d.ts.map