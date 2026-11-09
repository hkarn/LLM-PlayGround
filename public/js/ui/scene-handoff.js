/* LLM PlayGround: UI component: the scene handoff. Draw the DreamGen Scene leaves its last picture
   here, with the image prompt and the session text it was made from, for Animate the DreamGen Scene.
   Kept in memory only (this page, until a reload): pictures are megabytes, and nothing is saved. */

let last = null;

// { file, prompt, exportText, title }
export function setScenePicture(scene) {
  last = { ...scene, at: Date.now() };
  document.dispatchEvent(new Event('scene-picture'));
}

export const scenePicture = () => last;

// A generated image as a File: base64 from the answer, or fetched from its URL. Returns null when
// a URL can't be read from the page (no CORS); the picture can then be saved and uploaded instead.
export async function imageToFile(img, name = 'scene') {
  if (img?.b64) {
    const bin = atob(img.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const type = img.mime || 'image/png';
    return new File([bytes], `${name}.${(type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type });
  }
  if (img?.url) {
    try {
      const res = await fetch(img.url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const type = blob.type || 'image/png';
      return new File([blob], `${name}.${(type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type });
    } catch {
      return null;
    }
  }
  return null;
}
