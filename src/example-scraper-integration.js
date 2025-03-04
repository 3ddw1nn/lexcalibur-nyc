import { checkIfScrapingNeeded } from "./utils/check-scrape-needed.js";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Get Pinecone API key from environment variables
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const INDEX_NAME = "bill-tracker";

/**
 * Main function to run the scraper
 */
async function main() {
    try {
        console.log("Starting bill scraper process...");

        // Check if scraping is needed
        const { needsScraping, websiteCount, pineconeCount } =
            await checkIfScrapingNeeded(PINECONE_API_KEY, INDEX_NAME);

        if (!needsScraping) {
            console.log(
                "Skipping scraping process - Pinecone index is already up-to-date"
            );
            console.log(`Current bill count: ${websiteCount}`);
            return;
        }

        // If we need to scrape, continue with the scraping process
        console.log("Starting scraping process...");
        console.log(
            `Need to scrape approximately ${
                websiteCount - pineconeCount
            } new bills`
        );

        // Your existing scraping code would go here
        // ...

        console.log("Scraping process completed");
    } catch (error) {
        console.error("Error in scraper:", error);
    }
}

// Run the main function
main().catch(console.error);
