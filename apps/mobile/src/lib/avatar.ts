import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { enqueue, flush, usePendingAvatar } from '@/lib/outbox';
import { PermissionDenied } from '@/lib/photos';
import type { Me } from '@/lib/profile';

/*
 * The profile photo (FR-PROF-04): picked without the system editor, cropped on our own screen
 * (02c), then made into a 512×512 WebP on the phone. The API checks it again and strips metadata.
 */

export type Picked = { uri: string; width: number; height: number };
/** The square to keep, in the picked image's pixels. */
export type Crop = { originX: number; originY: number; width: number; height: number };

const SIDE = 512;
const QUALITY = 0.8;

/** One photo from the front camera or the gallery, or null if the student cancels. */
export async function pickAvatar(source: 'camera' | 'gallery'): Promise<Picked | null> {
  const camera = source === 'camera';
  const permission = camera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new PermissionDenied(camera ? 'camera' : 'photos');
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1 };
  const result = camera
    ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front })
    : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const { uri, width, height } = result.assets[0];
  return { uri, width, height };
}

/** The picked photo turned a quarter to the left (the rotate button on 02c). */
export async function rotateLeft(photo: Picked): Promise<Picked> {
  const rendered = await ImageManipulator.manipulate(photo.uri).rotate(-90).renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/** Crops, shrinks and converts to the upload format. Native copies go to documents so a photo
 * queued offline survives the cache being cleared. */
export async function makeAvatar(photo: Picked, crop: Crop): Promise<string> {
  const rendered = await ImageManipulator.manipulate(photo.uri)
    .crop(crop)
    .resize({ width: SIDE, height: SIDE })
    .renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.WEBP, compress: QUALITY });
  if (Platform.OS === 'web') return saved.uri;
  const dir = new Directory(Paths.document, 'avatar');
  if (!dir.exists) dir.create();
  const kept = new File(dir, `${Date.now()}.webp`);
  new File(saved.uri).move(kept);
  return kept.uri;
}

/** Sets (or with null, removes) the photo: shown at once, sent now or when back online. */
export async function saveAvatar(uri: string | null) {
  await enqueue({ kind: 'avatar', uri });
  void flush();
}

/** The student's own photo: a change waiting to be sent wins over the saved one. */
export function useMyAvatar(me: Me | undefined) {
  const pending = usePendingAvatar();
  return pending ? pending.uri : (me?.avatar_url ?? null);
}
