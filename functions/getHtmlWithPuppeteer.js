const puppeteer = require("puppeteer");

const getHtmlWithPuppeteer = async (url) => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url);

  try {
    await page.waitForSelector("script[type='application/ld+json']", {
      timeout: 1000 * 10,
    });
  } catch (error) {
    return null;
  }

  const bodyHandle = await page.$("html");
  const html = await page.evaluate((body) => body.innerHTML, bodyHandle);
  await browser.close();

  return html;
};

module.exports = getHtmlWithPuppeteer;
