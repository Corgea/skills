#!/usr/bin/env node
// Validates that the marketplace manifest, the plugin manifests, the skills on
// disk and the README all describe the same set of skills. A mismatch here
// breaks installs for users rather than failing anything at build time, so it
// has to be caught before merge.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const root = process.cwd();
const errors = [];

const fail = (msg) => errors.push(msg);

const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(join(root, path), "utf8"));
  } catch (e) {
    fail(`${path}: cannot parse as JSON (${e.message})`);
    return null;
  }
};

const dirsIn = (path) => {
  const abs = join(root, path);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).filter((n) => statSync(join(abs, n)).isDirectory());
};

// Enough of a YAML reader for `key: value` frontmatter. Skills use flat
// scalars only; anything nested is rejected below rather than half-parsed.
const parseFrontmatter = (content, label) => {
  if (!content.startsWith("---\n")) {
    fail(`${label}: must open with a --- frontmatter delimiter`);
    return null;
  }
  const end = content.indexOf("\n---", 3);
  if (end === -1) {
    fail(`${label}: frontmatter is never closed with ---`);
    return null;
  }
  const block = content.slice(4, end);
  const fields = {};
  for (const line of block.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!match) {
      fail(`${label}: frontmatter line is not a 'key: value' pair -> ${line}`);
      continue;
    }
    fields[match[1]] = match[2].trim();
  }
  return { fields, body: content.slice(end + 4) };
};

// --- marketplace and plugin manifests ---------------------------------------

const marketplacePath = ".claude-plugin/marketplace.json";
const marketplace = readJson(marketplacePath);
const pluginDirs = dirsIn("plugins");

if (marketplace) {
  if (!marketplace.name) fail(`${marketplacePath}: 'name' is required`);
  if (!marketplace.owner?.name) fail(`${marketplacePath}: 'owner.name' is required`);
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
    fail(`${marketplacePath}: 'plugins' must be a non-empty array`);
  }

  const seen = new Set();
  for (const entry of marketplace.plugins ?? []) {
    const label = `${marketplacePath} -> ${entry.name ?? "<unnamed>"}`;
    if (!entry.name) {
      fail(`${label}: 'name' is required`);
      continue;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.name)) {
      fail(`${label}: name must be kebab-case`);
    }
    if (seen.has(entry.name)) fail(`${label}: duplicate plugin name`);
    seen.add(entry.name);

    if (!entry.source) {
      fail(`${label}: 'source' is required`);
      continue;
    }
    if (!entry.source.startsWith("./") || entry.source.includes("..")) {
      fail(`${label}: source must be a relative './' path without '..'`);
      continue;
    }
    if (basename(entry.source) !== entry.name) {
      fail(`${label}: source directory must be named after the plugin`);
    }

    const manifestPath = join(entry.source, ".claude-plugin/plugin.json");
    if (!existsSync(join(root, manifestPath))) {
      fail(`${label}: no plugin manifest at ${manifestPath}`);
      continue;
    }
    const plugin = readJson(manifestPath);
    if (!plugin) continue;

    if (plugin.name !== entry.name) {
      fail(`${manifestPath}: name '${plugin.name}' does not match marketplace entry '${entry.name}'`);
    }
    // plugin.json wins at runtime, so silent divergence ships the wrong metadata.
    for (const field of ["description", "version", "author", "keywords"]) {
      if (entry[field] === undefined || plugin[field] === undefined) continue;
      if (JSON.stringify(entry[field]) !== JSON.stringify(plugin[field])) {
        fail(`${manifestPath}: '${field}' differs from the marketplace entry for '${entry.name}'`);
      }
    }

    if (dirsIn(join(entry.source, "skills")).length === 0) {
      fail(`${label}: plugin has no skills under ${entry.source}/skills`);
    }
  }

  for (const dir of pluginDirs) {
    if (!seen.has(dir)) fail(`plugins/${dir}: directory has no entry in ${marketplacePath}`);
  }
}

// --- skills ------------------------------------------------------------------

const skills = [];
for (const plugin of pluginDirs) {
  for (const skill of dirsIn(`plugins/${plugin}/skills`)) {
    const path = `plugins/${plugin}/skills/${skill}/SKILL.md`;
    if (!existsSync(join(root, path))) {
      fail(`plugins/${plugin}/skills/${skill}: missing SKILL.md`);
      continue;
    }
    const parsed = parseFrontmatter(readFileSync(join(root, path), "utf8"), path);
    if (!parsed) continue;

    const { fields, body } = parsed;
    for (const field of ["name", "description"]) {
      if (!fields[field]) fail(`${path}: frontmatter '${field}' is required and must be non-empty`);
    }
    if (fields.name && fields.name !== skill) {
      fail(`${path}: frontmatter name '${fields.name}' must match its directory '${skill}'`);
    }
    // Agent Skills caps the description; past it, agents stop seeing the tail.
    if (fields.description && fields.description.length > 1024) {
      fail(`${path}: description is ${fields.description.length} chars, over the 1024 limit`);
    }
    if (!body.trim()) fail(`${path}: has frontmatter but no body`);

    skills.push({ plugin, name: skill, path: `plugins/${plugin}/skills/${skill}` });
  }
}

// --- README -------------------------------------------------------------------

const readmePath = "README.md";
if (existsSync(join(root, readmePath))) {
  const readme = readFileSync(join(root, readmePath), "utf8");

  const rows = [...readme.matchAll(/^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|/gm)].map((m) => ({
    name: m[1],
    target: m[2],
  }));

  for (const skill of skills) {
    const row = rows.find((r) => r.name === skill.name);
    if (!row) {
      fail(`${readmePath}: skills table has no row for '${skill.name}'`);
    } else if (row.target !== skill.path) {
      fail(`${readmePath}: row '${skill.name}' links to '${row.target}', expected '${skill.path}'`);
    }
  }
  for (const row of rows) {
    if (!skills.some((s) => s.name === row.name)) {
      fail(`${readmePath}: skills table lists '${row.name}', which does not exist on disk`);
    }
  }

  for (const [, target] of readme.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    if (!existsSync(join(root, target))) {
      fail(`${readmePath}: relative link '${target}' does not resolve`);
    }
  }
}

// --- report ---------------------------------------------------------------------

if (errors.length > 0) {
  console.error(`Validation failed with ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `Validation passed: ${pluginDirs.length} plugin(s), ${skills.length} skill(s).`
);
