// Extends app.json — lets SELFHOST=1 override the baseUrl so the self-hosted
// build serves correctly at a root domain (app.devtshq.space/) instead of
// requiring the /NetrAstra sub-path that GitHub Pages needs.
const base = require("./app.json");

module.exports = ({ config }) => {
  const isGithubPages = !process.env.SELFHOST;
  return {
    ...base.expo,
    experiments: {
      ...base.expo.experiments,
      baseUrl: isGithubPages ? "/NetrAstra" : "",
    },
  };
};
