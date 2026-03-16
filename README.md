# Algorithmic-trading-platform

A full-stack starter for an algorithmic trading platform:
- Backend: FastAPI (Python)
- Frontend: React + TypeScript + Vite

## Project Structure

```text
Algorithmic-trading-platform/
├── backend/
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── package.json
│   └── src/
└── README.md
```

## Prerequisites

- Python 3.10+
- Node.js 18+ (Node.js 20 LTS recommended)
- npm (comes with Node.js)

## Backend Setup (FastAPI)

From the project root:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Run the backend server:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend URLs:
- API root: http://127.0.0.1:8000/
- Swagger docs: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc

## Frontend Setup (React + Vite)

From the project root:

```bash
cd frontend
npm install
```

Run the frontend dev server:

```bash
npm run dev
```

Typical frontend URL:
- http://127.0.0.1:5173/ (or the URL shown in terminal)

## Run Both Services

Use two terminal tabs/windows:

1. Backend

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

2. Frontend

```bash
cd frontend
npm run dev
```

## Useful Commands

Backend:

```bash
cd backend
source .venv/bin/activate
pip freeze > requirements.txt
```

Frontend:

```bash
cd frontend
npm run lint
npm run build
npm run preview
```

## Notes

- If `python` points to Python 2 on your machine, use `python3` instead of `python`.
- If `source` is unavailable (for example in some shells), use your shell's environment activation command.
