import { log } from "apify";

/**
 * Pre-run script to perform any necessary setup before running the main application
 */
async function preRun() {
    log.info("Running pre-run checks...");

    // We no longer need to restore dataset files since we're using Pinecone for storage
    log.info(
        "Using Pinecone for data storage - no local dataset restoration needed."
    );

    log.info("Pre-run checks completed.");
}

// Run the pre-run checks
preRun().catch((error) => log.error("Error in pre-run:", error));
