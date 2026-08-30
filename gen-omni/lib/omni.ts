import { GoogleGenAI } from "@google/genai";
import { moderationResultSchema, MODERATION_PROMPT, safePrompt } from "./safety";
import type { OutputQuality } from "./validation";
import { apiResolutionFor } from "./validation";

const OMNI_MODEL = "gemini-omni-1.1-flash";
const SAFETY_MODEL = "gemini-3.5-flash";

export function fileNameFromGoogleUri(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.hostname !== "generativelanguage.googleapis.com") return null;
    const match = url.pathname.match(/\/(files\/[^/:]+)(?::download)?$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function waitForFile(ai: GoogleGenAI, name: string) {
  for (let count = 0; count < 36; count += 1) {
    const file = await ai.files.get({ name });
    const state = String(file.state ?? "ACTIVE");
    if (state === "ACTIVE") return file;
    if (state === "FAILED") throw new Error("Google이 업로드한 미디어를 처리하지 못했습니다.");
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error("미디어 처리 시간이 초과되었습니다.");
}

function extractJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("안전 검사 응답을 해석하지 못했습니다.");
  return JSON.parse(match[0]);
}

export async function editWithOmni(args: {
  apiKey: string;
  video: File;
  imageJpeg: Buffer;
  prompt: string;
  quality: OutputQuality;
}) {
  const ai = new GoogleGenAI({ apiKey: args.apiKey });
  const uploadedNames: string[] = [];

  try {
    const videoUpload = await ai.files.upload({ file: args.video, config: { mimeType: args.video.type, displayName: "source-video" } });
    if (!videoUpload.name) throw new Error("영상 업로드 ID를 받지 못했습니다.");
    uploadedNames.push(videoUpload.name);
    const imageUpload = await ai.files.upload({ file: new Blob([Uint8Array.from(args.imageJpeg)], { type: "image/jpeg" }), config: { mimeType: "image/jpeg", displayName: "character-reference" } });
    if (!imageUpload.name) throw new Error("이미지 업로드 ID를 받지 못했습니다.");
    uploadedNames.push(imageUpload.name);
    const [videoFile, imageFile] = await Promise.all([
      waitForFile(ai, videoUpload.name),
      waitForFile(ai, imageUpload.name),
    ]);
    if (!videoFile.uri || !imageFile.uri) throw new Error("처리된 미디어 URI를 받지 못했습니다.");

    const moderation = await ai.models.generateContent({
      model: SAFETY_MODEL,
      contents: [{
        role: "user",
        parts: [
          { fileData: { fileUri: videoFile.uri, mimeType: args.video.type } },
          { fileData: { fileUri: imageFile.uri, mimeType: "image/jpeg" } },
          { text: MODERATION_PROMPT },
        ],
      }],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["allowed", "reason", "summary"],
          properties: {
            allowed: { type: "boolean" },
            reason: {
              type: "string",
              enum: ["safe", "graphic_violence", "sexual", "minor", "self_harm", "hate", "illegal", "unrelated", "no_subject", "low_quality", "unknown"],
            },
            summary: { type: "string" },
          },
        },
      },
    });
    const verdict = moderationResultSchema.parse(extractJson(moderation.text ?? ""));
    if (!verdict.allowed) {
      const error = new Error(`안전 검사에서 작업이 차단되었습니다: ${verdict.summary}`);
      Object.assign(error, { status: 422, reason: verdict.reason });
      throw error;
    }

    const resolution = apiResolutionFor(args.quality);
    const interaction = await ai.interactions.create({
      model: OMNI_MODEL,
      input: [
        { type: "video", uri: videoFile.uri, mime_type: args.video.type },
        { type: "image", uri: imageFile.uri, mime_type: "image/jpeg" },
        { type: "text", text: safePrompt(args.prompt) },
      ],
      response_format: {
        type: "video",
        resolution,
        delivery: resolution === "360p" ? "inline" : "uri",
      },
      generation_config: { video_config: { task: "edit" } },
      background: false,
      stream: false,
      store: resolution !== "360p",
    });

    const video = interaction.output_video;
    let data = video?.data;
    if (!data && video?.uri) {
      const outputFileName = fileNameFromGoogleUri(video.uri);
      if (!outputFileName) throw new Error("Omni가 신뢰할 수 없는 영상 URI를 반환했습니다.");
      uploadedNames.push(outputFileName);
      await waitForFile(ai, outputFileName);
      const response = await fetch(video.uri, { headers: { "x-goog-api-key": args.apiKey } });
      if (!response.ok) throw Object.assign(new Error("생성 영상을 다운로드하지 못했습니다."), { status: response.status });
      data = Buffer.from(await response.arrayBuffer()).toString("base64");
    }
    if (!data) throw new Error("Omni가 영상 데이터를 반환하지 않았습니다.");
    return {
      data,
      mimeType: video?.mime_type ?? "video/mp4",
      interactionId: interaction.id,
      model: OMNI_MODEL,
      requestedQuality: args.quality,
      generatedQuality: resolution,
    };
  } finally {
    await Promise.allSettled(uploadedNames.map((name) => ai.files.delete({ name })));
  }
}
