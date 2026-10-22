"""Optional BentoML packaging of the same FastAPI service."""
import bentoml

from legal_rag.api import app


@bentoml.service(resources={"cpu": "2"}, traffic={"timeout": 120})
@bentoml.asgi_app(app, path="/legal")
class ActelyoLegalRag:
    pass
