import { Pinecone } from "@pinecone-database/pinecone";
import axios from "axios";
import * as cheerio from "cheerio";

/**
 * Checks if scraping is needed by comparing bill counts between the NY Senate website and Pinecone
 * @param {string} pineconeApiKey - The Pinecone API key
 * @param {string} indexName - The name of the Pinecone index
 * @param {string} websiteUrl - The URL of the NY Senate legislation page
 * @returns {Promise<{needsScraping: boolean, websiteCount: number, pineconeCount: number}>} - Object indicating if scraping is needed and the counts
 */
export async function checkIfScrapingNeeded(
    pineconeApiKey,
    indexName = "bill-tracker",
    websiteUrl = "https://www.nysenate.gov/legislation"
) {
    try {
        console.log("Checking if scraping is needed...");

        // Get bill count from NY Senate website
        const websiteCount = await getBillCountFromWebsite(websiteUrl);
        console.log(
            `NY Senate website shows ${websiteCount} bills signed into law`
        );

        // Get bill count from Pinecone
        const pineconeCount = await getBillCountFromPinecone(
            pineconeApiKey,
            indexName
        );
        console.log(`Pinecone index contains ${pineconeCount} bill records`);

        // Compare counts
        const needsScraping = pineconeCount < websiteCount;

        if (needsScraping) {
            console.log(
                `⚠️ Scraping needed: Pinecone has ${pineconeCount} bills, website has ${websiteCount} bills`
            );
        } else {
            console.log("✅ Scraping not needed: Pinecone index is up-to-date");
        }

        return {
            needsScraping,
            websiteCount,
            pineconeCount,
        };
    } catch (error) {
        console.error("Error checking if scraping is needed:", error);
        // Default to requiring scraping if there's an error
        return {
            needsScraping: true,
            websiteCount: 0,
            pineconeCount: 0,
            error: error.message,
        };
    }
}

/**
 * Gets the bill count from the NY Senate website
 * @param {string} url - The URL of the NY Senate legislation page
 * @returns {Promise<number>} - The bill count
 */
async function getBillCountFromWebsite(url) {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // Target h4 elements with class c-stat
        const cStatElements = $("h4.c-stat");

        if (cStatElements.length > 0) {
            // The first c-stat element contains the bill count
            const firstStatText = cStatElements.first().text().trim();

            // Extract the number from the text
            const match = firstStatText.match(/(\d+)/);
            if (match && match[1]) {
                return parseInt(match[1], 10);
            }
        }

        // Fallback value if we can't find the count
        return 0;
    } catch (error) {
        console.error("Error fetching bill count from website:", error);
        return 0;
    }
}

/**
 * Gets the bill count from Pinecone
 * @param {string} apiKey - The Pinecone API key
 * @param {string} indexName - The name of the Pinecone index
 * @returns {Promise<number>} - The bill count
 */
async function getBillCountFromPinecone(apiKey, indexName) {
    try {
        // Initialize Pinecone client
        const pc = new Pinecone({
            apiKey,
        });

        // Check if our index exists
        const indexList = await pc.listIndexes();
        const indexes = indexList.indexes || [];
        const ourIndex = indexes.find((index) => index.name === indexName);

        if (!ourIndex) {
            console.log(
                `Index '${indexName}' not found in your Pinecone account.`
            );
            return 0;
        }

        // Connect to the index
        const index = pc.index(indexName);

        // Get index stats
        const stats = await index.describeIndexStats();
        return stats.totalRecordCount || 0;
    } catch (error) {
        console.error("Error fetching bill count from Pinecone:", error);
        return 0;
    }
}
