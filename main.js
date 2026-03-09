import {
  createIcons,
  LayoutDashboard,
  Plus,
  MoreHorizontal,
  X,
  Check,
  Trash2,
  Search,
  Edit3,
  Download,
  Upload,
  Columns,
  User,
  Calendar,
  MessageSquare,
  Tag
} from 'lucide';
import Sortable from 'sortablejs';

const ICONS = {
  LayoutDashboard,
  Plus,
  MoreHorizontal,
  X,
  Check,
  Trash2,
  Search,
  Edit3,
  Download,
  Upload,
  Columns,
  User,
  Calendar,
  MessageSquare,
  Tag
};

const STORAGE_KEY = 'kanban-state';
const CHANNEL_NAME = 'kanban-sync';
const APP_INSTANCE_ID = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

let broadcastChannel = null;
let suppressBroadcastOnce = false;
let sortableInstances = [];

const refreshIcons = () => {
  createIcons({ icons: ICONS });
};

const nowIso = () => new Date().toISOString();

const createId = (prefix) => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const isSafeId = (id) => /^[a-zA-Z0-9_-]+$/.test(String(id || ''));

const defaultState = {
  version: 2,
  boards: [
    {
      id: 'board-1',
      title: 'Main Project',
      columns: [
        {
          id: 'col-1',
          title: 'Backlog',
          tasks: [
            {
              id: 'task-1',
              title: 'Design System',
              description: 'Create a consistent design language.',
              priority: 'high',
              tags: ['UI/UX'],
              assignee: 'You',
              dueDate: null,
              comments: [],
              activity: [{ id: createId('act'), at: nowIso(), type: 'created', message: 'Task created.' }],
              createdAt: nowIso(),
              updatedAt: nowIso()
            },
            {
              id: 'task-2',
              title: 'API Integration',
              description: 'Connect frontend to backend.',
              priority: 'medium',
              tags: ['Backend'],
              assignee: '',
              dueDate: null,
              comments: [],
              activity: [{ id: createId('act'), at: nowIso(), type: 'created', message: 'Task created.' }],
              createdAt: nowIso(),
              updatedAt: nowIso()
            }
          ]
        },
        {
          id: 'col-2',
          title: 'In Progress',
          tasks: [
            {
              id: 'task-3',
              title: 'User Auth',
              description: 'Implement OAuth logic.',
              priority: 'high',
              tags: ['Security'],
              assignee: '',
              dueDate: null,
              comments: [],
              activity: [{ id: createId('act'), at: nowIso(), type: 'created', message: 'Task created.' }],
              createdAt: nowIso(),
              updatedAt: nowIso()
            }
          ]
        },
        { id: 'col-3', title: 'Done', tasks: [] }
      ]
    }
  ],
  activeBoardId: 'board-1'
};

const safeParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const normalizeTask = (task) => {
  const createdAt = task.createdAt || nowIso();
  const updatedAt = task.updatedAt || createdAt;
  return {
    id: isSafeId(task.id) ? task.id : createId('task'),
    title: task.title || 'New Task',
    description: task.description || '',
    priority: task.priority || 'low',
    tags: Array.isArray(task.tags) ? task.tags.filter(Boolean) : [],
    assignee: task.assignee || '',
    dueDate: task.dueDate || null,
    comments: Array.isArray(task.comments) ? task.comments : [],
    activity: Array.isArray(task.activity) ? task.activity : [{ id: createId('act'), at: createdAt, type: 'created', message: 'Task created.' }],
    createdAt,
    updatedAt
  };
};

const normalizeState = (input) => {
  const base = input && typeof input === 'object' ? input : defaultState;
  const boards = Array.isArray(base.boards) ? base.boards : defaultState.boards;
  const normalizedBoards = boards.map((board) => ({
    id: isSafeId(board.id) ? board.id : createId('board'),
    title: board.title || 'Untitled Board',
    columns: (Array.isArray(board.columns) ? board.columns : []).map((col) => ({
      id: isSafeId(col.id) ? col.id : createId('col'),
      title: col.title || 'Untitled',
      tasks: (Array.isArray(col.tasks) ? col.tasks : []).map(normalizeTask)
    }))
  }));

  const activeBoardId = normalizedBoards.some((b) => b.id === base.activeBoardId)
    ? base.activeBoardId
    : normalizedBoards[0]?.id;

  return {
    version: 2,
    boards: normalizedBoards,
    activeBoardId
  };
};

