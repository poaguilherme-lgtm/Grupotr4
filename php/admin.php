<?php
require __DIR__ . '/config.php';
session_start();

$error = '';

if (isset($_POST['password'])) {
    if (password_verify($_POST['password'], ADMIN_PASSWORD_HASH)) {
        $_SESSION['tr4_admin_ok'] = true;
    } else {
        $error = 'Senha incorreta.';
    }
}

if (isset($_GET['logout'])) {
    unset($_SESSION['tr4_admin_ok']);
}

$loggedIn = !empty($_SESSION['tr4_admin_ok']);

if ($loggedIn && isset($_GET['download'])) {
    if (file_exists(LEADS_CSV_PATH)) {
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="leads-bpm.csv"');
        readfile(LEADS_CSV_PATH);
        exit;
    }
}

function readLeads(): array {
    if (!file_exists(LEADS_CSV_PATH)) {
        return [];
    }
    $rows = array_map('str_getcsv', file(LEADS_CSV_PATH));
    if (count($rows) < 1) {
        return [];
    }
    array_shift($rows); // remove cabeçalho
    return array_reverse($rows); // mais recentes primeiro
}

$statusLabel = [
    'ativo' => 'Tenho um negócio ativo',
    'estruturando' => 'Estou estruturando um negócio',
    'quero' => 'Ainda não, mas quero empreender',
];
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Grupo TR4 — Leads BPM</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<style>
  body { font-family: Arial, sans-serif; background: #EAE1D3; color: #2E2E27; margin: 0; padding: 40px; }
  .box { max-width: 480px; margin: 80px auto; background: #FDFAF4; padding: 32px; border: 1px solid rgba(85,86,74,0.2); }
  h1 { font-size: 20px; margin-top: 0; }
  input { width: 100%; padding: 10px; font-size: 15px; margin: 12px 0; box-sizing: border-box; border: 1px solid rgba(85,86,74,0.4); }
  button { background: #3E3E34; color: #EAE1D3; border: none; padding: 12px 24px; font-size: 14px; cursor: pointer; }
  .error { color: #B5502E; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; background: #FDFAF4; margin-top: 24px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid rgba(85,86,74,0.15); font-size: 14px; }
  th { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #55564A; }
  .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; max-width: 1000px; margin: 0 auto 16px; }
  .wrap { max-width: 1000px; margin: 40px auto; }
  a.btn { background: #3E3E34; color: #EAE1D3; padding: 10px 18px; font-size: 13px; text-decoration: none; }
  a.logout { font-size: 13px; color: #55564A; }
</style>
</head>
<body>

<?php if (!$loggedIn): ?>
  <div class="box">
    <h1>Grupo TR4 — acesso restrito</h1>
    <?php if ($error): ?><p class="error"><?= htmlspecialchars($error) ?></p><?php endif; ?>
    <form method="post">
      <input type="password" name="password" placeholder="Senha" required autofocus>
      <button type="submit">Entrar</button>
    </form>
  </div>
<?php else:
  $leads = readLeads();
?>
  <div class="wrap">
    <div class="toolbar">
      <h1>Leads do BPM (<?= count($leads) ?>)</h1>
      <div>
        <a class="btn" href="?download=1">Baixar CSV</a>
        <a class="logout" href="?logout=1">Sair</a>
      </div>
    </div>
    <table>
      <thead>
        <tr><th>Data/hora</th><th>Nome</th><th>E-mail</th><th>Situação</th></tr>
      </thead>
      <tbody>
        <?php if (empty($leads)): ?>
          <tr><td colspan="4">Nenhum lead recebido ainda.</td></tr>
        <?php else: foreach ($leads as $row): [$dataHora, $nome, $email, $status] = $row + [null, null, null, null]; ?>
          <tr>
            <td><?= htmlspecialchars($dataHora) ?></td>
            <td><?= htmlspecialchars($nome) ?></td>
            <td><?= htmlspecialchars($email) ?></td>
            <td><?= htmlspecialchars($statusLabel[$status] ?? $status) ?></td>
          </tr>
        <?php endforeach; endif; ?>
      </tbody>
    </table>
  </div>
<?php endif; ?>

</body>
</html>
