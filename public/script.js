let currentEditingNoteId = null;
let newNoteAttachments = [];
let currentDraftNoteId = null; 
let isUploading = false; 

// ==============================================
// FUNÇÕES GLOBAIS DO APP
// ==============================================
function applyInlineFormatting(text) {
  let formattedText = text;
  formattedText = formattedText.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  formattedText = formattedText.replace(/(?<!href=")(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  formattedText = formattedText.replace(/\*(.*?)\*/g, '<strong>$1</strong>').replace(/_(.*?)_/g, '<em>$1</em>').replace(/~(.*?)~/g, '<del>$1</del>');
  return formattedText;
}

function formatNoteContent(content, noteId) {
    if (!content) return '';
    let html = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const codeBlocks = [];
    html = html.replace(/```([\s\S]*?)```/g, (match, code) => {
        codeBlocks.push(code);
        return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
    });
    const lines = html.split('\n');
    const newLines = [];
    let inList = null;
    lines.forEach((line, index) => {
        if (line.startsWith('%%CODEBLOCK_')) {
            const blockIndex = parseInt(line.match(/_(\d+)/)[1]);
            newLines.push(`<pre><code>${codeBlocks[blockIndex]}</code></pre>`);
            return;
        }
        if (!line.trim().startsWith('- ') && !line.match(/^\d+\-\s/)) {
            if (inList) newLines.push(inList === 'ol' ? '</ol>' : '</ul>');
            inList = null;
        }
        let processedLine;
        if (line.match(/^-\s\[x\]\s/i)) processedLine = `<div class="task-list-item checked"><input type="checkbox" data-note-id="${noteId}" data-line-index="${index}" checked> <label>${applyInlineFormatting(line.substring(6))}</label></div>`;
        else if (line.match(/^-\s\[\s\]\s/)) processedLine = `<div class="task-list-item"><input type="checkbox" data-note-id="${noteId}" data-line-index="${index}"> <label>${applyInlineFormatting(line.substring(6))}</label></div>`;
        else if (line.startsWith('# ')) processedLine = `<h1>${applyInlineFormatting(line.substring(2))}</h1>`;
        else if (line.startsWith('## ')) processedLine = `<h2>${applyInlineFormatting(line.substring(3))}</h2>`;
        else if (line.startsWith('### ')) processedLine = `<h3>${applyInlineFormatting(line.substring(4))}</h3>`;
        else if (line.startsWith('- ')) {
            if (inList !== 'ul') {
                if (inList) newLines.push('</ol>');
                newLines.push('<ul>');
                inList = 'ul';
            }
            newLines.push(`<li>${applyInlineFormatting(line.substring(2))}</li>`);
            return;
        }
        else if (line.match(/^\d+\-\s/)) {
             if (inList !== 'ol') {
                if (inList) newLines.push('</ul>');
                newLines.push('<ol>');
                inList = 'ol';
            }
            newLines.push(`<li>${applyInlineFormatting(line.replace(/^\d+\-\s/, ''))}</li>`);
            return;
        }
        else if (line.trim()) processedLine = `<p>${applyInlineFormatting(line)}</p>`;
        else processedLine = '<br>';
        newLines.push(processedLine);
    });
    if (inList) newLines.push(inList === 'ol' ? '</ol>' : '</ul>');
    return newLines.join('\n');
}

function insertSyntax(prefix, suffix = '') {
    const textarea = document.getElementById('newNoteContent');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const textToInsert = prefix + selectedText + suffix;
    textarea.value = textarea.value.substring(0, start) + textToInsert + textarea.value.substring(end);
    if (selectedText) {
        textarea.selectionStart = start;
        textarea.selectionEnd = start + textToInsert.length;
    } else {
        textarea.selectionStart = textarea.selectionEnd = start + prefix.length;
    }
    textarea.focus();
}

function handleListContinuation(event) {
    if (event.key === 'Enter') {
        const textarea = event.target;
        const cursorPosition = textarea.selectionStart;
        const textBeforeCursor = textarea.value.substring(0, cursorPosition);
        const currentLineStart = textBeforeCursor.lastIndexOf('\n') + 1;
        const currentLine = textarea.value.substring(currentLineStart, cursorPosition);
        let prefix = '';
        const unorderedMatch = currentLine.match(/^(\s*-\s(?:\[[ x]\]\s)?)/);
        if (unorderedMatch) {
            if (currentLine.trim() === unorderedMatch[1].trim()) prefix = '\n'; 
            else prefix = unorderedMatch[1].replace('[x]', '[ ]'); 
        }
        const orderedMatch = currentLine.match(/^(\s*)(\d+)(\-\s)/);
        if (orderedMatch) {
            if (currentLine.trim() === `${orderedMatch[2]}${orderedMatch[3]}`.trim()) prefix = '\n'; 
            else {
                const newNumber = parseInt(orderedMatch[2]) + 1;
                prefix = `${orderedMatch[1]}${newNumber}${orderedMatch[3]}`;
            }
        }
        if (prefix) {
            event.preventDefault();
            const textAfterCursor = textarea.value.substring(cursorPosition);
            const newText = `${textBeforeCursor}\n${prefix}${textAfterCursor}`;
            textarea.value = newText;
            textarea.selectionStart = textarea.selectionEnd = cursorPosition + 1 + prefix.length;
        }
    }
}

async function handleTaskCheck(event) {
    const checkbox = event.target;
    const noteId = checkbox.dataset.noteId;
    const lineIndex = parseInt(checkbox.dataset.lineIndex);
    const noteCard = document.querySelector(`.note-card[data-note-id='${noteId}']`);
    if (!noteCard) return;
    const rawContent = noteCard.dataset.rawContent;
    const lines = rawContent.split('\n');
    if (lines[lineIndex]) {
        if (checkbox.checked) lines[lineIndex] = lines[lineIndex].replace(/-\s\[\s\]/, '- [x]');
        else lines[lineIndex] = lines[lineIndex].replace(/-\s\[x\]/i, '- [ ]');
        const newContent = lines.join('\n');
        noteCard.dataset.rawContent = newContent;
        try {
            await fetch(`/api/notes/${noteId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newContent })
            });
        } catch (error) {
            console.error('Erro ao atualizar a tarefa:', error);
        }
    }
}

async function getOrCreateDraftNoteId() {
    // Se já temos um ID para a nota atual, apenas o retornamos
    if (currentDraftNoteId) {
        return currentDraftNoteId;
    }

    try {
        // Cria uma nova nota sem conteúdo para funcionar como rascunho
        const response = await fetch('/api/notes', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ content: '' }) // Envia conteúdo vazio
        });
        if (!response.ok) throw new Error('Falha ao criar nota rascunho');
        
        const noteData = await response.json();
        currentDraftNoteId = noteData.id; // Armazena o novo ID globalmente
        console.log(`Nota rascunho criada com ID: ${currentDraftNoteId}`);
        return currentDraftNoteId;
    } catch (error) {
        console.error(error);
        showToast('Unable to create or update note. Verify your connection.', 'error');
        return null;
    }
}

async function handleFiles(files) {
    const saveBtn = document.getElementById('saveNoteBtn');
    
    // Inicia o processo de upload
    isUploading = true;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Upload...`;

    const fileList = Array.from(files);
    const attachmentObjects = fileList.map(file => {
        const randomPart = Math.random().toString(36).substring(2, 11);
        const uniqueId = `preview-${Date.now()}-${randomPart}`;
        return { file, id: uniqueId, status: 'uploading', dbId: null };
    });
    newNoteAttachments.push(...attachmentObjects);
    renderNewAttachmentsPreview();

    try {
        const noteId = await getOrCreateDraftNoteId();
        if (!noteId) throw new Error("Não foi possível obter um ID para a nota rascunho.");

        const uploadPromises = attachmentObjects.map(obj => uploadAttachment(noteId, obj));
        await Promise.all(uploadPromises);

    } catch (error) {
        console.error("Erro no processo de upload:", error);
        showToast("Unable to upload one or more files. Try again.", "error");
    } finally {
        // Ao final de todos os uploads (com sucesso ou falha), reabilita o botão
        isUploading = false;
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fas fa-save"></i> Salvar Nota`;
    }
}

async function uploadAttachment(noteId, attachmentObject) {
    const { file, id } = attachmentObject;
    const statusContainer = document.querySelector(`#${id} .attachment-status`);

    try {
        if (statusContainer) statusContainer.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
        
        const formData = new FormData();
        formData.append('files', file);

        const response = await fetch(`/api/notes/${noteId}/attachments`, {
            method: 'POST',
            body: formData
        });
        if (!response.ok) throw new Error(await response.text());

        const result = await response.json();
        const createdAttachment = result.attachments[0]; // Pega o primeiro anexo retornado

        attachmentObject.status = 'success';
        attachmentObject.dbId = createdAttachment.id; // Armazena o ID do banco de dados
        
        // Atualiza a UI para refletir o sucesso e armazena o dbId no botão de apagar
        if (statusContainer) {
            statusContainer.innerHTML = `<i class="fas fa-check-circle success-icon"></i>`;
            const deleteBtn = document.querySelector(`#${id} .delete-attachment`);
            if(deleteBtn) deleteBtn.dataset.dbId = createdAttachment.id;
        }

    } catch (error) {
        attachmentObject.status = 'error';
        if (statusContainer) statusContainer.innerHTML = `<i class="fas fa-exclamation-circle error-icon" title="${error.message || 'Erro'}"></i>`;
    }
}

async function loadNotes() {
  try {
    const response = await fetch('/api/notes');
    if (!response.ok) throw new Error('Falha ao carregar notas');
    const notes = await response.json();
    const notesWithAttachments = await Promise.all(notes.map(async note => {
      const attachmentsResponse = await fetch(`/api/notes/${note.id}/attachments`);
      note.attachments = await attachmentsResponse.json();
      return note;
    }));
    renderNotes(notesWithAttachments);
  } catch (error) {
    console.error(error);
  }
}

function renderNotes(notes) {
  const container = document.getElementById('notesList');
  container.innerHTML = '';
  if (notes.length === 0) {
    container.innerHTML = '<div class="empty-notes">Nothing to see here yet</div>';
    return;
  }
  notes.forEach(note => {
    const noteCard = document.createElement('div');
    noteCard.className = 'note-card';
    noteCard.dataset.noteId = note.id;
    noteCard.dataset.rawContent = note.content;
    noteCard.innerHTML = `
      <div class="note-content">${formatNoteContent(note.content, note.id)}</div>
      ${note.attachments.length > 0 ? `
        <div class="attachments-section">
          <div class="attachments-title"><i class="fas fa-paperclip"></i> Attachments:</div>
          <div class="attachments-list">${renderAttachmentsForNote(note.attachments)}</div>
        </div>
      ` : ''}
      <div class="note-meta">
        ${note.updated_at ? `<span title="Created at: ${formatDateTime(note.created_at)}">Updated at: ${formatDateTime(note.updated_at)}</span>` : `<span>Created at: ${formatDateTime(note.created_at)}</span>`}
      </div>
      <div class="note-actions">
        <button class="note-action-btn note-actions-trigger" title="Mais opções"><i class="fas fa-ellipsis-v"></i></button>
        <div class="note-actions-menu">
            <div class="note-menu-option" data-action="edit" data-id="${note.id}"><i class="fas fa-edit"></i> Editar</div>
            <div class="note-menu-option note-menu-option-delete" data-action="delete" data-id="${note.id}"><i class="fas fa-trash-alt"></i> Apagar</div>
        </div>
      </div>
    `;
    container.appendChild(noteCard);
  });
}
function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function renderAttachmentsForNote(attachments) {
  return attachments.map(attachment => `
    <div class="attachment-item">
      <div class="attachment-icon"><i class="fas fa-file"></i></div>
      <div class="attachment-name" title="${attachment.originalname}">${attachment.originalname}</div>
      <div class="attachment-actions">
        <a href="/api/attachments/download/${attachment.id}" download="${attachment.originalname}" class="download-attachment" title="Download"><i class="fas fa-download"></i></a>
        <div class="delete-attachment" data-id="${attachment.id}" title="Delete"><i class="fas fa-trash-alt"></i></div>
      </div>
    </div>
  `).join('');
}

async function saveNewNote() {
    // Impede o salvamento se um upload ainda estiver ocorrendo em segundo plano
    if (isUploading) {
        showToast('There are attachments still uploading...', 'info');
        return;
    }

    const saveBtn = document.getElementById('saveNoteBtn');
    const originalBtnText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Salvando...`;

    try {
        const content = document.getElementById('newNoteContent').value.trim();

        if (currentDraftNoteId && !content && newNoteAttachments.length === 0) {
            await checkAndDeleteEmptyDraft();
            return;
        }
        if (!currentDraftNoteId && !content) {
            showToast('The note cannot be empty!', 'info');
            return;
        }

        let noteIdToUpdate = currentDraftNoteId;

        if (!noteIdToUpdate) {
            const response = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            if (!response.ok) throw new Error('Falha ao criar nota de texto.');
            const noteData = await response.json();
            noteIdToUpdate = noteData.id;
        } else {
            await fetch(`/api/notes/${noteIdToUpdate}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
        }
        
        resetNewNoteForm();
        loadNotes();
        showToast("Note created successfully!", "success");

    } catch (error) {
        console.error('Erro ao finalizar a nota:', error);
        showToast('Unable to create note!', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalBtnText;
    }
}

function resetNewNoteForm() {
    document.getElementById('newNoteContent').value = '';
    newNoteAttachments = [];
    renderNewAttachmentsPreview();
    currentDraftNoteId = null; // Limpa o ID do rascunho
}

function renderNewAttachmentsPreview() {
  const container = document.getElementById('newAttachmentsPreview');
  container.innerHTML = '';
  if (newNoteAttachments.length === 0) return;
  
  container.innerHTML = '<div class="attachments-title"><i class="fas fa-paperclip"></i> Attachments:</div>';
  const attachmentsList = document.createElement('div');
  attachmentsList.className = 'attachments-list';
  
  newNoteAttachments.forEach((attachmentObj) => {
    const { file, id, status, dbId } = attachmentObj;
    const attachmentEl = document.createElement('div');
    attachmentEl.className = 'attachment-item';
    attachmentEl.id = id;

    let statusIcon = '';
    if (status === 'uploading') statusIcon = `<i class="fas fa-spinner fa-spin"></i>`;
    else if (status === 'success') statusIcon = `<i class="fas fa-check-circle success-icon"></i>`;
    else if (status === 'error') statusIcon = `<i class="fas fa-exclamation-circle error-icon"></i>`;

    attachmentEl.innerHTML = `
      <div class="attachment-icon"><i class="fas fa-file"></i></div>
      <div class="attachment-name" title="${file.name}">${file.name}</div>
      <div class="attachment-status">${statusIcon}</div>
      <div class="attachment-actions">
        <div class="delete-attachment" data-preview-id="${id}" data-db-id="${dbId || ''}" title="Delete">
          <i class="fas fa-trash-alt"></i>
        </div>
      </div>
    `;
    attachmentsList.appendChild(attachmentEl);
  });
  
  container.appendChild(attachmentsList);
  
  // Listener de clique MODIFICADO para apagar no servidor
  document.querySelectorAll('#newAttachmentsPreview .delete-attachment').forEach(btn => {
    btn.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const previewId = button.dataset.previewId;
        const dbId = button.dataset.dbId;

        // Desabilita o botão para evitar cliques duplos
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        // Se o anexo já tiver um ID do banco, apaga no servidor
        if (dbId) {
            try {
                const response = await fetch(`/api/attachments/${dbId}`, { method: 'DELETE' });
                if (!response.ok) throw new Error('Falha ao apagar anexo no servidor.');
            } catch (error) {
                console.error(error);
                showToast(error.message, 'error');
                button.innerHTML = '<i class="fas fa-trash-alt"></i>'; // Restaura o ícone em caso de erro
                return;
            }
        }

        // Remove da lista local e re-renderiza a UI
        newNoteAttachments = newNoteAttachments.filter(a => a.id !== previewId);
        renderNewAttachmentsPreview();
		
		await checkAndDeleteEmptyDraft();
    });
  });
}

async function uploadAttachmentForNote(noteId, attachmentObject) {
    const { file, previewId } = attachmentObject;
    const statusContainer = document.querySelector(`#${previewId} .attachment-status`);

    try {
        // Mostra o ícone de carregamento
        if (statusContainer) {
            statusContainer.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
        }

        const formData = new FormData();
        formData.append('files', file);

        const response = await fetch(`/api/notes/${noteId}/attachments`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        // Mostra o ícone de sucesso
        if (statusContainer) {
            statusContainer.innerHTML = `<i class="fas fa-check-circle success-icon"></i>`;
        }
        return { success: true };

    } catch (error) {
        console.error(`Erro no upload de ${file.name}:`, error);
        // Mostra o ícone de erro
        if (statusContainer) {
            statusContainer.innerHTML = `<i class="fas fa-exclamation-circle error-icon" title="${error.message || 'Erro desconhecido'}"></i>`;
        }
        return { success: false, error: error.message };
    }
}

function openEditMode(noteId) {
    if (currentEditingNoteId && currentEditingNoteId !== noteId) cancelEditMode(currentEditingNoteId);
    const noteCard = document.querySelector(`.note-card[data-note-id='${noteId}']`);
    if (!noteCard) return;
    noteCard.classList.add('is-editing');
    const noteContentDiv = noteCard.querySelector('.note-content');
    const originalText = noteCard.dataset.rawContent;
    noteContentDiv.style.display = 'none';
    const textarea = document.createElement('textarea');
    textarea.value = originalText;
    textarea.className = 'edit-textarea';
    textarea.addEventListener('keydown', handleListContinuation);
    noteContentDiv.insertAdjacentElement('afterend', textarea);
    textarea.focus();
    const noteActionsDiv = noteCard.querySelector('.note-actions');
    noteActionsDiv.innerHTML = `
        <button class="note-action-btn save-edit-btn" title="Save"><i class="fas fa-save"></i></button>
        <button class="note-action-btn cancel-edit-btn" title="Cancel"><i class="fas fa-times"></i></button>
    `;
    noteActionsDiv.querySelector('.save-edit-btn').addEventListener('click', () => saveEditedNote(noteId));
    noteActionsDiv.querySelector('.cancel-edit-btn').addEventListener('click', () => cancelEditMode(noteId));
    currentEditingNoteId = noteId;
}
async function saveEditedNote(noteId) {
  const noteCard = document.querySelector(`.note-card[data-note-id='${noteId}']`);
  if (!noteCard) return;
  const textarea = noteCard.querySelector('.edit-textarea');
  const newContent = textarea.value;
  try {
    const response = await fetch(`/api/notes/${noteId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newContent }) });
    if (!response.ok) throw new Error('Falha ao atualizar a nota');
    currentEditingNoteId = null;
    noteCard.classList.remove('is-editing');
    loadNotes();
  } catch (error) {
    console.error('Erro ao salvar nota editada:', error);
  }
}
function cancelEditMode(noteId) {
  loadNotes(); 
  currentEditingNoteId = null;
}
async function deleteNote(noteId) {
  try {
    await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    loadNotes();
  } catch (error) {
    console.error('Erro ao excluir nota:', error);
  }
}
async function deleteAttachment(attachmentId) {
  try {
    await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' });
    loadNotes();
  } catch (error) {
    console.error('Erro ao excluir anexo:', error);
  }
}

// NOVA FUNÇÃO: Verifica se o rascunho atual está vazio e, se estiver, o apaga.
async function checkAndDeleteEmptyDraft() {
    if (!currentDraftNoteId) return; // Só executa se estivermos em um rascunho

    const content = document.getElementById('newNoteContent').value.trim();
    
    if (content === '' && newNoteAttachments.length === 0) {
        console.log(`Rascunho ${currentDraftNoteId} está vazio. Apagando...`);
        try {
            await fetch(`/api/notes/${currentDraftNoteId}`, { method: 'DELETE' });
            resetNewNoteForm(); // Reseta o formulário, incluindo o currentDraftNoteId
        } catch (error) {
            console.error("Falha ao apagar o rascunho vazio:", error);
        }
    }
}

function setupLiveUpdate() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}`);
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'update' && !currentEditingNoteId) {
        showUpdateNotification();
        loadNotes();
    }
  };
  ws.onerror = (error) => console.error('WebSocket error:', error);
}
function showUpdateNotification() {
  const notification = document.createElement('div');
  notification.className = 'update-notification';
  notification.innerHTML = `<i class="fas fa-sync-alt"></i><span>Sync Successful!</span>`;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 2000);
}

// NOVA FUNÇÃO para mostrar notificações elegantes
function showToast(message, type = 'info') { // type pode ser 'success', 'error', ou 'info'
    const container = document.getElementById('toast-container');
    if (!container) return;

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

function addFilesToQueue(files) {
    const fileList = Array.from(files);
    newNoteAttachments = newNoteAttachments.concat(fileList);
    renderNewAttachmentsPreview();
}

// ==========================================================
// PONTO DE ENTRADA DO SCRIPT
// ==========================================================

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verifica o status de login
  try {
    const res = await fetch('/api/users/status');
    if (!res.ok) {
        window.location.href = '/login.html';
        return;
    }
    const data = await res.json();
    if (!data.loggedIn) {
      window.location.href = '/login.html';
      return;
    }
	
	const userTheme = data.theme || 'dark';
    localStorage.setItem('theme', userTheme); // Sincroniza o localStorage
	
    // 2. Apenas se o login for bem-sucedido, inicializa o aplicativo
    initializeApp(data.username); 
  } catch (error) {
    console.error("Falha ao verificar status de login, redirecionando...", error);
    window.location.href = '/login.html';
  }
});

