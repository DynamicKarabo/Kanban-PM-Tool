# Kanban PM Tool

Frontend-only Kanban board built with Vite, SortableJS, and Lucide icons.

## Features

- Multiple boards (create/switch/delete)
- Columns (add/rename/delete)
- Tasks with drag & drop between columns
- Task details: title, description, priority, assignee, due date, tags
- Comments + per-task activity feed
- Filters: text search, priority, tag, assignee
- Local persistence via `localStorage`
- Lightweight “real-time” sync between tabs (BroadcastChannel + storage events)
- Export / import boards as JSON

## Run locally

```bash
npm install
npm run dev
```

Build / preview:

```bash
npm run build
npm run preview
```

## Notes

- Data is stored in your browser under the `kanban-state` key.
- Open two tabs of the app to see changes sync across tabs.

