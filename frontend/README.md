# Experiment Board UI

Next.js + TypeScript frontend для просмотра result JSON из `src/experiments/results/<run_id>/<config_name>/<test_id>.json` на бесконечной доске tldraw.

## Запуск

```bash
cd frontend
npm install
npm run dev
```

По умолчанию UI ожидает backend на:

```bash
http://localhost:8000/v1/experiments
```

Если backend запущен по другому адресу, создайте `.env.local`:

```bash
NEXT_PUBLIC_EXPERIMENTS_API_URL=http://localhost:8000/v1/experiments
```

## Что использует frontend

- `GET /v1/experiments/catalog`
- `GET /v1/experiments/runs`
- `GET /v1/experiments/runs/{run_id}`
- `GET /v1/experiments/runs/{run_id}/files/{config_name}/{file_name}`
- `GET /v1/experiments/tests`
- `POST /v1/experiments/tests`
- `POST /v1/experiments/run`
- `GET /v1/experiments/jobs/{job_id}`

Новые backend endpoint'ы не требуются.
