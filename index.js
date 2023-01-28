require("dotenv").config();
const cron = require("node-cron");
const fetch = require("node-fetch");
const { stringifyUrl } = require("query-string");

const constructUrlQuery = require("./functions/constructUrlQuery");
const extractJobDetails = require("./functions/extractJobDetails");
const getKeywordsFromSnippet = require("./functions/getKeywordsFromSnippet");
const createManyJobs = require("./functions/createManyJobs");
const notifyTelegram = require("./functions/notifyTelegram");
const slugify = require("./functions/slugify");

const cx = process.env.GOOGLE_SEARCH_CX;
const key = process.env.GOOGLE_SEARCH_KEY;
const URL = "https://www.googleapis.com/customsearch/v1";

async function run() {
  console.log("running");
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
    await notifyTelegram("do update – no jobs found");
    return console.log({ status: "OK", message: "no jobs found" });
  }

  const schemas = await Promise.all(
    results.map(({ link }) => extractJobDetails(link))
  );

  const withSchmeas = results.map(({ pagemap, ...rest }, i) => ({
    ...rest,
    schema: schemas[i],
  }));

  const withKeywords = withSchmeas.map((job) => {
    const isRemote =
      job?.schema?.description?.includes("remote") ||
      job?.schema?.responsibilities?.includes("remote");
    const keywords = getKeywordsFromSnippet(job.htmlSnippet);
    return {
      ...job,
      keywords: isRemote ? [...keywords, "remote"] : keywords,
    };
  });

  const withSlug = withKeywords.map((job) => ({ ...job, slug: slugify(job) }));

  const inserted = await createManyJobs(withSlug);

  if (!inserted) {
    await notifyTelegram("do update – no jobs added because duplicates");
    return console.log({
      status: "OK",
      message: "no jobs added because duplicates",
    });
  }

  // Send alert to telegram
  const count = withSlug.length;
  let telegram = `${count} new jobs!\n\n`;

  withSlug.forEach((job) => {
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

  await notifyTelegram(telegram, true);
  await notifyTelegram(`do update – new jobs`);

  return console.log({ status: "OK", message: `${count} jobs added` });
}

cron.schedule("00 */6 * * *", run, { timezone: "Asia/Kuala_Lumpur" });
