import json
from datetime import datetime, timezone
from pathlib import Path
from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


scenarios = [
    {
        "name": "Account takeover attempt",
        "transaction": {
            "amount": 8500,
            "average_amount": 300,
            "new_device": True,
            "new_beneficiary": True,
            "transactions_last_hour": 2,
            "failed_logins_last_hour": 5,
            "transaction_hour": 2
        }
    },
    {
        "name": "Rapid transaction attack",
        "transaction": {
            "amount": 1200,
            "average_amount": 400,
            "new_device": False,
            "new_beneficiary": False,
            "transactions_last_hour": 10,
            "failed_logins_last_hour": 0,
            "transaction_hour": 14
        }
    },
    {
        "name": "Unusual high-value transfer",
        "transaction": {
            "amount": 15000,
            "average_amount": 500,
            "new_device": False,
            "new_beneficiary": True,
            "transactions_last_hour": 1,
            "failed_logins_last_hour": 0,
            "transaction_hour": 11
        }
    },
    {
        "name": "Normal customer transaction",
        "transaction": {
            "amount": 250,
            "average_amount": 300,
            "new_device": False,
            "new_beneficiary": False,
            "transactions_last_hour": 1,
            "failed_logins_last_hour": 0,
            "transaction_hour": 13
        }
    }
]
simulation_results = []

for scenario in scenarios:
    response = client.post(
        "/evaluate",
        json=scenario["transaction"]
    )

    print("\n" + "=" * 60)
    print("Scenario:", scenario["name"])
    print("HTTP status:", response.status_code)

    if response.status_code == 200:
        result = response.json()
        simulation_results.append({
    "scenario": scenario["name"],
    "transaction": scenario["transaction"],
    "result": result
    })

        print("Risk score:", result["risk_score"])
        print("Severity:", result["severity"])
        print("Decision:", result["decision"])
        print("Reasons:", result["reasons"])
        print("ML prediction:", result["ml_prediction"])
        print("ML probability:", result["ml_probability"])
        print("Alert created:", result["alert_created"])
        print(
            "Security events:",
            result["security_events_logged"]
        )
    else:
        print("Error:", response.json())
        simulation_results.append({
        "scenario": scenario["name"],
        "transaction": scenario["transaction"],
        "error": response.json()
        })


reports_directory = Path("reports")
reports_directory.mkdir(exist_ok=True)

report_file = reports_directory / "attack_simulation_results.json"

report_data = {
    "generated_at": datetime.now(
        timezone.utc
    ).isoformat(),
    "total_scenarios": len(simulation_results),
    "scenarios": simulation_results
}

with report_file.open(
    "w",
    encoding="utf-8"
) as file:
    json.dump(
        report_data,
        file,
        indent=4
    )

print("\nAttack simulation report saved:")
print(report_file)