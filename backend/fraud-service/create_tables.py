from database import Base, engine
from db_models import (
    AuditLog,
    FraudAlert,
    InvestigationCase,
    SecurityEvent
)


Base.metadata.create_all(bind=engine)

print("Database tables created successfully!")