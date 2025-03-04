import * as fs from "fs";
import * as path from "path";

/**
 * Backup dataset files to a permanent location
 */
async function backupDataset() {
    console.log("Starting dataset backup...");

    const datasetDir = path.join(
        process.cwd(),
        "storage",
        "datasets",
        "default"
    );

    // Create a backup directory that won't be affected by purging
    const backupDir = path.join(
        process.cwd(),
        "permanent_storage",
        "dataset_backup"
    );

    // Ensure backup directory exists
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
        console.log(`Created permanent backup directory at ${backupDir}`);
    }

    // Check if dataset directory exists
    if (!fs.existsSync(datasetDir)) {
        console.log("Dataset directory does not exist yet. Nothing to backup.");
        return;
    }

    // Copy all files from dataset directory to backup directory
    const files = fs.readdirSync(datasetDir);
    let copiedCount = 0;

    for (const file of files) {
        const sourcePath = path.join(datasetDir, file);
        const destPath = path.join(backupDir, file);

        // Only copy if file doesn't exist in backup or is newer
        if (
            !fs.existsSync(destPath) ||
            fs.statSync(sourcePath).mtime > fs.statSync(destPath).mtime
        ) {
            fs.copyFileSync(sourcePath, destPath);
            copiedCount++;
        }
    }

    console.log(`Backed up ${copiedCount} dataset files to permanent storage.`);
    console.log(`Total files in backup: ${files.length}`);
    console.log(`Backup location: ${backupDir}`);
}

// Run the backup
backupDataset().catch(console.error);
