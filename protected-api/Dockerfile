# syntax=docker/dockerfile:1.7

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY --from=authsdk /sdk /opt/authsdk-sdk
COPY protected-api/pyproject.toml /app/pyproject.toml
COPY protected-api/app /app/app

RUN pip install --no-cache-dir /opt/authsdk-sdk .

EXPOSE 8200

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8200"]
