import { Dataset, createPlaywrightRouter } from "crawlee";
import * as fs from "fs";
import * as path from "path";

export const router = createPlaywrightRouter();

// Helper function to check if a bill already exists in the dataset
async function billExistsInDataset(billTitle: string): Promise<boolean> {
    const datasetDir = path.join(
        process.cwd(),
        "storage",
        "datasets",
        "default"
    );

    // If directory doesn't exist, bill doesn't exist
    if (!fs.existsSync(datasetDir)) {
        return false;
    }

    // Get all files in the dataset directory
    const files = fs.readdirSync(datasetDir);

    // Check each file to see if it contains the bill title
    for (const file of files) {
        const filePath = path.join(datasetDir, file);
        try {
            const content = fs.readFileSync(filePath, "utf8");
            const data = JSON.parse(content);
            if (data.billTitle === billTitle) {
                return true;
            }
        } catch (error) {
            // Skip files that can't be read or parsed
            continue;
        }
    }

    return false;
}

/**
 * DEFAULT HANDLER = Listing page
 */
router.addDefaultHandler(async ({ page, request, crawler, log }) => {
    log.info(`Processing listing page: ${request.url}`);

    // Wait for articles with class c-block
    await page.waitForSelector("article.c-block");

    // Scrape the bills on the current page
    const requestsToEnqueue = await page.$$eval(
        "article.c-block",
        (articles) => {
            const results = [];

            for (const article of articles) {
                const titleAnchor = article.querySelector(
                    "h3.c-bill-num a"
                ) as HTMLAnchorElement | null;
                if (!titleAnchor) continue;

                const billTitle = titleAnchor.textContent?.trim() ?? "";
                const billUrl = titleAnchor.href;

                // Bill description
                const descEl = article.querySelector(
                    "p.c-bill-descript"
                ) as HTMLParagraphElement | null;
                const description = descEl?.textContent?.trim() ?? "";

                // **Issued Date** from the listing
                const dateEl = article.querySelector(
                    "p.c-press-release--date span.date-display-single"
                ) as HTMLElement | null;
                const issuedDate = dateEl?.textContent?.trim() ?? "";

                if (billUrl) {
                    results.push({
                        url: billUrl,
                        uniqueKey: billTitle, // optional dedup
                        label: "BILL_DETAIL",
                        userData: {
                            billTitle,
                            description,
                            issuedDate, // pass it along to detail
                        },
                    });
                }
            }
            return results;
        }
    );

    if (requestsToEnqueue.length > 0) {
        await crawler.addRequests(requestsToEnqueue);
        log.info(
            `Enqueued ${requestsToEnqueue.length} bills from page ${request.url}`
        );
    } else {
        log.warning(`No bills found on: ${request.url}`);
    }

    // Pagination
    const nextLink = await page.$("li.pager__item--next a");
    if (nextLink) {
        const href = await nextLink.getAttribute("href");
        if (href) {
            const absoluteUrl = new URL(href, page.url()).toString();
            log.info(`Found next page link. Enqueueing: ${absoluteUrl}`);
            await crawler.addRequests([{ url: absoluteUrl, label: "LISTING" }]);
        }
    } else {
        log.info("No next page link found - done paginating.");
    }
});

/**
 * BILL_DETAIL handler
 */
router.addHandler("BILL_DETAIL", async ({ request, page, log }) => {
    log.info(`Processing detail page: ${request.url}`);

    // Retrieve the listing info from userData
    const { billTitle, description, issuedDate } = request.userData;

    // Check if this bill already exists in the dataset
    const exists = await billExistsInDataset(billTitle);
    if (exists) {
        log.info(`Bill ${billTitle} already exists in dataset. Skipping.`);
        return;
    }

    // Wait for the detail content so we know it's loaded
    await page.waitForSelector(".c-detail--header__bill");

    // PDF link
    const pdfLinkEl = await page.$("a.c-detail--download");
    const pdfUrl = pdfLinkEl ? await pdfLinkEl.getAttribute("href") : null;

    // Bill status
    const statusEl = await page.$("span.c-bill--flag");
    const status = statusEl ? (await statusEl.textContent())?.trim() : "";

    // Signed date from actions table
    let signedDate = "";
    const actionRows = await page.$$(".c-bill--actions-table tr");
    for (const row of actionRows) {
        const dateEl = await row.$(".c-bill--actions-table-col1");
        const actionEl = await row.$(".c-bill--actions-table-col2");
        if (!dateEl || !actionEl) continue;

        const dateText = (await dateEl.textContent())?.trim() ?? "";
        const actionText = (await actionEl.textContent())?.toLowerCase() ?? "";

        if (actionText.includes("signed")) {
            signedDate = dateText;
            break;
        }
    }

    // Now push all data to the default Dataset
    await Dataset.pushData({
        detailPageUrl: request.url,
        billTitle,
        description,
        status,
        pdfUrl,
        signedDate,
        issuedDate, // the date from the listing
    });

    log.info(`Saved data for ${billTitle} to dataset.`);
});
