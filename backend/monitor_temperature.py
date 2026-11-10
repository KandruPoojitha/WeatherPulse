
import json
import os
from datetime import datetime, timezone
from urllib.request import Request, urlopen

from weather_client import DEFAULT_CITY, fetch_weather

THRESHOLD_C = 10.0
DEDUP_KEY = "weatherpulse-toronto-temperature-10c"


def main():
    routing_key = os.environ.get("PAGERDUTY_ROUTING_KEY")

    if not routing_key:
        raise RuntimeError("PagerDuty routing key is missing")

    weather = fetch_weather(
        DEFAULT_CITY["latitude"],
        DEFAULT_CITY["longitude"]
    )

    temperature = float(
        weather["current"]["temperature_2m"]
    )

    action = "trigger" if temperature <= THRESHOLD_C else "resolve"

    event = {
        "routing_key": routing_key,
        "event_action": action,
        "dedup_key": DEDUP_KEY
    }

    if action == "trigger":
        event["payload"] = {
            "summary": (
                f"WeatherPulse Alert: Toronto is {temperature}°C. "
                f"Threshold is 10°C or below."
            ),
            "source": "WeatherPulse Temperature Monitor",
            "severity": "warning",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    request = Request(
        "https://events.pagerduty.com/v2/enqueue",
        data=json.dumps(event).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    with urlopen(request, timeout=20) as response:
        result = json.load(response)

        if response.status != 202 or result.get("status") != "success":
            raise RuntimeError("PagerDuty did not accept the event")

    print(f"Toronto: {temperature}°C")
    print(f"PagerDuty action: {action}")


if __name__ == "__main__":
    main()
