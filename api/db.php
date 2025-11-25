<?php
function db()
{
    static $conn;
    if ($conn) {
        return $conn;
    }

    $host = 'localhost';
    $user = 'root';
    $pass = '';
    $database = 'marca_maps';

    $conn = new mysqli($host, $user, $pass);
    if ($conn->connect_errno) {
        http_response_code(500);
        echo json_encode(['error' => 'Error de conexion a MySQL']);
        exit;
    }

    $conn->set_charset('utf8mb4');
    $conn->query("CREATE DATABASE IF NOT EXISTS `$database` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $conn->select_db($database);

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
    return $conn;
}

function json_error($code, $message)
{
    http_response_code($code);
    echo json_encode(['error' => $message]);
    exit;
}
