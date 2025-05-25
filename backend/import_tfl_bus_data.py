import requests
import psycopg2
from db_config import DB_PARAMS
from dotenv import load_dotenv
import os

load_dotenv()

API_KEY = os.getenv("TFL_API_KEY")
BASE_URL = "https://api.tfl.gov.uk/Line/Mode/bus/Route"

def fetch_bus_routes():
    response = requests.get(f"{BASE_URL}?app_key={API_KEY}")
    if response.status_code == 200:
        return response.json()
    else:
        print("Failed to fetch data from TfL API")
        return []

def insert_routes_into_db(routes):
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cur = conn.cursor()
        for route in routes:
            cur.execute("""
                INSERT INTO bus_routes (line_id, line_name, mode_name)
                VALUES (%s, %s, %s)
                ON CONFLICT (line_id) DO NOTHING;
            """, (route["id"], route["name"], route["modeName"]))
        conn.commit()
        cur.close()
        conn.close()
        print("Data inserted successfully.")
    except Exception as e:
        print(f"Database error: {e}")

if __name__ == "__main__":
    routes = fetch_bus_routes()
    if routes:
        insert_routes_into_db(routes)