import os
import joblib
import pandas as pd

from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler


# Load the dataset
data = pd.read_csv("data/transactions.csv")


# Information used by the model
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


# Use 80% for training and 20% for testing
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.20,
    random_state=42,
    stratify=y
)


# Create the model
model = Pipeline([
    ("scaler", StandardScaler()),
    ("classifier", LogisticRegression(
        class_weight="balanced",
        max_iter=1000,
        random_state=42
    ))
])


# Train the model
model.fit(X_train, y_train)


# Test the model using data it did not train on
predictions = model.predict(X_test)


# Display evaluation results
print("Training transactions:", len(X_train))
print("Testing transactions:", len(X_test))
print("Accuracy:", accuracy_score(y_test, predictions))
print("Precision:", precision_score(y_test, predictions))
print("Recall:", recall_score(y_test, predictions))
print("F1 score:", f1_score(y_test, predictions))


# Save the trained model
os.makedirs("models", exist_ok=True)
joblib.dump(model, "models/logistic_regression.joblib")

print("Model saved successfully!")