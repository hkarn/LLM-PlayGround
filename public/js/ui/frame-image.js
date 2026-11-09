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
  // A Blob (e.g. a picture made in the page) has no name; the request needs one.
  const fileName = file.name || 'frame';
  const real = await realImageType(file);
  if (real) {
    // Sent as it is; a wrong declared type (e.g. a JPEG saved as .png) is corrected so the data URL says what it is.
    return { file: real === file.type && file.name ? file : new File([file], fileName, { type: real }), note: '' };
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`The frame image "${fileName}" (${file.type || 'unknown type'}) could not be read. Use a PNG or JPEG.`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not convert the frame image to PNG.'))), 'image/png'));
  const name = `${fileName.replace(/\.[^.]*$/, '') || 'frame'}.png`;
  return {
    file: new File([blob], name, { type: 'image/png' }),
    note: `${fileName} (${['image/png', 'image/jpeg'].includes(file.type) ? `named ${file.type}, but not one inside` : file.type || 'unknown type'}) was converted to PNG before sending: video models take JPEG or PNG frames only.`,
  };
}

// Reference pictures for image models, as JPEG. In tests (2026-11-09) AVIF was refused by Seedream,
// Grok Imagine, GPT Image and MAI, and WebP by MAI, while every model took JPEG; JPEG is also small
// (about a tenth of PNG for a portrait). A real JPEG goes as it is; anything else is drawn onto a
// white canvas (portraits rarely have transparency) and saved as JPEG at quality 0.9.
export async function asJpeg(file, { quality = 0.9 } = {}) {
  if (!file) return file;
  const b = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return file.type === 'image/jpeg' && file.name ? file : new File([file], file.name || 'reference.jpg', { type: 'image/jpeg' });
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`The picture "${file.name || 'reference'}" (${file.type || 'unknown type'}) could not be read. Use a PNG, JPEG, WebP or AVIF.`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((x) => (x ? resolve(x) : reject(new Error('Could not convert the picture to JPEG.'))), 'image/jpeg', quality));
  return new File([blob], `${(file.name || 'reference').replace(/\.[^.]*$/, '')}.jpg`, { type: 'image/jpeg' });
}

