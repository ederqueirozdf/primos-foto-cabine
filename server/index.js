import cors from 'cors'
import { randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import express from 'express'
import fs from 'fs'
import http from 'http'
import https from 'https'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsDir = path.join(__dirname, 'uploads')
const framesDir = path.join(__dirname, 'frames')
const framesIndexPath = path.join(framesDir, 'frames.json')
const port = Number(process.env.PORT || 3001)
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`
const adminPassword = process.env.ADMIN_PASSWORD || ''
const settingsPath = path.join(__dirname, 'settings.json')
const onlineUploadUrl = process.env.CABINE_UPLOAD_URL || ''
const onlineUploadToken = process.env.CABINE_UPLOAD_TOKEN || ''
const isOnlineConfigured = Boolean(onlineUploadUrl && onlineUploadToken)

for (const dir of [uploadsDir, framesDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const frameUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
})

function readFrames() {
  try {
    return JSON.parse(fs.readFileSync(framesIndexPath, 'utf8'))
  } catch {
    return []
  }
}

function writeFrames(frames) {
  fs.writeFileSync(framesIndexPath, JSON.stringify(frames, null, 2))
}

function readSettings() {
  try {
    return { publishMode: 'offline', ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) }
  } catch {
    return { publishMode: 'offline' }
  }
}

function publicSettings() {
  return {
    publishMode: readSettings().publishMode,
    online: { configured: isOnlineConfigured, uploadUrl: onlineUploadUrl },
  }
}

// Fala com o upload.php do site.
function requestSite({ method, query = {}, body, timeout = 30_000 }) {
  return new Promise((resolve, reject) => {
    const url = new URL(onlineUploadUrl)
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)))
    const client = url.protocol === 'https:' ? https : http
    const headers = { 'X-Cabine-Token': onlineUploadToken, Accept: 'application/json' }
    if (body) {
      headers['Content-Type'] = 'application/octet-stream'
      headers['Content-Length'] = body.length
    }

    const request = client.request(url, { method, headers, timeout }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let data
        try {
          data = JSON.parse(text)
        } catch {
          const error = new Error(`o site respondeu ${response.statusCode} sem JSON; confira o endereço do upload.php`)
          error.permanent = true
          return reject(error)
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(data.message || `o site respondeu ${response.statusCode}`)
          // Erros 4xx não melhoram com nova tentativa.
          error.permanent = response.statusCode < 500
          return reject(error)
        }
        return resolve(data)
      })
    })

    request.on('timeout', () => request.destroy(new Error('o site demorou demais para responder')))
    request.on('error', (error) => reject(error))
    request.end(body)
  })
}

const PART_SIZE = 64 * 1024
const PART_ATTEMPTS = 3

// Envia a foto em partes. Cada parte só conta no progresso depois que o site confirma.
async function sendPhotoToSite(photo, onProgress) {
  const uploadId = randomBytes(16).toString('hex')
  let result = null

  for (let start = 0; start < photo.length; start += PART_SIZE) {
    const part = photo.subarray(start, start + PART_SIZE)

    for (let attempt = 1; ; attempt += 1) {
      try {
        result = await requestSite({
          method: 'POST',
          query: { envio: uploadId, inicio: start, tamanho: photo.length },
          body: part,
        })
        break
      } catch (error) {
        if (error.permanent || attempt === PART_ATTEMPTS) {
          throw error
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
      }
    }

    onProgress((start + part.length) / photo.length)
  }

  return result
}

function toPublicFrame(frame) {
  return { id: frame.id, name: frame.name, width: frame.width, height: frame.height, url: `/frames/${frame.file}` }
}

function requireAdmin(req, res, next) {
  if (!adminPassword) {
    return res.status(503).json({ message: 'Defina ADMIN_PASSWORD no arquivo .env e reinicie o servidor.' })
  }

  const given = Buffer.from(String(req.get('x-admin-password') || ''))
  const expected = Buffer.from(adminPassword)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return res.status(401).json({ message: 'Senha incorreta.' })
  }

  return next()
}

app.use(cors())
app.use(express.json({ limit: '20mb' }))
app.use('/uploads', express.static(uploadsDir))
app.use('/frames', express.static(framesDir, { index: false, extensions: false }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'Foto cabine backend online.' })
})

app.get('/api/album', (_req, res) => {
  const files = fs
    .readdirSync(uploadsDir)
    .filter((item) => !item.startsWith('.'))
    .map((item) => ({
      name: item,
      url: `${publicBaseUrl}/uploads/${item}`,
    }))

  res.json({ items: files })
})

app.get('/api/frames', (_req, res) => {
  res.json({ items: readFrames().map(toPublicFrame) })
})

app.get('/api/admin/check', requireAdmin, (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/settings', (_req, res) => {
  res.json(publicSettings())
})

app.put('/api/settings', requireAdmin, (req, res) => {
  const { publishMode } = req.body || {}

  if (!['offline', 'online'].includes(publishMode)) {
    return res.status(400).json({ message: 'Escolha online ou offline.' })
  }

  if (publishMode === 'online' && !isOnlineConfigured) {
    return res.status(400).json({ message: 'Defina CABINE_UPLOAD_URL e CABINE_UPLOAD_TOKEN no .env antes de ativar o modo online.' })
  }

  fs.writeFileSync(settingsPath, JSON.stringify({ ...readSettings(), publishMode }, null, 2))
  return res.json(publicSettings())
})

app.get('/api/admin/test-online', requireAdmin, async (_req, res) => {
  if (!isOnlineConfigured) {
    return res.status(400).json({ message: 'Defina CABINE_UPLOAD_URL e CABINE_UPLOAD_TOKEN no .env e reinicie o servidor.' })
  }

  try {
    const data = await requestSite({ method: 'GET' })
    return res.json({ ok: true, message: data.message || 'Site pronto para receber fotos.', albumUrl: data.albumUrl })
  } catch (error) {
    return res.status(502).json({ message: `Sem conexão com o site: ${error.message}.` })
  }
})

app.post('/api/frames', requireAdmin, frameUpload.single('frame'), (req, res) => {
  const file = req.file
  const name = String(req.body?.name || '').trim().slice(0, 60)

  if (!file) {
    return res.status(400).json({ message: 'Escolha um arquivo PNG.' })
  }

  if (!name) {
    return res.status(400).json({ message: 'Dê um nome para a moldura.' })
  }

  if (file.buffer.length < 24 || !file.buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return res.status(400).json({ message: 'A moldura precisa ser um PNG (com transparência nas áreas das fotos).' })
  }

  const width = file.buffer.readUInt32BE(16)
  const height = file.buffer.readUInt32BE(20)
  const id = randomUUID()
  const frame = { id, name, file: `${id}.png`, width, height, createdAt: new Date().toISOString() }

  fs.writeFileSync(path.join(framesDir, frame.file), file.buffer)
  writeFrames([...readFrames(), frame])

  return res.status(201).json({ item: toPublicFrame(frame) })
})

app.delete('/api/frames/:id', requireAdmin, (req, res) => {
  const frames = readFrames()
  const frame = frames.find((item) => item.id === req.params.id)

  if (!frame) {
    return res.status(404).json({ message: 'Moldura não encontrada.' })
  }

  fs.rmSync(path.join(framesDir, frame.file), { force: true })
  writeFrames(frames.filter((item) => item.id !== frame.id))

  return res.json({ ok: true })
})

// Responde em NDJSON (uma linha JSON por evento) para a cabine mostrar o progresso:
// {"type":"progress","percent":40} ... {"type":"done","shareUrl":"...","mode":"online"}
app.post('/api/upload', async (req, res) => {
  const { image, eventName } = req.body || {}

  if (!image || typeof image !== 'string' || !image.startsWith('data:image')) {
    return res.status(400).json({ message: 'Imagem inválida para upload.' })
  }

  const match = image.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/)
  if (!match) {
    return res.status(400).json({ message: 'Formato da imagem não suportado.' })
  }

  const [, format, base64Data] = match
  const extension = format === 'png' ? 'png' : 'jpg'
  const safeName = (eventName || 'evento').toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'evento'
  const fileName = `${Date.now()}-${safeName}.${extension}`
  const binary = Buffer.from(base64Data, 'base64')

  // Sempre guarda uma cópia na cabine, inclusive no modo online.
  try {
    fs.writeFileSync(path.join(uploadsDir, fileName), binary)
  } catch {
    return res.status(500).json({ message: 'Erro ao salvar a imagem na cabine.' })
  }

  const localUrl = `${publicBaseUrl}/uploads/${fileName}`
  const send = (event) => res.write(`${JSON.stringify(event)}\n`)

  res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' })
  res.flushHeaders()

  if (readSettings().publishMode !== 'online') {
    send({ type: 'progress', percent: 100 })
    send({ type: 'done', mode: 'offline', fileName, shareUrl: localUrl })
    return res.end()
  }

  if (!isOnlineConfigured) {
    send({ type: 'error', message: 'O modo online está ativo, mas falta configurar o site no .env. A foto ficou salva na cabine.' })
    return res.end()
  }

  try {
    send({ type: 'progress', percent: 0 })
    const result = await sendPhotoToSite(binary, (fraction) => send({ type: 'progress', percent: Math.round(fraction * 100) }))
    send({ type: 'done', mode: 'online', fileName, shareUrl: result.shareUrl || result.imageUrl })
  } catch (error) {
    send({ type: 'error', message: `Não deu para enviar ao site (${error.message}). A foto ficou salva na cabine.` })
  }

  return res.end()
})

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'O arquivo passa de 15 MB.' : 'Não deu para receber o arquivo.'
    return res.status(400).json({ message })
  }

  return next(error)
})

app.listen(port, '0.0.0.0', () => {
  console.log(`Backend executando em http://localhost:${port}`)
})
