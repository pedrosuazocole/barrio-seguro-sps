document.getElementById('form-registro').addEventListener('submit', function (e) {
  e.preventDefault();
  const nombre = document.getElementById('nombre').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const password2 = document.getElementById('password2').value;
  const errorBox = document.getElementById('auth-error');
  errorBox.classList.remove('visible');

  if (password !== password2) {
    errorBox.textContent = 'Las contraseñas no coinciden';
    errorBox.classList.add('visible');
    return;
  }

  fetch('/api/auth/registro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, telefono, username, password })
  })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la cuenta');
      window.location.href = '/denuncia.html';
    })
    .catch(err => {
      errorBox.textContent = err.message;
      errorBox.classList.add('visible');
    });
});
