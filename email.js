require("dotenv").config();
const Cryptr = require("cryptr");
const nodemailer = require("nodemailer");
const { format } = require("date-fns");
const { default: axios } = require("axios");
const { stringifyUrl } = require("query-string");

const { getWeeklyJobs } = require("./functions/createManyJobs");
const notifyTelegram = require("./functions/notifyTelegram");

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

alerts();
