FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir fastapi uvicorn pandas numpy requests scikit-learn

COPY ai_service.py .
COPY climate_data.json .

CMD ["uvicorn", "ai_service:app", "--host", "0.0.0.0", "--port", "8080"]