let state = normalizeState(safeParse(localStorage.getItem(STORAGE_KEY)));

const saveState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (suppressBroadcastOnce) {
    suppressBroadcastOnce = false;
    return;
  }
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'state', at: nowIso(), origin: APP_INSTANCE_ID, state });
  }
};

const getActiveBoard = () => state.boards.find((b) => b.id === state.activeBoardId) || null;

const findTask = (taskId) => {
  const board = getActiveBoard();
  if (!board) return null;
  for (const column of board.columns) {
    const index = column.tasks.findIndex((t) => t.id === taskId);
    if (index !== -1) return { board, column, task: column.tasks[index], index };
  }
  return null;
};

const addActivity = (task, message, type = 'updated') => {
  const entry = { id: createId('act'), at: nowIso(), type, message };
  task.activity = Array.isArray(task.activity) ? task.activity : [];
  task.activity.unshift(entry);
  task.updatedAt = entry.at;
};

const destroySortables = () => {
  sortableInstances.forEach((s) => {
    try {
      s.destroy();
    } catch {
      // ignore
    }
  });
  sortableInstances = [];
};

const getFilters = () => ({
  query: (document.getElementById('filter-query')?.value || '').trim().toLowerCase(),
  priority: document.getElementById('filter-priority')?.value || '',
  tag: (document.getElementById('filter-tag')?.value || '').trim().toLowerCase(),
  assignee: (document.getElementById('filter-assignee')?.value || '').trim().toLowerCase()
});

const taskMatchesFilters = (task, filters) => {
  if (filters.priority && (task.priority || 'low') !== filters.priority) return false;
  if (filters.tag) {
    const tags = (task.tags || []).map((t) => String(t).toLowerCase());
    if (!tags.some((t) => t.includes(filters.tag))) return false;
  }
  if (filters.assignee) {
    const a = String(task.assignee || '').toLowerCase();
    if (!a.includes(filters.assignee)) return false;
  }
  if (filters.query) {
    const hay = `${task.title || ''} ${task.description || ''} ${(task.tags || []).join(' ')} ${task.assignee || ''}`.toLowerCase();
    if (!hay.includes(filters.query)) return false;
  }
  return true;
};

const escapeHtml = (s) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
};

const renderBoardSelect = () => {
  const select = document.getElementById('board-select');
  const board = getActiveBoard();
  if (!select) return;
  select.innerHTML = state.boards
    .map((b) => `<option value="${b.id}" ${b.id === state.activeBoardId ? 'selected' : ''}>${escapeHtml(b.title)}</option>`)
    .join('');
  document.getElementById('board-title-display').innerText = board?.title || 'KanbanBoard';
};

