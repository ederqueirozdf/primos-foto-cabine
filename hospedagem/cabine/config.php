<?php
// Configuração do álbum online da cabine.
// O token precisa ser IGUAL ao CABINE_UPLOAD_TOKEN do arquivo .env da cabine.

const CABINE_TOKEN = '8bee83b8eedb4fce13e1b68e5c3003b9a3ad72b91db667bd';

// Endereço público desta pasta, sem barra no final.
const CABINE_BASE_URL = 'https://festadosprimos.com/cabine';

const CABINE_EVENT_NAME = 'Festa dos Primos';

date_default_timezone_set('America/Sao_Paulo');
const CABINE_MAX_BYTES = 15 * 1024 * 1024;
const CABINE_FOTOS_POR_PAGINA = 48;

// Nomes gerados pelo upload.php: 20261016-213045-a1b2c3d4.jpg
const CABINE_PADRAO_NOME = '/^\d{8}-\d{6}-[a-f0-9]{8}\.(jpg|png)$/';
