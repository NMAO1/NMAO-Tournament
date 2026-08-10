import { supabase } from "./supabase";

export type PickedVideo = { uri: string; mimeType?: string | null; fileName?: string | null };

const extFor = (v: PickedVideo): string => {
  const fromName = v.fileName?.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,4}$/.test(fromName)) return fromName;
  if (v.mimeType?.includes("quicktime")) return "mov";
  if (v.mimeType?.includes("webm")) return "webm";
  return "mp4";
};
const ctypeFor = (ext: string): string =>
  ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : "video/mp4";

// Reads the picked file and uploads it to the private entry-videos bucket under
// the competitor's own folder (RLS-scoped via the session). Returns the storage
// PATH, which submit-entry stores and get-playback-url later signs.
// (supabase-js upload — reliable in Expo Go; streaming uploader errors there.)
export async function uploadEntryVideo(
  competitorId: string,
  event: string,
  slot: 1 | 2,
  v: PickedVideo,
): Promise<string> {
  const ext = extFor(v);
  const path = `${competitorId}/${event}_a${slot}_${Date.now()}.${ext}`;
  const buf = await (await fetch(v.uri)).arrayBuffer();
  const { error } = await supabase.storage.from("entry-videos").upload(path, buf, {
    contentType: ctypeFor(ext),
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

// In-house entry video → same private bucket, under the competitor's own folder
// so competitor-scoped storage RLS applies. Returns the storage PATH, which
// submit-inhouse-video records and get-inhouse-video-url later signs.
export async function uploadInhouseVideo(
  competitorId: string,
  entrantId: string,
  v: PickedVideo,
): Promise<string> {
  const ext = extFor(v);
  const path = `${competitorId}/ih-${entrantId}_${Date.now()}.${ext}`;
  const buf = await (await fetch(v.uri)).arrayBuffer();
  const { error } = await supabase.storage.from("entry-videos").upload(path, buf, {
    contentType: ctypeFor(ext),
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}
