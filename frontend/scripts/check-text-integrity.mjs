import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".ini",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".txt",
  ".yaml",
  ".yml",
]);

const DEFAULT_TARGETS = [
  "src",
  "scripts",
  "eslint.config.js",
  "package.json",
  "vite.config.js",
];

const SKIP_DIRS = new Set(["coverage", "dist", "node_modules"]);

const CP1251_TAIL =
  "[\\u0402\\u0403\\u201A\\u0453\\u201E\\u2026\\u2020\\u2021\\u20AC\\u2030" +
  "\\u0409\\u2039\\u040A\\u040C\\u040B\\u040F\\u0452\\u2018\\u2019\\u201C" +
  "\\u201D\\u2022\\u2013\\u2014\\u2122\\u0459\\u203A\\u045A\\u045C\\u045B" +
  "\\u045F\\u00A0\\u040E\\u045E\\u0408\\u00A4\\u0490\\u00A6\\u00A7\\u0401" +
  "\\u00A9\\u0404\\u00AB\\u00AC\\u00AD\\u00AE\\u0407\\u00B0\\u00B1\\u0406" +
  "\\u0456\\u0491\\u00B5\\u00B6\\u00B7\\u0451\\u2116\\u0454\\u00BB\\u0458" +
  "\\u0405\\u0455\\u0457]";

const SUSPICIOUS_PATTERNS = [
  { name: "replacement character", regex: /\uFFFD/g },
  { name: "mojibake UTF-8 BOM", regex: /\u043F\u00BB\u0457/g },
  {
    name: "CP1251 mojibake",
    regex: new RegExp(`(?:\\u0420${CP1251_TAIL}|\\u0421${CP1251_TAIL})`, "g"),
  },
  {
    name: "CP1252 mojibake",
    regex: /(?:\u00E2[\u0080-\u00BF\u20AC\u201A-\u201E\u2020-\u2022\u2122]|\u00C2[\u0080-\u00BF])/g,
  },
  { name: "latin mojibake prefix", regex: /\u00D0|\u00D1/g },
  {
    name: "cyrillic mojibake punctuation",
    regex: /\u0432[\u0402\u201E\u2026\u2020\u2021\u20AC\u2122\u045A\u045C\u045B\u045F\u045E\u0408\u00A4\u00A6\u00A7\u00A9\u00AB\u00AC\u00AE\u00B0\u00B1\u0406\u0456\u0454\u0455\u00B6\u00B7\u2116\u201C\u201D\u2022\u2013\u2014]/g,
  },
];

const decoder = new TextDecoder("utf-8", { fatal: true });
const root = process.cwd();
const targets = process.argv.slice(2);

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath));
}

function collectFiles(targetPath, files = []) {
  const stat = fs.statSync(targetPath, { throwIfNoEntry: false });
  if (!stat) return files;

  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      collectFiles(path.join(targetPath, entry.name), files);
    }
    return files;
  }

  if (stat.isFile() && isTextFile(targetPath)) {
    files.push(targetPath);
  }
  return files;
}

function inspectFile(filePath) {
  const issues = [];
  const bytes = fs.readFileSync(filePath);
  const relative = path.relative(root, filePath);

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    issues.push({
      file: relative,
      line: 1,
      column: 1,
      kind: "UTF-8 BOM",
      match: "BOM",
      preview: "",
    });
  }

  let text;
  try {
    text = decoder.decode(bytes);
  } catch (error) {
    issues.push({
      file: relative,
      line: 1,
      column: 1,
      kind: "invalid UTF-8",
      match: error.message,
      preview: "",
    });
    return issues;
  }

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const findings = [];
    for (const pattern of SUSPICIOUS_PATTERNS) {
      pattern.regex.lastIndex = 0;
      const matches = line.match(pattern.regex);
      if (matches) {
        findings.push(`${pattern.name}: ${[...new Set(matches)].slice(0, 5).join(" ")}`);
      }
    }
    if (findings.length > 0) {
      issues.push({
        file: relative,
        line: index + 1,
        column: 1,
        kind: "suspicious text",
        match: findings.join("; "),
        preview: line.trim().slice(0, 180),
      });
    }
  }

  return issues;
}

const files = (targets.length > 0 ? targets : DEFAULT_TARGETS)
  .flatMap((target) => collectFiles(path.resolve(root, target)))
  .sort();

const issues = files.flatMap(inspectFile);

if (issues.length > 0) {
  console.error(`Text integrity check failed: ${issues.length} issue(s) found.`);
  for (const issue of issues.slice(0, 50)) {
    console.error(
      `${issue.file}:${issue.line}:${issue.column} ${issue.kind}: ${JSON.stringify(issue.match)}`,
    );
    if (issue.preview) {
      console.error(`  ${issue.preview}`);
    }
  }
  if (issues.length > 50) {
    console.error(`  ...and ${issues.length - 50} more issue(s).`);
  }
  process.exitCode = 1;
}