const renderBoard = () => {
  const container = document.getElementById('board-container');
  const board = getActiveBoard();

  destroySortables();

  if (!container) return;
  if (!board) {
    container.innerHTML = '<div class="empty-state">No board found.</div>';
    refreshIcons();
    return;
  }

  const filters = getFilters();
  container.innerHTML = board.columns
    .map((col) => {
      const filteredTasks = col.tasks.filter((t) => taskMatchesFilters(t, filters));
      const count = filteredTasks.length;

      return `
        <section class="column" data-id="${col.id}">
          <div class="column-header">
            <div class="column-title-row">
              <h2 class="column-title">${escapeHtml(col.title)}</h2>
              <span class="column-count">${count}</span>
            </div>
            <button class="btn-icon column-menu" type="button" data-column-id="${col.id}" title="Column actions">
              <i data-lucide="more-horizontal"></i>
            </button>
          </div>
          <div class="column-card-list" id="list-${col.id}">
            ${
              filteredTasks.length
                ? filteredTasks
                    .map((task) => {
                      const due = formatDate(task.dueDate);
                      const assignee = task.assignee ? escapeHtml(task.assignee) : '';
                      const tags = (task.tags || []).slice(0, 6);

                      return `
                        <div class="card" role="button" tabindex="0" data-id="${task.id}" data-column-id="${col.id}" aria-label="Open task ${escapeHtml(task.title)}">
                          <div class="card-title">${escapeHtml(task.title)}</div>
                          ${task.description ? `<div class="card-description">${escapeHtml(task.description)}</div>` : ''}
                          <div class="card-meta">
                            ${assignee ? `<span class="meta-pill"><i data-lucide="user"></i> ${assignee}</span>` : ''}
                            ${due ? `<span class="meta-pill"><i data-lucide="calendar"></i> ${escapeHtml(due)}</span>` : ''}
                          </div>
                          <div class="card-tags">
                            <span class="tag priority-${escapeHtml(task.priority || 'low')}">${escapeHtml(task.priority || 'low')}</span>
                            ${tags.map((tag) => `<span class="tag"><i data-lucide="tag"></i> ${escapeHtml(tag)}</span>`).join('')}
                          </div>
                        </div>
                      `;
                    })
                    .join('')
                : `<div class="column-empty">No tasks match filters.</div>`
            }
          </div>
          <div class="column-footer">
            <button class="btn btn-ghost add-task-btn" type="button" data-column-id="${col.id}">
              <i data-lucide="plus"></i>
              Add Task
            </button>
          </div>
        </section>
      `;
    })
    .join('') +
    `
      <section class="column column-add">
        <button id="add-column" class="btn btn-secondary" type="button">
          <i data-lucide="columns"></i>
          Add Column
        </button>
      </section>
    `;

  initDragAndDrop(board.columns);
  bindBoardEvents();
  refreshIcons();
};

const initDragAndDrop = (columns) => {
  columns.forEach((col) => {
    const el = document.getElementById(`list-${col.id}`);
    if (!el) return;
    const sortable = Sortable.create(el, {
      group: 'shared',
      animation: 150,
      ghostClass: 'card-ghost',
      onEnd: (evt) => {
        const fromColId = evt.from.id.replace('list-', '');
        const toColId = evt.to.id.replace('list-', '');
        const taskId = evt.item.getAttribute('data-id');
        moveTask(taskId, fromColId, toColId, evt.newIndex);
      }
    });
    sortableInstances.push(sortable);
  });
};

const moveTask = (taskId, fromColId, toColId, newIndex) => {
  const board = getActiveBoard();
  if (!board) return;
  const fromCol = board.columns.find((c) => c.id === fromColId);
  const toCol = board.columns.find((c) => c.id === toColId);
  if (!fromCol || !toCol) return;

  const taskIndex = fromCol.tasks.findIndex((t) => t.id === taskId);
  if (taskIndex === -1) return;
  const [task] = fromCol.tasks.splice(taskIndex, 1);
  const safeIndex = Math.max(0, Math.min(newIndex, toCol.tasks.length));
  toCol.tasks.splice(safeIndex, 0, task);

  addActivity(task, `Moved from "${fromCol.title}" to "${toCol.title}".`, 'moved');
  saveState();
  renderBoard();
};

const openModal = (renderFn) => {
  const modal = document.getElementById('modal-container');
  const content = modal?.querySelector('.modal-content');
  if (!modal || !content) return () => {};

  const onKeyDown = (e) => {
    if (e.key === 'Escape') close();
  };

  const onOverlayClick = (e) => {
    if (e.target === modal) close();
  };

  const close = () => {
    modal.classList.add('hidden');
    document.removeEventListener('keydown', onKeyDown);
    modal.removeEventListener('click', onOverlayClick);
  };

  content.innerHTML = '';
  renderFn(content, close);

  modal.classList.remove('hidden');
  refreshIcons();

  document.addEventListener('keydown', onKeyDown);
  modal.addEventListener('click', onOverlayClick);

  content.querySelectorAll('[data-close-modal="true"]').forEach((el) => {
    el.addEventListener('click', close);
  });

  return close;
};

