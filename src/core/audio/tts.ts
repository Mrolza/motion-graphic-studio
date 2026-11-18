import { mkdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import path from "path";
import {
  type WordTiming,
  type VoiceId,
  type TimingSource,
  probeMp3DurationSec,
  parseMsEdgeWordBoundaries,
  estimateWordTimingsProportional,
  trimAudioWithWordBoundaries,
  trimAudioSilence,
} from "@core/audio/tts-timing";

export * from "@core/audio/tts-timing";

export interface SceneAudioAsset {
  scene_number: number;
  scene_id: string;
  narration: string;
  voice_id: VoiceId;
  audio_url: string;
  local_file_path: string;
  byte_length: number;
  duration_sec: number;
  words: WordTiming[];
  timing_source: TimingSource;
  engine_used: "msedge-tts" | "google-translate-tts";
}

/**
 * Memecah teks narasi panjang menjadi potongan kalimat <= 180 karakter
 * untuk fallback Google Translate TTS agar tidak terpotong.
 */
function splitNarrationIntoChunks(text: string, maxLen = 180): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return ["Halo"];
  if (cleaned.length <= maxLen) return [cleaned];

  const sentences = cleaned.split(/(?<=[.!?।,])\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + " " + sentence).trim().length <= maxLen) {
      current = (current + " " + sentence).trim();
    } else {
      if (current) chunks.push(current);
      if (sentence.length <= maxLen) {
        current = sentence;
      } else {
        // Pecah per kata jika ada 1 kalimat yang sangat panjang
        const words = sentence.split(" ");
        let wordChunk = "";
        for (const w of words) {
          if ((wordChunk + " " + w).trim().length <= maxLen) {
            wordChunk = (wordChunk + " " + w).trim();
          } else {
            if (wordChunk) chunks.push(wordChunk);
            wordChunk = w;
          }
        }
        current = wordChunk;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Layer 1: Sintesis menggunakan `msedge-tts` (Microsoft Edge Neural TTS Bahasa Indonesia:
 * id-ID-ArdiNeural atau id-ID-GadisNeural).
 */
async function synthesizeWithMsEdgeTts(params: {
  text: string;
  voice: VoiceId;
  outputFilePath: string;
}): Promise<{ byteLength: number; words: WordTiming[] }> {
  const { text, voice, outputFilePath } = params;
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");

  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    voice,
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    { wordBoundaryEnabled: true }
  );

  const result = await Promise.race([
    tts.toFile(path.dirname(outputFilePath), text),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("msedge-tts timeout 15s")), 15000)
    ),
  ]);

  const generatedPath =
    typeof result === "string"
      ? result
      : (result as { audioFilePath?: string })?.audioFilePath;
  const metadataPath =
    typeof result === "object" && result !== null
      ? (result as { metadataFilePath?: string | null })?.metadataFilePath
      : null;

  if (!generatedPath) {
    throw new Error("msedge-tts tidak mengembalikan path file audio.");
  }

  let words: WordTiming[] = [];
  if (metadataPath) {
    try {
      const rawMeta = await readFile(metadataPath, "utf-8");
      words = parseMsEdgeWordBoundaries(JSON.parse(rawMeta));
    } catch {
      words = [];
    } finally {
      await rm(metadataPath, { force: true }).catch(() => {});
    }
  }

  if (path.resolve(generatedPath) !== path.resolve(outputFilePath)) {
    try {
      await rename(generatedPath, outputFilePath);
    } catch {
      const buf = await readFile(generatedPath);
      await writeFile(outputFilePath, buf);
    }
  }

  const fileStat = await stat(outputFilePath);
  if (fileStat.size < 500) {
    throw new Error(
      `File audio msedge-tts terlalu kecil (${fileStat.size} bytes)`
    );
  }
  return { byteLength: fileStat.size, words };
}

/**
 * Layer 2 (Fallback): Sintesis MP3 Bahasa Indonesia menggunakan Google Translate TTS Stream
 * jika WebSocket Microsoft Edge dibatasi oleh jaringan.
 */
