import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool


# Load variables from the .env file
load_dotenv()

def build_database_url():
    configured_url = os.getenv("DATABASE_URL")

    if configured_url:
        return configured_url

    required_settings = {
        "DB_HOST": os.getenv("DB_HOST"),
        "DB_PORT": os.getenv("DB_PORT"),
        "DB_NAME": os.getenv("DB_NAME"),
        "DB_USER": os.getenv("DB_USER"),
        "DB_PASSWORD": os.getenv("DB_PASSWORD"),
    }

    missing_settings = [
        name
        for name, value in required_settings.items()
        if not value
    ]

    if missing_settings:
        raise RuntimeError(
            "Missing database configuration: "
            + ", ".join(missing_settings)
        )

    return (
        f"postgresql+psycopg://{required_settings['DB_USER']}:"
        f"{required_settings['DB_PASSWORD']}"
        f"@{required_settings['DB_HOST']}:"
        f"{required_settings['DB_PORT']}/"
        f"{required_settings['DB_NAME']}"
    )


# Create the database connection engine
DATABASE_URL = build_database_url()
engine_options = {}

if DATABASE_URL.startswith("sqlite"):
    engine_options["connect_args"] = {
        "check_same_thread": False,
    }

    if DATABASE_URL == "sqlite://":
        engine_options["poolclass"] = StaticPool

engine = create_engine(DATABASE_URL, **engine_options)


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
