import { Pinecone } from "@pinecone-database/pinecone";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Get Pinecone API key from environment variables
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const INDEX_NAME = "bill-tracker";

/**
 * Checks the Pinecone index status without inserting test vectors
 */
async function checkPineconeStatus() {
    try {
        console.log("Checking Pinecone index status...");

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

        // Get current stats
        console.log("\nGetting index stats...");
        const stats = await index.describeIndexStats();
        console.log(`Current record count: ${stats.totalRecordCount || 0}`);
        console.log(`Dimension: ${stats.dimension || "unknown"}`);

        // Check for namespaces
        console.log("\nChecking for namespaces:");
        if (stats.namespaces) {
            console.log("Namespaces found:");
            Object.entries(stats.namespaces).forEach(([namespace, data]) => {
                console.log(
                    `  - ${namespace || "default"}: ${data.recordCount} records`
                );
            });
        } else {
            console.log("No namespaces found");
        }

        // Now let's try to list some sample vectors in the index
        console.log(
            "\nListing sample vectors in the index (without inserting any test data):"
        );

        try {
            // Note: Pinecone doesn't have a direct "list all vectors" API
            // We'll use a query with a dummy vector to get some sample vectors
            const dimension = stats.dimension || 1536;
            const dummyVector = Array(dimension)
                .fill(0)
                .map(() => Math.random() * 2 - 1);
            const queryResponse = await index.query({
                vector: dummyVector,
                topK: 5,
                includeMetadata: true,
            });

            console.log(`Found ${queryResponse.matches.length} sample vectors`);
            queryResponse.matches.forEach((match, i) => {
                console.log(
                    `- Vector ${i + 1}: ID=${match.id}, Score=${match.score}`
                );
                if (match.metadata) {
                    console.log(
                        "  Metadata:",
                        JSON.stringify(match.metadata, null, 2)
                    );
                }
            });
        } catch (error) {
            console.error("Error listing vectors:", error);
        }
    } catch (error) {
        console.error("Error checking Pinecone status:", error);
    }
}

// Run the check
checkPineconeStatus().catch(console.error);
