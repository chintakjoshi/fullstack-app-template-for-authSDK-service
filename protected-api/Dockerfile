# syntax=docker/dockerfile:1.7

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

ARG AUTHSDK_SDK_GIT_REF=v1.4.3

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

COPY protected-api/pyproject.toml /app/pyproject.toml
COPY protected-api/app /app/app

RUN pip install --no-cache-dir \
    "auth-service-sdk @ git+https://github.com/chintakjoshi/authSDK.git@${AUTHSDK_SDK_GIT_REF}#subdirectory=sdk" \
    .

EXPOSE 8200

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8200"]
