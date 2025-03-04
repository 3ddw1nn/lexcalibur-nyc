import { Actor, log } from "apify";
import { PlaywrightCrawler } from "crawlee";
import { router } from "./routes.js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { Dataset } from "crawlee";
import { uploadDatasetToPinecone } from "./pinecone-service.js";
import express from "express";
import { Pinecone } from "@pinecone-database/pinecone";

// Define the Input interface
const INPUT_DEFAULTS = {
    startUrls: [
        "https://www.nysenate.gov/search/legislation?type=bill&session_year=2025&status=SIGNED_BY_GOV&is_active_version=1",
    ],
    maxRequestsPerCrawl: 100,
    forceRun: false,
    setupRagApi: false,
    skipPineconeUpload: false, // New parameter to skip Pinecone upload
};

// Load environment variables from .env file
dotenv.config();

// Function to count files in the dataset directory
function countDatasetFiles() {
    const datasetDir = path.join(
        process.cwd(),
        "storage",
        "datasets",
        "default"
    );

    // Check if directory exists
    if (!fs.existsSync(datasetDir)) {
        log.info("Dataset directory does not exist yet. Creating it...");
        fs.mkdirSync(datasetDir, { recursive: true });
        return 0;
    }

    // Count files in the directory
    const files = fs.readdirSync(datasetDir);
    return files.length;
}

// Function to save the current file count to a metadata file
function saveFileCount(count) {
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

    const metadataPath = path.join(metadataDir, "dataset_metadata.json");
    fs.writeFileSync(
        metadataPath,
        JSON.stringify({
            fileCount: count,
            lastUpdated: new Date().toISOString(),
        })
    );
}

// Function to get the previous file count from metadata
function getPreviousFileCount() {
    const metadataPath = path.join(
        process.cwd(),
        "storage",
        "key_value_stores",
        "default",
        "dataset_metadata.json"
    );

    if (!fs.existsSync(metadataPath)) {
        return -1; // No previous count exists
    }

    try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
        return metadata.fileCount || -1;
    } catch (error) {
        log.warning(`Error reading previous file count: ${error}`);
        return -1;
    }
}

// Function to check if Pinecone upload is necessary
async function isPineconeUploadNeeded() {
    try {
        log.info("Checking if Pinecone upload is necessary...");

        // Get Pinecone API key from environment variables
        const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
        const INDEX_NAME = "bill-tracker";

        if (!PINECONE_API_KEY) {
            log.warning("Pinecone API key not found. Upload is required.");
            return true;
        }

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
                `Index '${INDEX_NAME}' not found in Pinecone. Upload is required.`
            );
            return true;
        }

        // Connect to the index
        const index = pc.index(INDEX_NAME);

        // Get current stats
        const stats = await index.describeIndexStats();
        const recordCount = stats.totalRecordCount || 0;
        log.info(`Current Pinecone record count: ${recordCount}`);

        // Check if re-upload is necessary
        if (recordCount > 0) {
            log.info(
                "Pinecone index already contains data. Upload can be skipped."
            );
            return false;
        } else {
            log.info("Pinecone index is empty. Upload is required.");
            return true;
        }
    } catch (error) {
        log.error("Error checking Pinecone state:", error);
        // Default to requiring upload if there's an error
        return true;
    }
}

// Function to check the legislation page and get the current bill count
async function getCurrentBillCount() {
    log.info("Checking the legislation page for current bill count...");

    let billCount = 0;

    // Create a crawler just to check the bill count
    const checkCrawler = new PlaywrightCrawler({
        maxRequestsPerCrawl: 1, // We only need to visit one page
        // Handle the legislation page to extract the bill count
        async requestHandler({ page }) {
            await page.waitForSelector(".c-stat"); // Wait for the stats to load

            // Find the "Bills Signed into Law" count
            const billCountText = await page.evaluate(() => {
                // Find the element with class c-stat that's related to signed bills
                const statElements = Array.from(
                    document.querySelectorAll(".c-stat")
                );
                if (statElements.length > 0) {
                    return statElements[0].textContent || "0";
                }
                return "0"; // Default if not found
            });

            // Parse the count as a number
            billCount = parseInt(billCountText.trim(), 10) || 0;
            log.info(`Current number of bills signed into law: ${billCount}`);
        },
    });

    try {
        // Run the crawler on the legislation page
        await checkCrawler.run(["https://www.nysenate.gov/legislation"]);
        return billCount;
    } catch (error) {
        log.error(`Error checking bill count: ${error}`);
        return -1; // Return -1 to indicate an error
    }
}

