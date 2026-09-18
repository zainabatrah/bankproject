import csv
import os
import random


random.seed(42)
os.makedirs("data", exist_ok=True)

transactions = []
number_of_transactions = 5000


def choose_hour(late_night_probability):
    if random.random() < late_night_probability:
        return random.randint(0, 4)

    return random.randint(5, 23)


for transaction_id in range(1, number_of_transactions + 1):
    is_fraud = random.random() < 0.12
    average_amount = round(random.uniform(50, 1000), 2)

    if is_fraud:
        fraud_type = random.choice([
            "ACCOUNT_TAKEOVER",
            "BENEFICIARY_SCAM",
            "HIGH_VELOCITY",
        ])

        if fraud_type == "ACCOUNT_TAKEOVER":
            amount = average_amount * random.uniform(1, 9)
            new_device = random.random() < 0.80
            new_beneficiary = random.random() < 0.55
            transactions_last_hour = random.randint(1, 9)
            failed_logins_last_hour = random.randint(1, 8)
            transaction_hour = choose_hour(0.55)

        elif fraud_type == "BENEFICIARY_SCAM":
            amount = average_amount * random.uniform(1, 7)
            new_device = random.random() < 0.35
            new_beneficiary = random.random() < 0.90
            transactions_last_hour = random.randint(0, 7)
            failed_logins_last_hour = random.randint(0, 3)
            transaction_hour = choose_hour(0.25)

        else:
            amount = average_amount * random.uniform(0.3, 4)
            new_device = random.random() < 0.40
            new_beneficiary = random.random() < 0.40
            transactions_last_hour = random.randint(5, 15)
            failed_logins_last_hour = random.randint(0, 4)
            transaction_hour = choose_hour(0.35)

    else:
        # Some legitimate customers make unusually large purchases.
        if random.random() < 0.08:
            amount_multiplier = random.uniform(3, 8)
        else:
            amount_multiplier = random.uniform(0.2, 3)

        amount = average_amount * amount_multiplier
        new_device = random.random() < 0.12
        new_beneficiary = random.random() < 0.18

        transactions_last_hour = random.choices(
            population=list(range(0, 9)),
            weights=[10, 25, 25, 18, 10, 6, 3, 2, 1],
            k=1,
        )[0]

        failed_logins_last_hour = random.choices(
            population=list(range(0, 5)),
            weights=[70, 20, 7, 2, 1],
            k=1,
        )[0]

        transaction_hour = choose_hour(0.08)

    transactions.append({
        "transaction_id": transaction_id,
        "amount": round(amount, 2),
        "average_amount": average_amount,
        "new_device": new_device,
        "new_beneficiary": new_beneficiary,
        "transactions_last_hour": transactions_last_hour,
        "failed_logins_last_hour": failed_logins_last_hour,
        "transaction_hour": transaction_hour,
        "is_fraud": int(is_fraud),
    })


with open(
    "data/transactions.csv",
    "w",
    newline="",
    encoding="utf-8",
) as file:
    writer = csv.DictWriter(
        file,
        fieldnames=transactions[0].keys(),
    )
    writer.writeheader()
    writer.writerows(transactions)


fraud_count = sum(
    transaction["is_fraud"]
    for transaction in transactions
)

print("Dataset generated successfully!")
print("Total transactions:", len(transactions))
print("Fraud transactions:", fraud_count)
print("Normal transactions:", len(transactions) - fraud_count)