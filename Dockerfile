# Build the React application with Node.
FROM node:22-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# /api requests use the same origin as the deployed FastAPI server.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

RUN npm run build

# Run both the API and the compiled React app with one Python process.
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ ./backend/
COPY --from=frontend-build /frontend/dist ./frontend/dist
EXPOSE 10000
CMD ["sh", "-c", "opentelemetry-instrument uvicorn api:app --app-dir /app/backend --host 0.0.0.0 --port ${PORT:-10000}"]
