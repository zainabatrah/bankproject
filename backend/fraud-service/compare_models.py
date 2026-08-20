import joblib
import pandas as pd

from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.model_selection import train_test_split


data = pd.read_csv("data/transactions.csv")

feature_names = [
    "amount",
    "average_amount",
    "new_device",
    "new_beneficiary",
    "transactions_last_hour",
    "failed_logins_last_hour",
    "transaction_hour"
]

X = data[feature_names]
y = data["is_fraud"]

_, X_test, _, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)

logistic_model = joblib.load("models/logistic_regression.joblib")
random_forest_model = joblib.load("models/random_forest.joblib")
isolation_model = joblib.load("models/isolation_forest.joblib")

logistic_predictions = logistic_model.predict(X_test)
random_forest_predictions = random_forest_model.predict(X_test)

isolation_raw = isolation_model.predict(X_test)
isolation_predictions = [
    1 if prediction == -1 else 0
    for prediction in isolation_raw
]


def calculate_metrics(model_name, predictions):
    return {
        "Model": model_name,
        "Accuracy": accuracy_score(y_test, predictions),
        "Precision": precision_score(
            y_test, predictions, zero_division=0
        ),
        "Recall": recall_score(
            y_test, predictions, zero_division=0
        ),
        "F1 Score": f1_score(
            y_test, predictions, zero_division=0
        )
    }


results = [
    calculate_metrics(
        "Logistic Regression",
        logistic_predictions
    ),
    calculate_metrics(
        "Random Forest",
        random_forest_predictions
    ),
    calculate_metrics(
        "Isolation Forest",
        isolation_predictions
    )
]

comparison = pd.DataFrame(results)

print("\nModel comparison:")
print(comparison.to_string(index=False))

best_model = comparison.loc[comparison["F1 Score"].idxmax()]

print("\nBest model based on F1 score:")
print(best_model["Model"])

comparison.to_csv(
    "models/model_comparison.csv",
    index=False
)

print("\nComparison saved successfully!")