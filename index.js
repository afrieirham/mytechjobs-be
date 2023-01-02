require("dotenv").config();
const cron = require("node-cron");
const fetch = require("node-fetch");
const { stringifyUrl } = require("query-string");

const constructUrlQuery = require("./functions/constructUrlQuery");
const extractJobDetails = require("./functions/extractJobDetails");
const getKeywordsFromSnippet = require("./functions/getKeywordsFromSnippet");
const createManyJobs = require("./functions/createManyJobs");
const notifyTelegram = require("./functions/notifyTelegram");

const cx = process.env.GOOGLE_SEARCH_CX;
const key = process.env.GOOGLE_SEARCH_KEY;
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
  return { status: "OK", message: `${count} jobs added` };
}

cron.schedule("00 000 * * *", run, { timezone: "Asia/Kuala_Lumpur" });