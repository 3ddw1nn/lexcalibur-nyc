/// <reference path="./types.d.ts" />
//
// main.ts
//
import { Actor, log } from "apify";
import { PlaywrightCrawler } from "crawlee";
import { router } from "./routes.js"; // ESM import needs .js extension
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { Dataset } from "crawlee";
import { uploadDatasetToPinecone } from "./pinecone-service.js"; // Import the Pinecone service
import express from "express";

import { Pinecone } from "@pinecone-database/pinecone";
// @ts-ignore
import { preventReupload } from "./prevent-reupload.js";

// Define the Input interface
interface Input {
    startUrls?: string[];
    maxRequestsPerCrawl?: number;
    forceRun?: boolean; // Parameter to force run regardless of changes
    setupRagApi?: boolean; // Parameter to set up the RAG API
}

// Load environment variables from .env file
dotenv.config();

// Get Pinecone API key from environment variables
const PINECONE_API_KEY = process.env.PINECONE_API_KEY || "";
const INDEX_NAME = "bill-tracker"; // Name of your Pinecone index

// Function to save the current file count to a metadata file
function saveFileCount(count: number): void {
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
function getPreviousFileCount(): number {
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

// Function to save the current bill count to a metadata file
function saveBillCount(count: number): void {
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

    const metadataPath = path.join(metadataDir, "bill_metadata.json");
    fs.writeFileSync(
        metadataPath,
        JSON.stringify({
            billCount: count,
            lastUpdated: new Date().toISOString(),
        })
    );
}

// Function to get the previous bill count from metadata
function getPreviousBillCount(): number {
    const metadataPath = path.join(
        process.cwd(),
        "storage",
        "key_value_stores",
        "default",
        "bill_metadata.json"
    );

    if (!fs.existsSync(metadataPath)) {
        return -1; // No previous count exists
    }

    try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
        return metadata.billCount || -1;
    } catch (error) {
        log.warning(`Error reading previous bill count: ${error}`);
        return -1;
    }
}

// Function to check the legislation page and get the current bill count
async function getCurrentBillCount(): Promise<number> {
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
                for (const element of statElements) {
                    const descriptionElement = element
                        .closest(".c-carousel--item")
                        ?.querySelector(".c-stat--descript");
                    if (
                        descriptionElement &&
                        descriptionElement.textContent &&
                        descriptionElement.textContent
                            .toLowerCase()
                            .includes("signed into law")
                    ) {
                        return element.textContent || "0";
                    }
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

// Function to get the current record count from Pinecone
async function getPineconeRecordCount(): Promise<number> {
    try {
        log.info("Getting record count from Pinecone...");

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
            return 0;
        }

        // Connect to the index
        const index = pc.index(INDEX_NAME);

        // Get current stats
        const stats = await index.describeIndexStats();

        // Handle the stats object safely
        if (stats && typeof stats === "object" && "totalRecordCount" in stats) {
            const recordCount = stats.totalRecordCount || 0;
            log.info(`Current Pinecone record count: ${recordCount}`);
            return recordCount;
        } else {
            log.info("Could not determine record count from Pinecone stats");
            return 0;
        }
    } catch (error) {
        log.error("Error getting Pinecone record count:", {
            error: String(error),
        });
        return 0;
    }
}

// Function to handle Pinecone upload
async function handlePineconeUpload() {
    try {
        // Check if re-upload to Pinecone is necessary
        const reuploadNeeded = await preventReupload();

        if (reuploadNeeded) {
            log.info(
                "Re-upload to Pinecone is needed. Proceeding with upload..."
            );

            // Get data from the dataset
            const dataset = await Dataset.open();
            const items = await dataset.getData();

            if (items && items.items.length > 0) {
                log.info(`Found ${items.items.length} items in dataset`);
                log.info(
                    `Uploading ${items.items.length} items to Pinecone...`
                );
                await uploadDatasetToPinecone(items.items);
                log.info("Successfully uploaded data to Pinecone");
            } else {
                log.info("No items found in dataset to upload to Pinecone");
            }
        } else {
            log.info("Skipping Pinecone upload as data already exists");
        }
    } catch (error) {
        log.error("Error handling Pinecone upload:", {
            error: String(error),
        });
    }
}

// Main function to run the crawler
async function runCrawler(): Promise<void> {
    // Initialize Actor with purgeOnStart set to false to preserve existing storage
    await Actor.init({
        purgeOnStart: false,
    } as any);

    // 1) Read input from Apify. If none is provided, defaults apply.
    const input = (await Actor.getInput()) as Input | null;
    const {
        startUrls = [
            "https://www.nysenate.gov/search/legislation?type=bill&session_year=2025&status=SIGNED_BY_GOV&is_active_version=1",
        ],
        maxRequestsPerCrawl = 100,
        forceRun = false, // Default to not forcing a run
        setupRagApi = false, // Default to not setting up the RAG API
    } = input ?? {};

    // Check if we should run the scraper
    const currentBillCount = await getCurrentBillCount();
    const pineconeRecordCount = await getPineconeRecordCount();
    const previousBillCount = getPreviousBillCount();

    log.info(`Current bill count from website: ${currentBillCount || 0}`);
    log.info(`Current Pinecone record count: ${pineconeRecordCount || 0}`);
    log.info(`Previous bill count: ${previousBillCount || 0}`);

    // Determine if we should run the scraper
    let shouldRun = forceRun;

    // Simplified logic: Only run if website has more bills than our Pinecone index
    if (currentBillCount > pineconeRecordCount) {
        log.info(
            `Website has ${currentBillCount} bills but Pinecone only has ${pineconeRecordCount} records. Running scraper to catch up.`
        );
        shouldRun = true;
    } else {
        log.info(
            `Pinecone (${pineconeRecordCount} records) is already up to date with website (${currentBillCount} bills). No need to scrape.`
        );
        shouldRun = false;
    }

    if (!shouldRun) {
        log.info("Skipping scrape as Pinecone is already up to date.");

        // Even though we're skipping the scrape, we should still save the current bill count
        if (currentBillCount > 0) {
            saveBillCount(currentBillCount);
        }

        // No need to handle Pinecone upload since we're already up to date
        log.info("Skipping Pinecone upload as data is already up to date.");

        // 9) If setupRagApi is true, set up the Express server for RAG API
        if (setupRagApi) {
            await setupRagServer();
        } else {
            // 10) Exit the actor gracefully if not setting up the RAG API
            await Actor.exit();
        }
        return;
    }

    log.info("Changes detected or force run enabled. Starting scrape...");

    // 2) Optional: Create proxy configuration, if needed
    const proxyConfiguration = await Actor.createProxyConfiguration();

    // 3) Log your final start URLs for debugging
    log.info(
        `DEBUG: The crawler will start at these URLs: ${JSON.stringify(
            startUrls,
            null,
            2
        )}`
    );

    // 4) Create the crawler
    const crawler = new PlaywrightCrawler({
        requestHandler: router, // Use your router from `routes.ts`
        maxRequestsPerCrawl,
        proxyConfiguration, // remove if you don't need a proxy
        launchContext: {
            launchOptions: {
                args: ["--disable-gpu"],
            },
        },
    });

    // 5) Add routes from the router
    crawler.router.use(router);

    // 6) Run the crawler
    await crawler.run(startUrls);

    // 7) Save the current bill count for future comparison
    if (currentBillCount > 0) {
        saveBillCount(currentBillCount);
    }

    // 8) Upload data to Pinecone
    await handlePineconeUpload();

    // 9) If setupRagApi is true, set up the Express server for RAG API
    if (setupRagApi) {
        await setupRagServer();
    } else {
        // 10) Exit the actor gracefully if not setting up the RAG API
        await Actor.exit();
    }
}

/**
 * Set up an Express server for RAG API
 */
async function setupRagServer() {
    try {
        const app = express();
        const port = process.env.PORT || 3000;

        // Middleware to parse JSON
        app.use(express.json());

        // Start the server
        app.listen(port, () => {
            log.info(`RAG API server running on port ${port}`);
        });

        log.info("RAG API server set up successfully");
    } catch (error) {
        log.error("Error setting up RAG API server:", { error: String(error) });
        await Actor.exit();
    }
}

// Run the crawler
runCrawler();
