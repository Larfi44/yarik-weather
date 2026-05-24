FROM python:3.11-slim

WORKDIR /app

# Copy the application files
COPY ai_service.py .
COPY climate_data.json .

# Install dependencies from PyPI (no local wheels needed)
RUN pip install --no-cache-dir fastapi uvicorn pandas numpy requests scikit-learn lightgbm

CMD ["uvicorn", "ai_service:app", "--host", "0.0.0.0", "--port", "8080"]