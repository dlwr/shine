import { scrapeAcademyAwards } from "./academy-awards";

async function main() {
  try {
    console.log("Starting Academy Awards scraping...");
    await scrapeAcademyAwards();
    console.log("Scraping completed successfully");
  } catch (error) {
    console.error("Error running scraper:", error);
    throw error;
  }
}

await main();
