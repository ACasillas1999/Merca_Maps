document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('user-form');
  const list = document.getElementById('users-list');
  const statusEl = document.getElementById('users-status');
  const submitBtn = document.getElementById('user-submit');
  const formControls = form ? Array.from(form.querySelectorAll('input, select, button')) : [];
  let editingId = null;

  // Deshabilitar hasta confirmar que el usuario es admin
  setFormEnabled(false);
  ensureAdmin().then((isAdmin) => {
    if (isAdmin) {
      setFormEnabled(true);
      loadUsers();
    } else {
      if (statusEl) statusEl.innerHTML = 'Solo administradores pueden gestionar usuarios. <a href="login.html">Iniciar sesion</a>';
      if (list) list.innerHTML = '';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.hidden) return;
    const payload = {
      name: document.getElementById('user-name').value.trim(),
      email: document.getElementById('user-email').value.trim(),
      password: document.getElementById('user-password').value,
      role: document.getElementById('user-role').value,
    };
    try {
      submitBtn.disabled = true;
      statusEl.textContent = editingId ? 'Actualizando...' : 'Creando usuario...';
      if (editingId) {
        payload.id = editingId;
        if (!payload.password) {
          delete payload.password; // no cambiar contraseña si viene vacía
        }
        await request('PUT', payload);
        statusEl.textContent = 'Usuario actualizado';
      } else {
        if (!payload.password) throw new Error('La contraseña es obligatoria');
        await request('POST', payload);
        statusEl.textContent = 'Usuario creado';
      }
      form.reset();
      editingId = null;
      submitBtn.textContent = 'Crear usuario';
      loadUsers();
    } catch (err) {
      statusEl.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === 'edit') {
      startEdit(id);
    } else if (btn.dataset.action === 'delete') {
      if (confirm('Eliminar usuario?')) {
        try {
          statusEl.textContent = 'Eliminando...';
          await fetch(`api/users.php?id=${id}`, { method: 'DELETE' });
          statusEl.textContent = 'Usuario eliminado';
          loadUsers();
        } catch (err) {
          statusEl.textContent = 'No se pudo eliminar';
        }
      }
    }
  });

  async function loadUsers() {
    statusEl.textContent = 'Cargando usuarios...';
    const res = await fetch('api/users.php');
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = data.error || 'Necesitas iniciar sesión como admin';
      if (res.status === 401) {
        statusEl.innerHTML = `${statusEl.textContent} <a href="login.html">Ir a login</a>`;
      }
      list.innerHTML = '';
      return;
    }
    statusEl.textContent = '';
    renderList(data.users || []);
  }

  function renderList(users) {
    if (!users.length) {
      list.innerHTML = '<p class="muted">Sin usuarios aún.</p>';
      return;
    }
    list.innerHTML = `
      <table class="table">
        <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Acciones</th></tr></thead>
        <tbody>
          ${users
            .map(
              (u) => `
              <tr>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td><span class="badge">${u.role}</span></td>
                <td class="table-actions">
                  <button class="ghost small" data-action="edit" data-id="${u.id}">Editar</button>
                  <button class="ghost small" data-action="delete" data-id="${u.id}">Eliminar</button>
                </td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  async function startEdit(id) {
    const res = await fetch('api/users.php');
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = data.error || 'No autorizado';
      return;
    }
    const user = (data.users || []).find((u) => Number(u.id) === id);
    if (!user) return;
    editingId = id;
    document.getElementById('user-name').value = user.name;
    document.getElementById('user-email').value = user.email;
    document.getElementById('user-password').value = '';
    document.getElementById('user-role').value = user.role;
    submitBtn.textContent = 'Actualizar usuario';
    statusEl.textContent = `Editando a ${user.name}`;
  }

  async function request(method, payload) {
    const res = await fetch('api/users.php', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Error en la operacion');
    }
    return data;
  }

  async function ensureAdmin() {
    try {
      statusEl.textContent = 'Verificando acceso...';
      const res = await fetch('api/auth.php');
      const data = await res.json();
      if (!res.ok || data?.user?.role !== 'admin') {
        throw new Error(data.error || 'No autorizado');
      }
      statusEl.textContent = '';
      return true;
    } catch (err) {
      statusEl.textContent = err.message || 'No autorizado';
      return false;
    }
  }

  function setFormEnabled(enabled) {
    formControls.forEach((el) => {
      if (el.id === 'user-submit') {
        el.hidden = !enabled;
        el.disabled = !enabled;
      } else {
        el.disabled = !enabled;
      }
    });
  }
});
