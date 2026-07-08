# Running EarthMind with Docker

This guide will help you get EarthMind up and running using Docker and Docker Compose.

## Prerequisites

- Docker
- Docker Compose

## Steps

1. Clone the EarthMind repository:

   ```sh
   git clone https://github.com/earthmind-ai/earthmind.git
   ```

2. Navigate to the `docker_example` directory:

   ```sh
   cd earthmind/docker_example
   ```

3. Run the Docker Compose file:

   ```sh
   docker compose up
   ```

EarthMind will now be accessible at [http://localhost:7860/](http://localhost:7860/).

## Docker Compose Configuration

The Docker Compose configuration spins up two services: `earthmind` and `postgres`.

### EarthMind Service

The `earthmind` service uses the `earthmindai/earthmind:latest` Docker image and exposes port 7860. It depends on the `postgres` service.

Environment variables:

- `EARTHMIND_DATABASE_URL`: The connection string for the PostgreSQL database.
- `EARTHMIND_CONFIG_DIR`: The directory where EarthMind stores logs, file storage, monitor data, and secret keys.

Volumes:

- `earthmind-data`: This volume is mapped to `/app/earthmind` in the container.

### PostgreSQL Service

The `postgres` service uses the `postgres:16-trixie` Docker image and exposes port 5432. The image is pinned to a specific Debian base (`trixie`, Debian 13) so the `postgres:16` tag cannot silently roll its underlying OS, which would otherwise produce a glibc collation version mismatch warning on existing data volumes.

Environment variables:

- `POSTGRES_USER`: The username for the PostgreSQL database.
- `POSTGRES_PASSWORD`: The password for the PostgreSQL database.
- `POSTGRES_DB`: The name of the PostgreSQL database.

Volumes:

- `earthmind-postgres`: This volume is mapped to `/var/lib/postgresql/data` in the container.

### Upgrading from a `bookworm`-initialized volume

Earlier versions of this example used `postgres:16`, which initially shipped on Debian Bookworm (glibc 2.36). The pinned image now uses Trixie (glibc 2.41). On the first start against a volume that was initialized under Bookworm, PostgreSQL logs a one-time warning:

```
WARNING: database "earthmind" has a collation version mismatch
DETAIL: The database was created using collation version 2.36, but the operating system provides version 2.41.
```

To clear it, refresh the collation version against the running database (one-off, takes seconds on a typical EarthMind database):

```sh
docker compose exec postgres \
  psql -U earthmind -d earthmind \
  -c "REINDEX DATABASE earthmind;" \
  -c "ALTER DATABASE earthmind REFRESH COLLATION VERSION;"
```

Fresh installs are unaffected.

## Switching to a Specific EarthMind Version

If you want to use a specific version of EarthMind, you can modify the `image` field under the `earthmind` service in the Docker Compose file. For example, to use version 1.0-alpha, change `earthmindai/earthmind:latest` to `earthmindai/earthmind:1.0-alpha`.