// Função que configura a página principal do aplicativo APÓS o login
function initializeApp(username) {
  document.getElementById('username-display').textContent = username;

  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.body.classList.toggle('dark-mode', savedTheme === 'dark');

  loadNotes();
  setupLiveUpdate();
  
  document.getElementById('saveNoteBtn').addEventListener('click', saveNewNote);
  // Modificado para usar a nova função handleFiles
  document.getElementById('fileUpload').addEventListener('change', (e) => handleFiles(e.target.files)); 
  document.getElementById('newNoteContent').addEventListener('keydown', handleListContinuation);
  
  // Lógica de Drag and Drop
  const newNoteTextarea = document.getElementById('newNoteContent');
  newNoteTextarea.addEventListener('dragover', (event) => {
    event.preventDefault();
    newNoteTextarea.classList.add('is-dragging-over');
  });
  newNoteTextarea.addEventListener('dragleave', () => {
    newNoteTextarea.classList.remove('is-dragging-over');
  });
  newNoteTextarea.addEventListener('drop', (event) => {
    event.preventDefault();
    newNoteTextarea.classList.remove('is-dragging-over');
    if (event.dataTransfer.files.length > 0) {
      handleFiles(event.dataTransfer.files); // Usa a mesma função
    }
  });
  
  // Lógica dos Menus
  const syntaxHelperContainer = document.querySelector('.syntax-helper-container');
  const syntaxBtn = document.getElementById('syntaxHelperBtn');
  const mainDropdown = document.getElementById('syntaxDropdown');
  const notesListContainer = document.getElementById('notesList');

  const hideAllSubmenus = () => document.querySelectorAll('.syntax-submenu').forEach(m => m.classList.remove('show'));
  const closeAllNoteActionMenus = () => document.querySelectorAll('.note-actions-menu.show').forEach(menu => menu.classList.remove('show'));

  syntaxBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    closeAllNoteActionMenus();
    mainDropdown.classList.toggle('show');
    if (!mainDropdown.classList.contains('show')) hideAllSubmenus();
  });
  
  mainDropdown.addEventListener('mouseover', (event) => {
    const option = event.target.closest('[data-target-submenu]');
    if (option) {
      const submenuId = option.dataset.targetSubmenu;
      const submenu = document.getElementById(submenuId);
      if (submenu && !submenu.classList.contains('show')) {
        hideAllSubmenus();
        submenu.style.left = `${mainDropdown.offsetWidth - 1}px`;
        submenu.style.top = `${option.offsetTop - mainDropdown.scrollTop}px`;
        submenu.classList.add('show');
      }
    } else if (event.target.closest('.syntax-option')) {
      hideAllSubmenus();
    }
  });

  syntaxHelperContainer.addEventListener('click', (event) => {
    const option = event.target.closest('.syntax-option');
    if (option && !option.hasAttribute('data-target-submenu')) {
      insertSyntax(option.dataset.prefix || '', option.dataset.suffix || '');
      mainDropdown.classList.remove('show');
      hideAllSubmenus();
    }
  });
  
  syntaxHelperContainer.addEventListener('mouseleave', () => hideAllSubmenus());

  notesListContainer.addEventListener('click', async (event) => {
    const target = event.target;
    const actionTrigger = target.closest('.note-actions-trigger');
    if (actionTrigger) {
      event.stopPropagation();
      const menu = actionTrigger.nextElementSibling;
      const isShowing = menu.classList.contains('show');
      closeAllNoteActionMenus();
      mainDropdown.classList.remove('show');
      hideAllSubmenus();
      if (!isShowing) menu.classList.add('show');
      return;
    }
    
    const menuOption = target.closest('.note-menu-option');
    if (menuOption) {
      const noteId = menuOption.dataset.id;
      const action = menuOption.dataset.action;
      if (action === 'edit') openEditMode(noteId);
      if (action === 'delete') await deleteNote(noteId);
      closeAllNoteActionMenus();
      return;
    }

    const taskCheckbox = target.closest('.task-list-item input[type="checkbox"]');
    if (taskCheckbox) {
      await handleTaskCheck(event);
	  return;
    }
	
	const deleteSavedAttachmentBtn = target.closest('.note-card.is-editing .delete-attachment');
    if (deleteSavedAttachmentBtn) {
        const attachmentId = deleteSavedAttachmentBtn.dataset.id;
        if (confirm('Tem certeza que deseja apagar este anexo?')) {
            try {
                const response = await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' });
                if (!response.ok) throw new Error('Falha ao apagar anexo no servidor.');
                
                const noteCard = deleteSavedAttachmentBtn.closest('.note-card');
                deleteSavedAttachmentBtn.closest('.attachment-item').remove();
                
                // Verifica se a nota ficou vazia
                const remainingAttachments = noteCard.querySelectorAll('.attachment-item').length;
                const editorText = noteCard.querySelector('.edit-textarea').value.trim();

                if (remainingAttachments === 0 && editorText === '') {
                    console.log(`Nota ${noteCard.dataset.noteId} ficou vazia. Apagando...`);
                    await deleteNote(noteCard.dataset.noteId);
                }
            } catch (error) {
                console.error(error);
                showToast(error.message, 'error');
            }
        }
    }
  });

  window.addEventListener('click', (event) => {
    if (!event.target.closest('.syntax-helper-container')) {
      mainDropdown.classList.remove('show');
      hideAllSubmenus();
    }
    if (!event.target.closest('.note-actions')) {
      closeAllNoteActionMenus();
    }
  });
}