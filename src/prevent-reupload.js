import { Pinecone } from "@pinecone-database/pinecone";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { log } from "apify";

// Load environment variables
dotenv.config();

// Get Pinecone API key from environment variables
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const INDEX_NAME = "bill-tracker";

/**
 * Prevents unnecessary re-uploading to Pinecone by checking if data already exists
 */
export async function preventReupload() {
    try {
        log.info("Checking if re-upload to Pinecone is necessary...");

        // Initialize Pinecone client
        const pc = new Pinecone({
            apiKey: PINECONE_API_KEY,
        });

        // Check if our index exists
        const indexList = await pc.listIndexes();
        const indexes = indexList.indexes || [];
        const ourIndex = indexes.find((index) => index.name === INDEX_NAME);

        if (!ourIndex) {
            log.info(
                `Index '${INDEX_NAME}' not found in your Pinecone account.`
            );
            log.info("Re-upload is necessary to create the index.");
            return true;
        }

        // Connect to the index
        const index = pc.index(INDEX_NAME);

        // Get current stats
        log.info("\nGetting index stats...");
        const stats = await index.describeIndexStats();
        log.info(`Current record count: ${stats.totalRecordCount || 0}`);

        // Check for namespaces
        if (stats.namespaces) {
            log.info("Namespaces found:");
            Object.entries(stats.namespaces).forEach(([namespace, data]) => {
                log.info(
                    `  - ${namespace || "default"}: ${data.recordCount} records`
                );
            });
        }

        // Create a metadata file to store the current state
        const metadataDir = path.join(
            process.cwd(),
            "storage",
            "key_value_stores",
            "default"
        );

        // Ensure directory exists
        if (!fs.existsSync(metadataDir)) {
            fs.mkdirSync(metadataDir, { recursive: true });
        }

        const metadataPath = path.join(metadataDir, "pinecone_metadata.json");

        // Save the current state to the metadata file
        const metadata = {
            indexName: INDEX_NAME,
            recordCount: stats.totalRecordCount || 0,
            lastUpdated: new Date().toISOString(),
            dimension: stats.dimension,
            namespaces: stats.namespaces || {},
        };

        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        log.info(`\nSaved current Pinecone state to ${metadataPath}`);

        // Check if re-upload is necessary
        if (stats.totalRecordCount > 0) {
            log.info(
                "\n✅ Re-upload is NOT necessary. Your Pinecone index already contains data."
            );
            log.info("You can safely skip the upload step in your script.");
            return false;
        } else {
            log.info(
                "\n⚠️ Re-upload IS necessary. Your Pinecone index is empty."
            );
            return true;
        }
    } catch (error) {
        log.error("Error checking if re-upload is necessary:", error);
        // Default to requiring re-upload if there's an error
        return true;
    }
}

// Run the check only if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    preventReupload()
        .then((reuploadNeeded) => {
            log.info(`\nFinal result: Re-upload needed = ${reuploadNeeded}`);
        })
        .catch((error) => log.error("Error in preventReupload:", error));
}
