import { createIcons, LayoutDashboard, Plus, MoreHorizontal, GripVertical, X, Check, Trash2 } from 'lucide';
import Sortable from 'sortablejs';

// Initialize Lucide icons
const refreshIcons = () => {
  createIcons({
    icons: {
      LayoutDashboard,
      Plus,
      MoreHorizontal,
      GripVertical,
      X,
      Check,
      Trash2
    }
  });
};

// Initial State
const defaultState = {
  boards: [
    {
      id: 'board-1',
      title: 'Main Project',
      columns: [
        {
          id: 'col-1',
          title: 'Backlog',
          tasks: [
            { id: 'task-1', title: 'Design System', description: 'Create a consistent design language.', priority: 'high', tags: ['UI/UX'] },
            { id: 'task-2', title: 'API Integration', description: 'Connect frontend to backend.', priority: 'medium', tags: ['Backend'] }
          ]
        },
        {
          id: 'col-2',
          title: 'In Progress',
          tasks: [
            { id: 'task-3', title: 'User Auth', description: 'Implement OAuth logic.', priority: 'high', tags: ['Security'] }
          ]
        },
        {
          id: 'col-3',
          title: 'Done',
          tasks: []
        }
      ]
    }
  ],
  activeBoardId: 'board-1'
};

let state = JSON.parse(localStorage.getItem('kanban-state')) || defaultState;

const saveState = () => {
  localStorage.setItem('kanban-state', JSON.stringify(state));
};

