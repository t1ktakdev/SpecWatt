import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Exercises the REAL photos.ts native composition (import / prune / existence
// gate) against a tiny in-memory filesystem. Only the three expo native
// modules are faked; every policy decision still runs the real photo-policy.
function loadPhotos(os = "android") {
  const files = new Map(); // uri -> {size}
  const dirs = new Set();
  let permissionTrap = null;
  let savedPhotoSize = 800_000;
  let pickerOutcome = { canceled: true, assets: [] };
  const released = { render: 0, context: 0 };
  // Injected native-failure seams (per test, cleared by reset): each holds a
  // factory for the error the fake native layer throws, or null.
  const faults = { copy: null, create: null, save: null, render: null, del: null };

  class FakeFile {
    constructor(a, b) {
      this.uri = typeof a === "string" ? a : `${a.uri}/${b}`;
      this.name = this.uri.split("/").at(-1);
    }
    get exists() {
      if (permissionTrap && this.uri === permissionTrap)
        throw new Error("EACCES: permission denied");
      return files.has(this.uri);
    }
    get size() {
      const entry = files.get(this.uri);
      return entry ? entry.size : 0;
    }
    async copy(destination) {
      if (faults.copy) {
        // A partial destination lands before the native failure, exactly like
        // a real interrupted copy.
        files.set(destination.uri, { size: 512 });
        throw faults.copy();
      }
      files.set(destination.uri, { size: files.get(this.uri).size });
    }
    delete() {
      if (faults.del) throw faults.del();
      files.delete(this.uri);
    }
  }
  class FakeDirectory {
    constructor(a, b) {
      this.uri = typeof a === "string" ? a : `${a.uri}/${b}`;
      this.name = this.uri.split("/").at(-1);
    }
    get exists() {
      return dirs.has(this.uri);
    }
    create() {
      if (faults.create) throw faults.create();
      dirs.add(this.uri);
    }
    list() {
      const children = [];
      for (const uri of [...files.keys(), ...dirs]) {
        if (!uri.startsWith(`${this.uri}/`)) continue;
        const rest = uri.slice(this.uri.length + 1);
        if (rest.includes("/")) continue;
        children.push(
          files.has(uri) ? new FakeFile(uri) : new FakeDirectory(uri),
        );
      }
      return children;
    }
  }
  const Paths = {
    document: { uri: "file:///data/user/0/app/files" },
    cache: { uri: "file:///data/user/0/app/cache" },
  };
  let manipulatorContexts = 0;
  const ImageManipulator = {
    manipulate: (uri, options) => {
      manipulatorContexts += 1;
      return {
        resize() {},
        async renderAsync() {
          if (faults.render) throw faults.render();
          return {
            width: 1024,
            height: 768,
            saveAsync: async () => {
              if (faults.save) throw faults.save();
              const uri = `${Paths.cache.uri}/ImageManipulator/out-${manipulatorContexts}.jpg`;
              files.set(uri, { size: savedPhotoSize });
              return { uri };
            },
            release() {
              released.render += 1;
            },
          };
        },
        release() {
          released.context += 1;
        },
      };
    },
  };

  const transpile = (path) =>
    ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
  const photoPolicyExports = {};
  vm.runInNewContext(transpile("../src/specwatt/photo-policy.ts"), {
    exports: photoPolicyExports,
    require: () => {
      throw new Error("photo-policy must stay dependency-free");
    },
  });
  const exports = {};
  vm.runInNewContext(transpile("../src/specwatt/photos.ts"), {
    exports,
    require: (name) => {
      if (name === "react-native") return { Platform: { OS: os } };
      if (name === "expo-file-system")
        return { Directory: FakeDirectory, File: FakeFile, Paths };
      if (name === "expo-image-manipulator")
        return { ImageManipulator, SaveFormat: { JPEG: "jpeg" } };
      if (name === "expo-image-picker")
        return {
          launchImageLibraryAsync: async () =>
            typeof pickerOutcome === "function" ? pickerOutcome() : pickerOutcome,
        };
      if (name === "./photo-policy") return photoPolicyExports;
      throw new Error("unexpected photos.ts import: " + name);
    },
  });

  const ownedDir = `${Paths.document.uri}/specwatt-photos`;
  const seedOwned = (name, size) => {
    files.set(`${ownedDir}/${name}`, { size });
    dirs.add(ownedDir);
  };
  const pickerAsset = (overrides = {}) => ({
    uri: `${Paths.cache.uri}/ImagePicker/input.jpg`,
    width: 4000,
    height: 3000,
    fileSize: 2_000_000,
    type: "image",
    mimeType: "image/jpeg",
    ...overrides,
  });
  const reset = () => {
    files.clear();
    dirs.clear();
    permissionTrap = null;
    pickerOutcome = { canceled: true, assets: [] };
    for (const key of Object.keys(faults)) faults[key] = null;
  };
  return {
    exports,
    ownedDir,
    files,
    dirs,
    released,
    faults,
    pickerAsset,
    seedOwned,
    reset,
    setPicker: (outcome) => { pickerOutcome = outcome; },
    setSavedSize: (size) => { savedPhotoSize = size; },
    trap: (uri) => { permissionTrap = uri; },
  };
}

test("importDevicePhoto lands a generated JPEG in the owned directory and cleans the cache", async () => {
  const h = loadPhotos();
  h.reset();
  const input = h.pickerAsset();
  h.files.set(input.uri, { size: 2_000_000 });
  h.setPicker({ canceled: false, assets: [input] });
  const uri = await h.exports.importDevicePhoto();
  assert.match(uri, /^file:\/\/\/data\/user\/0\/app\/files\/specwatt-photos\/photo-[a-z0-9]{6,16}-[a-z0-9]{8,20}\.jpg$/);
  assert.ok(h.files.get(uri), "imported photo must exist in the owned directory");
  assert.equal(h.files.get(uri).size, 800_000, "copied bytes must be the saved render, not the picker source");
  assert.ok(
    ![...h.files.keys()].some((key) => key.includes("ImageManipulator")),
    "manipulator cache must be cleaned up after import",
  );
  assert.equal(h.released.render, 1);
  assert.equal(h.released.context, 1);
  // The busy flag must be released so the next import works.
  h.reset();
  h.files.set(input.uri, { size: 2_000_000 });
  h.setPicker({ canceled: false, assets: [input] });
  const second = await h.exports.importDevicePhoto();
  assert.match(second, /specwatt-photos\/photo-/);
});

test("a canceled picker imports nothing and creates no owned state", async () => {
  const h = loadPhotos();
  h.reset();
  const uri = await h.exports.importDevicePhoto();
  assert.equal(uri, null);
  assert.equal(h.dirs.size, 0);
});

test("oversized sources are rejected by the real policy before any owned write", async () => {
  const h = loadPhotos();
  h.reset();
  const input = h.pickerAsset();
  h.files.set(input.uri, { size: 16 * 1024 * 1024 });
  h.setPicker({ canceled: false, assets: [input] });
  await assert.rejects(
    h.exports.importDevicePhoto(),
    (error) => error.code === "photo-too-large",
  );
  assert.equal(h.dirs.size, 0, "no owned directory may be created on rejection");
  // A manipulator result larger than the cap fails at the write gate as well.
  h.reset();
  h.files.set(input.uri, { size: 2_000_000 });
  h.setSavedSize(16 * 1024 * 1024);
  h.setPicker({ canceled: false, assets: [input] });
  await assert.rejects(
    h.exports.importDevicePhoto(),
    (error) => error.code === "photo-write-failed",
  );
  assert.equal(h.dirs.size, 0);
});

test("concurrent imports are rejected with photo-busy", async () => {
  const h = loadPhotos();
  h.reset();
  let release;
  const input = h.pickerAsset();
  h.files.set(input.uri, { size: 2_000_000 });
  h.setPicker(
    () => new Promise((resolve) => { release = resolve; }),
  );
  const first = h.exports.importDevicePhoto();
  await assert.rejects(
    h.exports.importDevicePhoto(),
    (error) => error.code === "photo-busy",
  );
  release({ canceled: false, assets: [input] });
  const uri = await first;
  assert.match(uri, /specwatt-photos\/photo-/);
});

test("pruneDevicePhotos keeps used photos and deletes only generated names", async () => {
  const h = loadPhotos();
  h.reset();
  h.seedOwned("photo-aaa111-abcd12345678.jpg", 100);
  h.seedOwned("photo-bbb222-zz9y8x7w6v5u.jpg", 100);
  h.seedOwned("notes.txt", 10);
  h.seedOwned("photo-small.jpg", 10);
  const used = `${h.ownedDir}/photo-aaa111-abcd12345678.jpg`;
  const deleted = await h.exports.pruneDevicePhotos([used]);
  assert.equal(deleted, 1, "only the orphan generated photo is deleted");
  assert.ok(h.files.get(used), "the used photo must survive");
  assert.ok(h.files.get(`${h.ownedDir}/notes.txt`), "foreign files are never touched");
  assert.ok(h.files.get(`${h.ownedDir}/photo-small.jpg`), "non-generated names are ignored");
  assert.ok(!h.files.get(`${h.ownedDir}/photo-bbb222-zz9y8x7w6v5u.jpg`));
});

test("clearDevicePhotos removes every generated photo", async () => {
  const h = loadPhotos();
  h.reset();
  h.seedOwned("photo-aaa111-abcd12345678.jpg", 100);
  h.seedOwned("photo-bbb222-zz9y8x7w6v5u.jpg", 100);
  h.seedOwned("keepme.txt", 1);
  const deleted = await h.exports.clearDevicePhotos();
  assert.equal(deleted, 2);
  assert.ok(h.files.get(`${h.ownedDir}/keepme.txt`));
});

test("devicePhotoExists gates on ownership, existence, size and IO failure", () => {
  const h = loadPhotos();
  h.reset();
  const owned = h.pickerAsset();
  h.seedOwned("photo-aaa111-abcd12345678.jpg", 800);
  const ownedUri = `${h.ownedDir}/photo-aaa111-abcd12345678.jpg`;
  assert.equal(h.exports.devicePhotoExists(ownedUri), true);
  h.files.set(ownedUri, { size: 0 });
  assert.equal(h.exports.devicePhotoExists(ownedUri), false, "empty file rejected");
  h.files.set(ownedUri, { size: 16 * 1024 * 1024 });
  assert.equal(h.exports.devicePhotoExists(ownedUri), false, "over-cap file rejected");
  h.files.set(ownedUri, { size: 800 });
  assert.equal(
    h.exports.devicePhotoExists("file:///data/user/0/other/files/specwatt-photos/photo-aaa111-abcd12345678.jpg"),
    false,
    "identical name under a foreign root is not owned",
  );
  assert.equal(h.exports.devicePhotoExists(null), false);
  h.trap(ownedUri);
  assert.equal(h.exports.devicePhotoExists(ownedUri), false, "IO/permission failure falls back safely");
  h.trap(null);
});

test("on web the photo module never touches the filesystem", async () => {
  const h = loadPhotos("web");
  h.reset();
  assert.equal(h.exports.devicePhotoExists("file:///x/photo-aaa111-abcd12345678.jpg"), false);
  h.setPicker({ canceled: false, assets: [h.pickerAsset()] });
  await assert.rejects(
    h.exports.importDevicePhoto(),
    (error) => error.code === "photo-unsupported",
  );
  assert.equal(await h.exports.pruneDevicePhotos([]), 0);
  assert.equal(h.dirs.size, 0);
  assert.ok(
    ![...h.files.keys()].some((key) => key.includes("ImagePicker")),
    "the picker must not even be reached on web",
  );
});

// Lifecycle helper: a picker asset fully prepared up to the injected fault.
function beginImport(h) {
  h.reset();
  const input = h.pickerAsset();
  h.files.set(input.uri, { size: 2_000_000 });
  h.setPicker({ canceled: false, assets: [input] });
  return input;
}

test("a native copy failure is photo-write-failed, cleans the partial file and preserves the source", async () => {
  const h = loadPhotos();
  const input = beginImport(h);
  h.faults.copy = () => new Error("ENOSPC: no space left on device");
  const failure = await h.exports.importDevicePhoto().then(
    () => null,
    (error) => error,
  );
  assert.equal(failure?.code, "photo-write-failed", "copy is a destination write, not a read");
  assert.equal(failure?.message, "photo-write-failed", "native error text must never leak");
  assert.ok(h.files.has(input.uri), "the picker original is never deleted");
  assert.equal(
    [...h.files.keys()].filter((key) => key.startsWith(h.ownedDir)).length,
    0,
    "the partial destination must be cleaned up",
  );
  assert.ok(
    ![...h.files.keys()].some((key) => key.includes("ImageManipulator")),
    "manipulator cache is still cleaned after the failure",
  );
  assert.equal(h.released.render, 1);
  assert.equal(h.released.context, 1);
});

test("owned directory creation failure is photo-write-failed without any destination", async () => {
  const h = loadPhotos();
  const input = beginImport(h);
  h.faults.create = () => new Error("EACCES: mkdir failed");
  const failure = await h.exports.importDevicePhoto().then(
    () => null,
    (error) => error,
  );
  assert.equal(failure?.code, "photo-write-failed");
  assert.equal(failure?.message, "photo-write-failed");
  assert.ok(h.files.has(input.uri), "the picker original survives");
  assert.equal(h.dirs.size, 0, "no owned directory is left half-created");
  assert.equal(h.released.context, 1, "native contexts are released on this path too");
});

test("a decoder render failure stays photo-read-failed and never reaches the destination", async () => {
  const h = loadPhotos();
  const input = beginImport(h);
  h.faults.render = () => new Error("decoder failure");
  const failure = await h.exports.importDevicePhoto().then(
    () => null,
    (error) => error,
  );
  assert.equal(failure?.code, "photo-read-failed", "decode is the read/decode stage");
  assert.equal(failure?.message, "photo-read-failed");
  assert.ok(h.files.has(input.uri), "the picker original survives the decode failure");
  assert.equal(h.dirs.size, 0, "no owned directory is created for an undecodable image");
  assert.equal(h.released.context, 1, "the manipulator context is released");
});

test("a manipulator save failure is photo-write-failed before any owned write", async () => {
  const h = loadPhotos();
  const input = beginImport(h);
  h.faults.save = () => new Error("ENOSPC while encoding");
  const failure = await h.exports.importDevicePhoto().then(
    () => null,
    (error) => error,
  );
  assert.equal(failure?.code, "photo-write-failed", "encoding/writing the output is a write stage");
  assert.ok(h.files.has(input.uri), "the picker original survives");
  assert.equal(h.dirs.size, 0, "the owned directory is not even created");
});

test("a source read failure stays photo-read-failed", async () => {
  const h = loadPhotos();
  const input = beginImport(h);
  h.trap(input.uri);
  const failure = await h.exports.importDevicePhoto().then(
    () => null,
    (error) => error,
  );
  assert.equal(failure?.code, "photo-read-failed", "stat/read of the source is the read stage");
  assert.ok(h.files.has(input.uri), "the picker original is never deleted on read failure");
});

test("cleanup failures never mask the original typed error", async () => {
  const h = loadPhotos();
  const input = beginImport(h);
  h.faults.copy = () => new Error("ENOSPC: no space left on device");
  h.faults.del = () => new Error("EACCES: unlink failed");
  const failure = await h.exports.importDevicePhoto().then(
    () => null,
    (error) => error,
  );
  assert.equal(failure?.code, "photo-write-failed", "the stage-accurate error must win over cleanup noise");
  assert.equal(failure?.message, "photo-write-failed", "no native text leaks through cleanup failures");
  // Cleanup failed, so the partial file honestly remains — but nothing else
  // was touched: the picker original and the foreign cache are intact.
  assert.ok(h.files.has(input.uri));
  assert.equal(
    [...h.files.keys()].filter((key) => key.startsWith(h.ownedDir)).length,
    1,
    "only the failed destination delete is blocked by the cleanup fault",
  );
});

test("a failed import releases the busy flag: the next import succeeds", async () => {
  const h = loadPhotos();
  const input = beginImport(h);
  h.faults.copy = () => new Error("ENOSPC: no space left on device");
  await h.exports.importDevicePhoto().then(
    () => null,
    () => null,
  );
  // Same session, faults cleared: the importer must not be stuck photo-busy.
  h.faults.copy = null;
  h.setPicker({ canceled: false, assets: [input] });
  const uri = await h.exports.importDevicePhoto();
  assert.match(uri, /specwatt-photos\/photo-/);
  assert.ok(h.files.get(uri), "the retry lands a real owned file");
});
