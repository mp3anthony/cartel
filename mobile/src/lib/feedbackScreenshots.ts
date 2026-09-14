import type { SupabaseClient } from '@supabase/supabase-js';

import { humanise, type Outcome } from './household';

export const FEEDBACK_SCREENSHOTS_BUCKET = 'feedback-screenshots';

/** JPEG/PNG/WebP only, per #70's acceptance criteria — the same three types
 * `expo-image-picker`'s `mediaTypes: ['images']` can actually hand back on a
 * real device library (never HEIC/GIF/etc. from that picker on either
 * platform), so this validates the picker's own output rather than guessing
 * at a broader allow-list nothing here would ever exercise. */
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** 8 MB — generous for a phone screenshot (even a full-res photo library
 * pick rarely exceeds a few MB as JPEG/WebP) while still bounding a single
 * upload well under Supabase Storage's free-tier project cap. No specific
 * number was set by the issue itself; this is the value this session chose,
 * not one confirmed with the user — worth revisiting if a real submission
 * ever gets rejected by it. */
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

export type PickedScreenshot = {
  uri: string;
  mimeType: string;
  /** Not always known ahead of upload — e.g. some web pickers don't report
   * it. When present, validated before ever starting the network upload; when
   * absent, size is only found out from the upload itself. */
  fileSizeBytes?: number;
};

/**
 * Client-side gate before ever touching the network — catches an obviously
 * wrong file type or a too-large one immediately, rather than letting a
 * doomed upload start and fail later with a less specific error.
 */
export function validateScreenshot(image: PickedScreenshot): Outcome<void> {
  if (!ALLOWED_MIME_TYPES.has(image.mimeType)) {
    return { ok: false, message: 'Please attach a JPEG, PNG, or WebP image.' };
  }
  if (image.fileSizeBytes !== undefined && image.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return { ok: false, message: 'That image is too large — please attach one under 8 MB.' };
  }
  return { ok: true, value: undefined };
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

/**
 * Uploads an already-validated picked image to the `feedback-screenshots`
 * bucket under the caller's own `<uid>/...` prefix (the only path the
 * bucket's INSERT policy allows — see the migration's own doc comment) and
 * returns its public URL, ready to hand to `submitFeedback`.
 *
 * `fetch(uri).blob()` is the upload body source on both platforms — the
 * officially-supported way to turn an `expo-image-picker` result into
 * upload-ready bytes without a separate `expo-file-system` dependency, and
 * it's the only path this project has ever verified (web, via Vercel; see
 * this project's own standing "native never run" caveat elsewhere in this
 * app — untested on a native device, expected to work identically).
 */
export async function uploadFeedbackScreenshot(
  client: SupabaseClient,
  userId: string,
  image: PickedScreenshot,
): Promise<Outcome<string>> {
  try {
    const blob = await fetch(image.uri).then((r) => r.blob());
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extensionForMimeType(image.mimeType)}`;

    const { error } = await client.storage
      .from(FEEDBACK_SCREENSHOTS_BUCKET)
      .upload(path, blob, { contentType: image.mimeType });

    if (error) {
      return { ok: false, message: humanise({ message: error.message }) };
    }

    const { data } = client.storage.from(FEEDBACK_SCREENSHOTS_BUCKET).getPublicUrl(path);
    return { ok: true, value: data.publicUrl };
  } catch {
    return { ok: false, message: 'Could not upload that screenshot — check your connection and try again.' };
  }
}
