import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker


# Load variables from the .env file
load_dotenv()

DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")


# PostgreSQL connection address
DATABASE_URL = (
    f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}"
    f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)


# Create the database connection engine
engine = create_engine(DATABASE_URL)


# Creates database sessions used to read and write data
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


# Parent class for database tables we create later
Base = declarative_base()


def test_database_connection():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        print("PostgreSQL connection successful!")

    except Exception as error:
        print("PostgreSQL connection failed!")
        print(error)


if __name__ == "__main__":
    test_database_connection()