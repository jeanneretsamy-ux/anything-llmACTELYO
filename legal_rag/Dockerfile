FROM python:3.11-slim
WORKDIR /app
COPY legal_rag/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY legal_rag /app/legal_rag
ENV ACTELYO_LEGAL_INDEX=/data/index
EXPOSE 8765
CMD ["uvicorn", "legal_rag.api:app", "--host", "0.0.0.0", "--port", "8765"]
