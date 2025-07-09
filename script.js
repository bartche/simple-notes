let currentEditingNoteId = null;
let newNoteAttachments = [];

function applyInlineFormatting(text) {
  let formattedText = text;
  formattedText = formattedText.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  formattedText = formattedText.replace(/(?<!href=")(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  formattedText = formattedText.replace(/\*(.*?)\*/g, '<strong>$1</strong>')
                               .replace(/_(.*?)_/g, '<em>$1</em>')
                               .replace(/~(.*?)~/g, '<del>$1</del>');
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
            if (inList) {
                newLines.push(inList === 'ol' ? '</ol>' : '</ul>');
                inList = null;
            }
        }
        let processedLine;
        if (line.match(/^-\s\[x\]\s/i)) {
            processedLine = `<div class="task-list-item checked"><input type="checkbox" data-note-id="${noteId}" data-line-index="${index}" checked> <label>${applyInlineFormatting(line.substring(6))}</label></div>`;
        } else if (line.match(/^-\s\[\s\]\s/)) {
            processedLine = `<div class="task-list-item"><input type="checkbox" data-note-id="${noteId}" data-line-index="${index}"> <label>${applyInlineFormatting(line.substring(6))}</label></div>`;
        }
        else if (line.startsWith('# ')) { processedLine = `<h1>${applyInlineFormatting(line.substring(2))}</h1>`; }
        else if (line.startsWith('## ')) { processedLine = `<h2>${applyInlineFormatting(line.substring(3))}</h2>`; }
        else if (line.startsWith('### ')) { processedLine = `<h3>${applyInlineFormatting(line.substring(4))}</h3>`; }
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
        else if (line.trim()) {
            processedLine = `<p>${applyInlineFormatting(line)}</p>`;
        } else {
            processedLine = '<br>';
        }
        newLines.push(processedLine);
    });
    if (inList) {
        newLines.push(inList === 'ol' ? '</ol>' : '</ul>');
    }
    return newLines.join('\n');
}

