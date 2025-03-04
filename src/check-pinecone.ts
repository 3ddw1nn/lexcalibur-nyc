import { Pinecone } from "@pinecone-database/pinecone";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Get Pinecone API key from environment variables
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const INDEX_NAME = "bill-tracker"; // Name of your Pinecone index

async function checkPineconeIndex() {
    try {
        console.log("Checking Pinecone index...");
        console.log(
            `API Key (first 8 chars): ${PINECONE_API_KEY.substring(0, 8)}...`
        );

        // Initialize Pinecone client
        const pc = new Pinecone({
            apiKey: PINECONE_API_KEY,
        });

        console.log("Pinecone client initialized successfully");

        // List all indexes
        console.log("\nListing all indexes:");
        const indexList = await pc.listIndexes();
        const indexes = indexList.indexes || [];
        console.log(`Found ${indexes.length} indexes:`);

        if (indexes.length === 0) {
            console.log("No indexes found in your Pinecone account.");
            return;
        }

        // Print all indexes
        indexes.forEach((index) => {
            console.log(`- ${index.name} (Host: ${index.host})`);
        });

        // Check if our index exists
        const ourIndex = indexes.find((index) => index.name === INDEX_NAME);

        if (!ourIndex) {
            console.log(
                `\nIndex '${INDEX_NAME}' not found in your Pinecone account.`
            );
            return;
        }

        console.log(`\nFound our index: ${INDEX_NAME}`);
        console.log(`Host: ${ourIndex.host}`);

        // Connect to the index
        const index = pc.index(INDEX_NAME);

        // Get index stats
        console.log("\nGetting index stats...");
        const stats = await index.describeIndexStats();
        console.log("Index stats:");
        console.log(`- Total record count: ${stats.totalRecordCount || 0}`);
        console.log(`- Dimensions: ${stats.dimension || "unknown"}`);

        if (stats.namespaces) {
            console.log("- Namespaces:");
            Object.entries(stats.namespaces).forEach(([namespace, data]) => {
                console.log(`  - ${namespace}: ${data.recordCount} records`);
            });
        }

        // Query a sample vector if there are any
        if (stats.totalRecordCount && stats.totalRecordCount > 0) {
            console.log("\nQuerying a sample vector...");

            // Create a random vector of the same dimension
            const dimension = stats.dimension || 1536;
            const sampleVector = Array.from(
                { length: dimension },
                () => Math.random() * 2 - 1
            );

            const queryResponse = await index.query({
                vector: sampleVector,
                topK: 3,
                includeMetadata: true,
            });

            console.log(`Found ${queryResponse.matches.length} matches:`);
            queryResponse.matches.forEach((match, i) => {
                console.log(`\nMatch ${i + 1}:`);
                console.log(`- ID: ${match.id}`);
                console.log(`- Score: ${match.score}`);
                console.log("- Metadata:", match.metadata);
            });
        }

        console.log("\nCheck completed successfully");
    } catch (error) {
        console.error("Error checking Pinecone index:");
        console.error(error);
    }
}

// Run the check
checkPineconeIndex().catch(console.error);
