import * as fs from "fs";
import * as path from "path";

/**
 * Restore dataset files from permanent backup
 */
async function restoreDataset() {
    console.log("Starting dataset restoration...");

    const datasetDir = path.join(
        process.cwd(),
        "storage",
        "datasets",
        "default"
    );

    const backupDir = path.join(
        process.cwd(),
        "permanent_storage",
        "dataset_backup"
    );

    // Check if backup directory exists
    if (!fs.existsSync(backupDir)) {
        console.log("No backup directory found. Nothing to restore.");
        return;
    }

    // Ensure dataset directory exists
    if (!fs.existsSync(datasetDir)) {
        fs.mkdirSync(datasetDir, { recursive: true });
        console.log(`Created dataset directory at ${datasetDir}`);
    }

    // Copy all files from backup directory to dataset directory
    const files = fs.readdirSync(backupDir);
    let restoredCount = 0;

    for (const file of files) {
        const sourcePath = path.join(backupDir, file);
        const destPath = path.join(datasetDir, file);

        fs.copyFileSync(sourcePath, destPath);
        restoredCount++;
    }

    console.log(
        `Restored ${restoredCount} dataset files from permanent storage.`
    );
    console.log(`Restoration complete. Dataset directory: ${datasetDir}`);
}

// Run the restoration
restoreDataset().catch(console.error);
