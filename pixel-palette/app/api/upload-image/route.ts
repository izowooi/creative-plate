export const runtime = 'edge'

export async function POST(request: Request) {
  const apiToken = process.env.REPLICATE_API_TOKEN
  if (!apiToken) {
    return Response.json({ error: 'API token not configured' }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file || !file.type.startsWith('image/')) {
    return Response.json({ error: 'Image file required' }, { status: 400 })
  }

  if (file.size > 10 * 1024 * 1024) {
    return Response.json({ error: 'File size must be under 10MB' }, { status: 400 })
  }

  try {
    const arrayBuffer = await file.arrayBuffer()
    const response = await fetch('https://api.replicate.com/v1/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': file.type,
        'Content-Disposition': `attachment; filename="${file.name}"`,
      },
      body: arrayBuffer,
    })

    if (!response.ok) {
      const error = await response.text()
      return Response.json({ error: `Upload failed: ${error}` }, { status: response.status })
    }

    const data = await response.json()
    return Response.json({ url: data.urls.get })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
