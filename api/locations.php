<?php
header('Content-Type: application/json');
require 'db.php';

$conn = db();
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        list_locations($conn);
        break;
    case 'POST':
        create_location($conn);
        break;
    case 'DELETE':
        delete_location($conn);
        break;
    default:
        json_error(405, 'Metodo no permitido');
}

function list_locations(mysqli $conn): void
{
    ensure_seed_locations($conn);

    $result = $conn->query("SELECT id, name, type, lat, lng, notes, created_at FROM locations ORDER BY created_at DESC");
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        if (!is_valid_coord($row['lat'], $row['lng'])) {
            // Saltar registros corruptos para no romper el mapa
            continue;
        }
        $row['createdAt'] = strtotime($row['created_at']) * 1000;
        unset($row['created_at']);
        $rows[] = $row;
    }
    echo json_encode(['locations' => $rows]);
}

function ensure_seed_locations(mysqli $conn): void
{
    $seed = [
        ['DIMEGSA', 20.66086566989181, -103.35498266582181],
        ['DEASA', 20.6626029222324, -103.35564905319303],
        ['AIESA', 20.647442138464317, -103.35303451136468],
        ['SEGSA', 20.68075274311637, -103.36740059908436],
        ['FESA', 20.680876941064735, -103.36717413301479],
        ['TAPATIA', 20.660080259250343, -103.35598648741274],
        ['GABSA', 21.1017480510419, -101.68149017883717],
        ['ILUMINACION', 20.660385131570916, -103.35616304721444],
        ['VALLARTA', 20.708876281913774, -105.27453124524618],
        ['QUERETARO', 20.652475013556035, -100.43190554642169],
        ['CODI', 20.660511385115246, -103.35846367710215],
    ];

    $check = $conn->prepare('SELECT COUNT(*) FROM locations WHERE name = ?');
    $insert = $conn->prepare('INSERT INTO locations (name, type, lat, lng, notes) VALUES (?, ?, ?, ?, ?)');
    foreach ($seed as [$name, $lat, $lng]) {
        $check->bind_param('s', $name);
        $check->execute();
        $check->bind_result($count);
        $check->fetch();
        $check->free_result();
        if ($count > 0) {
            continue;
        }
        $type = 'sucursal';
        $notes = '';
        $insert->bind_param('ssdds', $name, $type, $lat, $lng, $notes);
        $insert->execute();
    }
    $check->close();
    $insert->close();
}

function create_location(mysqli $conn): void
{
    $input = json_decode(file_get_contents('php://input'), true);
    if (!$input) {
        $input = $_POST;
    }

    $name = trim($input['name'] ?? '');
    $type = trim($input['type'] ?? '');
    $lat = $input['lat'] ?? null;
    $lng = $input['lng'] ?? null;
    $notes = trim($input['notes'] ?? '');

    if ($name === '' || $type === '' || !is_numeric($lat) || !is_numeric($lng)) {
        json_error(400, 'Datos incompletos');
    }
    if (!is_valid_coord($lat, $lng)) {
        json_error(400, 'Latitud/longitud fuera de rango');
    }

    $stmt = $conn->prepare('INSERT INTO locations (name, type, lat, lng, notes) VALUES (?, ?, ?, ?, ?)');
    $stmt->bind_param('ssdds', $name, $type, $lat, $lng, $notes);
    if (!$stmt->execute()) {
        json_error(500, 'No se pudo guardar la ubicacion');
    }

    $id = $stmt->insert_id;
    echo json_encode([
        'location' => [
            'id' => $id,
            'name' => $name,
            'type' => $type,
            'lat' => (float)$lat,
            'lng' => (float)$lng,
            'notes' => $notes,
            'createdAt' => time() * 1000,
        ],
    ]);
}

function is_valid_coord($lat, $lng): bool
{
    return is_numeric($lat) && is_numeric($lng) &&
        (float)$lat <= 90 && (float)$lat >= -90 &&
        (float)$lng <= 180 && (float)$lng >= -180 &&
        is_finite((float)$lat) && is_finite((float)$lng);
}

function delete_location(mysqli $conn): void
{
    $id = $_GET['id'] ?? null;
    if (!$id || !is_numeric($id)) {
        json_error(400, 'ID invalido');
    }

    $stmt = $conn->prepare('DELETE FROM locations WHERE id = ?');
    $stmt->bind_param('i', $id);
    if (!$stmt->execute()) {
        json_error(500, 'No se pudo eliminar');
    }

    echo json_encode(['deleted' => (int)$id]);
}

