<?php
function db()
{
    static $conn;
    if ($conn) {
        return $conn;
    }

    $host = '18.211.75.118';
    $user = 'merca_maps';
    $pass = 'Nomeacuerd0';
    $database = 'merca_maps';

    // Evitar que los warnings de MySQL rompan las respuestas JSON
    mysqli_report(MYSQLI_REPORT_OFF);

    $conn = new mysqli($host, $user, $pass);
    if ($conn->connect_errno) {
        http_response_code(500);
        echo json_encode(['error' => 'Error de conexion a MySQL']);
        exit;
    }

    $conn->set_charset('utf8mb4');
    $conn->query("CREATE DATABASE IF NOT EXISTS `$database` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $conn->select_db($database);

    ensure_users_table($conn);
    // Asegurar columna color para personalizar pins si ya existia la tabla sin romper si ya existe
    $hasColor = $conn->prepare('SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = "locations" AND COLUMN_NAME = "color"');
    $hasColor->bind_param('s', $database);
    $hasColor->execute();
    $hasColor->store_result();
    if ($hasColor->num_rows === 0) {
        $conn->query("ALTER TABLE locations ADD COLUMN color VARCHAR(16) NULL AFTER notes");
    }
    $hasColor->close();

    $createTable = "CREATE TABLE IF NOT EXISTS locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        type VARCHAR(50) NOT NULL,
        lat DOUBLE NOT NULL,
        lng DOUBLE NOT NULL,
        notes TEXT NULL,
        color VARCHAR(16) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

    $conn->query($createTable);

    // Normalizar tabla locations por si quedo sin AUTO_INCREMENT/PRIMARY KEY en instalaciones previas
    $locIdInfo = $conn->prepare('SELECT COLUMN_KEY, EXTRA FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "locations" AND COLUMN_NAME = "id"');
    $locIdInfo->execute();
    $locIdInfo->bind_result($colKey, $extra);
    $locIdInfo->fetch();
    $locIdInfo->close();
    if ($colKey !== 'PRI' || stripos((string)$extra, 'auto_increment') === false) {
        $conn->query('ALTER TABLE locations MODIFY id INT AUTO_INCREMENT PRIMARY KEY');
    }

    return $conn;
}

function ensure_users_table(mysqli $conn): void
{
    $createUsers = "CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(190) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin','user') NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    $conn->query($createUsers);

    // Normalizar tabla en caso de instalaciones previas sin AUTO_INCREMENT/PRIMARY KEY/UNIQUE
    $colInfo = $conn->prepare('SELECT COLUMN_KEY, EXTRA FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "users" AND COLUMN_NAME = "id"');
    $colInfo->execute();
    $colInfo->bind_result($colKey, $extra);
    $colInfo->fetch();
    $colInfo->close();
    if ($colKey !== 'PRI' || stripos((string)$extra, 'auto_increment') === false) {
        $conn->query('ALTER TABLE users MODIFY id INT AUTO_INCREMENT PRIMARY KEY');
    }

    $emailIndex = $conn->query("SELECT COUNT(1) AS cnt FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'email'");
    $idxRow = $emailIndex ? $emailIndex->fetch_assoc() : ['cnt' => 0];
    if ((int)$idxRow['cnt'] === 0) {
        $conn->query('ALTER TABLE users ADD UNIQUE KEY email (email)');
    }

    // Seed admin user if none exists
    $check = $conn->prepare('SELECT id FROM users WHERE role = "admin" LIMIT 1');
    $check->execute();
    $check->store_result();
    if ($check->num_rows === 0) {
        $name = 'Administrador';
        $email = 'admin@local';
        $passwordHash = password_hash('admin123', PASSWORD_DEFAULT);
        $role = 'admin';
        $insert = $conn->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
        $insert->bind_param('ssss', $name, $email, $passwordHash, $role);
        $insert->execute();
        $insert->close();
    }
    $check->close();
}

function json_error($code, $message)
{
    http_response_code($code);
    echo json_encode(['error' => $message]);
    exit;
}
