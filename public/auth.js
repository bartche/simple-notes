// ==============================================
// FUNÇÃO DE NOTIFICAÇÃO (TOAST)
// ==============================================
function showToast(message, type = 'info') { // type pode ser 'success', 'error', ou 'info'
    const container = document.getElementById('toast-container');
    if (!container) {
        console.error("Container de toast não encontrado. Adicione <div id='toast-container'></div> ao seu HTML.");
        // Fallback para o alert padrão se o container não existir
        alert(message);
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-check-circle';
    if (type === 'error') iconClass = 'fa-exclamation-triangle';

    toast.innerHTML = `<i class="fas ${iconClass}"></i><p>${message}</p>`;
    
    container.appendChild(toast);

    // Remove o toast após alguns segundos
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4000); // 4 segundos
}

document.addEventListener('DOMContentLoaded', () => {
    const loginContainer = document.getElementById('login-container');
    const registerContainer = document.getElementById('register-container');
    const showRegisterLink = document.getElementById('show-register');
    const showLoginLink = document.getElementById('show-login');

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const authError = document.getElementById('auth-error');

    // Alternar entre formulários de login e registro
    showRegisterLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginContainer.style.display = 'none';
        registerContainer.style.display = 'block';
        authError.textContent = '';
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerContainer.style.display = 'none';
        loginContainer.style.display = 'block';
        authError.textContent = '';
    });

    // Lógica de Login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;

        try {
            const response = await fetch('/api/users/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                window.location.href = '/'; // Redireciona para a página principal
            } else {
                const result = await response.json();
                authError.textContent = result.message || 'Unable to login.';
            }
        } catch (error) {
            authError.textContent = 'Unable to connect to the server.';
        }
    });

    // Lógica de Registro
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
		
		if (username.length < 4 || password.length < 4) {
			showToast('Username and password must be at least 4 characters long.', 'error');
			return;
		}

        try {
            const response = await fetch('/api/users/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (response.ok) {
                showToast('Account created successfully! Please, login.', 'info');
                showLoginLink.click(); // Mostra o formulário de login
            } else {
                const result = await response.json();
                authError.textContent = result.message || 'Unable to register';
            }
        } catch (error) {
            authError.textContent = 'Unable to connect to the server.';
        }
    });
});