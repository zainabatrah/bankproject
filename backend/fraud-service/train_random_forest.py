import os
import joblib
import pandas as pd

from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.model_selection import train_test_split


# Load the dataset
data = pd.read_csv("data/transactions.csv")


# Select model inputs
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


# Split the dataset: 80% training and 20% testing
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)


# Create and train Random Forest
model = RandomForestClassifier(
    n_estimators=100,
    class_weight="balanced",
    random_state=42
)

model.fit(X_train, y_train)


# Test the model
predictions = model.predict(X_test)


# Display results
print("Training transactions:", len(X_train))
print("Testing transactions:", len(X_test))
print("Accuracy:", accuracy_score(y_test, predictions))
print("Precision:", precision_score(y_test, predictions))
print("Recall:", recall_score(y_test, predictions))
print("F1 score:", f1_score(y_test, predictions))


# Save the model
os.makedirs("models", exist_ok=True)
joblib.dump(model, "models/random_forest.joblib")

print("Random Forest model saved successfully!")