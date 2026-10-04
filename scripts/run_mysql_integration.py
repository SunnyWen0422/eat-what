"""Start a private loopback MySQL instance; never connect to an existing service."""
import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import time

import pymysql

ROOT = Path(__file__).resolve().parents[1]


def statements(source):
    delimiter, buffer, quote = ";", "", None
    for line in source.splitlines():
        if line.strip().startswith("--"):
            continue
        if line.strip().upper().startswith("DELIMITER "):
            if buffer.strip():
                raise ValueError("Incomplete SQL before delimiter")
            delimiter = line.strip().split()[1]
            continue
        i = 0
        while i < len(line):
            char = line[i]
            if quote:
                buffer += char
                if char == "\\" and i + 1 < len(line):
                    i += 1
                    buffer += line[i]
                elif char == quote:
                    if i + 1 < len(line) and line[i + 1] == quote:
                        i += 1
                        buffer += line[i]
                    else:
                        quote = None
            elif char in "'\"`":
                quote = char
                buffer += char
            elif line.startswith(delimiter, i):
                if buffer.strip():
                    yield buffer.strip()
                buffer = ""
                i += len(delimiter) - 1
            else:
                buffer += char
            i += 1
        buffer += "\n"
    if buffer.strip():
        raise ValueError("Incomplete SQL at end")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mysqld", required=True)
    parser.add_argument("--maven", default="mvn")
    parser.add_argument("--restart-probe", action="store_true", help="Probe two real JVM processes; build the backend jar first")
    args = parser.parse_args()
    binary = Path(args.mysqld).resolve(strict=True)
    data = ROOT / ".mysql-test-data" / ("v4-" + secrets.token_hex(5))
    data.mkdir(parents=True)
    # Each run has a new directory and port; no recursive deletion or service stop.
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    log = data / "server.log"
    subprocess.run([str(binary), "--no-defaults", "--initialize-insecure", f"--datadir={data}", f"--log-error={log}"], check=True, creationflags=flags)
    process = subprocess.Popen([str(binary), "--no-defaults", f"--datadir={data}", "--bind-address=127.0.0.1", f"--port={port}", f"--log-error={log}", "--mysqlx=OFF", "--default-time-zone=+08:00"], creationflags=flags)
    connection = None
    try:
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline and process.poll() is None:
            try:
                connection = pymysql.connect(host="127.0.0.1", port=port, user="root", password="", charset="utf8mb4", autocommit=True)
                break
            except pymysql.Error:
                time.sleep(.25)
        if connection is None:
            raise RuntimeError("Private test MySQL did not start; inspect server.log")
        password = secrets.token_urlsafe(32)
        database = "eatwhat_v4_test_" + secrets.token_hex(5)
        with connection.cursor() as cursor:
            cursor.execute("ALTER USER 'root'@'localhost' IDENTIFIED BY %s", (password,))
            cursor.execute(f"CREATE DATABASE `{database}` CHARACTER SET utf8mb4")
            cursor.execute(f"USE `{database}`")
            cursor.execute("CREATE TABLE food(id INT PRIMARY KEY AUTO_INCREMENT, NAME VARCHAR(255),TYPE VARCHAR(16),CL TEXT,FL TEXT,STEP LONGTEXT)")
            scripts = ["database_migration.sql", "ensure_food_import_schema.sql", "create_favorite_dishes_table.sql", "shopping_list_schema.sql", "recommendation_preferences_schema.sql"]
            scripts += ["db/migrations/" + row["file"] for row in json.loads((ROOT / "backend/db/migration-manifest.json").read_text(encoding="utf-8"))["migrations"]]
            for relative in scripts:
                for sql in statements((ROOT / "backend" / relative).read_text(encoding="utf-8")):
                    if sql.upper().startswith("USE "):
                        continue
                    cursor.execute(sql)
                    while cursor.nextset():
                        pass
                if relative == "database_migration.sql":
                    cursor.execute("ALTER TABLE recipe_records ADD COLUMN DISH_DETAILS TEXT")
                print("Migrated private test database:", relative, flush=True)
            cursor.execute("INSERT INTO users(id,open_id) VALUES(1,'test-a'),(2,'test-b'),(3,'http-a'),(4,'http-b')")
        env = os.environ.copy()
        env.update(V4_TEST_JDBC=f"jdbc:mysql://127.0.0.1:{port}/{database}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8", V4_TEST_PASSWORD=password)
        result = subprocess.run([args.maven, "-q", "-f", str(ROOT / "backend/pom.xml"), "-Dtest=MealWorkspaceMysqlIT,MealWorkspaceHttpIT", "test"], env=env, creationflags=flags, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        output=result.stdout.decode("utf-8", errors="replace")
        (data / "maven.log").write_text(output,encoding="utf-8")
        print("\n".join(line for line in output.splitlines() if line.startswith("[ERROR]")).encode("ascii","backslashreplace").decode(),flush=True)
        if result.returncode:
            raise RuntimeError("MySQL transaction tests failed")
        metrics=[]
        with connection.cursor() as cursor:
            cursor.execute("SET @from_time=DATE(NOW()),@to_time=DATE(NOW())+INTERVAL 1 DAY,@metric_user_id=3")
            for query in statements((ROOT / "backend/db/queries/v4_feedback.sql").read_text(encoding="utf-8")):
                cursor.execute(query)
                columns=[column[0] for column in cursor.description]
                metrics.append([dict(zip(columns,row)) for row in cursor.fetchall()])
        assert metrics[0][0]["exposed_plans"]==3 and metrics[0][0]["accepted_exposed_plans"]==3
        assert metrics[0][0]["first_accepted_exposed_plans"]==3
        assert metrics[2][0]["current_completed_meals"]==3
        (data / "feedback-metrics.json").write_text(json.dumps(metrics,indent=2,default=str),encoding="utf-8")
        if args.restart_probe:
            from check_workspace_restart import probe
            probe(connection,env,data,ROOT)
        (data / "result.json").write_text(json.dumps({"database": database, "status": "passed", "migrations": scripts}, indent=2), encoding="utf-8")
        print("Private MySQL integration passed. Evidence:", data / "result.json", flush=True)
    finally:
        if connection:
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SHUTDOWN")
            except pymysql.Error:
                pass
            connection.close()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait(timeout=10)


if __name__ == "__main__":
    main()
