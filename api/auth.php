<?php
header('Content-Type: application/json');
session_start();
require __DIR__ . '/db.php';

$conn = db();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'POST':
        login($conn);
        break;
    case 'GET':
        me($conn);
        break;
    case 'DELETE':
        logout();
        break;
    default:
        json_error(405, 'Metodo no permitido');
}

function login(mysqli $conn): void
{
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';
    if ($email === '' || $password === '') {
        json_error(400, 'Credenciales incompletas');
    }

    $stmt = $conn->prepare('SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = ? LIMIT 1');
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();
    $stmt->close();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        json_error(401, 'Correo o contraseña incorrectos');
    }

    $_SESSION['user_id'] = $user['id'];
    $_SESSION['role'] = $user['role'];

    unset($user['password_hash']);
    echo json_encode(['user' => $user]);
}

function me(mysqli $conn): void
{
    if (!isset($_SESSION['user_id'])) {
        json_error(401, 'No autenticado');
    }
    $id = (int)$_SESSION['user_id'];
    $stmt = $conn->prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();
    $stmt->close();
    if (!$user) {
        session_destroy();
        json_error(401, 'No autenticado');
    }
    echo json_encode(['user' => $user]);
}

function logout(): void
{
    session_destroy();
    echo json_encode(['ok' => true]);
}
