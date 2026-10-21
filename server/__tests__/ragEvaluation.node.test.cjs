const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { validateBenchmark, scoreCase, summarize, prometheus } = require("../utils/ragEvaluation.cjs");
const { options, evaluate } = require("../scripts/rag-eval.cjs");
const { validateArticles, renderArticle, prepare } = require("../scripts/prepare-legal-corpus.cjs");

test("Recall@k and MRR use document rank with multilingual cases", () => {
  const fr = scoreCase(["article-1", "article-3"], ["article-2", "article-1", "article-3"]);
  const ar = scoreCase(["article-1"], ["article-1", "article-1", "article-2"]);
  assert.equal(fr["recall@1"], 0);
  assert.equal(fr["recall@3"], 1);
  assert.equal(fr.reciprocalRank, 0.5);
  assert.equal(ar["recall@1"], 1);
  assert.equal(ar.reciprocalRank, 1);
  const summary = summarize([{ metrics: fr, latencyMs: 10 }, { metrics: ar, latencyMs: 20 }]);
  assert.equal(summary["recall@1"], 0.5);
  assert.equal(summary.mrr, 0.75);
  assert.equal(summary.latencyMsP95, 20);
});

test("benchmark rejects missing judgements and duplicate IDs", () => {
  assert.throws(() => validateBenchmark({ schemaVersion: 1, cases: [{ id: "a", language: "fr", query: "Q", relevant: [] }] }));
  assert.throws(() => validateBenchmark({ schemaVersion: 1, cases: [
    { id: "a", language: "fr", query: "Q", relevant: ["1"] },
    { id: "a", language: "ar", query: "S", relevant: ["2"] },
  ] }));
});

test("CLI requires loopback, never an external API endpoint", () => {
  const base = ["--benchmark", "set.json", "--workspace", "legal", "--output", "report.json"];
  assert.equal(options(base).baseUrl, "http://127.0.0.1:3001");
  assert.throws(() => options([...base, "--base-url", "https://example.com"]));
  assert.throws(() => options([...base, "--base-url", "http://127.0.0.1:3001/redirect"]));
  assert.throws(() => options(["--benchmark", "same.json", "--workspace", "legal", "--output", "same.json"]));
});

test("evaluation calls the real vector-search contract and keeps queries out of reports", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "actelyo-rag-eval-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const benchmark = path.join(dir, "benchmark.json");
  fs.writeFileSync(benchmark, JSON.stringify({ schemaVersion: 1, cases: [
    { id: "fr-1", language: "fr", query: "Quelle règle ?", relevant: ["article-1"] },
    { id: "ar-1", language: "ar", query: "ما القاعدة؟", relevant: ["article-2"] },
  ] }));
  const config = options(["--benchmark", benchmark, "--workspace", "droit", "--output", path.join(dir, "report.json"), "--source-field", "docSource"]);
  const calls = [];
  const mockedRequest = async (url, init) => {
    calls.push({ url, init });
    const query = JSON.parse(init.body).query;
    const docSource = query.startsWith("Quelle") ? "article-1" : "article-2";
    return { ok: true, json: async () => ({ results: [{ id: "chunk-1", metadata: { docSource } }] }) };
  };
  const report = await evaluate(config, "test-key", mockedRequest);
  assert.equal(report.overall["recall@1"], 1);
  assert.equal(report.byLanguage.fr.mrr, 1);
  assert.equal(report.byLanguage.ar.mrr, 1);
  assert.equal(report.cases[0].query, undefined);
  assert.equal(calls[0].url, "http://127.0.0.1:3001/v1/workspace/droit/vector-search");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
  assert.equal(calls[0].init.redirect, "error");
  assert.match(prometheus(report), /actelyo_rag_eval_recall_at_1\{language="fr"\} 1/);
  assert.throws(() => prometheus({ byLanguage: { 'x"bad': { count: 1 } } }), /Langue invalide/);
  await assert.rejects(() => evaluate(config, "test-key", async () => ({ ok: false, status: 503 })), /Aucun rapport partiel/);
});

test("legal importer preserves bilingual article boundaries and separates repealed law", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "actelyo-legal-import-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const input = path.join(dir, "source.json");
  const output = path.join(dir, "prepared");
  fs.copyFileSync(path.resolve(__dirname, "../../examples/rag-eval/legal-articles.sample.json"), input);
  const manifest = prepare(input, output);
  assert.deepEqual(manifest.counts, { current: 1, repealed: 1 });
  const current = fs.readFileSync(path.join(output, manifest.articles[0].file), "utf8");
  const repealed = fs.readFileSync(path.join(output, manifest.articles[1].file), "utf8");
  assert.match(current, /## العربية/);
  assert.match(current, /Page source : 1/);
  assert.match(repealed, /ABROGÉ — NE PAS UTILISER/);
  assert.match(manifest.articles[0].file, /^current\//);
  assert.match(manifest.articles[1].file, /^repealed\//);
  assert.throws(() => prepare(input, output), /inexistant/);
  assert.throws(() => validateArticles({ schemaVersion: 1, articles: [
    { id: "1", citation: "X", jurisdiction: "FR", text_fr: "texte" },
  ] }), /is_repealed/);
  assert.match(renderArticle(validateArticles({ schemaVersion: 1, articles: [
    { id: "3", citation: "X", jurisdiction: "FR", is_repealed: false, text_fr: "texte" },
  ] })[0]), /## Français/);
});
