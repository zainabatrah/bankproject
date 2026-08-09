\# BankShield API Contract



\## 1. System Architecture



BankShield contains three main parts:



1\. Frontend

&#x20;  - React

&#x20;  - TypeScript



2\. Banking Backend

&#x20;  - NestJS

&#x20;  - TypeScript

&#x20;  - PostgreSQL

&#x20;  - Prisma



3\. Fraud Detection Engine

&#x20;  - Python

&#x20;  - FastAPI

&#x20;  - Scikit-learn



Architecture:



Frontend

&#x20;  |

&#x20;  v

NestJS Backend

&#x20;  |

&#x20;  +------> PostgreSQL

&#x20;  |

&#x20;  v

Python Fraud Engine





\## 2. Main Integration



The banking backend sends transaction information

to the fraud detection engine.



Endpoint:



POST /analyze-transaction





\## 3. Transaction Analysis Request



Example request:



{

&#x20; "transactionId": "TX-10001",

&#x20; "userId": 15,

&#x20; "amount": 2500,

&#x20; "currency": "USD",

&#x20; "newDevice": true,

&#x20; "newBeneficiary": false,

&#x20; "transactionsLastHour": 3,

&#x20; "transactionHour": 14

}





\## 4. Request Fields



transactionId

\- Type: string

\- Unique transaction identifier



userId

\- Type: number

\- User who performs the transaction



amount

\- Type: number

\- Transaction amount



currency

\- Type: string

\- Example: USD, EUR, LBP



newDevice

\- Type: boolean

\- true if the device was not previously trusted



newBeneficiary

\- Type: boolean

\- true if the beneficiary was recently added



transactionsLastHour

\- Type: number

\- Number of transactions made during the last hour



transactionHour

\- Type: number

\- Hour of the transaction from 0 to 23





\## 5. Fraud Engine Response



Example:



{

&#x20; "riskScore": 72,

&#x20; "riskLevel": "HIGH",

&#x20; "flagged": true,

&#x20; "reasons": \[

&#x20;   "Unusual transaction amount",

&#x20;   "New device"

&#x20; ]

}





\## 6. Response Fields



riskScore

\- Type: number

\- Range: 0 to 100



riskLevel

\- Type: string

\- Possible values:

&#x20; LOW

&#x20; MEDIUM

&#x20; HIGH

&#x20; CRITICAL



flagged

\- Type: boolean

\- true if the transaction needs review



reasons

\- Type: array of strings

\- Explains why the risk score increased





\## 7. Risk Levels



0 - 29

LOW



30 - 59

MEDIUM



60 - 79

HIGH



80 - 100

CRITICAL





\## 8. Initial Fraud Rules



Rule 1:

If amount > 5000

Risk +30



Rule 2:

If newDevice = true

Risk +20



Rule 3:

If newBeneficiary = true

Risk +15



Rule 4:

If transactionsLastHour > 5

Risk +25



Rule 5:

If transactionHour is between 00:00 and 05:00

Risk +10



Maximum risk score:

100





\## 9. Banking Backend Responsibilities



Person 1 is responsible for:



\- User registration

\- Login

\- JWT authentication

\- MFA

\- Users

\- Bank accounts

\- Beneficiaries

\- Transactions

\- Transaction history

\- Account balance

\- Customer dashboard

\- PostgreSQL database

\- Prisma

\- NestJS API





\## 10. Fraud Engine Responsibilities



Person 2 is responsible for:



\- Python FastAPI service

\- Synthetic transaction data

\- Fraud rules

\- Risk scoring

\- Fraud alerts

\- Machine learning

\- Model training

\- Fraud prediction

\- Security analytics

\- Fraud analyst dashboard





\## 11. Integration Rule



Person 1 must send transaction data using:



POST /analyze-transaction



Person 2 must return:



{

&#x20; "riskScore": number,

&#x20; "riskLevel": string,

&#x20; "flagged": boolean,

&#x20; "reasons": string\[]

}



Both sides must follow this contract so they can be

developed independently and integrated later.

