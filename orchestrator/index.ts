import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

type Pipeline = {
  mode: 'sequential' | 'parallel'
  steps: string[]
}

const PORT = 3000
const CACHE_TTL_MS = 30_000

const S3_ENDPOINT = process.env.S3_ENDPOINT || ''
const S3_BUCKET = process.env.S3_BUCKET || ''
const S3_REGION = process.env.S3_REGION || 'us-east-1'
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY || ''
const S3_SECRET_KEY = process.env.S3_SECRET_KEY || ''

const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT || undefined,
  forcePathStyle: true,
  credentials:
    S3_ACCESS_KEY && S3_SECRET_KEY
      ? {
          accessKeyId: S3_ACCESS_KEY,
          secretAccessKey: S3_SECRET_KEY,
        }
      : undefined,
})

const cache = new Map<string, { pipeline: Pipeline; fetchedAt: number }>()

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function streamToString(stream: unknown): Promise<string> {
  return await new Response(stream as BodyInit).text()
}

async function loadPipeline(name: string): Promise<Pipeline> {
  const cached = cache.get(name)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.pipeline
  }

  if (!S3_BUCKET) {
    throw new Error('S3_BUCKET is not configured')
  }

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: name + '.json',
  })

  const result = await s3.send(command)
  if (!result.Body) {
    throw new Error('Pipeline not found: ' + name)
  }

  const raw = await streamToString(result.Body)
  const pipeline = JSON.parse(raw) as Pipeline

  cache.set(name, { pipeline, fetchedAt: Date.now() })
  return pipeline
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }

  return text
}

async function callFunction(
  step: string,
  path: string,
  query: string,
  method: string,
  body: string,
  contentType: string,
): Promise<Response> {
  return await fetch('http://' + step + ':8080' + path + query, {
    method,
    headers: {
      'content-type': contentType,
      accept: 'application/json',
    },
    body: body.length ? body : undefined,
  })
}

async function handleSequential(
  pipeline: Pipeline,
  path: string,
  query: string,
  method: string,
  body: string,
  contentType: string,
): Promise<Response> {
  let currentBody = body
  let currentContentType = contentType
  let lastStatus = 200

  for (const step of pipeline.steps) {
    const response = await callFunction(
      step,
      path,
      query,
      method,
      currentBody,
      currentContentType,
    )

    if (!response.ok) {
      const errorText = await response.text()
      return jsonResponse(
        {
          error: 'Step failed',
          step,
          status: response.status,
          body: errorText,
        },
        response.status,
      )
    }

    currentBody = await response.text()
    currentContentType =
      response.headers.get('content-type') || currentContentType
    lastStatus = response.status
  }

  return new Response(currentBody, {
    status: lastStatus,
    headers: { 'content-type': currentContentType },
  })
}

async function handleParallel(
  pipeline: Pipeline,
  path: string,
  query: string,
  method: string,
  body: string,
  contentType: string,
): Promise<Response> {
  const calls = pipeline.steps.map(async (step) => {
    const response = await callFunction(
      step,
      path,
      query,
      method,
      body,
      contentType,
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        JSON.stringify({
          step,
          status: response.status,
          body: errorText,
        }),
      )
    }

    return { step, result: await parseResponseBody(response) }
  })

  try {
    const results = await Promise.all(calls)
    const merged: Record<string, unknown> = {}
    for (const { step, result } of results) {
      merged[step] = result
    }
    return jsonResponse(merged)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Parallel execution failed'
    return jsonResponse({ error: 'Parallel execution failed', details: message }, 502)
  }
}

Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url)

    if (!url.pathname.startsWith('/orchestrate/')) {
      return jsonResponse({ error: 'Not found' }, 404)
    }

    const match = url.pathname.match(/^/orchestrate/([^/]+)(.*)$/)
    if (!match) {
      return jsonResponse({ error: 'Pipeline name missing' }, 400)
    }

    const pipelineName = match[1]
    const path = match[2] || ''
    const query = url.search || ''
    const method = request.method || 'POST'
    const contentType = request.headers.get('content-type') || 'application/json'
    const body = await request.text()

    try {
      const pipeline = await loadPipeline(pipelineName)

      if (!pipeline.steps || pipeline.steps.length === 0) {
        return jsonResponse({ error: 'Pipeline has no steps' }, 400)
      }

      if (pipeline.mode === 'parallel') {
        return await handleParallel(
          pipeline,
          path,
          query,
          method,
          body,
          contentType,
        )
      }

      return await handleSequential(
        pipeline,
        path,
        query,
        method,
        body,
        contentType,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return jsonResponse({ error: message }, 500)
    }
  },
})

console.log('FaaS orchestrator listening on port ' + PORT)