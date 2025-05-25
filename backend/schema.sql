CREATE TABLE IF NOT EXISTS bus_routes (
    line_id TEXT PRIMARY KEY,
    line_name TEXT NOT NULL,
    mode_name TEXT NOT NULL
);