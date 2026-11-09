/* LLM PlayGround: UI component: video frame images. OpenRouter's video models take frame images
   as JPEG or PNG only; any other format (WebP, GIF, AVIF …) is accepted at submit and then fails
   the job ("Unsupported image format") after it is paid for. So other formats go as PNG. */

const SENT_AS_IS = ['image/png', 'image/jpeg'];

// Returns { file, note }: the file unchanged when it is PNG or JPEG, otherwise a PNG copy drawn
// through a canvas, with a note to show in the result. Throws when the browser can't read it.
export async function framePngOrJpeg(file) {
  if (!file || SENT_AS_IS.includes(file.type)) return { file, note: '' };
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`The frame image "${file.name}" (${file.type || 'unknown type'}) could not be read. Use a PNG or JPEG.`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not convert the frame image to PNG.'))), 'image/png'));
  const name = `${file.name.replace(/\.[^.]*$/, '') || 'frame'}.png`;
  return {
    file: new File([blob], name, { type: 'image/png' }),
    note: `${file.name} (${file.type || 'unknown type'}) was converted to PNG before sending: video models take JPEG or PNG frames only.`,
  };
}
