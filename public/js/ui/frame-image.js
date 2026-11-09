/* LLM PlayGround: UI component: video frame images. OpenRouter's video models take frame images
   as JPEG or PNG only; any other format (WebP, GIF, AVIF …) is accepted at submit and then fails
   the job ("Unsupported image format") after it is paid for. So other formats go as PNG. */

// What the file really is, from its first bytes: a renamed WebP can carry a .png name and type.
async function realImageType(file) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return '';
}

// Returns { file, note }: the file unchanged when its bytes are PNG or JPEG, otherwise a PNG copy
// drawn through a canvas, with a note to show in the result. Throws when the browser can't read it.
export async function framePngOrJpeg(file) {
  if (!file) return { file, note: '' };
  const real = await realImageType(file);
  if (real) {
    // Sent as it is; a wrong declared type (e.g. a JPEG saved as .png) is corrected so the data URL says what it is.
    return { file: real === file.type ? file : new File([file], file.name, { type: real }), note: '' };
  }
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
    note: `${file.name} (${['image/png', 'image/jpeg'].includes(file.type) ? `named ${file.type}, but not one inside` : file.type || 'unknown type'}) was converted to PNG before sending: video models take JPEG or PNG frames only.`,
  };
}
