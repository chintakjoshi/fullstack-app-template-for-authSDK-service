# Docker Guide

This sample app can be containerized with the files in this repository, but it
still depends on the sibling `../authSDK` repository for:

- the running auth service stack on `http://127.0.0.1:8000`
- the local `sdk/` source copied into the protected API image build

## Prerequisites

1. Check out `authSDK` next to this repository.
2. Start the auth service stack from `../authSDK`.
3. Confirm Docker Desktop or Docker Engine with Compose is available.

## Build and run

From the root of this repository:

```powershell
docker compose build
docker compose up
```

The sample app will be available at:

- frontend: `http://127.0.0.1:5173`
- backend BFF: `http://127.0.0.1:8100`
- protected API: `http://127.0.0.1:8200`

## Notes

- The containers call the auth service through `host.docker.internal:8000`.
- On Linux, the provided `extra_hosts` entry maps `host.docker.internal` to the
  Docker host gateway.
- The protected API build uses Docker `additional_contexts` to copy the sibling
  `../authSDK/sdk` package into the image.
