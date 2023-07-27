require("dotenv").config();
const Cryptr = require("cryptr");
const cron = require("node-cron");
const fetch = require("node-fetch");
const nodemailer = require("nodemailer");
const { format } = require("date-fns");
const { default: axios } = require("axios");
const { stringifyUrl } = require("query-string");

const {
  createManyJobs,
  getWeeklyJobs,
  getAllJobs,
  deleteJob,
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

  const onlyWithSchemas = withSchmeas.filter((j) => Boolean(j.schema));

  if (onlyWithSchemas?.length === 0) {
    await notifyTelegram("do update – no jobs found");
    return console.log({ status: "OK", message: "no jobs found" });
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
  await notifyTelegram(`do update – ${count} new jobs`);
  await createJobCount(count);

  return console.log({ status: "OK", message: `${count} jobs added` });
}

cron.schedule("0 */3 * * *", run, { timezone: "Asia/Kuala_Lumpur" });

const alerts = async () => {
  // get list of subscribers
  const list_id = process.env.SENDINBLUE_LIST_ID;
  const url = `https://api.sendinblue.com/v3/contacts/lists/${list_id}/contacts?limit=500`;

  // https://developers.sendinblue.com/reference/getcontactsfromlist
  const config = { headers: { "api-key": process.env.SENDINBLUE_API_KEY } };
  const { data } = await axios.get(url, config);
  const subscribers = data?.contacts;

  // get new jobs of the week
  const { jobs } = await getWeeklyJobs();

  // compose email body
  const jobList = jobs.map((j, i) => {
    const isAd = j?.source === "ad";
    const url = "https://kerja-it.com/jobs/" + j?.slug;
    const n = i + 1;
    const title = j?.schema?.title ?? j?.title;

    let content = `${n}. <b>${title}</b>`;

    const company = isAd
      ? j?.company?.name
      : j?.schema?.hiringOrganization?.name;

    const hasCompany = Boolean(company);
    if (hasCompany) {
      content += `<br/><i>${company}</i>`;
    }

    content += `<br/>${url}`;

    const postedAt = format(new Date(j?.postedAt), "do MMM yyyy");
    content += `<br/><sub>Posted on: ${postedAt}</sub>`;

    return content;
  });

  const email_body = jobList.join("<br/><br/>");

  // setup email & send
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const cryptr = new Cryptr(process.env.UNSUBSCRIPTION_SECRET);

  const $email = subscribers.map((subscriber) => {
    const { email, attributes } = subscriber;
    const name = attributes.FIRSTNAME;

    // setup unsubscribe link
    const unsubscribe_link = stringifyUrl({
      url: "https://kerja-it.com/emails/unsubscribe",
      query: { email, token: cryptr.encrypt(email) },
    });

    // setup email
    const email_header = `Hi ${name}, here are new jobs this week 🥳`;
    const email_footer = `No longer looking for a job? <a href="${unsubscribe_link}" target="_blank">Unsubscribe</a>`;
    const html = `${email_header}<br/><br/>${email_body}<br/><br/><br/><br/>${email_footer}`;

    const date = format(new Date(), "dd/MM");
    const subject = `New jobs this week (${date})`;
    return transporter.sendMail({
      from: '"🔔 Kerja IT Job Alerts" <alerts@kerja-it.com>',
      to: email,
      subject,
      html,
    });
  });

  await Promise.all($email);

  await notifyTelegram(
    `do update – email sent to ${subscribers?.length} people`
  );
};

cron.schedule("00 19 * * 5", alerts, { timezone: "Asia/Kuala_Lumpur" });

const removeBrokenLinks = async () => {
  const { jobs } = await getAllJobs();

  const remove = jobs
    .filter((j) => Boolean(j?.link))
    .map((j) =>
      fetch(j?.link)
        .then((res) => ({ ...j, status: res.status }))
        .catch(() => console.log(j))
    );

  const linksWithStatus = await Promise.all(remove);

  const deleted = linksWithStatus.map((l) => {
    if (l?.status < 300) {
      return;
    }
    return deleteJob(l?._id);
  });

  const saved = await Promise.all(deleted);
  const total_deleted = saved.filter(Boolean);

  await notifyTelegram(`do update – ${total_deleted?.length} jobs deleted`);
  console.log(`do update – ${total_deleted?.length} jobs deleted`);
};

// cron.schedule("00 01 * * *", removeBrokenLinks, {
//   timezone: "Asia/Kuala_Lumpur",
// });
