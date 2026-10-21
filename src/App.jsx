import QRCode from 'qrcode'
import { useEffect, useRef, useState } from 'react'
import './App.css'
import { API_BASE_URL, buildFinalCollage, toCustomFrame } from './collage.js'
import FramePreview from './FramePreview.jsx'

const FIRST_SHOT_SECONDS = 10
const SECOND_SHOT_SECONDS = 10

function App() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [step, setStep] = useState('intro')
  const [selectedFrame, setSelectedFrame] = useState(null)
  const [frames, setFrames] = useState(null)
  const [countdown, setCountdown] = useState(FIRST_SHOT_SECONDS)
  const [finalImage, setFinalImage] = useState('')
  const [shareUrl, setShareUrl] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [isQrOpen, setIsQrOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [cameraError, setCameraError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadMode, setUploadMode] = useState(null)
  const [isSaved, setIsSaved] = useState(false)
  // Muda a cada nova sessão; resultados de um envio antigo não aparecem na tela do grupo seguinte.
  const sessionRef = useRef(0)
  const [shot, setShot] = useState(1)
  const firstImageRef = useRef('')
  const [flashCount, setFlashCount] = useState(0)
  const isCameraActive = step === 'camera' || step === 'countdown'
  const isPublishingOnline = isUploading && uploadMode === 'online'

  useEffect(() => {
    if (step !== 'theme') {
      return undefined
    }

    const controller = new AbortController()
    fetch(`${API_BASE_URL}/api/frames`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((data) => setFrames(data.items.map(toCustomFrame)))
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setFrames([])
        }
      })

    return () => controller.abort()
  }, [step])

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  async function openCamera() {
    setCameraError('')

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Este navegador não liberou a câmera. Abra a cabine em localhost ou num endereço https.')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch(() => {})
      }
    } catch {
      setCameraError('Sem acesso à câmera. Permita o uso da câmera no navegador e toque em Recomeçar.')
    }
  }

  useEffect(() => {
    if (!isCameraActive) {
      return undefined
    }

    void openCamera()

    return () => {
      stopCamera()
    }
  }, [isCameraActive])

  function captureFrame() {
    const video = videoRef.current
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) {
      return null
    }

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.92)
  }

  async function handleCountdownEnd() {
    const image = captureFrame()
    if (!image) {
      setStatus('A câmera ainda não estava pronta. Toque em Tirar fotos de novo.')
      setStep('camera')
      return
    }

    setFlashCount((value) => value + 1)

    if (shot === 1) {
      firstImageRef.current = image
      setShot(2)
      setCountdown(SECOND_SHOT_SECONDS)
      return
    }

    try {
      const composedImage = await buildFinalCollage([firstImageRef.current, image], selectedFrame)
      setFinalImage(composedImage)
      setStep('review')
    } catch {
      setStatus('A moldura não carregou. Escolha outra moldura ou confira o servidor.')
      setStep('camera')
    } finally {
      firstImageRef.current = ''
    }
  }

  useEffect(() => {
    if (step !== 'countdown') {
      return undefined
    }

    if (cameraError) {
      setStep('camera')
      return undefined
    }

    if (countdown <= 0) {
      void handleCountdownEnd()
      return undefined
    }

    const timer = window.setTimeout(() => {
      setCountdown((value) => value - 1)
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [countdown, step, cameraError])

  const startCountdown = () => {
    setCountdown(FIRST_SHOT_SECONDS)
    setShot(1)
    setFlashCount(0)
    setStatus('')
    setStep('countdown')
  }

  const resetSession = () => {
    sessionRef.current += 1
    setIsSaved(false)
    setIsUploading(false)
    setUploadMode(null)
    setStep('intro')
    setFinalImage('')
    setShareUrl('')
    setQrCode('')
    setIsQrOpen(false)
    setStatus('')
    setCameraError('')
  }

  const handleUpload = async () => {
    if (!finalImage) {
      return
    }

    const session = sessionRef.current
    const isCurrent = () => sessionRef.current === session

    setIsUploading(true)
    setUploadProgress(0)
    setUploadMode(null)
    setStatus('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: finalImage,
          eventName: 'festa-dos-primos',
        }),
      })

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || 'A cabine não conseguiu receber a foto.')
      }

      // A resposta só começa depois que a cópia local foi gravada.
      if (isCurrent()) {
        setIsSaved(true)
      }

      // O servidor manda uma linha JSON por evento: progresso, conclusão ou erro.
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffered = ''
      let result = null

      while (!result) {
        const { value, done } = await reader.read()
        buffered += decoder.decode(value, { stream: !done })
        const lines = buffered.split('\n')
        buffered = lines.pop()

        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line)
          if (!isCurrent()) {
            continue
          }
          if (event.type === 'start') {
            setUploadMode(event.mode)
          } else if (event.type === 'progress') {
            setUploadProgress(event.percent)
          } else if (event.type === 'error') {
            throw new Error(event.message)
          } else if (event.type === 'done') {
            result = event
          }
        }

        if (done && !result) {
          throw new Error('A conexão caiu antes de terminar. A foto ficou salva na cabine.')
        }
      }

      if (!isCurrent()) {
        return
      }

      setUploadProgress(100)
      setShareUrl(result.shareUrl)

      // Online: assim que o envio termina, o QR com o link da foto no site abre para o convidado.
      // Offline: a foto fica só na cabine, sem QR.
      if (result.mode === 'online') {
        const code = await QRCode.toDataURL(result.shareUrl, { width: 720, margin: 2, errorCorrectionLevel: 'M' })
        setQrCode(code)
        setIsQrOpen(true)
      } else {
        setStatus('Salva no álbum da cabine.')
      }
    } catch (error) {
      if (isCurrent()) {
        setStatus(error instanceof Error ? error.message : 'Não deu para publicar a foto agora.')
      }
    } finally {
      if (isCurrent()) {
        setIsUploading(false)
      }
    }
  }

  const saveLocally = async (image) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/save-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, eventName: 'festa-dos-primos' }),
      })
      if (!response.ok) {
        throw new Error()
      }
    } catch {
      setStatus('A foto anterior não foi salva na cabine. Confira se o servidor da cabine está rodando.')
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = finalImage
    link.download = 'foto-evento.jpg'
    link.click()
  }

  // Mesma moldura, nova sessão: volta para a câmera e já inicia a contagem.
  // "Próxima foto" (outro grupo) guarda a foto atual na cabine se ela ainda não foi salva;
  // "Refazer" (mesmo grupo) descarta.
  const startNextShot = ({ keepCurrent }) => {
    if (keepCurrent && finalImage && !isSaved && !isUploading) {
      void saveLocally(finalImage)
    }

    sessionRef.current += 1
    setIsSaved(false)
    setIsUploading(false)
    setUploadMode(null)
    setFinalImage('')
    setShareUrl('')
    setQrCode('')
    setIsQrOpen(false)
    setUploadProgress(0)
    startCountdown()
  }

  const handleCopy = async () => {
    if (!shareUrl) {
      return
    }

    try {
      await navigator.clipboard.writeText(shareUrl)
      setStatus('Link copiado.')
    } catch {
      setStatus('Não deu para copiar. Selecione o link e copie manualmente.')
    }
  }

  return (
    <div className="booth">
      {step !== 'intro' && (
        <header className="booth-bar">
          <p className="wordmark">Festa dos Primos</p>
          <button type="button" className="text-button" onClick={resetSession}>
            Recomeçar
          </button>
        </header>
      )}

      {step === 'intro' && (
        <main className="screen intro">
          <div className="marquee">
            <div className="marquee-sign">
              <h1>Festa dos Primos</h1>
            </div>
            <div className="marquee-board">
              <p>Em cartaz hoje:</p>
              <p>10 anos de histórias</p>
            </div>
          </div>

          <button type="button" className="ticket" onClick={() => setStep('theme')}>
            Entrar na cabine
          </button>
          <p className="intro-note">Duas fotos, uma moldura e a impressão na hora.</p>
        </main>
      )}

      {step === 'theme' && (
        <main className="screen lobby">
          <h2>Escolha a moldura</h2>

          {frames === null && <p className="lobby-empty">Carregando molduras…</p>}
          {frames?.length === 0 && (
            <p className="lobby-empty">
              Nenhuma moldura disponível ainda. O organizador da festa adiciona as molduras na página de admin.
            </p>
          )}

          <div className="lobby-wall">
            {frames?.map((frame) => (
              <button
                key={frame.id}
                type="button"
                className={`lobby-card ${selectedFrame?.id === frame.id ? 'is-selected' : ''}`}
                onClick={() => {
                  setSelectedFrame(frame)
                  startCountdown()
                }}
              >
                <FramePreview frame={frame} />
                <span className="lobby-card-name">{frame.name}</span>
              </button>
            ))}
          </div>
        </main>
      )}

      {isCameraActive && (
        <main className="screen camera">
          <div className="camera-stage">
            <video ref={videoRef} autoPlay muted playsInline className="camera-video" />

            {step === 'countdown' && (
              <div className="countdown" aria-live="assertive">
                {countdown > 0 && (
                  <span key={`${shot}-${countdown}`} className="leader">
                    <span className="leader-sweep" />
                    <span className="leader-number">{countdown}</span>
                  </span>
                )}
                <span className="countdown-shot">
                  {countdown <= 0 && shot === 2
                    ? 'Montando sua foto…'
                    : shot === 2
                      ? 'Foto 2 de 2: mude de pose'
                      : 'Foto 1 de 2'}
                </span>
              </div>
            )}

            {flashCount > 0 && <div key={flashCount} className="flash" aria-hidden="true" />}
          </div>

          <div className="camera-controls">
            <p className="camera-frame">
              Moldura <strong>{selectedFrame?.name}</strong>
            </p>

            {cameraError ? (
              <p className="camera-error" role="alert">
                {cameraError}
              </p>
            ) : (
              <button type="button" className="shutter" onClick={startCountdown} disabled={step === 'countdown'}>
                <span className="shutter-label">{step === 'countdown' ? 'Olhe para a câmera' : 'Tirar fotos'}</span>
              </button>
            )}
          </div>
        </main>
      )}

      {step === 'review' && (
        <main className="screen review">
          <div className="premiere">
            {finalImage ? <img src={finalImage} alt="Composição final com as duas fotos e a moldura" className="premiere-image" /> : null}
          </div>

          <div className="review-actions">
            <button type="button" className="button button-gold" onClick={handlePrint}>
              Imprimir
            </button>
            <button type="button" className="button" onClick={handleDownload}>
              Baixar
            </button>
            <button type="button" className="button" onClick={handleUpload} disabled={isUploading}>
              {isUploading ? 'Publicando…' : 'Publicar no álbum'}
            </button>
            <button
              type="button"
              className="button button-next"
              onClick={() => startNextShot({ keepCurrent: true })}
              disabled={isPublishingOnline}
            >
              Próxima foto
            </button>
            <button type="button" className="text-button" onClick={() => startNextShot({ keepCurrent: false })} disabled={isPublishingOnline}>
              Refazer
            </button>
          </div>
          <p className="review-note">A impressão sai com duas cópias numa folha A4.</p>

          {isUploading && (
            <div className="upload">
              <div
                className="upload-track"
                role="progressbar"
                aria-label="Envio da foto"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={uploadProgress}
              >
                <span className="upload-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="upload-percent">{uploadProgress}%</span>
            </div>
          )}

          {shareUrl && (
            <div className="share">
              <a href={shareUrl} target="_blank" rel="noreferrer">
                {shareUrl}
              </a>
              <button type="button" className="text-button" onClick={handleCopy}>
                Copiar link
              </button>
              {qrCode && (
                <button type="button" className="text-button" onClick={() => setIsQrOpen(true)}>
                  Mostrar QR code
                </button>
              )}
            </div>
          )}

          {isQrOpen && qrCode && (
            <div
              className="qr-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="qr-title"
              onKeyDown={(event) => event.key === 'Escape' && setIsQrOpen(false)}
            >
              <div className="qr-ticket">
                <h2 id="qr-title">Sua foto está no ar</h2>
                <p>Aponte a câmera do celular para o código e baixe a sua foto.</p>
                <img src={qrCode} alt={`QR code com o link da foto: ${shareUrl}`} className="qr-image" />
                <p className="qr-url">{shareUrl.replace(/^https?:\/\//, '')}</p>
                <div className="qr-actions">
                  <button type="button" className="button" onClick={() => setIsQrOpen(false)}>
                    Fechar
                  </button>
                  <button type="button" className="button button-gold" onClick={() => startNextShot({ keepCurrent: true })} autoFocus>
                    Próxima foto
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {step === 'review' && finalImage && (
        <div className="print-sheet" aria-hidden="true">
          <img src={finalImage} alt="" />
          <img src={finalImage} alt="" />
        </div>
      )}

      {status && (
        <div className="toast" role="status">
          {status}
        </div>
      )}
    </div>
  )
}

export default App
