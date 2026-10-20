# Foto Cabine para Eventos

Aplicação web em kiosk para eventos com:
- tela inicial de abertura
- seleção de molduras/temas
- contagem regressiva
- duas fotos seguidas
- revisão final
- impressão local
- download da imagem
- upload para álbum público temporário

## Como rodar

1. Instale as dependências
   npm install
2. Inicie o ambiente de desenvolvimento
   npm run dev
3. Acesse:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:3001

## Configuração para o seu domínio

Crie um arquivo .env na raiz do projeto:

PUBLIC_BASE_URL=https://festadosprimos.com
VITE_API_URL=https://festadosprimos.com
PORT=3001

No backend, o upload salva imagens na pasta server/uploads e gera uma URL pública.
Se o domínio estiver apontando para a aplicação, o link compartilhável passa a ser da própria página do seu site.

## Fluxo do sistema

1. Usuário clica em "Iniciar sessão de fotos".
2. Escolhe um tema/moldura.
3. Sistema abre a câmera.
4. Contagem regressiva dispara 3, 2, 1.
5. Duas fotos são capturadas.
6. A imagem final é montada como collage com moldura.
7. Usuário pode imprimir, baixar ou publicar online.
8. Link público temporário entra no álbum do evento.

## Estrutura principal

- src/App.jsx: fluxo completo da cabine e interação do kiosk
- src/App.css: visual do app em tela cheia
- server/index.js: backend para upload e geração de URL pública

## Admin

Acesse http://localhost:5173/admin com a senha `ADMIN_PASSWORD` do `.env`. Lá você:

- escolhe se as fotos publicadas ficam só na cabine (offline) ou vão para o site (online);
- testa a conexão com o site;
- envia as molduras (PNG 3:2 com as duas janelas das fotos transparentes).

## Álbum online (festadosprimos.com/cabine)

A pasta `hospedagem/cabine` é o site em PHP que recebe e mostra as fotos.

1. Envie a pasta `hospedagem/cabine` inteira para a hospedagem, de modo que fique em
   `https://festadosprimos.com/cabine/` (inclua os arquivos `.htaccess`, que ficam ocultos no Finder).
2. Dê permissão de escrita (755 ou 775) às pastas `cabine/fotos` e `cabine/envios`.
3. Em `cabine/config.php`, confira `CABINE_BASE_URL` e o `CABINE_TOKEN`.
4. No `.env` da cabine, use o mesmo token:

       CABINE_UPLOAD_URL=https://festadosprimos.com/cabine/upload.php
       CABINE_UPLOAD_TOKEN=<o mesmo valor de CABINE_TOKEN>

5. Reinicie a cabine (`npm run dev`), abra o admin, clique em **Testar conexão** e escolha **Online**.

Como funciona: a cabine envia a foto ao `upload.php` em partes de 64 KB. Cada parte confirmada pelo site
avança a barra de progresso, e uma parte que falhar é reenviada até 3 vezes. O token fica só no servidor
da cabine; o navegador do quiosque nunca vê o token. No modo online a foto também fica salva em
`server/uploads`, como cópia de segurança.

Páginas públicas: `https://festadosprimos.com/cabine/` (todas as fotos) e
`https://festadosprimos.com/cabine/?foto=<arquivo>` (uma foto, com botão para baixar).
