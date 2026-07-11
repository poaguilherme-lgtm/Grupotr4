<?php
require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

// Honeypot: campo invisível que só bot preenche.
if (!empty($data['website'])) {
    echo json_encode(['ok' => true]);
    exit;
}

$nome = trim((string)($data['nome'] ?? ''));
$email = trim((string)($data['email'] ?? ''));
$status = trim((string)($data['status'] ?? ''));

$statusPermitido = ['ativo', 'estruturando', 'quero'];

if ($nome === '' || $email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || !in_array($status, $statusPermitido, true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'dados_invalidos']);
    exit;
}

$dir = dirname(LEADS_CSV_PATH);
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

$isNewFile = !file_exists(LEADS_CSV_PATH);

$fp = fopen(LEADS_CSV_PATH, 'a');
if ($fp === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'nao_foi_possivel_salvar']);
    exit;
}

if (flock($fp, LOCK_EX)) {
    if ($isNewFile) {
        fputcsv($fp, LEADS_CSV_HEADER);
    }
    fputcsv($fp, [date('Y-m-d H:i:s'), $nome, $email, $status]);
    fflush($fp);
    flock($fp, LOCK_UN);
}
fclose($fp);

echo json_encode(['ok' => true]);
