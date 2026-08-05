document.getElementById('form-login').addEventListener('submit', function (e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorBox = document.getElementById('auth-error');
  errorBox.classList.remove('visible');

  fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión');
      window.location.href = '/denuncia.html';
    })
    .catch(err => {
      errorBox.textContent = err.message;
      errorBox.classList.add('visible');
    });
});
