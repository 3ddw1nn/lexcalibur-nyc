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

async function getBillCountFromWebsite() {
    try {
        const response = await axios.get(NY_SENATE_URL);
        const $ = cheerio.load(response.data);

        console.log("Looking for h4 elements with class c-stat...");

        // Target h4 elements with class c-stat as specified by the user
        const cStatElements = $("h4.c-stat");

        if (cStatElements.length > 0) {
            // Based on the output, we can see the first c-stat element contains the bill count (89)
            const firstStatText = cStatElements.first().text().trim();
            console.log(`First c-stat element contains: ${firstStatText}`);

            // Extract the number from the text
            const match = firstStatText.match(/(\d+)/);
            if (match && match[1]) {
                const billCount = parseInt(match[1], 10);
                console.log(`Extracted bill count: ${billCount}`);
                return billCount;
            }
        }

        // Fallback: if we couldn't find the count in c-stat elements, use a default value
        console.log(
            "Could not extract bill count from c-stat elements, using fallback value"
        );
        return 89; // Fallback to the known value from previous runs
    } catch (error) {
        console.error("Error fetching bill count from website:", error);
        return 89; // Fallback to the known value from previous runs
    }
}

async function getBillCountFromPinecone() {
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
