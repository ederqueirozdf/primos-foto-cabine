export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export const CANVAS_WIDTH = 1800
export const CANVAS_HEIGHT = 1200

// Posição padrão das fotos, usada no gabarito e quando a arte não tem
// duas janelas transparentes que dê para detectar.
export const PHOTO_SLOTS = [
  { x: 175, y: 170, width: 630, height: 720 },
  { x: 965, y: 170, width: 630, height: 720 },
]

export const assetUrl = (url) => (/^(https?:|data:|blob:)/.test(url) ? url : `${API_BASE_URL}${url}`)

export const toCustomFrame = (item) => ({ ...item, kind: 'custom', url: assetUrl(item.url) })

export const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    // Molduras vêm do backend; sem isso o canvas fica "contaminado" e não exporta.
    if (/^https?:/.test(url)) {
      image.crossOrigin = 'anonymous'
    }
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem.'))
    image.src = url
  })

// Desenha a imagem preenchendo a área (como object-fit: cover), sem distorcer.
const drawImageCover = (ctx, image, x, y, width, height) => {
  const scale = Math.max(width / image.width, height / image.height)
  const sourceWidth = width / scale
  const sourceHeight = height / scale
  const sourceX = (image.width - sourceWidth) / 2
  const sourceY = (image.height - sourceHeight) / 2
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height)
}

const SAMPLE_WIDTH = 360
const SAMPLE_HEIGHT = 240
const MIN_WINDOW_AREA = 0.015

// Encontra as janelas transparentes da arte: regiões transparentes contínuas,
// grandes e que não encostam na borda. Devolve as duas maiores, da esquerda
// para a direita, em coordenadas da composição final.
function findTransparentWindows(art) {
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_WIDTH
  canvas.height = SAMPLE_HEIGHT
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(art, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)
  const { data } = ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)

  const total = SAMPLE_WIDTH * SAMPLE_HEIGHT
  const visited = new Uint8Array(total)
  const isClear = (index) => data[index * 4 + 3] < 200
  const windows = []

  for (let start = 0; start < total; start += 1) {
    if (visited[start] || !isClear(start)) {
      continue
    }

    const stack = [start]
    visited[start] = 1
    let area = 0
    let minX = SAMPLE_WIDTH
    let minY = SAMPLE_HEIGHT
    let maxX = 0
    let maxY = 0

    while (stack.length) {
      const index = stack.pop()
      const x = index % SAMPLE_WIDTH
      const y = (index - x) / SAMPLE_WIDTH
      area += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)

      const neighbors = [x > 0 && index - 1, x < SAMPLE_WIDTH - 1 && index + 1, y > 0 && index - SAMPLE_WIDTH, y < SAMPLE_HEIGHT - 1 && index + SAMPLE_WIDTH]
      for (const next of neighbors) {
        if (next !== false && !visited[next] && isClear(next)) {
          visited[next] = 1
          stack.push(next)
        }
      }
    }

    const touchesEdge = minX === 0 || minY === 0 || maxX === SAMPLE_WIDTH - 1 || maxY === SAMPLE_HEIGHT - 1
    if (!touchesEdge && area / total >= MIN_WINDOW_AREA) {
      windows.push({ area, minX, minY, maxX, maxY })
    }
  }

  const scaleX = CANVAS_WIDTH / SAMPLE_WIDTH
  const scaleY = CANVAS_HEIGHT / SAMPLE_HEIGHT

  // Uma amostra de folga em cada lado, para a foto passar por baixo da borda da arte.
  return windows
    .sort((a, b) => b.area - a.area)
    .slice(0, 2)
    .sort((a, b) => a.minX - b.minX || a.minY - b.minY)
    .map((item) => ({
      x: Math.round((item.minX - 1) * scaleX),
      y: Math.round((item.minY - 1) * scaleY),
      width: Math.round((item.maxX - item.minX + 3) * scaleX),
      height: Math.round((item.maxY - item.minY + 3) * scaleY),
    }))
}

const slotsCache = new Map()

// Janelas detectadas na arte (ou as posições padrão, se não achar duas).
export function getPhotoSlots(url) {
  if (!slotsCache.has(url)) {
    const result = loadImage(url).then((art) => {
      const windows = findTransparentWindows(art)
      return { slots: windows.length === 2 ? windows : PHOTO_SLOTS, detected: windows.length }
    })
    result.catch(() => slotsCache.delete(url))
    slotsCache.set(url, result)
  }

  return slotsCache.get(url)
}

async function drawCustomFrame(ctx, photos, frame) {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  const [art, { slots }] = await Promise.all([loadImage(frame.url), getPhotoSlots(frame.url)])

  slots.forEach((slot, index) => {
    drawImageCover(ctx, photos[index], slot.x, slot.y, slot.width, slot.height)
  })

  ctx.drawImage(art, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
}

export async function buildFinalCollage(images, frame) {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const ctx = canvas.getContext('2d')

  const photos = await Promise.all(images.map((image) => loadImage(image)))

  await drawCustomFrame(ctx, photos, frame)

  return canvas.toDataURL('image/jpeg', 0.92)
}

// Gabarito em PNG para quem cria a arte: mostra o tamanho e onde as fotos entram.
export function buildTemplatePng() {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#d9d4c7'
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

  ctx.fillStyle = '#3a3340'
  ctx.font = '600 34px Jost, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('Arte da moldura: 1800 × 1200 px, PNG', CANVAS_WIDTH / 2, 90)
  ctx.font = '28px Jost, sans-serif'
  ctx.fillText('Sugestão de posição. Deixe as janelas das fotos transparentes; a cabine encontra as janelas sozinha.', CANVAS_WIDTH / 2, 1060)

  PHOTO_SLOTS.forEach((slot, index) => {
    ctx.fillStyle = 'rgba(255, 0, 140, 0.45)'
    ctx.fillRect(slot.x, slot.y, slot.width, slot.height)
    ctx.strokeStyle = '#ff008c'
    ctx.lineWidth = 4
    ctx.strokeRect(slot.x, slot.y, slot.width, slot.height)

    ctx.fillStyle = '#fff'
    ctx.font = '600 44px Jost, sans-serif'
    ctx.fillText(`Foto ${index + 1}`, slot.x + slot.width / 2, slot.y + slot.height / 2 - 10)
    ctx.font = '28px Jost, sans-serif'
    ctx.fillText(`x ${slot.x}, y ${slot.y}`, slot.x + slot.width / 2, slot.y + slot.height / 2 + 36)
    ctx.fillText(`${slot.width} × ${slot.height} px`, slot.x + slot.width / 2, slot.y + slot.height / 2 + 74)
  })

  return canvas.toDataURL('image/png')
}
