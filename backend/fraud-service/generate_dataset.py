import csv
import os
import random


random.seed(42)
os.makedirs("data", exist_ok=True)

transactions = []

for transaction_id in range(1, 1001):
    is_fraud = random.random() < 0.15
    average_amount = round(random.uniform(50, 1000), 2)

    if is_fraud:
        amount = round(average_amount * random.uniform(5, 15), 2)
        new_device = random.choice([True, True, False])
        new_beneficiary = random.choice([True, True, False])
        transactions_last_hour = random.randint(5, 12)
        failed_logins_last_hour = random.randint(3, 8)
        transaction_hour = random.randint(0, 4)
    else:
        amount = round(average_amount * random.uniform(0.2, 2), 2)
        new_device = random.choice([False, False, True])
        new_beneficiary = random.choice([False, False, True])
        transactions_last_hour = random.randint(0, 4)
        failed_logins_last_hour = random.randint(0, 2)
        transaction_hour = random.randint(5, 23)

    transactions.append({
        "transaction_id": transaction_id,
        "amount": amount,
        "average_amount": average_amount,
        "new_device": new_device,
        "new_beneficiary": new_beneficiary,
        "transactions_last_hour": transactions_last_hour,
        "failed_logins_last_hour": failed_logins_last_hour,
        "transaction_hour": transaction_hour,
        "is_fraud": int(is_fraud)
    })


with open("data/transactions.csv", "w", newline="") as file:
    writer = csv.DictWriter(file, fieldnames=transactions[0].keys())
    writer.writeheader()
    writer.writerows(transactions)


print("Dataset generated successfully!")
print("Total transactions:", len(transactions))