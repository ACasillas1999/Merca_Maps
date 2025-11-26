<?php
header('Content-Type: application/json');
session_start();
require 'db.php';

$conn = db();
$method = $_SERVER['REQUEST_METHOD'];
$admin = current_admin($conn);

if (!$admin) {
    json_error(401, 'Solo administradores pueden gestionar usuarios');
}

switch ($method) {
    case 'GET':
        list_users($conn);
        break;
    case 'POST':
        create_user($conn);
        break;
    case 'PUT':
        update_user($conn);
        break;
    case 'DELETE':
        delete_user($conn);
        break;
    default:
        json_error(405, 'Metodo no permitido');
}

function current_admin(mysqli $conn): ?array
{
    if (!isset($_SESSION['user_id'])) {
        return null;
    }
    $id = (int)$_SESSION['user_id'];
    $stmt = $conn->prepare('SELECT id, name, email, role FROM users WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();
    $stmt->close();
    if (!$user || $user['role'] !== 'admin') {
        return null;
    }
    return $user;
}

function list_users(mysqli $conn): void
{
    $result = $conn->query('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC');
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    echo json_encode(['users' => $rows]);
}

function create_user(mysqli $conn): void
{
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $name = trim($input['name'] ?? '');
    $email = trim($input['email'] ?? '');
    $password = $input['password'] ?? '';
    $role = $input['role'] ?? 'user';

    if ($name === '' || $email === '' || $password === '') {
        json_error(400, 'Datos incompletos');
    }
    if (!in_array($role, ['admin', 'user'], true)) {
        json_error(400, 'Rol invalido');
    }

    $exists = $conn->prepare('SELECT id FROM users WHERE email = ?');
    $exists->bind_param('s', $email);
    $exists->execute();
    $exists->store_result();
    if ($exists->num_rows > 0) {
        $exists->close();
        json_error(409, 'El correo ya existe');
    }
    $exists->close();

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $conn->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
    $stmt->bind_param('ssss', $name, $email, $hash, $role);
    if (!$stmt->execute()) {
        json_error(500, 'No se pudo crear el usuario');
    }
    $id = $stmt->insert_id;
    $stmt->close();

    echo json_encode(['user' => ['id' => $id, 'name' => $name, 'email' => $email, 'role' => $role]]);
}

function update_user(mysqli $conn): void
{
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $id = isset($input['id']) ? (int)$input['id'] : 0;
    if ($id <= 0) {
        json_error(400, 'ID requerido');
    }

    $fields = [];
    $params = [];
    $types = '';

    if (isset($input['name'])) {
        $fields[] = 'name = ?';
        $params[] = trim($input['name']);
        $types .= 's';
    }
    if (isset($input['email'])) {
        $email = trim($input['email']);
        if ($email === '') {
            json_error(400, 'Email invalido');
        }
        // Validar email unico
        $check = $conn->prepare('SELECT id FROM users WHERE email = ? AND id <> ?');
        $check->bind_param('si', $email, $id);
        $check->execute();
        $check->store_result();
        if ($check->num_rows > 0) {
            $check->close();
            json_error(409, 'El correo ya existe');
        }
        $check->close();
        $fields[] = 'email = ?';
        $params[] = $email;
        $types .= 's';
    }
    if (isset($input['role'])) {
        $role = $input['role'];
        if (!in_array($role, ['admin', 'user'], true)) {
            json_error(400, 'Rol invalido');
        }
        $fields[] = 'role = ?';
        $params[] = $role;
        $types .= 's';
    }
    if (isset($input['password']) && $input['password'] !== '') {
        $hash = password_hash($input['password'], PASSWORD_DEFAULT);
        $fields[] = 'password_hash = ?';
        $params[] = $hash;
        $types .= 's';
    }

    if (empty($fields)) {
        json_error(400, 'Nada que actualizar');
    }

    $sql = 'UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?';
    $stmt = $conn->prepare($sql);
    $types .= 'i';
    $params[] = $id;
    $stmt->bind_param($types, ...$params);
    if (!$stmt->execute()) {
        json_error(500, 'No se pudo actualizar el usuario');
    }
    $stmt->close();

    $fetch = $conn->prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?');
    $fetch->bind_param('i', $id);
    $fetch->execute();
    $result = $fetch->get_result();
    $user = $result->fetch_assoc();
    $fetch->close();

    echo json_encode(['user' => $user]);
}

function delete_user(mysqli $conn): void
{
    $id = $_GET['id'] ?? null;
    if (!$id || !is_numeric($id)) {
        json_error(400, 'ID invalido');
    }
    $userId = (int)$id;

    $stmt = $conn->prepare('DELETE FROM users WHERE id = ?');
    $stmt->bind_param('i', $userId);
    if (!$stmt->execute()) {
        json_error(500, 'No se pudo eliminar');
    }
    $stmt->close();
    echo json_encode(['deleted' => $userId]);
}
