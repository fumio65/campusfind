import { createClient } from 'jsr:@supabase/supabase-js@2'

// Looks up a report's public preview data (title/description/photo) and
// serves it as JSON, plus a resized/robots-clean image proxy. This does NOT
// render HTML itself - Supabase Edge Functions on the shared *.supabase.co
// domain force every text/html response to text/plain (a deliberate platform
// restriction; only paid plans with a custom domain can serve real HTML), so
// no amount of code here can make a browser render a page from this URL.
// The actual HTML (with Open Graph tags for Facebook/Messenger's crawler) is
// rendered by a Netlify Edge Function in the nwssu-app-library repo
// (library/netlify/edge-functions/report-preview.ts), which fetches this
// JSON and has no such restriction. This function's only job is the part
// that needs the service-role key (bypassing RLS - report data is normally
// gated to authenticated users, but a public preview page needs a database
// role/policy that can read it), which must never leave the server.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

const supabaseAdmin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// Supabase Storage serves every public object with `X-Robots-Tag: none`,
// which tells crawlers not to embed/index it - Facebook's og:image fetcher
// respects that and silently drops the photo (title/description still came
// through fine, since those aren't subject to that header). Routing the
// image through this function instead of linking Storage directly means we
// control the response headers and that tag never reaches the crawler.
//
// Also resizes via Storage's image transform endpoint rather than fetching
// the raw object - report photos are full camera-resolution JPEGs (2-3MB,
// ~20s to fetch), which blows well past whatever timeout Messenger's own
// preview generator uses (its request to this proxy failed outright, not
// just slowly). 1200px/q75 comfortably covers a link-preview card at a
// fraction of the size and fetch time. (image/* responses aren't subject to
// the text/html restriction above, so this part can stay here.)
async function serveImage(reportId: string | undefined): Promise<Response> {
  if (!reportId) return new Response('Missing report id', { status: 400, headers: corsHeaders })

  const { data: photos } = await supabaseAdmin
    .from('report_photos')
    .select('storage_path')
    .eq('report_id', reportId)
    .order('position', { ascending: true })
    .limit(1)

  const storagePath = photos?.[0]?.storage_path
  if (!storagePath) return new Response('No photo', { status: 404, headers: corsHeaders })

  const upstream = await fetch(
    `${SUPABASE_URL}/storage/v1/render/image/public/report-photos/${storagePath}?width=1200&quality=75`
  )
  if (!upstream.ok || !upstream.body) {
    return new Response('Image fetch failed', { status: 502, headers: corsHeaders })
  }

  return new Response(upstream.body, {
    headers: {
      ...corsHeaders,
      'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}

async function servePreviewData(reportId: string | undefined): Promise<Response> {
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }

  if (!reportId) {
    return new Response(JSON.stringify({ error: 'Missing report id' }), { status: 400, headers: jsonHeaders })
  }

  const { data: report } = await supabaseAdmin
    .from('reports')
    .select('id, type, title, description, location')
    .eq('id', reportId)
    .maybeSingle()

  if (!report) {
    return new Response(JSON.stringify({ notFound: true }), { status: 404, headers: jsonHeaders })
  }

  const { data: photos } = await supabaseAdmin
    .from('report_photos')
    .select('storage_path')
    .eq('report_id', reportId)
    .order('position', { ascending: true })
    .limit(1)

  // The filename segment lets the caller build a cache-busting query string
  // for the image proxy URL - Netlify's edge caches that URL per exact query
  // string, so a bare /image/:id would keep serving whatever got cached
  // under it forever. Since storage_path changes whenever the photo is
  // replaced, this also naturally busts the cache if a report's photo is
  // ever swapped, with no manual purge needed either way.
  const photoFilename = photos?.[0]?.storage_path?.split('/').pop() ?? null

  const label = report.type === 'found_walkin' ? 'Found at ISSC' : 'Lost'
  const title = `${label}: ${report.title}`
  const description = report.location
    ? `${report.description} — Last seen near ${report.location}. Help reunite it on CampusFind.`
    : `${report.description} Help reunite it on CampusFind.`

  return new Response(
    JSON.stringify({ notFound: false, title, description, photoFilename }),
    { headers: jsonHeaders }
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const baseIndex = pathParts.indexOf('og-preview')

  if (pathParts[baseIndex + 1] === 'image') {
    return serveImage(pathParts[baseIndex + 2])
  }

  try {
    return await servePreviewData(pathParts[baseIndex + 1])
  } catch (err) {
    console.error('og-preview error:', err)
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
