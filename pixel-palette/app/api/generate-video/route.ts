export const runtime = 'edge'

interface GenerateVideoRequest {
  modelId: string
  prompt: string
  aspectRatio: string
  resolution: string
  duration: number
  advancedParams: Record<string, unknown>
  imageUrl?: string
  lastFrameUrl?: string
}

function buildVideoInput(
  modelId: string,
  prompt: string,
  aspectRatio: string,
  resolution: string,
  duration: number,
  advancedParams: Record<string, unknown>,
  imageUrl?: string,
  lastFrameUrl?: string
): Record<string, unknown> {
  const base: Record<string, unknown> = { prompt }

  if (modelId === 'bytedance/seedance-1-pro' || modelId === 'bytedance/seedance-1-pro-fast') {
    const input: Record<string, unknown> = {
      ...base,
      duration,
      resolution: resolution || '1080p',
      aspect_ratio: aspectRatio,
      ...advancedParams,
    }
    if (imageUrl) input.image = imageUrl
    if (lastFrameUrl && modelId === 'bytedance/seedance-1-pro') input.last_frame_image = lastFrameUrl
    return input
  }

  if (modelId === 'google/veo-3-fast') {
    const input: Record<string, unknown> = {
      ...base,
      aspect_ratio: aspectRatio,
      duration,
      ...advancedParams,
    }
    if (resolution) input.resolution = resolution
    if (imageUrl) input.image = imageUrl
    return input
  }

  if (modelId === 'google/veo-3.1-fast') {
    const input: Record<string, unknown> = {
      ...base,
      aspect_ratio: aspectRatio,
      duration,
      ...advancedParams,
    }
    if (resolution) input.resolution = resolution
    if (imageUrl) input.image = imageUrl
    if (lastFrameUrl) input.last_frame = lastFrameUrl
    return input
  }

  if (modelId === 'kwaivgi/kling-v2.5-turbo-pro') {
    const input: Record<string, unknown> = {
      ...base,
      aspect_ratio: aspectRatio,
      duration,
      ...advancedParams,
    }
    if (imageUrl) input.start_image = imageUrl
    if (lastFrameUrl) input.end_image = lastFrameUrl
    return input
  }

  if (modelId === 'xai/grok-imagine-video') {
    const input: Record<string, unknown> = {
      ...base,
      aspect_ratio: aspectRatio,
      duration,
      ...advancedParams,
    }
    if (resolution) input.resolution = resolution
    if (imageUrl) input.image = imageUrl
    return input
  }

  // Default fallback
  const input: Record<string, unknown> = {
    ...base,
    aspect_ratio: aspectRatio,
    duration,
    ...advancedParams,
  }
  if (resolution) input.resolution = resolution
  if (imageUrl) input.image = imageUrl
  return input
}

export async function POST(request: Request) {
  const apiToken = process.env.REPLICATE_API_TOKEN
  if (!apiToken) {
    return Response.json({ error: 'API token not configured' }, { status: 500 })
  }

  let body: GenerateVideoRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { modelId, prompt, aspectRatio, resolution, duration, advancedParams, imageUrl, lastFrameUrl } = body

  if (!modelId || !prompt?.trim()) {
    return Response.json({ error: 'Model and prompt are required' }, { status: 400 })
  }

  const [owner, name] = modelId.split('/')

  try {
    const input = buildVideoInput(modelId, prompt, aspectRatio, resolution, duration, advancedParams, imageUrl, lastFrameUrl)

    const response = await fetch(
      `https://api.replicate.com/v1/models/${owner}/${name}/predictions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          Prefer: 'respond-async',
        },
        body: JSON.stringify({ input }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return Response.json({ error: `Replicate API error: ${error}` }, { status: response.status })
    }

    const prediction = await response.json()
    return Response.json({ predictions: [{ id: prediction.id, index: 0 }] })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
