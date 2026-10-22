# Deployment data persistence

Metrroma's Node service keeps mutable store data outside the Git checkout. On Hostinger/Linux, the default directory is `~/metrroma-data`; `PERSISTENT_DATA_DIR` can override it if it points to a stable directory outside `builds/versions`.

Deployments should preserve this directory. Do not delete or replace its contents during an application upgrade. Keep an independent Hostinger backup before maintenance.
