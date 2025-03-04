import { Pinecone } from "@pinecone-database/pinecone";
import * as dotenv from "dotenv";
import { log } from "apify";

// Load environment variables
dotenv.config();

// Get Pinecone API key from environment variables
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const INDEX_NAME = "bill-tracker"; // Name of your Pinecone index

// Log Pinecone configuration (without showing the full API key)
log.info("Pinecone Configuration:", {
    apiKeyPrefix: PINECONE_API_KEY
        ? `${PINECONE_API_KEY.substring(0, 8)}...`
        : "Not set",
});

// Initialize Pinecone client
let pinecone: Pinecone;
try {
    pinecone = new Pinecone({
        apiKey: PINECONE_API_KEY,
    });
    log.info("Pinecone client initialized successfully");
} catch (error) {
    log.error("Failed to initialize Pinecone client:", {
        error: String(error),
    });
    throw new Error(`Failed to initialize Pinecone client: ${error}`);
}

// Get the index
const index = pinecone.index(INDEX_NAME);

// Function to initialize the Pinecone index
export async function initializePineconeIndex() {
    try {
        log.info("Initializing Pinecone index...");

        // Check if index exists
        log.info("Listing Pinecone indexes...");
        const indexList = await pinecone.listIndexes();
        const indexes = indexList.indexes || [];
        log.info(`Found ${indexes.length} existing indexes`);

        if (!indexes.some((index) => index.name === INDEX_NAME)) {
            log.info(`Creating new Pinecone index: ${INDEX_NAME}`);

            // Create a new index
            await pinecone.createIndex({
                name: INDEX_NAME,
                dimension: 1536,
                metric: "cosine",
                spec: {
                    serverless: {
                        cloud: "aws",
                        region: "us-east-1",
                    },
                },
            });

            log.info("Waiting for index to initialize...");
            await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 60 seconds
        } else {
            log.info(`Pinecone index ${INDEX_NAME} already exists`);
        }

        return index;
    } catch (error) {
        log.error("Error initializing Pinecone index:", {
            error: String(error),
        });
        throw error;
    }
}

// Function to generate embeddings for text
async function generateEmbeddings(text: string): Promise<number[]> {
    try {
        // For this example, we'll use a simple mock embedding function
        // In a real application, you would use an embedding API like OpenAI
        // This is a placeholder that creates a random vector of the right dimension
        return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);

        // Example of how you would use OpenAI's embedding API:
        /*
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-ada-002'
      })
    });
    
    const result = await response.json();
    return result.data[0].embedding;
    */
    } catch (error) {
        log.error("Error generating embeddings:", { error: String(error) });
        throw error;
    }
}

// Function to upload dataset to Pinecone
export async function uploadDatasetToPinecone(bills: any[]) {
    try {
        log.info("Initializing Pinecone index...");
        const index = await initializePineconeIndex();

        log.info(`Uploading ${bills.length} bills to Pinecone...`);

        // Process bills in batches to avoid rate limits
        const BATCH_SIZE = 100;
        for (let i = 0; i < bills.length; i += BATCH_SIZE) {
            const batch = bills.slice(i, i + BATCH_SIZE);

            // Prepare vectors for upsert
            const vectors = await Promise.all(
                batch.map(async (bill) => {
                    // Create a text representation of the bill for embedding
                    const textToEmbed = `${bill.billTitle} ${
                        bill.description
                    } ${bill.content || ""}`;

                    // Generate embedding for the bill
                    const embedding = await generateEmbeddings(textToEmbed);

                    return {
                        id: bill.billTitle
                            ? bill.billTitle.replace(/\s+/g, "-").toLowerCase()
                            : `bill-${Date.now()}-${Math.random()
                                  .toString(36)
                                  .substring(2, 9)}`, // Create a unique ID
                        values: embedding,
                        metadata: {
                            billTitle: bill.billTitle,
                            description: bill.description,
                            url: bill.url,
                            issuedDate: bill.issuedDate,
                            content: bill.content || "",
                        },
                    };
                })
            );

            // Upsert vectors to Pinecone
            log.info(
                `Upserting batch ${i / BATCH_SIZE + 1} of ${Math.ceil(
                    bills.length / BATCH_SIZE
                )} to Pinecone...`
            );
            await index.upsert(vectors);

            log.info(
                `Uploaded batch ${i / BATCH_SIZE + 1} of ${Math.ceil(
                    bills.length / BATCH_SIZE
                )}`
            );
        }

        log.info("Successfully uploaded all bills to Pinecone");
    } catch (error) {
        log.error("Error uploading to Pinecone:", { error: String(error) });
        throw error;
    }
}

// Function to query Pinecone for similar bills
export async function querySimilarBills(query: string, limit: number = 5) {
    try {
        // Make sure the index is initialized
        await initializePineconeIndex();

        // Generate embedding for the query
        const queryEmbedding = await generateEmbeddings(query);

        // Query Pinecone
        const queryResponse = await index.query({
            vector: queryEmbedding,
            topK: limit,
            includeMetadata: true,
        });

        return queryResponse.matches.map((match) => ({
            billTitle: match.metadata?.billTitle,
            description: match.metadata?.description,
            url: match.metadata?.url,
            issuedDate: match.metadata?.issuedDate,
            content: match.metadata?.content,
            score: match.score,
        }));
    } catch (error) {
        log.error("Error querying Pinecone:", { error: String(error) });
        throw error;
    }
}

async function testPinecone() {
    try {
        console.log("Testing Pinecone connection...");
        console.log(
            `API Key (first 8 chars): ${PINECONE_API_KEY.substring(0, 8)}...`
        );

        // Initialize Pinecone client using the simplified approach
        const pc = new Pinecone({
            apiKey: PINECONE_API_KEY,
        });

        console.log("Pinecone client initialized successfully");

        // List indexes
        console.log("Listing indexes...");
        const indexList = await pc.listIndexes();
        const indexes = indexList.indexes || [];
        console.log(`Found ${indexes.length} indexes:`);
        indexes.forEach((index) => console.log(`- ${index.name}`));

        // If the index exists, try to connect to it
        if (indexes.some((index) => index.name === INDEX_NAME)) {
            console.log(`\nConnecting to index: ${INDEX_NAME}`);
            const index = pc.index(INDEX_NAME);
            console.log("Successfully connected to index");

            // Try to get stats from the index
            try {
                console.log("\nGetting index stats...");
                const stats = await index.describeIndexStats();
                console.log("Index stats:", JSON.stringify(stats, null, 2));
            } catch (statsError) {
                console.error("Error getting index stats:", statsError);
            }
        } else {
            console.log(`\nIndex '${INDEX_NAME}' does not exist yet`);
        }

        console.log("\nTest completed successfully");
    } catch (error) {
        console.error("Error testing Pinecone:");
        console.error(error);
    }
}

// Run the test
testPinecone().catch(console.error);
