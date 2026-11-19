/** Web has no photo library; the recap screen offers sharing on the phone instead. */
export async function saveImage(_uri: string): Promise<void> {
  throw new Error('Saving images is only on the phone');
}