// Main function to run the crawler
async function runCrawler() {
    // Initialize Actor with purgeOnStart set to false to preserve existing storage
    await Actor.init({
        purgeOnStart: false,
    });

    // 1) Read input from Apify. If none is provided, defaults apply.
    const input = (await Actor.getInput()) || {};
    const {
        startUrls = INPUT_DEFAULTS.startUrls,
        maxRequestsPerCrawl = INPUT_DEFAULTS.maxRequestsPerCrawl,
        forceRun = INPUT_DEFAULTS.forceRun,
        setupRagApi = INPUT_DEFAULTS.setupRagApi,
        skipPineconeUpload = INPUT_DEFAULTS.skipPineconeUpload,
    } = input;

    // Check if we should run the scraper
    const currentBillCount = await getCurrentBillCount();
    const datasetFileCount = countDatasetFiles();

    log.info(`Current bill count from website: ${currentBillCount || 0}`);
    log.info(`Current dataset file count: ${datasetFileCount || 0}`);

    // Determine if we should run the scraper
    let shouldRun = forceRun;

    // If this is the first run or there's a difference in bill count, we should run
    if (currentBillCount === -1) {
        log.info("Could not get current bill count. Using force run.");
        shouldRun = true;
    } else if (currentBillCount > datasetFileCount) {
        log.info(
            "There are more bills on the website than in our dataset. Running scraper to catch up."
        );
        shouldRun = true;
    }

    if (!shouldRun) {
        log.info(
            "No changes detected in the website content. Skipping scrape."
        );
    } else {
        log.info("Changes detected or force run enabled. Starting scrape...");

        // 2) Set up the crawler and add routes
        const crawler = new PlaywrightCrawler({
            maxRequestsPerCrawl,
            requestHandler: router,
        });

        // 3) Run the crawler
        await crawler.run(startUrls);

        // Save the current file count for future reference
        const newFileCount = countDatasetFiles();
        saveFileCount(newFileCount);
        log.info(
            `Scrape completed. Dataset now contains ${newFileCount} files.`
        );
    }

    // 4) Check if we should upload to Pinecone
    if (skipPineconeUpload) {
        log.info("Pinecone upload explicitly skipped via input parameter.");
    } else {
        const uploadNeeded = await isPineconeUploadNeeded();

        if (uploadNeeded || forceRun) {
            log.info("Uploading dataset to Pinecone...");

            // Get the dataset
            const dataset = await Dataset.open();
            const items = await dataset.getData();

            // Upload to Pinecone
            await uploadDatasetToPinecone(items.items);
            log.info("Pinecone upload completed.");
        } else {
            log.info("Pinecone upload skipped. Index already contains data.");
        }
    }

    // 5) Set up the RAG API if requested
    if (setupRagApi) {
        log.info("Setting up RAG API server...");

        const app = express();
        const port = process.env.PORT || 3000;

        // Add your API routes here
        app.get("/", (req, res) => {
            res.send("RAG API is running");
        });

        // Start the server
        app.listen(port, () => {
            log.info(`RAG API server is running on port ${port}`);
        });
    } else {
        // Exit the Actor
        await Actor.exit();
    }
}

// Run the crawler
runCrawler().catch((error) => {
    log.error("Error running crawler:", error);
    Actor.exit(1);
});
