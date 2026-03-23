export const runtime = 'edge'

interface GenerateRequest {
  modelId: string
  prompt: string
  aspectRatio: string
  imageCount: number
  advancedParams: Record<string, unknown>
}

function buildInput(
  modelId: string,
  prompt: string,
  aspectRatio: string,
  imageCount: number,
  advancedParams: Record<string, unknown>
): Record<string, unknown> {
  const base: Record<string, unknown> = { prompt }

  // Seedream 4 - native multi-image
  if (modelId === 'bytedance/seedream-4') {
    return {
      ...base,
      aspect_ratio: aspectRatio,
      max_images: imageCount,
      ...advancedParams,
    }
  }

  // Seedream 5 Lite - native multi-image
  if (modelId === 'bytedance/seedream-5-lite') {
    return {
      ...base,
      aspect_ratio: aspectRatio,
      max_images: imageCount,
      ...advancedParams,
    }
  }

  // GPT Image 1.5 - native multi-image
  if (modelId === 'openai/gpt-image-1.5') {
    return {
      ...base,
      aspect_ratio: aspectRatio,
      number_of_images: imageCount,
      ...advancedParams,
    }
  }

  // Z-Image-Turbo - custom dimensions
  if (modelId === 'prunaai/z-image-turbo') {
    const dims = aspectRatioDimensions(aspectRatio, 1024)
    return {
      ...base,
      width: dims.width,
      height: dims.height,
      guidance_scale: 0,
      ...advancedParams,
    }
  }

  // P-Image - aspect_ratio
  if (modelId === 'prunaai/p-image') {
    // Filter empty lora_weights
    const params = { ...advancedParams }
    if (!params.lora_weights) delete params.lora_weights
    return {
      ...base,
      aspect_ratio: aspectRatio,
      ...params,
    }
  }

  // FLUX models and Nano Banana Pro
  return {
    ...base,
    aspect_ratio: aspectRatio,
    ...advancedParams,
  }
}

function aspectRatioDimensions(ratio: string, base: number): { width: number; height: number } {
  const map: Record<string, { width: number; height: number }> = {
    '1:1': { width: base, height: base },
    '16:9': { width: Math.round(base * 16 / 9 / 16) * 16, height: base },
    '9:16': { width: base, height: Math.round(base * 16 / 9 / 16) * 16 },
    '4:3': { width: Math.round(base * 4 / 3 / 16) * 16, height: base },
    '3:4': { width: base, height: Math.round(base * 4 / 3 / 16) * 16 },
    '3:2': { width: Math.round(base * 3 / 2 / 16) * 16, height: base },
    '2:3': { width: base, height: Math.round(base * 3 / 2 / 16) * 16 },
  }
  return map[ratio] || { width: base, height: base }
}

export async function POST(request: Request) {
  const apiToken = process.env.REPLICATE_API_TOKEN
  if (!apiToken) {
    return Response.json({ error: 'API token not configured' }, { status: 500 })
  }

  let body: GenerateRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { modelId, prompt, aspectRatio, imageCount, advancedParams } = body

  if (!modelId || !prompt?.trim()) {
    return Response.json({ error: 'Model and prompt are required' }, { status: 400 })
  }

  // Models that natively support multiple images
  const nativeMultiModels = [
    'bytedance/seedream-4',
    'bytedance/seedream-5-lite',
    'openai/gpt-image-1.5',
  ]

  const isNativeMulti = nativeMultiModels.includes(modelId)
  const [owner, name] = modelId.split('/')

  try {
    if (isNativeMulti) {
      // Single API call for native multi-image models
      const input = buildInput(modelId, prompt, aspectRatio, imageCount, advancedParams)
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
    } else {
      // Multiple parallel API calls for single-image models
      const count = Math.min(imageCount, 4)
      const promises = Array.from({ length: count }, async (_, i) => {
        const seed = advancedParams.seed
          ? Number(advancedParams.seed) + i
          : undefined
        const params = seed !== undefined ? { ...advancedParams, seed } : advancedParams
        const input = buildInput(modelId, prompt, aspectRatio, 1, params)

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
          throw new Error(`Replicate API error: ${await response.text()}`)
        }

        const prediction = await response.json()
        return { id: prediction.id, index: i }
      })

      const predictions = await Promise.all(promises)
      return Response.json({ predictions })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