const parseTags = (text) =>
  String(text || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);

const showTaskModal = ({ columnId, taskId }) => {
  const board = getActiveBoard();
  if (!board) return;

  const taskInfo = taskId ? findTask(taskId) : null;
  const isEditing = Boolean(taskInfo);
  const task = isEditing ? taskInfo.task : normalizeTask({ id: createId('task') });
  const initialColumnId = isEditing ? taskInfo.column.id : columnId;

  openModal((content, close) => {
    content.innerHTML = `
      <div class="modal-header">
        <div class="modal-header-title">
          <h2>${isEditing ? 'Edit Task' : 'Add New Task'}</h2>
          <p class="muted">${escapeHtml(board.title)} • ${escapeHtml(board.columns.find((c) => c.id === initialColumnId)?.title || '')}</p>
        </div>
        <button class="btn-icon" type="button" data-close-modal="true" title="Close"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group span-2">
            <label>Task Title</label>
            <input type="text" id="task-title-input" value="${escapeHtml(task.title || '')}" placeholder="What needs to be done?">
          </div>
          <div class="form-group span-2">
            <label>Description</label>
            <textarea id="task-desc-input" placeholder="Add more details...">${escapeHtml(task.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label>Priority</label>
            <select id="task-priority-input">
              <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
              <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
              <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
            </select>
          </div>
          <div class="form-group">
            <label>Assignee</label>
            <input type="text" id="task-assignee-input" value="${escapeHtml(task.assignee || '')}" placeholder="e.g. Alex">
          </div>
          <div class="form-group">
            <label>Due date</label>
            <input type="date" id="task-due-input" value="${task.dueDate ? escapeHtml(task.dueDate.slice(0, 10)) : ''}">
          </div>
          <div class="form-group">
            <label>Tags</label>
            <input type="text" id="task-tags-input" value="${escapeHtml((task.tags || []).join(', '))}" placeholder="comma, separated">
          </div>
        </div>

        ${
          isEditing
            ? `
              <div class="detail-panels">
                <section class="panel">
                  <div class="panel-title"><i data-lucide="message-square"></i> Comments</div>
                  <div class="comment-list" id="comment-list">
                    ${
                      (task.comments || []).length
                        ? (task.comments || [])
                            .map(
                              (c) => `
                                <div class="comment">
                                  <div class="comment-meta">${escapeHtml(formatDate(c.at) || c.at)}</div>
                                  <div class="comment-text">${escapeHtml(c.text)}</div>
                                </div>
                              `
                            )
                            .join('')
                        : `<div class="muted">No comments yet.</div>`
                    }
                  </div>
                  <div class="comment-compose">
                    <textarea id="comment-input" placeholder="Write a comment..."></textarea>
                    <button class="btn btn-secondary" type="button" id="add-comment-btn"><i data-lucide="plus"></i> Add</button>
                  </div>
                </section>

                <section class="panel">
                  <div class="panel-title"><i data-lucide="download"></i> Activity</div>
                  <div class="activity-list">
                    ${
                      (task.activity || []).length
                        ? (task.activity || [])
                            .slice(0, 20)
                            .map((a) => `<div class="activity"><span class="activity-at">${escapeHtml(formatDate(a.at) || a.at)}</span> ${escapeHtml(a.message)}</div>`)
                            .join('')
                        : `<div class="muted">No activity yet.</div>`
                    }
                  </div>
                </section>
              </div>
            `
            : ''
        }
      </div>
      <div class="modal-footer">
        ${
          isEditing
            ? `<button class="btn btn-ghost text-danger" type="button" id="delete-task-btn"><i data-lucide="trash-2"></i> Delete</button>`
            : `<div></div>`
        }
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" data-close-modal="true">Cancel</button>
          <button class="btn btn-primary" type="button" id="save-task-btn"><i data-lucide="check"></i> ${isEditing ? 'Update' : 'Create'}</button>
        </div>
      </div>
    `;

    const getFormData = () => {
      const title = document.getElementById('task-title-input').value.trim();
      const description = document.getElementById('task-desc-input').value.trim();
      const priority = document.getElementById('task-priority-input').value;
      const assignee = document.getElementById('task-assignee-input').value.trim();
      const dueInput = document.getElementById('task-due-input').value;
      const dueDate = dueInput ? new Date(`${dueInput}T00:00:00.000Z`).toISOString() : null;
      const tags = parseTags(document.getElementById('task-tags-input').value);
      return { title: title || 'New Task', description, priority, assignee, dueDate, tags };
    };

    const persist = () => {
      const data = getFormData();
      if (isEditing) {
        const found = findTask(task.id);
        if (!found) return;
        Object.assign(found.task, data);
        addActivity(found.task, 'Updated task details.', 'updated');
      } else {
        const targetCol = board.columns.find((c) => c.id === initialColumnId);
        if (!targetCol) return;
        const newTask = normalizeTask({ ...task, ...data, comments: [], activity: [] });
        addActivity(newTask, 'Task created.', 'created');
        targetCol.tasks.push(newTask);
      }
      saveState();
      renderBoardSelect();
      renderBoard();
    };

    content.querySelector('#save-task-btn')?.addEventListener('click', () => {
      persist();
      close();
    });

    if (isEditing) {
      content.querySelector('#delete-task-btn')?.addEventListener('click', () => {
        const ok = confirm('Delete this task?');
        if (!ok) return;
        const found = findTask(task.id);
        if (!found) return;
        found.column.tasks.splice(found.index, 1);
        saveState();
        renderBoard();
        close();
      });

      content.querySelector('#add-comment-btn')?.addEventListener('click', () => {
        const text = document.getElementById('comment-input').value.trim();
        if (!text) return;
        const found = findTask(task.id);
        if (!found) return;
        found.task.comments = Array.isArray(found.task.comments) ? found.task.comments : [];
        found.task.comments.unshift({ id: createId('cmt'), at: nowIso(), text });
        addActivity(found.task, 'Added a comment.', 'comment');
        saveState();
        close();
        showTaskModal({ taskId: task.id });
      });
    }

    setTimeout(() => document.getElementById('task-title-input')?.focus(), 0);
  });
};

