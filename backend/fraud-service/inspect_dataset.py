import pandas as pd


# Load the generated dataset
data = pd.read_csv("data/transactions.csv")


# Display the first five transactions
print("\nFirst 5 transactions:")
print(data.head())


# Display the number of rows and columns
print("\nDataset size:")
print("Rows:", data.shape[0])
print("Columns:", data.shape[1])


# Check for missing values
print("\nMissing values:")
print(data.isnull().sum())


# Count normal and fraudulent transactions
print("\nTransaction labels:")
print(data["is_fraud"].value_counts())


# Display percentages
print("\nTransaction percentages:")
print(data["is_fraud"].value_counts(normalize=True) * 100)