import { Pinecone } from "@pinecone-database/pinecone";
import * as dotenv from "dotenv";
import axios from "axios";
import * as cheerio from "cheerio";

// Load environment variables
dotenv.config();

// Get Pinecone API key from environment variables
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const INDEX_NAME = "bill-tracker"; // Name of your Pinecone index
const NY_SENATE_URL = "https://www.nysenate.gov/legislation";

async function checkBillCounts() {
    try {
        console.log(
            "Comparing bill counts between NY Senate website and Pinecone..."
        );

        // Step 1: Get bill count from NY Senate website
        console.log("\nFetching bill count from NY Senate website...");
        const websiteBillCount = await getBillCountFromWebsite();
        console.log(
            `NY Senate website shows ${websiteBillCount} bills signed into law`
        );

        // Step 2: Get bill count from Pinecone
        console.log("\nFetching bill count from Pinecone...");
        const pineconeCount = await getBillCountFromPinecone();
        console.log(`Pinecone index contains ${pineconeCount} bill records`);

        // Step 3: Compare counts
        console.log("\nComparison:");
        if (pineconeCount >= websiteBillCount) {
            console.log(
                "✅ Your Pinecone index is up-to-date with all bills from the NY Senate website."
            );
            console.log("No need to run the scraper again.");
        } else {
            const difference = websiteBillCount - pineconeCount;
            console.log(
                `⚠️ Your Pinecone index is missing approximately ${difference} bills.`
            );
            console.log("Consider running the scraper to update your index.");
        }
    } catch (error) {
        console.error("Error comparing bill counts:");
        console.error(error);
    }
}

async function getBillCountFromWebsite(): Promise<number> {
    try {
        const response = await axios.get(NY_SENATE_URL);
        const $ = cheerio.load(response.data);

        // Look for the bill count in the "by the numbers" section
        // This targets the specific h4 element that contains the bill count
        const billCountText = $(".c-by-the-numbers h4").first().text().trim();

        // Extract the number from text like "89 Bills Signed into Law"
        const match = billCountText.match(/(\d+)/);
        if (match && match[1]) {
            return parseInt(match[1], 10);
        }

        throw new Error("Could not find bill count on the NY Senate website");
    } catch (error) {
        console.error("Error fetching bill count from website:", error);
        return 0;
    }
}

async function getBillCountFromPinecone(): Promise<number> {
    try {
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
            return 0;
        }

        // Connect to the index
        const index = pc.index(INDEX_NAME);

        // Get index stats
        const stats = await index.describeIndexStats();
        return stats.totalRecordCount || 0;
    } catch (error) {
        console.error("Error fetching bill count from Pinecone:", error);
        return 0;
    }
}

// Run the check
checkBillCounts().catch(console.error);
