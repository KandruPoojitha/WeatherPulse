
import logging
import os

from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.exporter.otlp.proto.http._log_exporter import (
    OTLPLogExporter,
)


def configure_elastic_logging():
    logger = logging.getLogger("weatherpulse")
    logger.setLevel(logging.INFO)

    endpoint = os.getenv("ELASTIC_OTLP_ENDPOINT", "").strip()
    api_key = os.getenv("ELASTIC_API_KEY", "").strip()

    if not endpoint or not api_key:
        logger.info("Elastic logging not configured")
        return logger

    resource = Resource.create({
        "service.name": "weatherpulse-api",
        "deployment.environment.name": "production",
    })

    provider = LoggerProvider(resource=resource)

    exporter = OTLPLogExporter(
        endpoint=endpoint.rstrip("/") + "/v1/logs",
        headers={
            "Authorization": f"ApiKey {api_key}"
        },
        timeout=10,
    )

    provider.add_log_record_processor(
        BatchLogRecordProcessor(exporter)
    )

    handler = LoggingHandler(
        level=logging.INFO,
        logger_provider=provider,
    )

    logger.addHandler(handler)

    logger.info("Elastic log exporter configured")

    return logger