function insertSyntax(prefix, suffix = '') {
    const textarea = document.activeElement;
    if (textarea.tagName !== 'TEXTAREA') {
        const mainTextarea = document.getElementById('newNoteContent');
        if(mainTextarea) mainTextarea.focus();
        else return;
    }
    const targetTextarea = document.activeElement;
    const start = targetTextarea.selectionStart;
    const end = targetTextarea.selectionEnd;
    const selectedText = targetTextarea.value.substring(start, end);
    const textToInsert = prefix + selectedText + suffix;
    targetTextarea.value = targetTextarea.value.substring(0, start) + textToInsert + targetTextarea.value.substring(end);
    if (selectedText) {
        targetTextarea.selectionStart = start;
        targetTextarea.selectionEnd = start + textToInsert.length;
    } else {
        targetTextarea.selectionStart = targetTextarea.selectionEnd = start + prefix.length;
    }
    targetTextarea.focus();
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
            if (currentLine.trim() === unorderedMatch[1].trim()) {
                prefix = '\n'; 
            } else {
                prefix = unorderedMatch[1].replace('[x]', '[ ]'); 
            }
        }
        const orderedMatch = currentLine.match(/^(\s*)(\d+)(\-\s)/);
        if (orderedMatch) {
            if (currentLine.trim() === `${orderedMatch[2]}${orderedMatch[3]}`.trim()) {
                 prefix = '\n'; 
            } else {
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

document.addEventListener('DOMContentLoaded', () => {
  const themeToggle = document.getElementById('theme-checkbox');
  const applyTheme = (theme) => {
    if (theme === 'dark') {
      document.body.classList.add('dark-mode');
      themeToggle.checked = true;
    } else {
      document.body.classList.remove('dark-mode');
      themeToggle.checked = false;
    }
  };
  themeToggle.addEventListener('change', () => {
    const newTheme = themeToggle.checked ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  });
  const savedTheme = localStorage.getItem('theme') || 'light';
  applyTheme(savedTheme);
  
  loadNotes();
  setupLiveUpdate();
  document.getElementById('saveNoteBtn').addEventListener('click', saveNewNote);
  document.getElementById('fileUpload').addEventListener('change', handleNewAttachment);
  document.getElementById('newNoteContent').addEventListener('keydown', handleListContinuation);
  
  const syntaxHelperContainer = document.querySelector('.syntax-helper-container');
  const syntaxBtn = document.getElementById('syntaxHelperBtn');
  const mainDropdown = document.getElementById('syntaxDropdown');
  const submenus = document.querySelectorAll('.syntax-submenu');
  const hideAllSubmenus = () => submenus.forEach(submenu => submenu.classList.remove('show'));
  
  syntaxBtn.addEventListener('click', (event) => {
    event.stopPropagation();
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
      } else if (event.target.closest('.syntax-option') && !event.target.closest('[data-target-submenu]')) {
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

  // --- NOVA LÓGICA DE EVENTOS PARA OS CARDS DE NOTA ---
  const notesListContainer = document.getElementById('notesList');

  // Função para fechar todos os menus de ação abertos
  const closeAllNoteActionMenus = () => {
      document.querySelectorAll('.note-actions-menu.show').forEach(menu => {
          menu.classList.remove('show');
      });
  };

  notesListContainer.addEventListener('click', (event) => {
      const target = event.target;
      
      // Lógica para o botão de toggle do menu de ações (...)
      const actionTrigger = target.closest('.note-actions-trigger');
      if (actionTrigger) {
          const menu = actionTrigger.nextElementSibling;
          const isShowing = menu.classList.contains('show');
          closeAllNoteActionMenus(); // Fecha outros menus antes de abrir um novo
          if (!isShowing) {
              menu.classList.add('show');
          }
          return;
      }
      
      // Lógica para as opções do menu (Editar, Apagar)
      const menuOption = target.closest('.note-menu-option');
      if (menuOption) {
          const noteId = menuOption.dataset.id;
          const action = menuOption.dataset.action;

          if (action === 'edit') {
              openEditMode(noteId);
          } else if (action === 'delete') {
              deleteNote(noteId);
          }
          closeAllNoteActionMenus(); // Fecha o menu após a ação
          return;
      }

      // Lógica para os checkboxes de tarefas
      const taskCheckbox = target.closest('.task-list-item input[type="checkbox"]');
      if(taskCheckbox) {
          handleTaskCheck(event);
      }
  });

  // Fecha menus de ação ao clicar fora deles
  window.addEventListener('click', (event) => {
    if (!event.target.closest('.syntax-helper-container')) {
      mainDropdown.classList.remove('show');
      hideAllSubmenus();
    }
    if (!event.target.closest('.note-actions')) {
        closeAllNoteActionMenus();
    }
  });
});

async function handleTaskCheck(event) {
    const checkbox = event.target;
    const noteId = checkbox.dataset.noteId;
    const lineIndex = parseInt(checkbox.dataset.lineIndex);
    const noteCard = document.querySelector(`.note-card[data-note-id='${noteId}']`);
    if (!noteCard) return;
    const rawContent = noteCard.dataset.rawContent;
    const lines = rawContent.split('\n');
    if (lines[lineIndex]) {
        if (checkbox.checked) {
            lines[lineIndex] = lines[lineIndex].replace(/-\s\[\s\]/, '- [x]');
        } else {
            lines[lineIndex] = lines[lineIndex].replace(/-\s\[x\]/i, '- [ ]');
        }
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
            alert('Erro ao salvar o estado da tarefa.');
        }
    }
}
async function loadNotes() {
  try {
    const response = await fetch('/api/notes');
    const notes = await response.json();
    const notesWithAttachments = await Promise.all(notes.map(async note => {
      const attachmentsResponse = await fetch(`/api/notes/${note.id}/attachments`);
      note.attachments = await attachmentsResponse.json();
      return note;
    }));
    renderNotes(notesWithAttachments);
  } catch (error) {
    console.error('Erro ao carregar notas:', error);
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
        ${
          note.updated_at
            ? `<span title="Created: ${formatDateTime(note.created_at)}">Updated: ${formatDateTime(note.updated_at)}</span>`
            : `<span>Created: ${formatDateTime(note.created_at)}</span>`
        }
      </div>

      <div class="note-actions">
        <button class="note-action-btn note-actions-trigger" title="Mais opções">
            <i class="fas fa-ellipsis-v"></i>
        </button>
        <div class="note-actions-menu">
            <div class="note-menu-option" data-action="edit" data-id="${note.id}">
                <i class="fas fa-edit"></i> Edit
            </div>
            <div class="note-menu-option note-menu-option-delete" data-action="delete" data-id="${note.id}">
                <i class="fas fa-trash-alt"></i> Delete
            </div>
        </div>
      </div>
    `;
    container.appendChild(noteCard);
  });

  // O listener de eventos agora é único e está no container principal,
  // então não é mais necessário adicionar listeners individuais aqui.
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
        <a href="/api/attachments/download/${attachment.id}" download="${attachment.originalname}" class="download-attachment" title="Baixar"><i class="fas fa-download"></i></a>
        <div class="delete-attachment" data-id="${attachment.id}" title="Excluir"><i class="fas fa-trash-alt"></i></div>
      </div>
    </div>
  `).join('');
}
async function saveNewNote() {
  const content = document.getElementById('newNoteContent').value.trim();
  if (!content && newNoteAttachments.length === 0) {
    alert('A nota não pode estar vazia!');
    return;
  }
  try {
    const response = await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    if (!response.ok) throw new Error('Falha ao criar a nota');
    const noteData = await response.json();
    if (newNoteAttachments.length > 0) {
      const uploadPromises = newNoteAttachments.map(file => uploadAttachmentForNote(noteData.id, file));
      await Promise.all(uploadPromises);
    }
    resetNewNoteForm();
    loadNotes();
  } catch (error) {
    console.error('Erro ao salvar nota:', error);
    alert(`Erro ao salvar nota: ${error.message}`);
  }
}
function resetNewNoteForm() {
    document.getElementById('newNoteContent').value = '';
    newNoteAttachments = [];
    renderNewAttachmentsPreview();
}
function handleNewAttachment(event) {
  const files = Array.from(event.target.files);
  newNoteAttachments = newNoteAttachments.concat(files);
  renderNewAttachmentsPreview();
  event.target.value = '';
}
function renderNewAttachmentsPreview() {
  const container = document.getElementById('newAttachmentsPreview');
  container.innerHTML = '';
  if (newNoteAttachments.length === 0) return;
  container.innerHTML = '<div class="attachments-title"><i class="fas fa-paperclip"></i> Anexos para upload:</div>';
  const attachmentsList = document.createElement('div');
  attachmentsList.className = 'attachments-list';
  newNoteAttachments.forEach((file, index) => {
    const attachmentEl = document.createElement('div');
    attachmentEl.className = 'attachment-item';
    attachmentEl.innerHTML = `
      <div class="attachment-icon"><i class="fas fa-file"></i></div>
      <div class="attachment-name" title="${file.name}">${file.name}</div>
      <div class="attachment-actions">
        <div class="delete-attachment" data-index="${index}"><i class="fas fa-trash-alt"></i></div>
      </div>
    `;
    attachmentsList.appendChild(attachmentEl);
  });
  container.appendChild(attachmentsList);
  document.querySelectorAll('#newAttachmentsPreview .delete-attachment').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.getAttribute('data-index'));
      newNoteAttachments.splice(index, 1);
      renderNewAttachmentsPreview();
    });
  });
}
async function uploadAttachmentForNote(noteId, file) {
  const formData = new FormData();
  formData.append('files', file);
  const response = await fetch(`/api/notes/${noteId}/attachments`, { method: 'POST', body: formData });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Falha no anexo ${file.name}: ${error}`);
  }
  return response.json();
}
function openEditMode(noteId) {
    if (currentEditingNoteId && currentEditingNoteId !== noteId) {
        cancelEditMode(currentEditingNoteId);
    }
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
    alert('Erro ao salvar nota.');
  }
}
function cancelEditMode(noteId) {
  loadNotes(); 
  currentEditingNoteId = null;
}
async function deleteNote(noteId) {
  if (!confirm('Are you sure you want to delete this note and its attechments? IT IS NOT REVERSIBLE!')) return;
  try {
    await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    loadNotes();
  } catch (error) {
    console.error('Erro ao excluir nota:', error);
    alert('Erro ao excluir nota');
  }
}
async function deleteAttachment(attachmentId) {
  if (!confirm('Tem certeza que deseja excluir este anexo?')) return;
  try {
    await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' });
    loadNotes();
  } catch (error) {
    console.error('Erro ao excluir anexo:', error);
    alert('Erro ao excluir anexo');
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
  notification.innerHTML = `<i class="fas fa-sync-alt"></i><span>Notes updateded!</span>`;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.remove();
  }, 2000);
}