require("dotenv").config();
const fetch = require("node-fetch");
const { stringifyUrl } = require("query-string");

const {
  createManyJobs,
  createJobCount,
} = require("./functions/createManyJobs");
const slugify = require("./functions/slugify");
const notifyTelegram = require("./functions/notifyTelegram");
const extractJobDetails = require("./functions/extractJobDetails");
const constructUrlQuery = require("./functions/constructUrlQuery");
const getKeywordsFromSnippet = require("./functions/getKeywordsFromSnippet");

const cx = process.env.GOOGLE_SEARCH_CX;
const key = process.env.GOOGLE_SEARCH_KEY;
const URL = "https://www.googleapis.com/customsearch/v1";

async function fetchJobs() {
  await notifyTelegram("starting from github actions");
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
    await notifyTelegram("ga update – no jobs found");
    return console.log({ status: "OK", message: "no jobs found" });
  }

  const schemas = await Promise.all(
    results.map(({ link }) => extractJobDetails(link))
  );

  const withSchmeas = results.map(({ pagemap, ...rest }, i) => ({
    ...rest,
    schema: schemas[i],
  }));

  const onlyWithSchemas = withSchmeas.filter((j) => Boolean(j.schema));

  if (onlyWithSchemas?.length === 0) {
    await notifyTelegram("ga update – no jobs found");
    console.log({ status: "OK", message: "no jobs found" });
    return;
  }

  const withKeywords = onlyWithSchemas.map((job) => {
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
    await notifyTelegram("ga update – no jobs added because duplicates");
    console.log({
      status: "OK",
      message: "no jobs added because duplicates",
    });
    return;
  }

  // Send alert to telegram
  const count = withSlug.length;
  let telegram = `${count} new jobs!\n\n`;

  withSlug.forEach((job) => {
    const { schema, title, slug } = job;
    const applyUrl = "https://kerja-it.com/jobs/" + slug;
    if (schema) {
      const { title, hiringOrganization } = schema;
      const company = hiringOrganization?.name;
      const text = `${title} @ ${company}\n${applyUrl}\n\n\n`;
      telegram += text;
    } else {
      telegram += `${title}\n${applyUrl}\n\n\n`;
    }
  });

  await notifyTelegram(telegram, true);
  await notifyTelegram(`ga update – ${count} new jobs`);
  await createJobCount(count);

  console.log({ status: "OK", message: `${count} jobs added` });
  return;
}

fetchJobs();
