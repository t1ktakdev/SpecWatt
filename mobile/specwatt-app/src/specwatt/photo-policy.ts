/** Pure validation. Persisted URIs are never accepted as proof of file ownership. */
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 50_000_000;
export const MAX_PHOTO_SIDE = 16_000;
export const OUTPUT_PHOTO_SIDE = 1024;
export type PhotoErrorCode =
  | "photo-unsupported"
  | "photo-invalid"
  | "photo-too-large"
  | "photo-read-failed"
  | "photo-write-failed"
  | "photo-busy";
export class PhotoError extends Error {
  readonly code: PhotoErrorCode;
  constructor(code: PhotoErrorCode) {
    super(code);
    this.name = "PhotoError";
    this.code = code;
  }
}
const namePattern = /^photo-[a-z0-9]{6,16}-[a-z0-9]{8,20}\.jpg$/;
export function isGeneratedPhotoName(value: unknown): value is string {
  return typeof value === "string" && namePattern.test(value);
}
export function isLocalPhotoInputUri(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 1024 ||
    !value.startsWith("file:///") ||
    /[\\%?#\u0000-\u0020\u007f]/.test(value)
  )
    return false;
  return value
    .slice(8)
    .split("/")
    .every(
      (segment) => segment.length > 0 && segment !== "." && segment !== "..",
    );
}
/** Structural persistence check. Native rendering must additionally check exact root and existence. */
export function isPhotoUri(value: unknown): value is string {
  if (!isLocalPhotoInputUri(value)) return false;
  const parts = value.split("/");
  return (
    parts.at(-2) === "specwatt-photos" && isGeneratedPhotoName(parts.at(-1))
  );
}
export function isPhotoUriWithin(
  value: unknown,
  ownedDirectoryUri: unknown,
): value is string {
  if (!isPhotoUri(value) || typeof ownedDirectoryUri !== "string") return false;
  const base = ownedDirectoryUri.endsWith("/")
    ? ownedDirectoryUri.slice(0, -1)
    : ownedDirectoryUri;
  if (
    !isLocalPhotoInputUri(base) ||
    base.split("/").at(-1) !== "specwatt-photos"
  )
    return false;
  const prefix = base + "/";
  return (
    value.startsWith(prefix) && isGeneratedPhotoName(value.slice(prefix.length))
  );
}
export type PickedPhoto = {
  uri: unknown;
  width: unknown;
  height: unknown;
  fileSize?: unknown;
  mimeType?: unknown;
  type?: unknown;
};
export function validatePickedPhotoMetadata(asset: PickedPhoto): {
  uri: string;
  width: number;
  height: number;
} {
  if (
    !isLocalPhotoInputUri(asset.uri) ||
    typeof asset.width !== "number" ||
    !Number.isInteger(asset.width) ||
    asset.width <= 0 ||
    typeof asset.height !== "number" ||
    !Number.isInteger(asset.height) ||
    asset.height <= 0 ||
    (asset.type !== undefined && asset.type !== null && asset.type !== "image")
  )
    throw new PhotoError("photo-invalid");
  if (
    asset.mimeType !== undefined &&
    asset.mimeType !== null &&
    (typeof asset.mimeType !== "string" ||
      ![
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/heic",
        "image/heif",
        "image/bmp",
        "image/gif",
      ].includes(asset.mimeType.toLowerCase()))
  )
    throw new PhotoError("photo-invalid");
  if (
    asset.width > MAX_PHOTO_SIDE ||
    asset.height > MAX_PHOTO_SIDE ||
    asset.width * asset.height > MAX_PHOTO_PIXELS
  )
    throw new PhotoError("photo-too-large");
  return { uri: asset.uri, width: asset.width, height: asset.height };
}
export function validatePickedPhoto(
  asset: PickedPhoto,
  actualFileSize?: number,
): { uri: string; width: number; height: number; fileSize: number } {
  const metadata = validatePickedPhotoMetadata(asset);
  for (const size of [asset.fileSize, actualFileSize])
    if (
      size !== undefined &&
      (!Number.isSafeInteger(size) || Number(size) <= 0)
    )
      throw new PhotoError("photo-invalid");
  if (
    [asset.fileSize, actualFileSize].some(
      (size) => typeof size === "number" && size > MAX_PHOTO_BYTES,
    )
  )
    throw new PhotoError("photo-too-large");
  const size = actualFileSize ?? asset.fileSize;
  if (typeof size !== "number") throw new PhotoError("photo-invalid");
  return { ...metadata, fileSize: size };
}
export function fitPhotoDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  if (
    !Number.isInteger(width) ||
    width <= 0 ||
    width > MAX_PHOTO_SIDE ||
    !Number.isInteger(height) ||
    height <= 0 ||
    height > MAX_PHOTO_SIDE ||
    width * height > MAX_PHOTO_PIXELS
  )
    throw new PhotoError("photo-invalid");
  const scale = Math.min(1, OUTPUT_PHOTO_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
