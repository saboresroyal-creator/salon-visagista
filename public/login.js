function renderLogin(container, onSuccess) {
  document.getElementById('tabs').innerHTML = '';
  document.getElementById('logout-btn')?.remove();

  container.innerHTML = `
    <div style="max-width:360px; margin:80px auto;" class="card">
      <h2 style="margin-top:0; text-align:center;">Ingresar</h2>
      <div class="field"><label>Email</label><input type="email" id="lg-email" autocomplete="username" /></div>
      <div class="field"><label>Contraseña</label><input type="password" id="lg-password" autocomplete="current-password" /></div>
      <p id="lg-error" style="color:var(--danger); font-size:0.85rem; display:none;"></p>
      <button class="primary" id="lg-submit" style="width:100%;">Entrar</button>
    </div>
  `;

  const submit = async () => {
    const email = container.querySelector('#lg-email').value.trim();
    const password = container.querySelector('#lg-password').value;
    const errorEl = container.querySelector('#lg-error');
    errorEl.style.display = 'none';
    if (!email || !password) return;
    try {
      const user = await api.auth.login(email, password);
      onSuccess(user);
    } catch (e) {
      errorEl.textContent = e.message;
      errorEl.style.display = 'block';
    }
  };

  container.querySelector('#lg-submit').onclick = submit;
  container.querySelectorAll('#lg-email, #lg-password').forEach((el) => {
    el.onkeydown = (ev) => { if (ev.key === 'Enter') submit(); };
  });
}
