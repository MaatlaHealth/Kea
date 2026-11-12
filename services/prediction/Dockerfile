# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Kea referral non-attendance prediction service
#
# Experimental. Trained on synthetic data and not validated for patient care.
# The service holds no patient data: it receives a feature vector, returns a
# score and stores nothing.
# ---------------------------------------------------------------------------

FROM python:3.12-slim-bookworm AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /service

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY kea_prediction ./kea_prediction

# Train the baseline on synthetic data so the image ships with a usable
# artefact. The metadata file records that it was trained on synthetic data,
# which is what the application surfaces in the interface.
RUN python -m kea_prediction.train --rows 8000

RUN groupadd --system --gid 1001 prediction \
 && useradd --system --uid 1001 --gid prediction prediction \
 && chown -R prediction:prediction /service
USER prediction

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

CMD ["uvicorn", "kea_prediction.app:app", "--host", "0.0.0.0", "--port", "8000"]
