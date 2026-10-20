<?php
// Álbum público da cabine: lista todas as fotos ou mostra uma foto (?foto=nome.jpg).

declare(strict_types=1);

require __DIR__ . '/config.php';

function e(string $texto): string
{
    return htmlspecialchars($texto, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$pastaFotos = __DIR__ . '/fotos';
$fotos = [];
if (is_dir($pastaFotos)) {
    foreach (scandir($pastaFotos, SCANDIR_SORT_DESCENDING) ?: [] as $arquivo) {
        if (preg_match(CABINE_PADRAO_NOME, $arquivo)) {
            $fotos[] = $arquivo;
        }
    }
}

$fotoPedida = isset($_GET['foto']) && is_string($_GET['foto']) ? basename($_GET['foto']) : '';
$foto = ($fotoPedida !== '' && in_array($fotoPedida, $fotos, true)) ? $fotoPedida : '';

$totalPaginas = max(1, (int) ceil(count($fotos) / CABINE_FOTOS_POR_PAGINA));
$pagina = min($totalPaginas, max(1, (int) ($_GET['pagina'] ?? 1)));
$fotosDaPagina = array_slice($fotos, ($pagina - 1) * CABINE_FOTOS_POR_PAGINA, CABINE_FOTOS_POR_PAGINA);

$titulo = $foto !== '' ? 'Sua foto na ' . CABINE_EVENT_NAME : 'Álbum da ' . CABINE_EVENT_NAME;
$imagemCompartilhada = $foto !== '' ? CABINE_BASE_URL . '/fotos/' . rawurlencode($foto) : '';

if ($fotoPedida !== '' && $foto === '') {
    http_response_code(404);
}
?>
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= e($titulo) ?></title>
  <meta property="og:title" content="<?= e($titulo) ?>">
  <meta property="og:type" content="website">
  <?php if ($imagemCompartilhada !== ''): ?>
  <meta property="og:image" content="<?= e($imagemCompartilhada) ?>">
  <meta property="og:url" content="<?= e(CABINE_BASE_URL . '/?foto=' . rawurlencode($foto)) ?>">
  <meta name="twitter:card" content="summary_large_image">
  <?php endif; ?>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&family=Limelight&display=swap" rel="stylesheet">
  <style>
    :root {
      --noite: #160e24;
      --noite-funda: #0d0817;
      --tapete: #b3122e;
      --ouro: #e9b949;
      --ouro-escuro: #7a5a17;
      --lampada: #fff3d1;
      --lampada-suave: rgba(255, 243, 209, 0.7);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: Jost, 'Futura', 'Avenir Next', sans-serif;
      line-height: 1.5;
      color: var(--lampada);
      background:
        radial-gradient(ellipse 70% 40% at 50% -5%, rgba(255, 243, 209, 0.14), transparent 70%),
        linear-gradient(180deg, var(--noite) 0%, var(--noite-funda) 100%) fixed;
    }

    a { color: inherit; }

    a:focus-visible { outline: 3px solid var(--ouro); outline-offset: 3px; }

    .pagina {
      max-width: 1180px;
      margin: 0 auto;
      padding: 28px 16px 56px;
    }

    .letreiro {
      margin: 0 auto 32px;
      max-width: 720px;
      padding: 16px;
      text-align: center;
      background:
        radial-gradient(circle, var(--lampada) 0 4px, rgba(255, 243, 209, 0.25) 5px, transparent 8px) 0 0 / 24px 24px,
        linear-gradient(180deg, #8f6a1c, var(--ouro-escuro));
    }

    .letreiro h1 {
      margin: 0;
      padding: 18px 12px;
      font-family: Limelight, serif;
      font-weight: 400;
      font-size: clamp(2.2rem, 7vw, 4.2rem);
      line-height: 1.05;
      background: linear-gradient(180deg, #c3163a, var(--tapete) 60%, #8c0e25);
      text-shadow: 0 0 10px rgba(255, 243, 209, 0.5), 0 3px 0 #6e0a1c;
    }

    .resumo {
      margin: 0 0 24px;
      text-align: center;
      color: var(--lampada-suave);
      font-size: 1.1rem;
    }

    .grade {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
      gap: 18px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .grade a {
      display: block;
      padding: 6px;
      border: 2px solid var(--ouro-escuro);
      background: var(--noite-funda);
    }

    .grade a:hover { border-color: var(--ouro); }

    .grade img {
      display: block;
      width: 100%;
      aspect-ratio: 3 / 2;
      object-fit: cover;
    }

    .foto {
      margin: 0 auto;
      max-width: 1000px;
      padding: 8px;
      border: 2px solid var(--ouro);
      background: var(--noite-funda);
      box-shadow: 0 0 80px rgba(255, 243, 209, 0.12);
    }

    .foto img { display: block; width: 100%; height: auto; }

    .acoes {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      margin-top: 24px;
    }

    .botao {
      display: inline-flex;
      align-items: center;
      min-height: 52px;
      padding: 0 1.5rem;
      border: 2px solid var(--ouro);
      border-radius: 4px;
      font-size: 1.1rem;
      font-weight: 600;
      text-decoration: none;
    }

    .botao-ouro { background: var(--ouro); color: var(--noite-funda); }

    .paginacao {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-top: 32px;
    }

    .vazio {
      max-width: 44ch;
      margin: 40px auto;
      text-align: center;
      color: var(--lampada-suave);
      font-size: 1.15rem;
    }
  </style>
</head>
<body>
  <main class="pagina">
    <div class="letreiro"><h1><?= e(CABINE_EVENT_NAME) ?></h1></div>

    <?php if ($foto !== ''): ?>
      <figure class="foto">
        <img src="fotos/<?= e(rawurlencode($foto)) ?>" alt="Foto da cabine na <?= e(CABINE_EVENT_NAME) ?>">
      </figure>
      <div class="acoes">
        <a class="botao botao-ouro" href="fotos/<?= e(rawurlencode($foto)) ?>" download>Baixar foto</a>
        <a class="botao" href="./">Ver todas as fotos</a>
      </div>

    <?php elseif ($fotoPedida !== ''): ?>
      <p class="vazio">Essa foto não está no álbum. Ela pode ter sido removida, ou o link foi copiado pela metade.</p>
      <div class="acoes"><a class="botao" href="./">Ver todas as fotos</a></div>

    <?php elseif (!$fotos): ?>
      <p class="vazio">Nenhuma foto ainda. As fotos da cabine aparecem aqui assim que forem publicadas.</p>

    <?php else: ?>
      <p class="resumo"><?= count($fotos) === 1 ? '1 foto' : count($fotos) . ' fotos' ?> da cabine</p>
      <ul class="grade">
        <?php foreach ($fotosDaPagina as $arquivo): ?>
          <li>
            <a href="?foto=<?= e(rawurlencode($arquivo)) ?>">
              <img src="fotos/<?= e(rawurlencode($arquivo)) ?>" alt="Foto da cabine" loading="lazy">
            </a>
          </li>
        <?php endforeach; ?>
      </ul>

      <?php if ($totalPaginas > 1): ?>
        <nav class="paginacao" aria-label="Páginas do álbum">
          <?php if ($pagina > 1): ?>
            <a class="botao" href="?pagina=<?= $pagina - 1 ?>">Fotos mais novas</a>
          <?php endif; ?>
          <?php if ($pagina < $totalPaginas): ?>
            <a class="botao" href="?pagina=<?= $pagina + 1 ?>">Fotos mais antigas</a>
          <?php endif; ?>
        </nav>
      <?php endif; ?>
    <?php endif; ?>
  </main>
</body>
</html>
