import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** Photos are shrunk before upload: a phone photo can be 5 MB, the limit is 25 MB per document. */
export const MAX_PHOTOS = 30;
const MAX_SIDE = 2000; // keeps lecture text sharp enough for OCR
const JPEG_QUALITY = 0.7;

export type Photo = { uri: string; width: number; height: number; size: number };

export class PermissionDenied extends Error {}

async function shrink(asset: ImagePicker.ImagePickerAsset): Promise<Photo> {
  const context = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > MAX_SIDE) {
    context.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  return { uri: saved.uri, width: saved.width, height: saved.height, size: new File(saved.uri).size };
}

/** Up to `limit` photos from the gallery, in the order the student picked them (FR-DOC-01). */
export async function pickPhotos(limit: number): Promise<Photo[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PermissionDenied('photos');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    orderedSelection: true,
    quality: 1,
  });
  if (result.canceled) return [];
  return Promise.all(result.assets.slice(0, limit).map(shrink));
}

/** One photo from the camera, or null if the student cancels. */
export async function takePhoto(): Promise<Photo | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new PermissionDenied('camera');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled) return null;
  return shrink(result.assets[0]);
}
