import { useEffect, useState } from 'react'
import './App.css'
import FramePreview from './FramePreview.jsx'
import { API_BASE_URL, CANVAS_HEIGHT, CANVAS_WIDTH, buildTemplatePng, getPhotoSlots, toCustomFrame } from './collage.js'

const PASSWORD_KEY = 'foto-cabine-admin'

const readSavedPassword = () => {
  try {
    return sessionStorage.getItem(PASSWORD_KEY) || ''
  } catch {
    return ''
  }
}

const savePassword = (value) => {
  try {
    if (value) {
      sessionStorage.setItem(PASSWORD_KEY, value)
    } else {
      sessionStorage.removeItem(PASSWORD_KEY)
    }
  } catch {
    // Sem sessionStorage a senha vale só até recarregar a página.
  }
}

async function request(path, password, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...options.headers, 'x-admin-password': password },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || 'O servidor não respondeu. Confira se o backend está rodando.')
    error.status = response.status
    throw error
  }
  return data
}

function Admin() {
  const [password, setPassword] = useState(readSavedPassword)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [frames, setFrames] = useState([])
  const [name, setName] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [warnings, setWarnings] = useState([])
  const [status, setStatus] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState(null)
  const [connection, setConnection] = useState(null)
  const [isTesting, setIsTesting] = useState(false)

  async function loadFrames() {
    const data = await request('/api/frames', password)
    setFrames(data.items.map(toCustomFrame))
  }

  async function loadSettings() {
    setSettings(await request('/api/settings', password))
  }

  async function login(candidate) {
    setLoginError('')
    try {
      await request('/api/admin/check', candidate)
      savePassword(candidate)
      setIsAuthorized(true)
      await Promise.all([loadFrames(), loadSettings()])
    } catch (error) {
      savePassword('')
      setLoginError(error.message)
    }
  }

  useEffect(() => {
    if (password) {
      void login(password)
    }
    // Só tenta a senha guardada ao abrir a página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!file) {
      setPreview(null)
      setWarnings([])
      return undefined
    }

    const url = URL.createObjectURL(file)
    setPreview({ id: 'preview', kind: 'custom', url })

    let isCurrent = true
    const image = new Image()
    image.onload = async () => {
      const found = []
      const ratio = image.naturalWidth / image.naturalHeight
      if (Math.abs(ratio - CANVAS_WIDTH / CANVAS_HEIGHT) > 0.02) {
        found.push(
          `A arte tem ${image.naturalWidth} × ${image.naturalHeight} px e vai ser esticada para a proporção 3:2. Use 1800 × 1200 px (ou outro tamanho 3:2) para evitar distorção.`,
        )
      }

      const { detected } = await getPhotoSlots(url)
      if (detected !== 2) {
        found.push(
          `Encontrei ${detected} janela${detected === 1 ? '' : 's'} transparente${detected === 1 ? '' : 's'} na arte, e a cabine precisa de 2. As fotos vão para a posição do gabarito.`,
        )
      }

      if (isCurrent) {
        setWarnings(found)
      }
    }
    image.src = url

    return () => {
      isCurrent = false
      URL.revokeObjectURL(url)
    }
  }, [file])

  const handleModeChange = async (publishMode) => {
    try {
      const data = await request('/api/settings', password, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publishMode }),
      })
      setSettings(data)
      setStatus(publishMode === 'online' ? 'Modo online ativado. As fotos vão para o site.' : 'Modo offline ativado. As fotos ficam só na cabine.')
    } catch (error) {
      setStatus(error.message)
    }
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    setConnection(null)
    try {
      const data = await request('/api/admin/test-online', password)
      setConnection({ ok: true, message: data.message, albumUrl: data.albumUrl })
    } catch (error) {
      setConnection({ ok: false, message: error.message })
    } finally {
      setIsTesting(false)
    }
  }

  const handleTemplate = () => {
    const link = document.createElement('a')
    link.href = buildTemplatePng()
    link.download = 'gabarito-moldura-1800x1200.png'
    link.click()
  }

  const handleUpload = async (event) => {
    event.preventDefault()
    if (!file) {
      setStatus('Escolha o arquivo PNG da moldura.')
      return
    }

    const body = new FormData()
    body.append('name', name.trim())
    body.append('frame', file)

    setIsSaving(true)
    try {
      await request('/api/frames', password, { method: 'POST', body })
      await loadFrames()
      setName('')
      setFile(null)
      event.target.reset()
      setStatus('Moldura adicionada. Ela já aparece na cabine.')
    } catch (error) {
      setStatus(error.message)
      if (error.status === 401) {
        setIsAuthorized(false)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (frame) => {
    if (!window.confirm(`Remover a moldura "${frame.name}"?`)) {
      return
    }

    try {
      await request(`/api/frames/${frame.id}`, password, { method: 'DELETE' })
      await loadFrames()
      setStatus('Moldura removida.')
    } catch (error) {
      setStatus(error.message)
    }
  }

  if (!isAuthorized) {
    return (
      <div className="booth">
        <main className="screen admin admin-login">
          <h1 className="admin-title">Painel da cabine</h1>
          <form
            className="admin-form"
            onSubmit={(event) => {
              event.preventDefault()
              void login(password)
            }}
          >
            <label className="field">
              <span>Senha do admin</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required />
            </label>
            {loginError && (
              <p className="form-error" role="alert">
                {loginError}
              </p>
            )}
            <button type="submit" className="button button-gold">
              Entrar
            </button>
          </form>
        </main>
      </div>
    )
  }

  return (
    <div className="booth">
      <header className="booth-bar">
        <p className="wordmark">Festa dos Primos</p>
        <a className="text-button" href="/">
          Abrir a cabine
        </a>
      </header>

      <main className="screen admin">
        <h1 className="admin-title">Painel da cabine</h1>

        {settings && (
          <section className="admin-section">
            <h2>Publicação das fotos</h2>
            <p className="admin-help">Define o que acontece quando o convidado toca em Publicar no álbum.</p>

            <div className="mode-options" role="radiogroup" aria-label="Onde publicar as fotos">
              <label className={`mode-option ${settings.publishMode === 'offline' ? 'is-selected' : ''}`}>
                <input
                  type="radio"
                  name="publishMode"
                  value="offline"
                  checked={settings.publishMode === 'offline'}
                  onChange={() => handleModeChange('offline')}
                />
                <span className="mode-name">Offline</span>
                <span className="mode-detail">A foto fica salva só neste computador, na pasta server/uploads.</span>
              </label>

              <label
                className={`mode-option ${settings.publishMode === 'online' ? 'is-selected' : ''} ${settings.online.configured ? '' : 'is-disabled'}`}
              >
                <input
                  type="radio"
                  name="publishMode"
                  value="online"
                  checked={settings.publishMode === 'online'}
                  disabled={!settings.online.configured}
                  onChange={() => handleModeChange('online')}
                />
                <span className="mode-name">Online</span>
                <span className="mode-detail">
                  {settings.online.configured
                    ? `Envia a foto para ${settings.online.uploadUrl.replace(/\/upload\.php$/, '')} e guarda uma cópia na cabine.`
                    : 'Defina CABINE_UPLOAD_URL e CABINE_UPLOAD_TOKEN no .env e reinicie o servidor para liberar.'}
                </span>
              </label>
            </div>

            {settings.online.configured && (
              <div className="connection">
                <button type="button" className="button" onClick={handleTestConnection} disabled={isTesting}>
                  {isTesting ? 'Testando…' : 'Testar conexão'}
                </button>
                {connection && (
                  <p className={connection.ok ? 'form-success' : 'form-error'} role="status">
                    {connection.message}{' '}
                    {connection.albumUrl && (
                      <a href={connection.albumUrl} target="_blank" rel="noreferrer">
                        Abrir o álbum
                      </a>
                    )}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        <section className="admin-section admin-upload">
          <div>
            <h2>Adicionar moldura</h2>
            <p className="admin-help">
              Envie a arte em PNG na proporção 3:2 (por exemplo {CANVAS_WIDTH} × {CANVAS_HEIGHT} px) com as duas janelas das fotos
              transparentes. A cabine encontra as janelas sozinha e encaixa uma foto em cada, por baixo da arte.
            </p>
            <button type="button" className="button" onClick={handleTemplate}>
              Baixar gabarito
            </button>

            <form className="admin-form" onSubmit={handleUpload}>
              <label className="field">
                <span>Nome que o convidado vê</span>
                <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} required />
              </label>
              <label className="field">
                <span>Arquivo PNG</span>
                <input type="file" accept="image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
              </label>
              {warnings.map((warning) => (
                <p key={warning} className="form-warning">
                  {warning}
                </p>
              ))}
              <button type="submit" className="button button-gold" disabled={isSaving}>
                {isSaving ? 'Adicionando…' : 'Adicionar moldura'}
              </button>
            </form>
          </div>

          <div className="admin-preview">
            {preview ? (
              <FramePreview frame={preview} />
            ) : (
              <p className="admin-empty">A prévia aparece aqui quando você escolher o arquivo. As áreas prateadas são as fotos.</p>
            )}
          </div>
        </section>

        <section className="admin-section">
          <h2>Molduras enviadas</h2>
          {frames.length === 0 ? (
            <p className="admin-empty">Nenhuma moldura enviada ainda. Enquanto a lista estiver vazia, a cabine não tem moldura para o convidado escolher.</p>
          ) : (
            <ul className="admin-list">
              {frames.map((frame) => (
                <li key={frame.id}>
                  <FramePreview frame={frame} />
                  <div className="admin-list-row">
                    <span>{frame.name}</span>
                    <button type="button" className="text-button" onClick={() => handleDelete(frame)}>
                      Remover
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {status && (
        <div className="toast" role="status">
          {status}
        </div>
      )}
    </div>
  )
}

export default Admin