async function synthesizeWithGoogleTtsFallback(params: {
  text: string;
  outputFilePath: string;
}): Promise<number> {
  const { text, outputFilePath } = params;
  const chunks = splitNarrationIntoChunks(text, 175);
  const buffers: Buffer[] = [];

  for (const chunk of chunks) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
      chunk
    )}&tl=id&total=${chunks.length}&idx=0&textlen=${
      chunk.length
    }&client=tw-ob&prev=input`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
      },
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`Google TTS fallback HTTP ${res.status}`);
    }

    const arr = await res.arrayBuffer();
    buffers.push(Buffer.from(arr));
  }

  const combined = Buffer.concat(buffers);
  if (combined.byteLength < 500) {
    throw new Error("Buffer audio fallback terlalu kecil.");
  }

  await writeFile(outputFilePath, combined);
  return combined.byteLength;
}

/**
 * Mensintesis narasi Bahasa Indonesia untuk seluruh scene secara berurutan
 * dan menyimpannya ke `public/audio/scene-{timestamp}-{sceneNumber}.mp3`.
 */
export async function synthesizeScenesVoiceOver(params: {
  scenes: Array<{
    scene_number: number;
    narration: string;
  }>;
  voice?: VoiceId;
  batchTimestamp?: number;
}): Promise<{
  voice: VoiceId;
  audioAssets: SceneAudioAsset[];
  durationMs: number;
}> {
  const t0 = Date.now();
  const voice: VoiceId = params.voice || "id-ID-ArdiNeural";
  const batchTimestamp = params.batchTimestamp || Date.now();

  const audioDir = path.join(process.cwd(), "public", "audio");
  await mkdir(audioDir, { recursive: true });

  const audioAssets: SceneAudioAsset[] = [];

  for (const scene of params.scenes) {
    const fileName = `scene-${batchTimestamp}-${scene.scene_number}.mp3`;
    const diskFilePath = path.join(audioDir, fileName);
    const publicAudioUrl = `/audio/${fileName}`;
    const narrationText =
      scene.narration?.trim() || `Adegan ${scene.scene_number}`;

    let byteLength = 0;
    let durationSec = 0;
    let words: WordTiming[] = [];
    let timingSource: TimingSource = "proportional_estimate";
    let engineUsed: "msedge-tts" | "google-translate-tts" = "msedge-tts";

    try {
      const edgeRes = await synthesizeWithMsEdgeTts({
        text: narrationText,
        voice,
        outputFilePath: diskFilePath,
      });
      byteLength = edgeRes.byteLength;
      engineUsed = "msedge-tts";
      if (edgeRes.words.length > 0) {
        const trimmed = await trimAudioWithWordBoundaries(
          diskFilePath,
          edgeRes.words
        );
        byteLength = trimmed.byteLength;
        durationSec = trimmed.durationSec;
        words = trimmed.words;
        timingSource = "word_boundary";
      } else {
        byteLength = await trimAudioSilence(diskFilePath);
        durationSec = (await probeMp3DurationSec(diskFilePath)) || 4;
        words = estimateWordTimingsProportional(narrationText, durationSec);
        timingSource = "proportional_estimate";
      }
      console.log(
        `[VoiceOver] Scene ${scene.scene_number} (${voice}) selesai via msedge-tts (${byteLength} bytes, ${durationSec}s, ${timingSource})`
      );
    } catch (edgeErr) {
      console.warn(
        `[VoiceOver] msedge-tts gagal pada Scene ${scene.scene_number}, menggunakan fallback Google TTS Bahasa Indonesia:`,
        edgeErr instanceof Error ? edgeErr.message : String(edgeErr)
      );
      byteLength = await synthesizeWithGoogleTtsFallback({
        text: narrationText,
        outputFilePath: diskFilePath,
      });
      engineUsed = "google-translate-tts";
      byteLength = await trimAudioSilence(diskFilePath);
      durationSec = (await probeMp3DurationSec(diskFilePath)) || 4;
      words = estimateWordTimingsProportional(narrationText, durationSec);
      timingSource = "proportional_estimate";
      console.log(
        `[VoiceOver] Scene ${scene.scene_number} selesai via Google TTS fallback (${byteLength} bytes, ${durationSec}s)`
      );
    }

    const sceneId = `S${String(scene.scene_number).padStart(2, "0")}`;
    audioAssets.push({
      scene_number: scene.scene_number,
      scene_id: sceneId,
      narration: narrationText,
      voice_id: voice,
      audio_url: publicAudioUrl,
      local_file_path: `public/audio/${fileName}`,
      byte_length: byteLength,
      duration_sec: durationSec,
      words,
      timing_source: timingSource,
      engine_used: engineUsed,
    });
  }

  return {
    voice,
    audioAssets,
    durationMs: Date.now() - t0,
  };
}