const showBoardModal = ({ focusColumnId = null, focusNewColumn = false } = {}) => {
  const board = getActiveBoard();
  if (!board) return;

  openModal((content, close) => {
    content.innerHTML = `
      <div class="modal-header">
        <div class="modal-header-title">
          <h2>Board Settings</h2>
          <p class="muted">Manage board, columns, import/export</p>
        </div>
        <button class="btn-icon" type="button" data-close-modal="true" title="Close"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body">
        <section class="panel">
          <div class="panel-title"><i data-lucide="edit-3"></i> Board</div>
          <div class="form-group">
            <label>Title</label>
            <input type="text" id="board-title-input" value="${escapeHtml(board.title)}" />
          </div>
          <div class="row">
            <button class="btn btn-secondary" type="button" id="save-board-title"><i data-lucide="check"></i> Save</button>
            <button class="btn btn-ghost text-danger" type="button" id="delete-board"><i data-lucide="trash-2"></i> Delete board</button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-title"><i data-lucide="columns"></i> Columns</div>
          <div class="column-settings">
            ${board.columns
              .map(
                (c) => `
                  <div class="col-row ${focusColumnId === c.id ? 'col-row-focus' : ''}" data-column-id="${escapeHtml(c.id)}">
                    <input class="input col-title-input" type="text" value="${escapeHtml(c.title)}" />
                    <button class="btn btn-secondary col-rename" type="button"><i data-lucide="edit-3"></i></button>
                    <button class="btn btn-ghost text-danger col-delete" type="button"><i data-lucide="trash-2"></i></button>
                  </div>
                `
              )
              .join('')}
          </div>
          <div class="row">
            <input class="input" id="new-column-title" type="text" placeholder="New column title" />
            <button class="btn btn-secondary" type="button" id="add-column-btn"><i data-lucide="plus"></i> Add</button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-title"><i data-lucide="download"></i> Export / Import</div>
          <div class="row">
            <button class="btn btn-secondary" type="button" id="export-board"><i data-lucide="download"></i> Export JSON</button>
            <label class="btn btn-secondary file-btn">
              <i data-lucide="upload"></i> Import JSON
              <input id="import-board-file" type="file" accept="application/json" />
            </label>
          </div>
          <p class="muted small">Export downloads the active board. Import adds a board to your list.</p>
        </section>
      </div>
      <div class="modal-footer">
        <div></div>
        <div class="modal-actions">
          <button class="btn btn-primary" type="button" data-close-modal="true"><i data-lucide="check"></i> Done</button>
        </div>
      </div>
    `;

    content.querySelector('#save-board-title')?.addEventListener('click', () => {
      const title = document.getElementById('board-title-input').value.trim();
      if (!title) return;
      board.title = title;
      saveState();
      renderBoardSelect();
      renderBoard();
    });

    content.querySelector('#delete-board')?.addEventListener('click', () => {
      if (state.boards.length <= 1) {
        alert('You must have at least one board.');
        return;
      }
      const ok = confirm('Delete this board? This cannot be undone.');
      if (!ok) return;
      state.boards = state.boards.filter((b) => b.id !== board.id);
      state.activeBoardId = state.boards[0]?.id;
      saveState();
      renderBoardSelect();
      renderBoard();
      close();
    });

    content.querySelectorAll('.col-row').forEach((row) => {
      const colId = row.getAttribute('data-column-id');
      row.querySelector('.col-rename')?.addEventListener('click', () => {
        const title = row.querySelector('.col-title-input')?.value?.trim();
        if (!title) return;
        const col = board.columns.find((c) => c.id === colId);
        if (!col) return;
        col.title = title;
        saveState();
        renderBoard();
      });
      row.querySelector('.col-delete')?.addEventListener('click', () => {
        const col = board.columns.find((c) => c.id === colId);
        if (!col) return;
        if (board.columns.length <= 1) {
          alert('You must have at least one column.');
          return;
        }
        const ok = confirm(`Delete column "${col.title}"? Tasks in it will be removed.`);
        if (!ok) return;
        board.columns = board.columns.filter((c) => c.id !== colId);
        saveState();
        renderBoard();
        close();
        setTimeout(showBoardModal, 0);
      });
    });

    content.querySelector('#add-column-btn')?.addEventListener('click', () => {
      const title = document.getElementById('new-column-title').value.trim();
      if (!title) return;
      board.columns.push({ id: createId('col'), title, tasks: [] });
      saveState();
      renderBoard();
      close();
      setTimeout(showBoardModal, 0);
    });

    content.querySelector('#export-board')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${board.title.replaceAll(/[^a-z0-9_-]+/gi, '_') || 'kanban-board'}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    content.querySelector('#import-board-file')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const parsed = safeParse(text);
      if (!parsed) {
        alert('Invalid JSON file.');
        return;
      }
      const incomingBoards = Array.isArray(parsed.boards) ? parsed.boards : [parsed];
      const normalizedBoards = normalizeState({ boards: incomingBoards, activeBoardId: incomingBoards[0]?.id }).boards.map((b) => ({
        ...b,
        id: createId('board')
      }));
      state.boards.push(...normalizedBoards);
      state.activeBoardId = normalizedBoards[normalizedBoards.length - 1]?.id || state.activeBoardId;
      saveState();
      renderBoardSelect();
      renderBoard();
      close();
    });

    if (focusColumnId) {
      setTimeout(() => {
        const row = content.querySelector(`.col-row[data-column-id="${CSS.escape(focusColumnId)}"]`);
        row?.querySelector('.col-title-input')?.focus();
      }, 0);
    } else if (focusNewColumn) {
      setTimeout(() => content.querySelector('#new-column-title')?.focus(), 0);
    }
  });
};

