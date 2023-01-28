const { nanoid } = require("nanoid");

const toSlug = (str) =>
  str
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-zA-Z0-9 ]/g, "")
    .replaceAll(" ", "-");

const slugify = (job) => {
  const title = job?.schema?.title ? job.schema.title : job.title;
  const company = job?.schema?.hiringOrganization?.name;

  if (!Boolean(company)) {
    return toSlug(title) + "-" + nanoid(4);
  }

  return toSlug(title) + "-" + toSlug(company) + "-" + nanoid(4);
};

module.exports = slugify;
