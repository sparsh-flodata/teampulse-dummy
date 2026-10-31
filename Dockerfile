FROM node:22-slim AS frontend
WORKDIR /build
COPY package*.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --no-audit --no-fund
COPY frontend ./frontend
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home appuser && mkdir /app/data && chown appuser /app/data
COPY backend/app ./backend/app
COPY org-tree.json ./org-tree.json
COPY backend/__init__.py ./backend/__init__.py
COPY --from=frontend /build/frontend/dist ./frontend/dist
USER appuser
ENV DATABASE_URL=sqlite:////app/data/teampulse.db SEED_DEMO=false SEED_COMPANY=false APP_TIMEZONE=Asia/Kolkata
EXPOSE 8787
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8787"]
