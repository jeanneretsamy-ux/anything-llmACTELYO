#!/usr/bin/env node
// Evaluate the actual workspace retrieval API without exporting document text.
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  DEFAULT_K, SOURCE_FIELDS, validateBenchmark, sourceId, scoreCase,
  summarize, benchmarkHash, prometheus,
} = require("../utils/ragEvaluation.cjs");

function options(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith("--") || !argv[i + 1] || argv[i + 1].startsWith("--"))
      throw new Error("Arguments attendus : --benchmark FICHIER --workspace SLUG --output FICHIER [--base-url URL] [--source-field CHAMP] [--top-n N] [--threshold 0..1] [--prometheus FICHIER]");
    if (values[key]) throw new Error(`Argument répété : ${key}`);
    values[key] = argv[i + 1];
  }
  const allowed = new Set(["--benchmark", "--workspace", "--output", "--base-url", "--source-field", "--top-n", "--threshold", "--prometheus"]);
  if (Object.keys(values).some((key) => !allowed.has(key))) throw new Error("Argument non reconnu.");
  if (!values["--benchmark"] || !values["--workspace"] || !values["--output"])
    throw new Error("--benchmark, --workspace et --output sont requis.");
  const paths = [values["--benchmark"], values["--output"], values["--prometheus"]]
    .filter(Boolean).map((file) => path.resolve(file).toLowerCase());
  if (new Set(paths).size !== paths.length)
    throw new Error("Le benchmark, le rapport et l'export Prometheus doivent être des fichiers distincts.");
  if (!/^[\w-]{1,100}$/.test(values["--workspace"])) throw new Error("Slug de workspace invalide.");
  const url = new URL(values["--base-url"] || "http://127.0.0.1:3001");
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("Seule une URL HTTP locale, sans identifiants ni chemin, est autorisée.");
  const sourceField = values["--source-field"] || "id";
  if (!SOURCE_FIELDS.has(sourceField)) throw new Error("Champ source non pris en charge.");
  const topN = Number(values["--top-n"] || 5);
  if (!Number.isInteger(topN) || topN < 5 || topN > 100) throw new Error("--top-n doit être un entier entre 5 et 100.");
  const threshold = Number(values["--threshold"] || 0);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error("--threshold doit être compris entre 0 et 1.");
  return { benchmark: values["--benchmark"], workspace: values["--workspace"], output: values["--output"],
    baseUrl: url.origin, sourceField, topN, threshold, prometheusPath: values["--prometheus"] };
}

function atomicWrite(file, content) {
  const dest = path.resolve(file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const temp = path.join(path.dirname(dest), `.${path.basename(dest)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temp, content, { flag: "wx", mode: 0o600 });
    fs.renameSync(temp, dest);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

async function evaluate(config, apiKey, request = fetch) {
  if (!apiKey) throw new Error("ACTELYO_RAG_API_KEY est requis ; ne placez pas la clé dans la commande.");
  const raw = fs.readFileSync(config.benchmark);
  const benchmark = validateBenchmark(JSON.parse(raw.toString("utf8")));
  const rows = [];
  const endpoint = `${config.baseUrl}/v1/workspace/${encodeURIComponent(config.workspace)}/vector-search`;
  for (const item of benchmark.cases) {
    const started = performance.now();
    const response = await request(endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: item.query, topN: config.topN, scoreThreshold: config.threshold }),
    });
    if (!response.ok) throw new Error(`Recherche ${item.id} : HTTP ${response.status}. Aucun rapport partiel publié.`);
    const payload = await response.json();
    if (!Array.isArray(payload?.results)) throw new Error(`Recherche ${item.id} : réponse API invalide.`);
    const retrieved = payload.results.map((result) => sourceId(result, config.sourceField)).filter(Boolean);
    rows.push({ id: item.id, language: item.language.toLowerCase(), expected: item.relevant,
      retrieved, latencyMs: Math.round(performance.now() - started),
      metrics: scoreCase(item.relevant, retrieved, DEFAULT_K) });
  }
  const byLanguage = {};
  for (const language of new Set(rows.map((row) => row.language)))
    byLanguage[language] = summarize(rows.filter((row) => row.language === language));
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), benchmarkSha256: benchmarkHash(raw),
    workspace: config.workspace, retrieval: { sourceField: config.sourceField, topN: config.topN,
      threshold: config.threshold, endpoint: config.baseUrl },
    overall: summarize(rows), byLanguage, cases: rows };
}

async function main(argv = process.argv.slice(2)) {
  const config = options(argv);
  const report = await evaluate(config, process.env.ACTELYO_RAG_API_KEY);
  atomicWrite(config.output, JSON.stringify(report, null, 2) + "\n");
  if (config.prometheusPath) atomicWrite(config.prometheusPath, prometheus(report));
  console.log(`Évaluation locale : ${report.overall.count} questions, Recall@5=${report.overall["recall@5"].toFixed(3)}, MRR=${report.overall.mrr.toFixed(3)}.`);
  console.log(`Rapport : ${path.resolve(config.output)}`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { options, evaluate, atomicWrite };
