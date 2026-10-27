import { test } from "node:test";
import assert from "node:assert/strict";
import * as photos from "../src/specwatt/photo-policy.ts";

const base = "file:///data/user/0/kg.specwatt.mobile/files/specwatt-photos/";
const name = "photo-m31j9n00-abcd1234efgh.jpg";
test("stored photo policy admits only generated local JPEG paths", () => {
  assert.equal(photos.isPhotoUri(base + name), true);
  for (const value of [
    null,
    42,
    "https://host/image.jpg",
    "content://media/1",
    "data:image/jpeg;base64,x",
    "javascript:alert(1)",
    "blob:x",
    base + "../" + name,
    base + "%2e%2e/" + name,
    base + name + "?x=1",
    base + name + "#x",
    base + "nested/" + name,
    "file://other/data/specwatt-photos/" + name,
    base + "arbitrary.svg",
    base + "a.jpg",
    "file:///other//specwatt-photos/" + name,
    "file:///other\\specwatt-photos/" + name,
  ])
    assert.equal(photos.isPhotoUri(value), false, String(value));
});
test("ownership policy checks the exact current application document root", () => {
  const uri = base + name;
  assert.equal(photos.isPhotoUriWithin(uri, base), true);
  assert.equal(
    photos.isPhotoUriWithin(
      uri,
      "file:///data/user/0/other/files/specwatt-photos/",
    ),
    false,
  );
  assert.equal(
    photos.isPhotoUriWithin(
      uri,
      "file:///data/user/0/kg.specwatt.mobile/files/",
    ),
    false,
  );
  assert.equal(photos.isPhotoUriWithin(uri, base + "../"), false);
});
const asset = {
  uri: "file:///data/user/0/app/cache/ImagePicker/input.jpg",
  width: 4000,
  height: 3000,
  fileSize: 2000000,
  type: "image",
  mimeType: "image/jpeg",
};
test("photo input validates local raster and uses actual file size as authoritative bound", () => {
  const value = photos.validatePickedPhoto(asset, 2000000);
  assert.equal(value.width, 4000);
  assert.equal(value.height, 3000);
  assert.throws(
    () =>
      photos.validatePickedPhoto({ ...asset, fileSize: 1 }, 16 * 1024 * 1024),
    (e) => e.code === "photo-too-large",
  );
  assert.throws(
    () =>
      photos.validatePickedPhoto({ ...asset, fileSize: 16 * 1024 * 1024 }, 1),
    (e) => e.code === "photo-too-large",
  );
  assert.throws(
    () =>
      photos.validatePickedPhoto({ ...asset, fileSize: undefined }, undefined),
    (e) => e.code === "photo-invalid",
  );
  assert.throws(
    () => photos.validatePickedPhoto({ ...asset, fileSize: undefined }, 0),
    (e) => e.code === "photo-invalid",
  );
});
test("unsupported content and unbounded pixels fail before image decode", () => {
  for (const changed of [
    { uri: "https://host/x.jpg" },
    { uri: "content://media/1" },
    { mimeType: "image/svg+xml" },
    { mimeType: "text/html" },
    { type: "video" },
    { width: 0 },
    { height: Infinity },
    { width: 16001 },
    { width: 10000, height: 10000 },
    { uri: "file:///app/cache/%2e%2e/x.jpg" },
  ])
    assert.throws(() =>
      photos.validatePickedPhoto({ ...asset, ...changed }, 2000000),
    );
});
test("resize dimensions preserve aspect ratio, never upscale and cap longest side", () => {
  assert.deepEqual(photos.fitPhotoDimensions(4000, 3000), {
    width: 1024,
    height: 768,
  });
  assert.deepEqual(photos.fitPhotoDimensions(3000, 4000), {
    width: 768,
    height: 1024,
  });
  assert.deepEqual(photos.fitPhotoDimensions(320, 200), {
    width: 320,
    height: 200,
  });
  assert.throws(() => photos.fitPhotoDimensions(0, 100));
});
test("oversized or malformed URI input is rejected without decoding executable text", () => {
  assert.equal(
    photos.isPhotoUri(
      "file:///" + "a".repeat(3000) + "/specwatt-photos/" + name,
    ),
    false,
  );
  assert.equal(
    photos.isPhotoUri("file:///data/\u0000/specwatt-photos/" + name),
    false,
  );
  assert.equal(
    photos.isPhotoUri("file:///data/./specwatt-photos/" + name),
    false,
  );
  assert.equal(
    photos.isPhotoUri("file:///data/%252e%252e/specwatt-photos/" + name),
    false,
  );
});

test("unknown metadata is rejected without calling user-defined coercion", () => {
  let called = false;
  assert.throws(() =>
    photos.validatePickedPhoto(
      {
        ...asset,
        mimeType: {
          toString() {
            called = true;
            return "image/jpeg";
          },
        },
      },
      2000000,
    ),
  );
  assert.equal(called, false);
});
