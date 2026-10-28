import { Asset, requestPermissionsAsync } from 'expo-media-library';

/** Saves a local image file to the phone's photos (asks for add-only access first). */
export async function saveImage(uri: string) {
  const permission = await requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) throw new Error('Photos permission denied');
  await Asset.create(uri);
}
