const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Capture the actual Multer destination callbacks. Other upload handlers are not invoked.
const filename = path.resolve(__dirname, '../runtime-overrides/server/utils/files/multer.js');
function destinations(env) {
  const storages = [];
  const sandbox = {
    module: { exports: {} }, __dirname: path.dirname(filename), process: { env }, Buffer,
    require(name) {
      if (name === 'multer') return { diskStorage(value) { storages.push(value); return value; } };
      if (name === 'path') return path;
      if (name === 'fs') return fs;
      if (name === 'uuid') return { v4: () => 'unused' };
      if (name === '.') return { normalizePath: value => value, sanitizeFileName: value => value };
      throw Error('Unexpected dependency: ' + name);
    },
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return storages.slice(0, 2).map(storage => {
    let destination;
    storage.destination({}, {}, (error, value) => { assert.equal(error, null); destination = value; });
    return destination;
  });
}
test('Desktop API and GUI upload to the collector workspace selected by the runtime', () => {
  const work = path.join(process.cwd(), 'synthetic-profile', 'collector');
  const values = destinations({ NODE_ENV:'production', STORAGE_DIR:path.join(process.cwd(),'synthetic-profile','storage'), ACTELYO_WORK_DIR:work });
  assert.deepEqual(values, [path.join(work, 'hotdir'), path.join(work, 'hotdir')]);
});
test('legacy production storage destination remains consistent without Desktop workspace', () => {
  const storage = path.join(process.cwd(),'synthetic-profile','storage');
  const values = destinations({ NODE_ENV:'production', STORAGE_DIR:storage });
  assert.deepEqual(values, [path.resolve(storage,'../../collector/hotdir'),path.resolve(storage,'../../collector/hotdir')]);
});
test('development upload destinations remain consistent', () => {
  const values = destinations({ NODE_ENV:'development' });
  const expected = path.resolve(path.dirname(filename),'../../../collector/hotdir');
  assert.deepEqual(values,[expected,expected]);
});
