<?php
// Configurações do formulário do BPM.
// IMPORTANTE: troque essa senha antes de publicar o site.
// Gere um hash novo rodando no terminal (ou num script PHP temporário):
//   echo password_hash('SUA_SENHA_AQUI', PASSWORD_DEFAULT);
define('ADMIN_PASSWORD_HASH', '$2y$12$16mcsLj7yLeDCYV18TtLF.CgCPLcWMszSYlhHHAVnkDKpXRHqpd/a');
// Senha padrão inicial (troque assim que possível): TR4bpm2026!

define('LEADS_CSV_PATH', __DIR__ . '/../data/leads.csv');
define('LEADS_CSV_HEADER', ['data_hora', 'nome', 'email', 'status']);
