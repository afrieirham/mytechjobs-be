const fetch = require("node-fetch");
const { load } = require("cheerio");

const extractJobDetails = async (url) => {
  // Check if broken url
  const status = await fetch(url).then((res) => res.status);
  if (status >= 400) {
    return null;
  }

  // Fetch url content
  const response = await fetch(url).then((res) => res.text());

  // Get json-ld of the page
  const $ = load(response);
  const staticJobSchema = $("script[type='application/ld+json']").text();

  if (staticJobSchema) {
    const schema = extract(staticJobSchema);

    if (!schema) {
      return null;
    }

    return { url, ...extract(staticJobSchema) };
  }

  return null;
};

const extract = (html) => {
  // Check if multiple json-ld
  const split = html.split("}{");

  // Find jsob-ld for "JobPosting"
  if (split.length > 1) {
    const fixed = split.map((item, i) =>
      i % 2 === 0 ? item + "}" : "{" + item
    );
    const formatted = fixed.map((i) => JSON.parse(i));
    const needed = formatted.find((item) => item["@type"] === "JobPosting");
    return needed;
  }

  // Check if jsob-ld is "JobPosting"
  const needed = JSON.parse(html);
  if (needed["@type"] === "JobPosting") {
    return needed;
  }

  return null;
};

module.exports = extractJobDetails;
