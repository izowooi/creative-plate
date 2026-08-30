import { z } from "zod";

export const moderationResultSchema = z.object({
  allowed: z.boolean(),
  reason: z.enum([
    "safe",
    "graphic_violence",
    "sexual",
    "minor",
    "self_harm",
    "hate",
    "illegal",
    "unrelated",
    "no_subject",
    "low_quality",
    "unknown",
  ]),
  summary: z.string().max(240),
});

export type ModerationResult = z.infer<typeof moderationResultSchema>;

export const MODERATION_PROMPT = `You are a strict media safety gate for a character-replacement video editor.
Inspect BOTH the uploaded source video and reference image. Return JSON only.
Block if either input contains graphic/gory violence, explicit sexual content or nudity, sexualized minors, self-harm, hateful abuse, or instructions for wrongdoing.
Also block if the reference image has no clearly identifiable person, face, creature, illustrated character, toy, mascot, or coherent character subject; is an unrelated screenshot/document/QR code; or is too corrupted/blurred to guide a character edit.
The source video and reference character may differ—that is the intended use and is not "unrelated".
Use reason "safe" only when editing may begin.`;

export function safePrompt(userPrompt: string): string {
  const intent = userPrompt.trim()
    ? `Additional direction: ${userPrompt.trim()}`
    : "No additional direction.";

  return `Replace the primary on-screen character in the uploaded video with the character shown in <IMAGE_REF_0>. Preserve the reference character's recognizable face, identity, costume, proportions, and visual style across every frame. Preserve the original performance, body motion, camera movement, timing, composition, lighting, background, and audio. Keep everything else the same. ${intent} Make the result coherent and non-deceptive entertainment: no graphic violence, gore, explicit sexual content, nudity, hate, self-harm, or illegal activity. Do not add dialogue or change voices.`;
}
