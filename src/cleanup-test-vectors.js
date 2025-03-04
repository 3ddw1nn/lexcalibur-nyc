import { Pinecone } from "@pinecone-database/pinecone";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Get Pinecone API key from environment variables
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const INDEX_NAME = "bill-tracker";

/**
 * Cleans up test vectors from the Pinecone index
 */
async function cleanupTestVectors() {
    try {
        console.log("Cleaning up test vectors from Pinecone index...");

        // Initialize Pinecone client
        const pc = new Pinecone({
            apiKey: PINECONE_API_KEY,
        });

        // Check if our index exists
        const indexList = await pc.listIndexes();
        const indexes = indexList.indexes || [];
        const ourIndex = indexes.find((index) => index.name === INDEX_NAME);

        if (!ourIndex) {
            console.log(
                `Index '${INDEX_NAME}' not found in your Pinecone account.`
            );
            return;
        }

        // Connect to the index
        const index = pc.index(INDEX_NAME);

        // Get current stats before cleanup
        console.log("\nGetting index stats before cleanup...");
        const statsBefore = await index.describeIndexStats();
        console.log(
            `Current record count: ${statsBefore.totalRecordCount || 0}`
        );

        // List of test vector IDs to delete
        const testVectorIds = [
            "test-vector-1",
            "test-vector-2",
            "test-vector-3",
        ];

        // Delete test vectors
        console.log(`\nDeleting ${testVectorIds.length} test vectors...`);

        for (const id of testVectorIds) {
            try {
                await index.deleteOne(id);
                console.log(`Deleted vector with ID: ${id}`);
            } catch (error) {
                console.log(
                    `Error deleting vector with ID ${id}: ${error.message}`
                );
            }
        }

        // Get stats after cleanup
        console.log("\nGetting index stats after cleanup...");
        const statsAfter = await index.describeIndexStats();
        console.log(
            `Record count after cleanup: ${statsAfter.totalRecordCount || 0}`
        );

        // Check if the count changed
        const countDifference =
            (statsBefore.totalRecordCount || 0) -
            (statsAfter.totalRecordCount || 0);
        if (countDifference > 0) {
            console.log(
                `\n✅ Successfully deleted ${countDifference} test vectors.`
            );
        } else {
            console.log(
                "\n⚠️ No vectors were deleted. The test vectors might not exist or there was an issue with deletion."
            );
        }
    } catch (error) {
        console.error("Error cleaning up test vectors:", error);
    }
}

// Run the cleanup
cleanupTestVectors().catch(console.error);
