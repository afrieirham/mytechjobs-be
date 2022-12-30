const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const { stringifyUrl } = require("query-string");

const constructUrlQuery = require("./constructUrlQuery");
const extractJobDetails = require("./extractJobDetails");
const getKeywordsFromSnippet = require("./getKeywordsFromSnippet");
const createManyJobs = require("./createManyJobs");
const notifyTelegram = require("./notifyTelegram");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

admin.initializeApp();

// every day at 12am
exports.crawl = functions
  .region("asia-southeast1")
  .pubsub.schedule("0 0 * * *")
  .timeZone("Asia/Kuala_Lumpur")
  .onRun(async () => {
    await run();
  });

exports.manual = functions
  .region("asia-southeast1")
  .https.onRequest(async (req, res) => {
    await run();
    res.json({ message: "success" });
  });

const cx = process.env.GOOGLE_SERACH_CX;
const key = process.env.GOOGLE_SERACH_KEY;
const URL = "https://www.googleapis.com/customsearch/v1";

async function run() {
  const q = constructUrlQuery();

  let results = [];
  let start = 1;

  while (true) {
    const requestUrl = stringifyUrl({
      url: URL,
      query: { start, cx, key, q },
    });
    const result = await fetch(requestUrl).then((res) => res.json());

    // add if has result
    if (result?.items?.length > 0) {
      results.push(...result.items);
    }

    // stop if no next page
    if (!result?.queries?.nextPage) {
      break;
    }

    start += 10;
  }

  if (results?.length === 0) {
    return { status: "OK", message: "no jobs added" };
  }

  const schemas = await Promise.all(
    results.map(({ link }) => extractJobDetails(link))
  );

  const withSchmeas = results.map(({ pagemap, ...rest }, i) => ({
    ...rest,
    schema: schemas[i],
  }));

  const withKeywords = withSchmeas.map((job) => {
    const keywords = getKeywordsFromSnippet(job.htmlSnippet);
    return {
      ...job,
      keywords,
    };
  });

  await createManyJobs(withKeywords);

  // Send alert to telegram
  const count = withKeywords.length;
  let telegram = `${count} new jobs!\n\n`;

  withKeywords.forEach((job) => {
    const { schema, title, link } = job;
    if (schema) {
      const { title, hiringOrganization, url } = schema;
      const company = hiringOrganization?.name;
      const text = `${title} @ ${company}\n${url}\n\n\n`;
      telegram += text;
    } else {
      telegram += `${title}\n${link}\n\n\n`;
    }
  });

  await notifyTelegram(telegram);
}
