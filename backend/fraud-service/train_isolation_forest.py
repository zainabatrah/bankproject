import os
import joblib
import pandas as pd

from sklearn.ensemble import IsolationForest
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

X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)

model = IsolationForest(
    contamination=0.15,
    random_state=42
)

model.fit(X_train)

raw_predictions = model.predict(X_test)

# Isolation Forest returns 1 for normal and -1 for unusual.
# Convert that to our labels: 0 normal and 1 fraud.
predictions = [
    1 if prediction == -1 else 0
    for prediction in raw_predictions
]

print("Training transactions:", len(X_train))
print("Testing transactions:", len(X_test))
print("Accuracy:", accuracy_score(y_test, predictions))
print(
    "Precision:",
    precision_score(y_test, predictions, zero_division=0)
)
print(
    "Recall:",
    recall_score(y_test, predictions, zero_division=0)
)
print(
    "F1 score:",
    f1_score(y_test, predictions, zero_division=0)
)

os.makedirs("models", exist_ok=True)
joblib.dump(model, "models/isolation_forest.joblib")

print("Isolation Forest model saved successfully!")