const showNewBoardModal = () => {
  openModal((content, close) => {
    content.innerHTML = `
      <div class="modal-header">
        <div class="modal-header-title">
          <h2>New Board</h2>
          <p class="muted">Create a new project board</p>
        </div>
        <button class="btn-icon" type="button" data-close-modal="true" title="Close"><i data-lucide="x"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Title</label>
          <input type="text" id="new-board-title" placeholder="e.g. Website Redesign" />
        </div>
        <div class="form-group">
          <label>Columns (comma separated)</label>
          <input type="text" id="new-board-columns" value="Backlog, In Progress, Review, Done" />
        </div>
      </div>
      <div class="modal-footer">
        <div></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" data-close-modal="true">Cancel</button>
          <button class="btn btn-primary" type="button" id="create-board-btn"><i data-lucide="check"></i> Create</button>
        </div>
      </div>
    `;

    content.querySelector('#create-board-btn')?.addEventListener('click', () => {
      const title = document.getElementById('new-board-title').value.trim();
      const columnsText = document.getElementById('new-board-columns').value;
      if (!title) return;
      const cols = columnsText
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean)
        .slice(0, 10);
      const columnTitles = cols.length ? cols : ['Backlog', 'In Progress', 'Done'];
      const newBoard = {
        id: createId('board'),
        title,
        columns: columnTitles.map((t) => ({ id: createId('col'), title: t, tasks: [] }))
      };
      state.boards.push(newBoard);
      state.activeBoardId = newBoard.id;
      saveState();
      renderBoardSelect();
      renderBoard();
      close();
    });

    setTimeout(() => document.getElementById('new-board-title')?.focus(), 0);
  });
};