// UI Rendering Functions
const renderBoard = () => {
  const container = document.getElementById('board-container');
  const board = state.boards.find(b => b.id === state.activeBoardId);
  
  if (!board) {
    container.innerHTML = '<div class="empty-state">No board found.</div>';
    return;
  }

  document.getElementById('board-title-display').innerText = board.title;

  container.innerHTML = board.columns.map(col => `
    <section class="column" data-id="${col.id}">
      <div class="column-header">
        <h2 class="column-title">${col.title}</h2>
        <button class="btn-icon"><i data-lucide="more-horizontal"></i></button>
      </div>
      <div class="column-card-list" id="list-${col.id}">
        ${col.tasks.map(task => `
          <div class="card" draggable="true" data-id="${task.id}" data-column-id="${col.id}">
            <div class="card-title">${task.title}</div>
            <div class="card-description">${task.description}</div>
            <div class="card-tags">
              <span class="tag priority-${task.priority || 'low'}">${task.priority || 'low'}</span>
              ${(task.tags || []).map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
      <div class="column-footer">
        <button class="btn btn-ghost add-task-btn" data-column-id="${col.id}">
          <i data-lucide="plus"></i>
          Add Task
        </button>
      </div>
    </section>
  `).join('');

  initDragAndDrop(board.columns);
  bindEvents();
  refreshIcons();
};

const initDragAndDrop = (columns) => {
  columns.forEach(col => {
    const el = document.getElementById(`list-${col.id}`);
    Sortable.create(el, {
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
  });
};

const moveTask = (taskId, fromColId, toColId, newIndex) => {
  const board = state.boards.find(b => b.id === state.activeBoardId);
  const fromCol = board.columns.find(c => c.id === fromColId);
  const toCol = board.columns.find(c => c.id === toColId);
  
  const taskIndex = fromCol.tasks.findIndex(t => t.id === taskId);
  const [task] = fromCol.tasks.splice(taskIndex, 1);
  
  toCol.tasks.splice(newIndex, 0, task);
  saveState();
};

const addTask = (columnId, title, description, priority = 'low') => {
  const board = state.boards.find(b => b.id === state.activeBoardId);
  const column = board.columns.find(c => c.id === columnId);
  const newTask = {
    id: `task-${Date.now()}`,
    title: title || 'New Task',
    description: description || '',
    priority,
    tags: []
  };
  column.tasks.push(newTask);
  saveState();
  renderBoard();
};

const updateTask = (taskId, updates) => {
  const board = state.boards.find(b => b.id === state.activeBoardId);
  for (const col of board.columns) {
    const task = col.tasks.find(t => t.id === taskId);
    if (task) {
      Object.assign(task, updates);
      break;
    }
  }
  saveState();
  renderBoard();
};

const deleteTask = (taskId) => {
  const board = state.boards.find(b => b.id === state.activeBoardId);
  for (const col of board.columns) {
    const taskIndex = col.tasks.findIndex(t => t.id === taskId);
    if (taskIndex !== -1) {
      col.tasks.splice(taskIndex, 1);
      break;
    }
  }
  saveState();
  renderBoard();
};

const bindEvents = () => {
  document.querySelectorAll('.add-task-btn').forEach(btn => {
    btn.onclick = () => {
      const colId = btn.getAttribute('data-column-id');
      showTaskModal(colId);
    };
  });

  document.querySelectorAll('.card').forEach(card => {
    card.onclick = () => {
      const taskId = card.getAttribute('data-id');
      const colId = card.getAttribute('data-column-id');
      const board = state.boards.find(b => b.id === state.activeBoardId);
      const column = board.columns.find(c => c.id === colId);
      const task = column.tasks.find(t => t.id === taskId);
      showTaskModal(colId, task);
    };
  });
};

// Modal Logic
const showTaskModal = (columnId, task = null) => {
  const modal = document.getElementById('modal-container');
  const content = modal.querySelector('.modal-content');
  const isEditing = !!task;
  
  content.innerHTML = `
    <div class="modal-header">
      <h2>${isEditing ? 'Edit Task' : 'Add New Task'}</h2>
      <button class="btn-icon close-modal"><i data-lucide="x"></i></button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Task Title</label>
        <input type="text" id="task-title-input" value="${isEditing ? task.title : ''}" placeholder="What needs to be done?">
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea id="task-desc-input" placeholder="Add more details...">${isEditing ? task.description : ''}</textarea>
      </div>
      <div class="form-group">
        <label>Priority</label>
        <select id="task-priority-input">
          <option value="low" ${isEditing && task.priority === 'low' ? 'selected' : ''}>Low</option>
          <option value="medium" ${isEditing && task.priority === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="high" ${isEditing && task.priority === 'high' ? 'selected' : ''}>High</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      ${isEditing ? `<button class="btn btn-ghost text-danger" id="delete-task-btn"><i data-lucide="trash-2"></i> Delete</button>` : ''}
      <button class="btn btn-primary" id="save-task-btn">
        <i data-lucide="check"></i>
        ${isEditing ? 'Update Task' : 'Create Task'}
      </button>
    </div>
  `;
  
  modal.classList.remove('hidden');
  refreshIcons();

  document.querySelector('.close-modal').onclick = () => modal.classList.add('hidden');
  
  if (isEditing) {
    document.getElementById('delete-task-btn').onclick = () => {
      deleteTask(task.id);
      modal.classList.add('hidden');
    };
  }

  document.getElementById('save-task-btn').onclick = () => {
    const title = document.getElementById('task-title-input').value;
    const desc = document.getElementById('task-desc-input').value;
    const priority = document.getElementById('task-priority-input').value;
    
    if (isEditing) {
      updateTask(task.id, { title, description: desc, priority });
    } else {
      addTask(columnId, title, desc, priority);
    }
    modal.classList.add('hidden');
  };
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  renderBoard();
  
  document.getElementById('add-board').onclick = () => {
    const title = prompt('Enter board title:');
    if (title) {
      const newBoard = {
        id: `board-${Date.now()}`,
        title,
        columns: [
          { id: `col-${Date.now()}-1`, title: 'Backlog', tasks: [] },
          { id: `col-${Date.now()}-2`, title: 'In Progress', tasks: [] },
          { id: `col-${Date.now()}-3`, title: 'Done', tasks: [] }
        ]
      };
      state.boards.push(newBoard);
      state.activeBoardId = newBoard.id;
      saveState();
      renderBoard();
    }
  };
});
