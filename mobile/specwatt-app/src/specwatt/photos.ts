import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { launchImageLibraryAsync } from "expo-image-picker";
import {
  fitPhotoDimensions,
  isGeneratedPhotoName,
  isLocalPhotoInputUri,
  isPhotoUriWithin,
  MAX_PHOTO_BYTES,
  OUTPUT_PHOTO_SIDE,
  PhotoError,
  validatePickedPhoto,
  validatePickedPhotoMetadata,
} from "./photo-policy";

export { PhotoError } from "./photo-policy";
let importing = false;
let nameSequence = 0;
const directory = () => new Directory(Paths.document, "specwatt-photos");

/** Exact current sandbox root, not just a matching directory name in a stored URI. */
export function isOwnedPhotoUri(value: unknown): value is string {
  if (Platform.OS === "web") return false;
  try {
    return isPhotoUriWithin(value, directory().uri);
  } catch {
    return false;
  }
}
export function devicePhotoExists(value: unknown): value is string {
  if (!isOwnedPhotoUri(value)) return false;
  try {
    const file = new File(value);
    return file.exists && file.size > 0 && file.size <= MAX_PHOTO_BYTES;
  } catch {
    return false;
  }
}

/**
 * User-initiated native system picker. No camera, microphone, broad library
 * permission request, upload, external URI or web blob persistence.
 */
export async function importDevicePhoto(): Promise<string | null> {
  if (Platform.OS === "web") throw new PhotoError("photo-unsupported");
  if (importing) throw new PhotoError("photo-busy");
  importing = true;
  let temporaryUri: string | undefined;
  let destination: File | undefined;
  let context: ReturnType<typeof ImageManipulator.manipulate> | undefined;
  let rendered:
    | Awaited<
        ReturnType<
          ReturnType<typeof ImageManipulator.manipulate>["renderAsync"]
        >
      >
    | undefined;
  try {
    const result = await launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      allowsEditing: false,
      quality: 1,
      base64: false,
      exif: false,
      legacy: false,
    });
    if (result.canceled) return null;
    if (result.assets.length !== 1) throw new PhotoError("photo-invalid");
    const asset = result.assets[0];
    // Validate dimensions/type before a decoder ever sees the selected resource.
    validatePickedPhotoMetadata(asset);
    const source = new File(asset.uri);
    if (!source.exists) throw new PhotoError("photo-read-failed");
    const checked = validatePickedPhoto(asset, source.size);
    const fitted = fitPhotoDimensions(checked.width, checked.height);
    context = ImageManipulator.manipulate(checked.uri, {
      maxWidth: OUTPUT_PHOTO_SIDE,
      maxHeight: OUTPUT_PHOTO_SIDE,
    });
    context.resize(
      checked.width >= checked.height
        ? { width: fitted.width }
        : { height: fitted.height },
    );
    rendered = await context.renderAsync();
    if (
      rendered.width < 1 ||
      rendered.height < 1 ||
      rendered.width > OUTPUT_PHOTO_SIDE ||
      rendered.height > OUTPUT_PHOTO_SIDE
    )
      throw new PhotoError("photo-invalid");
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: 0.86,
      base64: false,
    });
    temporaryUri = saved.uri;
    if (!isLocalPhotoInputUri(saved.uri))
      throw new PhotoError("photo-write-failed");
    const prepared = new File(saved.uri);
    if (
      !prepared.exists ||
      prepared.size <= 0 ||
      prepared.size > MAX_PHOTO_BYTES
    )
      throw new PhotoError("photo-write-failed");
    const own = directory();
    own.create({ intermediates: true, idempotent: true });
    for (let attempt = 0; attempt < 5; attempt++) {
      const stamp = Date.now().toString(36);
      const suffix = (
        Math.random().toString(36).slice(2, 12) + (nameSequence++).toString(36)
      ).padEnd(12, "0");
      const candidate = new File(own, `photo-${stamp}-${suffix}.jpg`);
      if (!candidate.exists) {
        destination = candidate;
        break;
      }
    }
    if (!destination || !isOwnedPhotoUri(destination.uri))
      throw new PhotoError("photo-write-failed");
    await prepared.copy(destination);
    if (!devicePhotoExists(destination.uri))
      throw new PhotoError("photo-write-failed");
    const uri = destination.uri;
    destination = undefined;
    return uri;
  } catch (error) {
    if (destination && isOwnedPhotoUri(destination.uri)) {
      try {
        if (destination.exists) destination.delete();
      } catch {
        /* Keep the original error; never delete outside this sandbox. */
      }
    }
    if (error instanceof PhotoError) throw error;
    throw new PhotoError("photo-read-failed");
  } finally {
    // Only the new manipulator cache result is eligible for temporary cleanup.
    if (temporaryUri && isLocalPhotoInputUri(temporaryUri)) {
      try {
        const prefix = Paths.cache.uri.replace(/\/$/, "") + "/";
        if (temporaryUri.startsWith(prefix)) {
          const temp = new File(temporaryUri);
          if (temp.exists) temp.delete();
        }
      } catch {
        /* OS may already have reclaimed cache. */
      }
    }
    try {
      rendered?.release();
    } catch {
      /* Native context may already be released by activity cleanup. */
    }
    try {
      context?.release();
    } catch {
      /* Native context may already be released by activity cleanup. */
    }
    importing = false;
  }
}

/** Deletes only generated JPEG files directly inside this app's photo directory. */
export function pruneDevicePhotos(usedUris: readonly string[]): number {
  if (Platform.OS === "web") return 0;
  if (importing) throw new PhotoError("photo-busy");
  const own = directory();
  if (!own.exists) return 0;
  const keep = new Set(usedUris.filter(isOwnedPhotoUri));
  let deleted = 0;
  for (const item of own.list()) {
    if (
      !(item instanceof File) ||
      !isGeneratedPhotoName(item.name) ||
      !isOwnedPhotoUri(item.uri) ||
      keep.has(item.uri)
    )
      continue;
    item.delete();
    deleted++;
  }
  return deleted;
}
/** Call only after the user has confirmed clearing the local demo's photos. */
export function clearDevicePhotos(): number {
  return pruneDevicePhotos([]);
}
