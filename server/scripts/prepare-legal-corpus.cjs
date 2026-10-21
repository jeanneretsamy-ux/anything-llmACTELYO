#!/usr/bin/env node
// Build article-level files for the existing Actelyo RAG document importer.
// No external corpus or third-party source code is bundled here.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const LANGUAGES = [["fr", "Français"], ["en", "English"], ["ar", "العربية"]];
const MAX_RECORDS = 10000;

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function cleanText(value, name, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`${name} est requis.`);
    return null;
  }
  if (typeof value !== "string" || value.length > 100000 || value.includes("\0"))
    throw new Error(`${name} doit être un texte valide de 100 000 caractères au plus.`);
  const text = value.trim();
  if (required && !text) throw new Error(`${name} est vide.`);
  return text || null;
}
function cleanMetadata(value, name, required = false) {
  const text = cleanText(value, name, required);
  if (text && (text.length > 500 || /[\r\n\u2028\u2029]/u.test(text)))
    throw new Error(`${name} doit tenir sur une seule ligne de 500 caractères au plus.`);
  return text;
}

function validateArticles(input) {
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.articles) ||
      input.articles.length < 1 || input.articles.length > MAX_RECORDS)
    throw new Error(`Le corpus doit contenir entre 1 et ${MAX_RECORDS} articles (schemaVersion 1).`);
  const seen = new Set();
  return input.articles.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`Article ${index + 1} invalide.`);
    const id = String(raw.id ?? raw.article_number ?? "").trim();
    if (!/^[\w.-]{1,100}$/.test(id) || seen.has(id)) throw new Error(`Identifiant d'article invalide ou dupliqué : ${id}`);
    seen.add(id);
    if (typeof raw.is_repealed !== "boolean") throw new Error(`L'article ${id} doit déclarer is_repealed (true/false).`);
    const citation = cleanMetadata(raw.citation, `Citation ${id}`, true);
    const jurisdiction = cleanMetadata(raw.jurisdiction, `Juridiction ${id}`, true);
    const texts = Object.fromEntries(LANGUAGES.map(([code]) => [code, cleanText(raw[`text_${code}`], `Texte ${code} ${id}`)]));
    if (!Object.values(texts).some(Boolean)) throw new Error(`L'article ${id} n'a aucun texte juridique.`);
    const sourcePage = raw.source_page ?? null;
    if (sourcePage !== null && (!Number.isInteger(sourcePage) || sourcePage < 1))
      throw new Error(`Page source invalide pour l'article ${id}.`);
    return { id, citation, jurisdiction, isRepealed: raw.is_repealed, sourcePage,
      sourceName: cleanMetadata(raw.source_name, `Source ${id}`),
      book: cleanMetadata(raw.book, `Livre ${id}`), chapter: cleanMetadata(raw.chapter, `Chapitre ${id}`),
      section: cleanMetadata(raw.section, `Section ${id}`), texts };
  });
}

function renderArticle(article) {
  const status = article.isRepealed ? "ABROGÉ — NE PAS UTILISER COMME DROIT EN VIGUEUR" : "En vigueur selon le corpus importé — à vérifier à la date d'usage";
  const lines = [`# ${article.citation}`, "", `Juridiction : ${article.jurisdiction}`, `Statut : ${status}`];
  if (article.sourceName) lines.push(`Source : ${article.sourceName}`);
  if (article.sourcePage) lines.push(`Page source : ${article.sourcePage}`);
  for (const [label, value] of [["Livre", article.book], ["Chapitre", article.chapter], ["Section", article.section]])
    if (value) lines.push(`${label} : ${value}`);
  for (const [code, name] of LANGUAGES)
    if (article.texts[code]) lines.push("", `## ${name}`, "", article.texts[code]);
  return lines.join("\n") + "\n";
}

function prepare(inputFile, outputDirectory) {
  const inputPath = path.resolve(inputFile);
  const outputPath = path.resolve(outputDirectory);
  if (outputPath === inputPath || fs.existsSync(outputPath))
    throw new Error("Choisissez un nouveau dossier de sortie inexistant, distinct du fichier source.");
  const raw = fs.readFileSync(inputPath);
  if (raw.length > 50 * 1024 * 1024) throw new Error("Corpus trop volumineux pour cet importateur (50 Mo maximum).");
  const articles = validateArticles(JSON.parse(raw.toString("utf8")));
  const manifest = { schemaVersion: 1, sourceSha256: sha256(raw), counts: { current: 0, repealed: 0 }, articles: [] };
  for (const article of articles) {
    const status = article.isRepealed ? "repealed" : "current";
    const filename = `${article.id.slice(0, 60).replace(/[^\w.-]/g, "_")}-${sha256(article.id).slice(0, 8)}.md`;
    const relative = path.posix.join(status, filename);
    const content = renderArticle(article);
    manifest.articles.push({ id: article.id, file: relative, citation: article.citation,
      jurisdiction: article.jurisdiction, is_repealed: article.isRepealed,
      source_page: article.sourcePage, sha256: sha256(content) });
    manifest.counts[status] += 1;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(outputPath, { recursive: false });
  for (let index = 0; index < articles.length; index++) {
    const file = path.join(outputPath, manifest.articles[index].file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, renderArticle(articles[index]), { flag: "wx", mode: 0o600 });
  }
  fs.writeFileSync(path.join(outputPath, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return manifest;
}

function main(argv = process.argv.slice(2)) {
  if (argv.length !== 4 || argv[0] !== "--input" || argv[2] !== "--output")
    throw new Error("Usage : --input corpus.json --output nouveau-dossier");
  const manifest = prepare(argv[1], argv[3]);
  const current = manifest.counts.current;
  const repealed = manifest.counts.repealed;
  console.log(`${current} article${current > 1 ? "s" : ""} courant${current > 1 ? "s" : ""} et ${repealed} article${repealed > 1 ? "s" : ""} abrogé${repealed > 1 ? "s" : ""} préparés localement.`);
}
if (require.main === module) try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
module.exports = { validateArticles, renderArticle, prepare };
