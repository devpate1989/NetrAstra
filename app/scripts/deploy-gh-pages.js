// Deploys dist/ to the gh-pages branch using a fresh git repo so that
// node_modules inside dist/assets/ are NOT excluded by the root .gitignore.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REMOTE = "https://github.com/devpate1989/NetrAstra.git";
const DIST = path.resolve(__dirname, "../dist");

// Write .nojekyll so GitHub Pages skips Jekyll (_expo/ would be ignored otherwise)
fs.writeFileSync(path.join(DIST, ".nojekyll"), "");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-deploy-"));

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd: cwd ?? tempDir, stdio: "inherit" });
}

try {
  // Copy entire dist into the temp dir
  fs.cpSync(DIST, tempDir, { recursive: true });

  // The temp dir is a brand-new repo with no local config, so it needs its
  // own committer identity even if the user has no global git config set.
  const userName = execFileSync("git", ["config", "user.name"], { cwd: __dirname }).toString().trim();
  const userEmail = execFileSync("git", ["config", "user.email"], { cwd: __dirname }).toString().trim();

  run("git", ["init", "-b", "gh-pages"]);
  run("git", ["config", "user.name", userName]);
  run("git", ["config", "user.email", userEmail]);
  run("git", ["remote", "add", "origin", REMOTE]);
  run("git", ["add", "-A"]); // no .gitignore here — fonts included
  run("git", ["commit", "-m", "Deploy: Expo web build"]);
  run("git", ["push", "origin", "gh-pages", "--force"]);

  console.log("\nDeployed to https://devpate1989.github.io/NetrAstra/");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
