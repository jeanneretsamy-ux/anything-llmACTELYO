const fs = require("fs");
const os = require("os");
const path = require("path");
const extract = require("extract-zip");
const { processSingleFile } = require("../index");
const { isWithin, trashFile } = require("../../utils/files");
const { SUPPORTED_FILETYPE_CONVERTERS } = require("../../utils/constants");

const SAFE_EXTENSIONS = Object.keys(SUPPORTED_FILETYPE_CONVERTERS).filter(
  (extension) => extension !== ".zip"
);

function walkFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function asZip({
  fullFilePath = "",
  filename = "",
  options = {},
  metadata = {},
}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "actelyo-rag-zip-"));
  const documents = [];
  const failures = [];

  try {
    await extract(fullFilePath, { dir: tempRoot });

    for (const extractedFile of walkFiles(tempRoot)) {
      const normalized = path.resolve(extractedFile);
      if (!isWithin(tempRoot, normalized)) {
        failures.push(`${extractedFile}: rejected path outside archive root`);
        continue;
      }

      const extension = path.extname(normalized).toLowerCase();
      if (!SAFE_EXTENSIONS.includes(extension)) continue;

      const relativeName = path.relative(tempRoot, normalized);
      const result = await processSingleFile(
        relativeName,
        {
          ...options,
          absolutePath: normalized,
        },
        {
          ...metadata,
          title: metadata.title || relativeName,
          docSource:
            metadata.docSource ||
            `file extracted from zip archive ${filename}.`,
        }
      );

      if (result.success) {
        documents.push(...result.documents);
      } else {
        failures.push(`${relativeName}: ${result.reason}`);
      }
    }
  } catch (error) {
    failures.push(error.message);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    if (!options.absolutePath) trashFile(fullFilePath);
  }

  if (!documents.length) {
    return {
      success: false,
      reason:
        failures.join("; ") ||
        `No supported documents found inside ${filename}.`,
      documents: [],
    };
  }

  return {
    success: true,
    reason: failures.length ? failures.join("; ") : null,
    documents,
  };
}

module.exports = asZip;
