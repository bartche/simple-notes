document.addEventListener('DOMContentLoaded', async () => {
    // Toda a lógica agora fica dentro do try...catch para garantir que
    // só será executada se a verificação de status for bem-sucedida.
    try {
        // 1. Verifica o status de login
        const res = await fetch('/api/users/status');
        const data = await res.json();

        if (!data.loggedIn) {
            window.location.href = '/login.html';
            return;
        }
		
		const userTheme = data.theme || 'dark';
		localStorage.setItem('theme', userTheme); // Sincroniza o localStorage

        // 2. Com os dados do usuário em mãos, configura a página
        const usernameEl = document.getElementById('username-display');
        if (usernameEl) usernameEl.textContent = data.username;

        // 3. Lógica do Tema
        const themeToggle = document.getElementById('theme-checkbox');
        const applyTheme = (theme) => {
            document.body.classList.toggle('dark-mode', theme === 'dark');
            if(themeToggle) themeToggle.checked = (theme === 'dark');
        };
        const savedTheme = localStorage.getItem('theme') || 'dark';
        applyTheme(savedTheme);

		if (themeToggle) {
			themeToggle.addEventListener('change', async () => { // Função agora é async
				const newTheme = themeToggle.checked ? 'dark' : 'light';
				
				// 1. Aplica visualmente na hora
				applyTheme(newTheme);
				
				// 2. Salva no localStorage para consistência entre abas
				localStorage.setItem('theme', newTheme);

				// 3. NOVO: Envia a preferência para o servidor para salvar na conta
				try {
					await fetch('/api/users/theme', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ theme: newTheme })
					});
				} catch (error) {
					console.error("Não foi possível salvar a preferência de tema no servidor.", error);
				}
			});
		}

        // 4. Lógica de Admin (se o usuário for root)
        const isRoot = data.is_root;
		const currentUserId = data.userId;
        if (isRoot) {
            showAdminPanels();
            loadAdminData(currentUserId);
        }

        // 5. Listener para o Botão de Logout
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await fetch('/api/users/logout', { method: 'POST' });
                window.location.href = '/login.html';
            });
        }

        // 6. Listener para o Formulário de Troca de Senha
        const passwordForm = document.getElementById('change-password-form');
        const passwordFeedback = document.getElementById('password-feedback');

        if (passwordForm) {
            passwordForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                passwordFeedback.textContent = '';
                passwordFeedback.classList.remove('success', 'error');

                const currentPassword = document.getElementById('current-password').value;
                const newPassword = document.getElementById('new-password').value;

                try {
                    const response = await fetch('/api/users/change-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ currentPassword, newPassword })
                    });
                    const result = await response.json();

                    if (response.ok) {
                        passwordFeedback.textContent = result.message;
                        passwordFeedback.classList.add('success');
                        passwordForm.reset();
                    } else {
                        passwordFeedback.textContent = result.message;
                        passwordFeedback.classList.add('error');
                    }
                } catch (error) {
                    passwordFeedback.textContent = 'Erro de conexão com o servidor.';
                    passwordFeedback.classList.add('error');
                }
            });
        }

    } catch (error) {
        // Se qualquer parte da verificação inicial falhar, redireciona para o login
        console.error("Falha ao inicializar a página de perfil:", error);
        window.location.href = '/login.html';
    }
});

// Funções de Admin permanecem fora, pois são chamadas apenas se o usuário for root
function showAdminPanels() {
    document.querySelectorAll('.admin-panel').forEach(panel => {
        panel.style.display = 'block';
    });
}

async function loadAdminData(currentUserId) { // Recebe o ID do usuário logado
    try {
        // ... (código para carregar o status do registro permanece o mesmo)
        const regResponse = await fetch('/api/settings/registrations');
        const regData = await regResponse.json();
        const regToggle = document.getElementById('allow-registrations-toggle');
        regToggle.checked = regData.enabled;

        regToggle.addEventListener('change', async () => {
            await fetch('/api/settings/registrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: regToggle.checked })
            });
        });


        // Carrega e renderiza a lista de usuários com a nova lógica de permissão
        const usersResponse = await fetch('/api/users');
        const users = await usersResponse.json();
        const tableBody = document.querySelector('#users-table tbody');
        tableBody.innerHTML = '';

        users.forEach(user => {
            let actionButtons = '';
            
            // CORREÇÃO: Botões só aparecem se o usuário logado for o super root (ID 1)
            if (currentUserId === 1 && user.id !== 1) {
                if (user.is_root) {
                    actionButtons += `<button class="demote-btn admin-action-btn" data-user-id="${user.id}" data-username="${user.username}">Unroot user</button>`;
                } else {
                    actionButtons += `<button class="promote-btn admin-action-btn" data-user-id="${user.id}" data-username="${user.username}">Root user</button>`;
                }
                actionButtons += `<button class="delete-user-btn admin-action-btn" data-user-id="${user.id}" data-username="${user.username}">Delete</button>`;
            }

            const row = `
                <tr>
                    <td>${user.id}</td>
                    <td>${user.username}</td>
                    <td>${user.is_root ? '<span class="status-root">Yes</span>' : 'No'}</td>
                    <td class="action-cell">${actionButtons}</td>
                </tr>
            `;
            tableBody.innerHTML += row;
        });

        // Adiciona listeners para os novos botões (lógica permanece a mesma)
        document.querySelectorAll('.admin-action-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const button = e.target;
                const userId = button.dataset.userId;
                const username = button.dataset.username;

                if (button.classList.contains('promote-btn')) {
                    if (confirm(`Tem certeza que deseja tornar "${username}" um administrador?`)) {
                        await fetch(`/api/users/${userId}/promote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_root: true }) });
                        loadAdminData(currentUserId);
                    }
                } else if (button.classList.contains('demote-btn')) {
                    if (confirm(`Tem certeza que deseja remover os privilégios de "${username}"?`)) {
                        await fetch(`/api/users/${userId}/promote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_root: false }) });
                        loadAdminData(currentUserId);
                    }
                } else if (button.classList.contains('delete-user-btn')) {
                    if (confirm(`ATENÇÃO: Isso apagará o usuário "${username}" e TODAS as suas notas e anexos permanentemente. Deseja continuar?`)) {
                        await fetch(`/api/users/${userId}`, { method: 'DELETE' });
                        loadAdminData(currentUserId);
                    }
                }
            });
        });
    } catch (error) {
        console.error("Erro ao carregar dados de admin:", error);
    }
}