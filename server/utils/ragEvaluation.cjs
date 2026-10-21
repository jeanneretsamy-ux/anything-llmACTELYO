const { createHash } = require("node:crypto");

const SOURCE_FIELDS = new Set(["id", "docSource", "chunkSource", "url", "title"]);
const DEFAULT_K = [1, 3, 5];

function validateBenchmark(value) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.cases))
    throw new Error("Benchmark invalide : schemaVersion=1 et cases sont requis.");
  if (value.cases.length === 0 || value.cases.length > 1000)
    throw new Error("Le benchmark doit contenir entre 1 et 1000 questions.");
  const ids = new Set();
  for (const item of value.cases) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !/^[\w.-]{1,100}$/.test(item.id) ||
      ids.has(item.id) ||
      typeof item.query !== "string" ||
      !item.query.trim() ||
      item.query.length > 10000 ||
      typeof item.language !== "string" ||
      !/^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(item.language) ||
      !Array.isArray(item.relevant) ||
      item.relevant.length === 0 ||
      item.relevant.length > 100 ||
      item.relevant.some((id) => typeof id !== "string" || !id.trim())
    ) throw new Error("Question de benchmark invalide ou identifiant dupliqué.");
    ids.add(item.id);
  }
  return value;
}

function sourceId(result, field) {
  if (!SOURCE_FIELDS.has(field)) throw new Error("Champ source non pris en charge.");
  const value = field === "id" ? result?.id : result?.metadata?.[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function scoreCase(expected, retrieved, ks = DEFAULT_K) {
  const relevant = new Set(expected);
  const ranked = [...new Set(retrieved.filter(Boolean))];
  const reciprocalRank = ranked.findIndex((id) => relevant.has(id));
  const recall = {};
  const hit = {};
  for (const k of ks) {
    const found = new Set(ranked.slice(0, k).filter((id) => relevant.has(id)));
    recall[`recall@${k}`] = found.size / relevant.size;
    hit[`hit@${k}`] = found.size > 0 ? 1 : 0;
  }
  return { ...recall, ...hit, reciprocalRank: reciprocalRank < 0 ? 0 : 1 / (reciprocalRank + 1) };
}

function summarize(rows, ks = DEFAULT_K) {
  if (!rows.length) return { count: 0 };
  const keys = [...ks.flatMap((k) => [`recall@${k}`, `hit@${k}`]), "reciprocalRank"];
  const out = { count: rows.length };
  for (const key of keys) out[key === "reciprocalRank" ? "mrr" : key] =
    rows.reduce((sum, row) => sum + row.metrics[key], 0) / rows.length;
  const latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b);
  out.latencyMsP50 = latencies[Math.ceil(latencies.length * 0.5) - 1];
  out.latencyMsP95 = latencies[Math.ceil(latencies.length * 0.95) - 1];
  return out;
}

function benchmarkHash(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function prometheus(report) {
  const lines = [];
  for (const [language, metrics] of Object.entries(report.byLanguage)) {
    if (!/^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(language)) throw new Error("Langue invalide pour les métriques.");
    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      const name = `actelyo_rag_eval_${key.replace(/@/g, "_at_").replace(/[^a-zA-Z0-9_]/g, "_")}`;
      lines.push(`${name}{language="${language}"} ${value}`);
    }
  }
  return lines.join("\n") + "\n";
}

module.exports = { DEFAULT_K, SOURCE_FIELDS, validateBenchmark, sourceId, scoreCase, summarize, benchmarkHash, prometheus };
