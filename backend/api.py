from flask import Flask, jsonify
import psycopg2
from db_config import DB_PARAMS
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)

@app.route("/api/routes")
def get_bus_routes():
    try:
        conn = psycopg2.connect(**DB_PARAMS)
        cur = conn.cursor()
        cur.execute("SELECT line_id, line_name, mode_name FROM bus_routes;")
        rows = cur.fetchall()
        cur.close()
        conn.close()

        data = [
            {"line_id": r[0], "line_name": r[1], "mode_name": r[2]}
            for r in rows
        ]
        return jsonify(data)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
