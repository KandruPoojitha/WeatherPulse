# WeatherPulse

A responsive worldwide weather dashboard built with React + TypeScript and FastAPI. Weather data and geocoding from Open-Meteo. No Azure resources, Kafka broker, or paid background jobs are required for this version.

## Clean project structure

```
WeatherPulse/
├── backend/
│   ├── api.py               # FastAPI API routes + 5-min cache
│   ├── weather_client.py    # Open-Meteo forecast + geocoding
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts       # Local /api proxy
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── styles.css
│       ├── types.ts
│       └── weather.ts
├── .gitignore
└── README.md
```

## Run locally (Windows / VS Code)

Open `WeatherPulse` as the folder in VS Code. Use **two separate terminals**.

Terminal 1 — backend:

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn api:app --reload
```

API documentation: http://127.0.0.1:8000/docs

Terminal 2 — frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Search for a city (at least two letters), choose a match, and the dashboard will refresh.

If your terminal starts in the existing `weatherpulse-starter` folder, use the **new** `WeatherPulse` project instead of mixing it into `weatherpulse-react` or `weatherpulse-frontend`.

## Render deployment

Put this repository on GitHub. Create two Render services:

1. **Web Service** (root directory `backend`, runtime Python): build `pip install -r requirements.txt`; start `uvicorn api:app --host 0.0.0.0 --port $PORT`. Set `ALLOWED_ORIGINS` to your frontend Render URL.
2. **Static Site** (root directory `frontend`): build `npm install && npm run build`; publish `dist`. Set `VITE_API_BASE_URL` to the backend's HTTPS URL **before building**.

Both services can use Render's free offerings subject to current limits. The free backend can spin down. The cache is per-process and is not persistent. Do not deploy continuous background jobs here expecting them to be reliable.

## Notes

- Hourly and daily forecasts reflect the Open-Meteo provider data; the browser refreshes every five minutes while the page is open, but the source observations might update less frequently.
- This public demo includes no claims of official severe weather alerts. Add official alerts only when connected to a verified government alert feed.
- Open-Meteo free API has non-commercial use conditions. Review its terms before deploying commercial or high-traffic applications.
- Old Azure Functions/Azurite files are intentionally **not included** in this public web app. Keep your old starter folder as a separate backup if you want to resume the Azure ingestion project later.
