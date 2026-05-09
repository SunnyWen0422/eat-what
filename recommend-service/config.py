"""配置与环境变量"""
import os
from dotenv import load_dotenv

load_dotenv()


def get_env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


# 通义千问
DASHSCOPE_API_KEY = get_env("DASHSCOPE_API_KEY")

# MySQL
DB_HOST = get_env("DB_HOST", "127.0.0.1")
DB_PORT = int(get_env("DB_PORT", "3306"))
DB_USER = get_env("DB_USER", "root")
DB_PASSWORD = get_env("DB_PASSWORD", "Sunny418")
DB_NAME = get_env("DB_NAME", "food")

# 服务
PORT = int(get_env("PORT", "8000"))