const bindBoardEvents = () => {
  document.querySelectorAll('.add-task-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const colId = btn.getAttribute('data-column-id');
      showTaskModal({ columnId: colId });
    });
  });

  document.querySelectorAll('.card').forEach((card) => {
    const open = () => {
      const taskId = card.getAttribute('data-id');
      showTaskModal({ taskId });
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') open();
    });
  });

  document.getElementById('add-column')?.addEventListener('click', () => {
    showBoardModal({ focusNewColumn: true });
  });

  document.querySelectorAll('.column-menu').forEach((btn) => {
    btn.addEventListener('click', () => {
      const colId = btn.getAttribute('data-column-id');
      if (!colId) return;
      showBoardModal({ focusColumnId: colId });
    });
  });
};

const bindGlobalEvents = () => {
  document.getElementById('add-board')?.addEventListener('click', showNewBoardModal);
  document.getElementById('board-settings')?.addEventListener('click', showBoardModal);

  document.getElementById('board-select')?.addEventListener('change', (e) => {
    state.activeBoardId = e.target.value;
    saveState();
    renderBoardSelect();
    renderBoard();
  });

  const rerender = () => renderBoard();
  ['filter-query', 'filter-priority', 'filter-tag', 'filter-assignee'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', rerender);
    document.getElementById(id)?.addEventListener('change', rerender);
  });

  document.getElementById('filter-clear')?.addEventListener('click', () => {
    document.getElementById('filter-query').value = '';
    document.getElementById('filter-priority').value = '';
    document.getElementById('filter-tag').value = '';
    document.getElementById('filter-assignee').value = '';
    renderBoard();
  });
};

const initSync = () => {
  if ('BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      const msg = event.data;
      if (!msg || msg.type !== 'state') return;
      if (msg.origin === APP_INSTANCE_ID) return;
      suppressBroadcastOnce = true;
      state = normalizeState(msg.state);
      saveState();
      renderBoardSelect();
      renderBoard();
    };
  }

  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    const parsed = safeParse(e.newValue);
    if (!parsed) return;
    state = normalizeState(parsed);
    renderBoardSelect();
    renderBoard();
  });
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  state = normalizeState(state);
  initSync();
  bindGlobalEvents();
  renderBoardSelect();
  renderBoard();
  refreshIcons();
});
