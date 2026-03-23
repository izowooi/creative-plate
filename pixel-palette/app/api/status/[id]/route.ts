export const runtime = 'edge'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiToken = process.env.REPLICATE_API_TOKEN
  if (!apiToken) {
    return Response.json({ error: 'API token not configured' }, { status: 500 })
  }

  const { id } = await params

  const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    return Response.json({ error: 'Failed to fetch prediction' }, { status: response.status })
  }

  const prediction = await response.json()

  return Response.json({
    id: prediction.id,
    status: prediction.status,
    output: prediction.output,
    error: prediction.error,
    metrics: prediction.metrics,
    urls: prediction.urls,
  })
}
