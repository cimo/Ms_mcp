import os
import psycopg2
from pgvector.psycopg2 import register_vector

class Database:
    def execute(self, query, parameterList=()):
        if self.cursor is not None:
            self.cursor.close()

        self.cursor = self.connection.cursor()
        self.cursor.execute(query, parameterList)

        return self.cursor

    def commit(self):
        self.connection.commit()

    def close(self):
        if self.cursor is not None:
            self.cursor.close()

        self.connection.close()

    def __init__(self, isInit=False):
        DB_NAME = os.environ.get("DB_NAME", "")
        DB_HOST = os.environ.get("DB_HOST", "")
        DB_PORT = os.environ.get("DB_PORT", "")
        DB_USER = os.environ.get("DB_USER", "")
        DB_PASS = os.environ.get("DB_PASS", "")

        self.PATH_CERTIFICATE_PEM = os.environ.get("MS_M_PATH_CERTIFICATE_PEM", "")

        self.connection = psycopg2.connect(
            dbname=DB_NAME,
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASS,
            sslmode="verify-ca",
            sslrootcert=self.PATH_CERTIFICATE_PEM
        )

        self.cursor = None

        if isInit:
            cursor = self.connection.cursor()

            cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
            cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

            self.connection.commit()

            cursor.close()

        register_vector(self.connection)
