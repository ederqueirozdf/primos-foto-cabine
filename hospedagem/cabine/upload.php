<?php
// Recebe as fotos enviadas pela cabine, em partes, para a cabine mostrar o progresso real.
//
// GET  upload.php                                    -> teste de conexão
// POST upload.php?envio=ID&inicio=BYTE&tamanho=TOTAL -> uma parte da foto (corpo = bytes da parte)
//
// ID: 32 caracteres hexadecimais gerados pela cabine para cada foto.
// Quando a última parte chega, a foto é validada e publicada em fotos/.
// Todas as chamadas exigem o cabeçalho X-Cabine-Token.

declare(strict_types=1);

require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const CABINE_MAX_PARTE = 2 * 1024 * 1024;

function responder(int $status, array $dados): void
{
    http_response_code($status);
    echo json_encode($dados, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

$token = $_SERVER['HTTP_X_CABINE_TOKEN'] ?? '';
if (CABINE_TOKEN === '' || !is_string($token) || !hash_equals(CABINE_TOKEN, $token)) {
    responder(401, ['message' => 'Token inválido. Confira se o token do config.php é igual ao do .env da cabine.']);
}

$pastaFotos = __DIR__ . '/fotos';
$pastaEnvios = __DIR__ . '/envios';

foreach ([$pastaFotos, $pastaEnvios] as $pasta) {
    if (!is_dir($pasta) && !@mkdir($pasta, 0755, true)) {
        responder(500, ['message' => 'Não deu para criar a pasta ' . basename($pasta) . ' no servidor. Confira as permissões da pasta cabine.']);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!is_writable($pastaFotos) || !is_writable($pastaEnvios)) {
        responder(500, ['message' => 'As pastas cabine/fotos e cabine/envios precisam de permissão de escrita no servidor.']);
    }
    responder(200, ['ok' => true, 'message' => 'Site pronto para receber fotos.', 'albumUrl' => CABINE_BASE_URL . '/']);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: GET, POST');
    responder(405, ['message' => 'Use POST para enviar a foto.']);
}

$envio = is_string($_GET['envio'] ?? null) ? $_GET['envio'] : '';
$inicio = filter_var($_GET['inicio'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
$tamanho = filter_var($_GET['tamanho'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => CABINE_MAX_BYTES]]);

if (!preg_match('/^[a-f0-9]{32}$/', $envio) || $inicio === false || $tamanho === false) {
    responder(400, ['message' => 'Parâmetros do envio inválidos, ou a foto passa do limite de ' . (CABINE_MAX_BYTES / 1024 / 1024) . ' MB.']);
}

$tamanhoParte = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($tamanhoParte <= 0 || $tamanhoParte > CABINE_MAX_PARTE || $inicio + $tamanhoParte > $tamanho) {
    responder(400, ['message' => 'Parte da foto com tamanho inválido.']);
}

$parte = file_get_contents('php://input', false, null, 0, CABINE_MAX_PARTE + 1);
if ($parte === false || strlen($parte) !== $tamanhoParte) {
    responder(400, ['message' => 'A parte chegou incompleta.']);
}

// Limpa envios abandonados há mais de 2 horas.
if ($inicio === 0) {
    foreach (glob($pastaEnvios . '/*.parte') ?: [] as $antigo) {
        if (filemtime($antigo) < time() - 7200) {
            @unlink($antigo);
        }
    }
}

$arquivoParcial = $pastaEnvios . '/' . $envio . '.parte';
clearstatcache(true, $arquivoParcial);
$recebido = is_file($arquivoParcial) ? filesize($arquivoParcial) : 0;

if ($recebido === $inicio + $tamanhoParte) {
    // Parte repetida: a cabine reenviou porque não recebeu a confirmação. Já está gravada.
} elseif ($recebido === $inicio || $inicio === 0) {
    $modo = $inicio === 0 ? 'wb' : 'ab';
    $arquivo = fopen($arquivoParcial, $modo);
    if ($arquivo === false || !flock($arquivo, LOCK_EX) || fwrite($arquivo, $parte) !== $tamanhoParte) {
        responder(500, ['message' => 'Não deu para gravar a foto. Confira a permissão de escrita da pasta cabine/envios.']);
    }
    fflush($arquivo);
    flock($arquivo, LOCK_UN);
    fclose($arquivo);
} else {
    responder(409, ['message' => 'Parte fora de ordem.', 'recebido' => $recebido]);
}

clearstatcache(true, $arquivoParcial);
$recebido = filesize($arquivoParcial);

if ($recebido < $tamanho) {
    responder(200, ['ok' => true, 'recebido' => $recebido]);
}

// Última parte: confere se é mesmo uma imagem e publica.
$info = @getimagesize($arquivoParcial);
$extensoes = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png'];
if ($recebido !== $tamanho || $info === false || !isset($extensoes[$info[2]])) {
    @unlink($arquivoParcial);
    responder(415, ['message' => 'O arquivo enviado não é uma imagem JPEG ou PNG.']);
}

$nome = date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.' . $extensoes[$info[2]];
if (!rename($arquivoParcial, $pastaFotos . '/' . $nome)) {
    responder(500, ['message' => 'Não deu para publicar a foto. Confira a permissão de escrita da pasta cabine/fotos.']);
}

responder(201, [
    'ok' => true,
    'fileName' => $nome,
    'imageUrl' => CABINE_BASE_URL . '/fotos/' . $nome,
    'shareUrl' => CABINE_BASE_URL . '/?foto=' . rawurlencode($nome),
]);
