export const runtime = 'edge'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const imageUrl = url.searchParams.get('url')

  if (!imageUrl) {
    return new Response('Missing url parameter', { status: 400 })
  }

  // Only proxy from trusted Replicate domains
  const allowed = ['replicate.delivery', 'pbxt.replicate.delivery']
  try {
    const parsed = new URL(imageUrl)
    const isAllowed = allowed.some(domain => parsed.hostname.endsWith(domain))
    if (!isAllowed) {
      return new Response('Unauthorized domain', { status: 403 })
    }
  } catch {
    return new Response('Invalid URL', { status: 400 })
  }

  const response = await fetch(imageUrl)
  if (!response.ok) {
    return new Response('Failed to fetch image', { status: 502 })
  }

  const contentType = response.headers.get('content-type') || 'image/webp'
  const blob = await response.arrayBuffer()

  return new Response(blob, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': 'attachment; filename="pixel-palette.webp"',
      'Cache-Control': 'no-store',
    },
  })
}
